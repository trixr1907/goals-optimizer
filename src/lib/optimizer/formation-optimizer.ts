import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import formationsData from '@/config/formations.json';
import { OptimizationMode, solveHungarian } from './hungarian-solver';
import { calcPositionFitScore } from '@/lib/scoring/position-fit';
import { PRIMARY_BONUS, SECONDARY_BONUS } from './optimizer-constants';

export interface FormationMeta {
  name: string;
  slots: LineupSlot[];
  playstyle?: 'Offensiv' | 'Defensiv' | 'Ausgewogen' | 'Konter' | string;
  strengths?: string[];
  weaknesses?: string[];
}

export interface FormationAssignment {
  slotKey: string;
  slot: LineupSlot;
  player: PlayerWithScores;
  fit: number;
  /** How the player relates to this slot: primary = his main pos, secondary = nebenposition, out = fremd */
  positionType: 'primary' | 'secondary' | 'out';
}

export interface FormationRecommendation {
  formationKey: string;
  formation: FormationMeta;
  assignments: FormationAssignment[];
  totalFit: number;
  averageFit: number;
  squadMatch: number;
  warnings: string[];
  reasons: string[];
  variants: Record<'offensiv' | 'defensiv' | 'gegenMeta', FormationAssignment[]>;
}

const FORMATIONS = formationsData as Record<string, FormationMeta>;
const DEF_POSITIONS = new Set<Position>(['GK', 'CB', 'FB', 'WB', 'DM']);
const ATT_POSITIONS = new Set<Position>(['AM', 'WM', 'WF', 'CF', 'ST']);

function slotKeyFor(position: Position, index: number) {
  return `${position}-${index}`;
}

function getRoleBias(player: PlayerWithScores, position: Position, mode: OptimizationMode) {
  if (mode === 'balanced') return 0;
  const stats = player.stats;
  if (mode === 'offensiv') {
    if (ATT_POSITIONS.has(position)) return stats.pac * 0.08 + stats.sho * 0.1 + stats.dri * 0.06 + stats.pas * 0.04;
    if (position === 'CM' || position === 'AM') return stats.pas * 0.08 + stats.dri * 0.05 + stats.sho * 0.04;
    return 0;
  }
  if (mode === 'defensiv') {
    if (DEF_POSITIONS.has(position)) return stats.def * 0.1 + stats.phy * 0.06 + stats.pac * 0.04;
    if (position === 'CM' || position === 'DM') return stats.def * 0.08 + stats.pas * 0.04 + stats.phy * 0.05;
    return 0;
  }
  return stats.pac * 0.07 + stats.def * 0.06 + stats.phy * 0.03;
}

function slotFit(player: PlayerWithScores, slot: LineupSlot): number {
  const hasFullStats = player.stats.pac > 0 || player.stats.dri > 0 || player.stats.def > 0;
  return hasFullStats
    ? calcPositionFitScore(player, slot.position, slot.x)
    : (player.fit_scores[slot.position] ?? 0);
}

function getPosType(player: PlayerWithScores, pos: Position): 'primary' | 'secondary' | 'out' {
  return player.positionType?.[pos] ?? 'out';
}

function posBonus(posType: 'primary' | 'secondary' | 'out'): number {
  if (posType === 'primary') return PRIMARY_BONUS;
  if (posType === 'secondary') return SECONDARY_BONUS;
  return 0;
}

function solveGreedy(players: PlayerWithScores[], slots: LineupSlot[], mode: OptimizationMode) {
  const used = new Set<string>();
  const sortedSlots = [...slots].sort((a, b) => {
    const bestA = Math.max(...players.map((p) => slotFit(p, a) + posBonus(getPosType(p, a.position))));
    const bestB = Math.max(...players.map((p) => slotFit(p, b) + posBonus(getPosType(p, b.position))));
    return bestA - bestB;
  });

  const assignmentsByOriginalIndex = new Map<number, FormationAssignment>();
  sortedSlots.forEach((slot) => {
    const originalIndex = slots.findIndex(
      (candidate, idx) =>
        candidate === slot ||
        (candidate.position === slot.position &&
          candidate.x === slot.x &&
          candidate.y === slot.y &&
          !assignmentsByOriginalIndex.has(idx)),
    );
    const best = players
      .filter((player) => !used.has(player.id))
      .map((player) => {
        const posType = getPosType(player, slot.position);
        const fit = slotFit(player, slot);
        return {
          player,
          fit,
          posType,
          score: fit + getRoleBias(player, slot.position, mode) + posBonus(posType),
        };
      })
      .sort((a, b) => b.score - a.score)[0];

    if (best && originalIndex >= 0) {
      used.add(best.player.id);
      assignmentsByOriginalIndex.set(originalIndex, {
        slotKey: slotKeyFor(slot.position, originalIndex),
        slot,
        player: best.player,
        fit: best.fit,
        positionType: best.posType,
      });
    }
  });

  return Array.from(assignmentsByOriginalIndex.entries())
    .sort(([a], [b]) => a - b)
    .map(([, assignment]) => assignment);
}

function toAssignments(
  result: Array<{ slotIndex: number; playerId: string; fit: number }>,
  players: PlayerWithScores[],
  slots: LineupSlot[],
): FormationAssignment[] {
  const playersById = new Map(players.map((player) => [player.id, player]));

  return result
    .map((assignment) => {
      const slot = slots[assignment.slotIndex];
      const player = playersById.get(assignment.playerId);
      if (!slot || !player) return null;

      return {
        slotKey: slotKeyFor(slot.position, assignment.slotIndex),
        slot,
        player,
        fit: assignment.fit,
        positionType: getPosType(player, slot.position),
      } satisfies FormationAssignment;
    })
    .filter((assignment): assignment is FormationAssignment => Boolean(assignment));
}

function solveOptimal(players: PlayerWithScores[], slots: LineupSlot[], mode: OptimizationMode) {
  const biasFn = (player: PlayerWithScores, position: Position) => {
    const modeBias = mode === 'balanced' ? 0 : getRoleBias(player, position, mode);
    return modeBias + posBonus(getPosType(player, position));
  };
  const optimal = solveHungarian(players, slots, biasFn);
  const assignments = toAssignments(optimal, players, slots);

  if (assignments.length === slots.length) return assignments;

  return solveGreedy(players, slots, mode);
}

function makeWarnings(assignments: FormationAssignment[]) {
  const warnings: string[] = [];

  // Out-of-position — highest priority warning
  const outOfPos = assignments.filter((item) => item.positionType === 'out');
  if (outOfPos.length > 0) {
    outOfPos.forEach((item) =>
      warnings.push(
        `${item.player.name} auf ${item.slot.position} — keine Primär- oder Nebenposition. Kein besserer Kandidat im Kader.`,
      ),
    );
  }

  // Low fit
  const weak = assignments
    .filter((item) => item.fit < 62 && item.positionType !== 'out') // out-of-pos already warned
    .sort((a, b) => a.fit - b.fit)
    .slice(0, 2);
  weak.forEach((item) =>
    warnings.push(`${item.slot.position}: ${item.player.name} — nur ${item.fit.toFixed(0)} Fit.`),
  );

  // Defensive pace
  const defenders = assignments.filter(
    (item) => DEF_POSITIONS.has(item.slot.position) && item.slot.position !== 'GK',
  );
  const avgDefPace = defenders.length
    ? defenders.reduce((sum, item) => sum + item.player.stats.pac, 0) / defenders.length
    : 0;
  if (defenders.length && avgDefPace < 68)
    warnings.push('Abwehr-Pace niedrig — keine hohe Linie gegen schnelle Stürmer.');

  // Attack fit
  const attackers = assignments.filter((item) => ATT_POSITIONS.has(item.slot.position));
  const avgAttackFit = attackers.length
    ? attackers.reduce((sum, item) => sum + item.fit, 0) / attackers.length
    : 0;
  if (attackers.length && avgAttackFit < 68)
    warnings.push('Angriff passt nicht gut zur Formation — Alternative testen.');

  return warnings;
}

function makeReasons(
  formation: FormationMeta,
  assignments: FormationAssignment[],
  averageFit: number,
  squadMatch: number,
) {
  const reasons: string[] = [];
  reasons.push(`${squadMatch.toFixed(0)}% Kader-Fit · Ø ${averageFit.toFixed(1)} Slot-Fit.`);
  if (formation.playstyle) reasons.push(`Spielstil: ${formation.playstyle}.`);

  const primaryCount = assignments.filter((a) => a.positionType === 'primary').length;
  const secondaryCount = assignments.filter((a) => a.positionType === 'secondary').length;
  reasons.push(`${primaryCount} Primär-Positionen, ${secondaryCount} Neben-Positionen.`);

  const bestLine = assignments.slice().sort((a, b) => b.fit - a.fit).slice(0, 2);
  if (bestLine.length)
    reasons.push(
      `Stärkste Rollen: ${bestLine.map((item) => `${item.player.name} (${item.slot.position})`).join(', ')}.`,
    );
  return reasons;
}

export function recommendFormations(players: PlayerWithScores[]): FormationRecommendation[] {
  if (players.length < 11) return [];

  return Object.entries(FORMATIONS)
    .map(([formationKey, formation]) => {
      const assignments = solveOptimal(players, formation.slots, 'balanced');
      const totalFit = assignments.reduce((sum, item) => sum + item.fit, 0);
      const averageFit = assignments.length ? totalFit / assignments.length : 0;
      const squadMatch = Math.max(0, Math.min(100, averageFit));
      return {
        formationKey,
        formation,
        assignments,
        totalFit,
        averageFit,
        squadMatch,
        warnings: makeWarnings(assignments),
        reasons: makeReasons(formation, assignments, averageFit, squadMatch),
        variants: {
          offensiv: solveOptimal(players, formation.slots, 'offensiv'),
          defensiv: solveOptimal(players, formation.slots, 'defensiv'),
          gegenMeta: solveOptimal(players, formation.slots, 'gegenMeta'),
        },
      } satisfies FormationRecommendation;
    })
    .sort((a, b) => b.squadMatch - a.squadMatch);
}

export function recommendationToLineup(recommendation: FormationRecommendation) {
  return recommendation.assignments.reduce<Record<string, string>>((lineup, assignment) => {
    lineup[assignment.slotKey] = assignment.player.id;
    return lineup;
  }, {});
}
