import type { Player } from '../scraper/types';
import type { TournamentSummary } from './tournament-parser';

// ── Types ─────────────────────────────────────────────────────────────────────

export type EligibilityStatus =
  | 'eligible'
  | 'notEligible'
  | 'notEvaluated'; // requirement not safely evaluatable with current data

export interface RequirementResult {
  key: string;
  value: string;
  status: EligibilityStatus;
  /** Human-readable reason, especially when notEvaluated */
  reason?: string;
}

export interface TournamentEligibilityResult {
  tournamentName: string;
  /** null when the squad has fewer than 11 starters — no overall can be computed */
  squadOvr: number | null;
  /** Overall eligibility: eligible only if all evaluated requirements pass */
  eligible: boolean | null; // null = cannot determine (e.g. < 11 starters)
  requirements: RequirementResult[];
}

// ── Core OVR calculation ───────────────────────────────────────────────────────

/**
 * Calculates the Squad OVR from an array of starting-eleven players.
 *
 * Mirrors the verified in-game formula:
 *   squadOvr = Math.round(sum(players.overall) / 11)
 *
 * Returns null when fewer than 11 players are provided — the game requires
 * a full starting eleven; substitutes do not count.
 *
 * NOTE: Uses player.overall deliberately — not effectiveStats or position-adjusted OVR.
 * GOALS rule: position changes (secondary / out-of-position) penalise individual stats
 * only. player.overall and the resulting Team/Squad OVR are NOT affected by where a
 * player is placed on the pitch. This is verifiziert GOALS behaviour.
 */
export function calculateStartingElevenOvr(players: Player[]): number | null {
  if (players.length < 11) return null;

  // Only the first 11 are the starting eleven — extra players are ignored
  const starters = players.slice(0, 11);
  const sum = starters.reduce((acc, p) => acc + p.overall, 0);
  return Math.round(sum / 11);
}

// ── Requirement evaluation ─────────────────────────────────────────────────────

/**
 * Requirements that are safely evaluatable using the current Squad OVR.
 * Keys that are NOT listed here get status = 'notEvaluated'.
 */
const OVR_REQUIREMENTS = new Set(['OVR Max', 'OVR Min']);

/**
 * Requirements that are explicitly acknowledged as not yet evaluatable.
 * Kept as a named constant to document intent — these need additional data
 * (e.g. player flags) that the current model does not expose safely.
 */
const NOT_EVALUATED_REQUIREMENTS = new Set(['Retired', 'Duplicated Originals']);

function evaluateOvrRequirement(
  key: string,
  rawValue: string,
  squadOvr: number,
): RequirementResult {
  const limit = parseInt(rawValue, 10);
  if (isNaN(limit)) {
    return {
      key,
      value: rawValue,
      status: 'notEvaluated',
      reason: `Value "${rawValue}" could not be parsed as a number`,
    };
  }

  let status: EligibilityStatus;
  if (key === 'OVR Max') {
    // Squad OVR must be at or below the cap
    status = squadOvr <= limit ? 'eligible' : 'notEligible';
  } else {
    // OVR Min: Squad OVR must be at or above the floor
    status = squadOvr >= limit ? 'eligible' : 'notEligible';
  }

  return { key, value: rawValue, status };
}

/**
 * Evaluates tournament requirements against a squad's starting eleven.
 *
 * Only OVR Max and OVR Min are evaluated — both refer to the Squad OVR
 * (Math.round average of exactly 11 starters), NOT to individual player OVR.
 *
 * Retired and Duplicated Originals are marked notEvaluated because the
 * current data model does not reliably expose those player flags.
 *
 * Any other unknown requirement keys are also marked notEvaluated.
 *
 * @param startingEleven - Exactly 11 (or more) starters; only first 11 count.
 * @param tournament - Parsed tournament summary from tournament-parser.
 */
export function evaluateTournamentRequirements(
  startingEleven: Player[],
  tournament: TournamentSummary,
): TournamentEligibilityResult {
  const squadOvr = calculateStartingElevenOvr(startingEleven);

  // Without a valid squad OVR we cannot evaluate any requirement
  if (squadOvr === null) {
    const requirements: RequirementResult[] = tournament.requirements.map((req) => ({
      key: req.key,
      value: req.value,
      status: 'notEvaluated' as const,
      reason: 'Fewer than 11 starters — Squad OVR cannot be calculated',
    }));

    return {
      tournamentName: tournament.name,
      squadOvr: null,
      eligible: null,
      requirements,
    };
  }

  const requirements: RequirementResult[] = tournament.requirements.map((req) => {
    if (OVR_REQUIREMENTS.has(req.key)) {
      return evaluateOvrRequirement(req.key, req.value, squadOvr);
    }

    if (NOT_EVALUATED_REQUIREMENTS.has(req.key)) {
      return {
        key: req.key,
        value: req.value,
        status: 'notEvaluated' as const,
        reason: `"${req.key}" requires player-level flags not yet exposed in current data model`,
      };
    }

    // Unknown future requirement — stay safe
    return {
      key: req.key,
      value: req.value,
      status: 'notEvaluated' as const,
      reason: `Unknown requirement key "${req.key}"`,
    };
  });

  // Overall: eligible only when every evaluated requirement is eligible.
  // notEvaluated items are skipped (they don't make it ineligible on their own).
  const evaluated = requirements.filter((r) => r.status !== 'notEvaluated');
  const eligible =
    evaluated.length > 0 ? evaluated.every((r) => r.status === 'eligible') : null;

  return {
    tournamentName: tournament.name,
    squadOvr,
    eligible,
    requirements,
  };
}
