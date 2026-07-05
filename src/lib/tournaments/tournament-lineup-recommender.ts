/**
 * Tournament Lineup Recommender
 *
 * For each tournament, finds the best valid starting eleven from the available
 * player pool. Uses the existing formation optimizer as a base, then adjusts
 * the lineup to satisfy OVR Max / OVR Min squad requirements.
 *
 * Output is labelled "empfohlene Startelf" (recommended lineup), not "optimal" —
 * the algorithm uses best-effort heuristics, not exhaustive search.
 *
 * Rules (verified in-game 2026-07-04):
 *   Squad OVR = Math.round(sum of 11 starting-eleven OVRs / 11)
 *   Bank / substitutes do NOT count.
 *   OVR Max / OVR Min refer to Squad OVR, NOT individual player OVR.
 */

import type { PlayerWithScores } from '@/lib/scraper/types';
import type { TournamentSummary } from './tournament-parser';
import type { FormationAssignment } from '@/lib/optimizer/formation-optimizer';
import formationsData from '@/config/formations.json';
import { solveHungarian } from '@/lib/optimizer/hungarian-solver';
import { calcPositionFitScore } from '@/lib/scoring/position-fit';
import {
  evaluateTournamentRequirements,
  type TournamentEligibilityResult,
} from './tournament-eligibility';
import type { LineupSlot } from '@/lib/store/lineup-store';
import type { FormationMeta } from '@/lib/optimizer/formation-optimizer';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TournamentLineupResult {
  tournamentName: string;
  /** null only when no valid 11 could be built at all */
  eligible: boolean | null;
  /** null only when fewer than 11 players in pool */
  squadOvr: number | null;
  formationKey: string;
  formationName: string;
  assignments: FormationAssignment[];
  averageFit: number;
  /** Human-readable explanation of the recommendation */
  reasons: string[];
  /** Warnings about compromises made (weak fits, impossible constraints, etc.) */
  warnings: string[];
  /** Full requirement evaluation from evaluateTournamentRequirements */
  requirementResults: TournamentEligibilityResult;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const FORMATIONS = formationsData as Record<string, FormationMeta>;

function slotFit(player: PlayerWithScores, slot: LineupSlot): number {
  const hasFullStats = player.stats.pac > 0 || player.stats.dri > 0 || player.stats.def > 0;
  return hasFullStats
    ? calcPositionFitScore(player, slot.position, slot.x)
    : (player.fit_scores[slot.position] ?? 0);
}

function buildAssignments(
  players: PlayerWithScores[],
  slots: LineupSlot[],
): FormationAssignment[] {
  const result = solveHungarian(players, slots);
  const byId = new Map(players.map((p) => [p.id, p]));
  const assignments: FormationAssignment[] = [];

  for (const r of result) {
    const slot = slots[r.slotIndex];
    const player = byId.get(r.playerId);
    if (!slot || !player) continue;
    assignments.push({
      slotKey: `${slot.position}-${r.slotIndex}`,
      slot,
      player,
      fit: r.fit,
      positionType: player.positionType?.[slot.position] ?? 'out',
    });
  }

  // Fallback: greedy fill if hungarian didn't cover all slots
  if (assignments.length < slots.length) {
    const used = new Set(assignments.map((a) => a.player.id));
    const remaining = slots.filter((_, i) => !assignments.find((a) => a.slot === slots[i]));
    for (const slot of remaining) {
      const idx = slots.indexOf(slot);
      const best = players
        .filter((p) => !used.has(p.id))
        .map((p) => ({ player: p, fit: slotFit(p, slot) }))
        .sort((a, b) => b.fit - a.fit)[0];
      if (best) {
        used.add(best.player.id);
        assignments.push({
          slotKey: `${slot.position}-${idx}`,
          slot,
          player: best.player,
          fit: best.fit,
          positionType: best.player.positionType?.[slot.position] ?? 'out',
        });
      }
    }
  }

  return assignments;
}

function averageFitOf(assignments: FormationAssignment[]): number {
  if (!assignments.length) return 0;
  return assignments.reduce((s, a) => s + a.fit, 0) / assignments.length;
}

/**
 * Given a set of assignments and a pool of unused players,
 * try to replace the assignment at `targetIdx` with a player from the pool
 * that minimises the delta |squadOvr - targetOvr| while keeping fit as high
 * as possible.
 *
 * Returns a new assignments array (or the original if no improvement found).
 */
function swapTowardsOvr(
  assignments: FormationAssignment[],
  pool: PlayerWithScores[],
  targetOvr: number,
  maxRounds: number,
): FormationAssignment[] {
  let current = [...assignments];
  let currentOvr = computeSquadOvrFromAssignments(current);
  if (currentOvr === null) return current;

  for (let round = 0; round < maxRounds; round++) {
    if (currentOvr === null || currentOvr === targetOvr) break;

    const needLower: boolean = currentOvr > targetOvr;
    const poolUnused = pool.filter((p) => !current.some((a) => a.player.id === p.id));

    let bestSwap: {
      assignmentIdx: number;
      replacement: PlayerWithScores;
      newOvr: number;
      fitDelta: number;
    } | null = null;

    for (let ai = 0; ai < current.length; ai++) {
      const current_assignment = current[ai];
      const candidatePool: PlayerWithScores[] = poolUnused.filter((p) =>
        needLower
          ? p.overall < current_assignment.player.overall
          : p.overall > current_assignment.player.overall,
      );

      for (const candidate of candidatePool) {
        // Build a test set with the candidate replacing the current assignment
        const testAssignments = current.map((a, i) =>
          i === ai
            ? { ...a, player: candidate, fit: slotFit(candidate, a.slot) }
            : a,
        );
        const testOvr = computeSquadOvrFromAssignments(testAssignments);
        if (testOvr === null) continue;

        const newDelta = Math.abs(testOvr - targetOvr);
        const oldDelta = Math.abs(currentOvr! - targetOvr);
        if (newDelta > oldDelta) continue; // no improvement on OVR side

        const fitDelta = slotFit(candidate, current_assignment.slot) - current_assignment.fit;

        if (
          !bestSwap ||
          newDelta < Math.abs(bestSwap.newOvr - targetOvr) ||
          (newDelta === Math.abs(bestSwap.newOvr - targetOvr) && fitDelta > bestSwap.fitDelta)
        ) {
          bestSwap = { assignmentIdx: ai, replacement: candidate, newOvr: testOvr, fitDelta };
        }
      }
    }

    if (!bestSwap) break; // no useful swap found

    // Apply the best swap
    current = current.map((a, i) =>
      i === bestSwap!.assignmentIdx
        ? {
            ...a,
            player: bestSwap!.replacement,
            fit: slotFit(bestSwap!.replacement, a.slot),
          }
        : a,
    );
    currentOvr = bestSwap.newOvr;
  }

  return current;
}

function computeSquadOvrFromAssignments(assignments: FormationAssignment[]): number | null {
  if (assignments.length < 11) return null;
  const starters = assignments.slice(0, 11);
  return Math.round(starters.reduce((s, a) => s + a.player.overall, 0) / 11);
}

/**
 * Parses the OVR constraint from tournament requirements.
 * Returns { type: 'max'|'min', limit } or null if no OVR requirement exists.
 */
function parseOvrConstraint(
  tournament: TournamentSummary,
): { type: 'max' | 'min'; limit: number } | null {
  for (const req of tournament.requirements) {
    if (req.key === 'OVR Max') {
      const limit = parseInt(req.value, 10);
      if (!isNaN(limit)) return { type: 'max', limit };
    }
    if (req.key === 'OVR Min') {
      const limit = parseInt(req.value, 10);
      if (!isNaN(limit)) return { type: 'min', limit };
    }
  }
  return null;
}

/** Checks whether the current squad OVR satisfies the constraint. */
function ovrSatisfied(
  ovr: number,
  constraint: { type: 'max' | 'min'; limit: number },
): boolean {
  return constraint.type === 'max' ? ovr <= constraint.limit : ovr >= constraint.limit;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Finds the best recommended starting eleven for a single tournament.
 *
 * Tries all available formations and variants, adjusts for OVR constraints,
 * and returns the strongest valid lineup found. Clearly labelled as
 * "beste gefundene Startelf" — not guaranteed to be globally optimal.
 */
export function recommendTournamentLineup(
  players: PlayerWithScores[],
  tournament: TournamentSummary,
): TournamentLineupResult {
  if (players.length < 11) {
    return {
      tournamentName: tournament.name,
      eligible: null,
      squadOvr: null,
      formationKey: '',
      formationName: '',
      assignments: [],
      averageFit: 0,
      reasons: ['Weniger als 11 Spieler im Kader — keine Startelf möglich.'],
      warnings: [],
      requirementResults: evaluateTournamentRequirements([], tournament),
    };
  }

  const constraint = parseOvrConstraint(tournament);
  const MAX_SWAP_ROUNDS = 20; // per formation attempt

  interface Candidate {
    formationKey: string;
    formationName: string;
    assignments: FormationAssignment[];
    averageFit: number;
    squadOvr: number;
    eligible: boolean | null;
  }

  const candidates: Candidate[] = [];

  for (const [formationKey, formation] of Object.entries(FORMATIONS)) {
    const slots = formation.slots as LineupSlot[];
    if (slots.length !== 11) continue; // skip malformed formations

    // Base assignment from Hungarian solver
    let assignments = buildAssignments(players, slots);
    if (assignments.length < 11) continue;

    // If there's an OVR constraint, try to satisfy it by swapping players
    if (constraint) {
      const baseOvr = computeSquadOvrFromAssignments(assignments);
      if (baseOvr !== null && !ovrSatisfied(baseOvr, constraint)) {
        assignments = swapTowardsOvr(assignments, players, constraint.limit, MAX_SWAP_ROUNDS);
      }
    }

    const ovr = computeSquadOvrFromAssignments(assignments);
    if (ovr === null) continue;

    // Evaluate eligibility using the canonical evaluateTournamentRequirements
    const starters = assignments.slice(0, 11).map((a) => a.player);
    const eligibilityResult = evaluateTournamentRequirements(starters, tournament);

    candidates.push({
      formationKey,
      formationName: formation.name,
      assignments,
      averageFit: averageFitOf(assignments),
      squadOvr: ovr,
      eligible: eligibilityResult.eligible,
    });
  }

  if (!candidates.length) {
    return {
      tournamentName: tournament.name,
      eligible: false,
      squadOvr: null,
      formationKey: '',
      formationName: '',
      assignments: [],
      averageFit: 0,
      reasons: ['Keine Formation mit 11 Slots gefunden.'],
      warnings: ['Formations-Konfiguration prüfen.'],
      requirementResults: evaluateTournamentRequirements([], tournament),
    };
  }

  // Sort: eligible first, then highest averageFit, then OVR closest to limit
  candidates.sort((a, b) => {
    // 1. Eligible beats not-eligible
    const aElig = a.eligible === true ? 0 : a.eligible === null ? 1 : 2;
    const bElig = b.eligible === true ? 0 : b.eligible === null ? 1 : 2;
    if (aElig !== bElig) return aElig - bElig;

    // 2. Higher average fit
    if (Math.abs(b.averageFit - a.averageFit) > 0.5) return b.averageFit - a.averageFit;

    // 3. OVR closest to limit (if constraint exists)
    if (constraint) {
      const aDelta = Math.abs(a.squadOvr - constraint.limit);
      const bDelta = Math.abs(b.squadOvr - constraint.limit);
      return aDelta - bDelta;
    }

    return 0;
  });

  const best = candidates[0];
  const starters = best.assignments.slice(0, 11).map((a) => a.player);
  const requirementResults = evaluateTournamentRequirements(starters, tournament);

  // Build human-readable reasons and warnings
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (best.eligible === true) {
    reasons.push(`Beste gefundene gültige Startelf für ${tournament.name}.`);
  } else if (best.eligible === false) {
    reasons.push(`Keine vollständig gültige Startelf für ${tournament.name} gefunden.`);
    reasons.push('Dies ist der beste Annäherungsversuch aus deinem aktuellen Kader.');
  } else {
    reasons.push(`Turnier-Anforderungen konnten nicht vollständig bewertet werden.`);
  }

  reasons.push(
    `Formation: ${best.formationName} — Ø Fit: ${best.averageFit.toFixed(1)}, Squad OVR: ${best.squadOvr}.`,
  );

  if (constraint) {
    if (best.eligible === true) {
      reasons.push(
        `Squad OVR ${best.squadOvr} erfüllt ${constraint.type === 'max' ? 'OVR Max' : 'OVR Min'} ${constraint.limit}.`,
      );
    } else if (best.eligible === false) {
      const diff =
        constraint.type === 'max'
          ? best.squadOvr - constraint.limit
          : constraint.limit - best.squadOvr;
      warnings.push(
        `Squad OVR ${best.squadOvr} verfehlt ${constraint.type === 'max' ? 'OVR Max' : 'OVR Min'} ${constraint.limit} um ${diff} Punkte. Mehr ${constraint.type === 'max' ? 'niedrig-OVR' : 'hoch-OVR'}-Spieler im Kader nötig.`,
      );
    }
  }

  // Flag any assignments with poor fit
  const weakAssignments = best.assignments.filter((a) => a.fit < 62);
  if (weakAssignments.length) {
    warnings.push(
      `${weakAssignments.length} Slot(s) mit niedrigem Fit (<62): ${weakAssignments.map((a) => `${a.slot.position} (${a.fit.toFixed(0)})`).join(', ')}.`,
    );
  }

  // Warn about any not-evaluated requirements (Retired, etc.)
  const notEvaluated = requirementResults.requirements.filter((r) => r.status === 'notEvaluated');
  if (notEvaluated.length) {
    warnings.push(
      `${notEvaluated.map((r) => r.key).join(', ')} konnten nicht automatisch geprüft werden — im Spiel manuell prüfen.`,
    );
  }

  return {
    tournamentName: tournament.name,
    eligible: best.eligible,
    squadOvr: best.squadOvr,
    formationKey: best.formationKey,
    formationName: best.formationName,
    assignments: best.assignments,
    averageFit: best.averageFit,
    reasons,
    warnings,
    requirementResults,
  };
}

/**
 * Runs recommendTournamentLineup for each tournament in the list.
 */
export function recommendTournamentLineups(
  players: PlayerWithScores[],
  tournaments: TournamentSummary[],
): TournamentLineupResult[] {
  return tournaments.map((t) => recommendTournamentLineup(players, t));
}
