import { Player, PlayerWithScores, Position, ALL_POSITIONS, getPositionType, getEffectiveStats } from '@/lib/scraper/types';
import type { PlayerStats } from '@/lib/scraper/types';
import detailedWeights from '@/config/position-weights-detailed.json';
import { SECONDARY_FIT_MULTIPLIER, OUT_OF_POSITION_FIT_MULTIPLIER } from '@/lib/optimizer/optimizer-constants';

// Raw JSON has a _meta key we must exclude at runtime (filter in loop via `stat !== '_meta'`).
// Double-cast through unknown to satisfy TS — the _meta object is never accessed as weights.
const WEIGHTS = detailedWeights as unknown as Record<string, Record<string, number>>;

// ─────────────────────────────────────────────────────────────
// Context modifiers: return a *copy* of the weight map with
// per-player adjustments applied before scoring.
// All modifiers multiply individual stat weights — the formula
// stays purely additive afterwards.
// ─────────────────────────────────────────────────────────────

function applyContextModifiers(
  baseWeights: Record<string, number>,
  player: Player,
  position: Position,
  slotX?: number, // 0–100 pitch coordinate; undefined = position-level scoring (no side info)
): Record<string, number> {
  // Shallow copy so we never mutate the imported constant.
  const w = { ...baseWeights };

  if (position === 'GK') return w; // GK scoring is purely technical, no context mods

  const height = player.height_cm ?? 181; // assume average if unknown
  const foot = player.preferred_foot;
  // weak_foot stat is stored on player.stats.weak_foot (0-99 range in GOALS)
  const wfStat = player.stats.weak_foot ?? 70;

  // ── Height modifiers ──────────────────────────────────────
  if (height >= 185) {
    // Tall players win more headers and out-jump opponents
    w['heading'] = (w['heading'] ?? 0) * 1.3;
    w['jumping'] = (w['jumping'] ?? 0) * 1.3;
  } else if (height < 178) {
    // Shorter players are quicker in tight spaces
    w['sprint_speed']    = (w['sprint_speed']    ?? 0) * 1.2;
    w['agility']         = (w['agility']         ?? 0) * 1.3;
    w['close_dribbling'] = (w['close_dribbling'] ?? 0) * 1.2;
  }

  // ── Foot / wide position modifiers ───────────────────────
  //
  // These modifiers require slot-side context (left vs right wing) to be
  // meaningful. When slotX is provided we can determine the side:
  //   slotX < 40  → left wing slot
  //   slotX > 60  → right wing slot
  //
  // Without slotX (position-level scoring in enrichPlayerWithScores) we skip
  // side-dependent modifiers entirely — a neutral score is more honest than
  // a modifier applied to the wrong half of WF players.
  if (foot && slotX !== undefined) {
    const isLeftSlot  = slotX < 40;
    const isRightSlot = slotX > 60;

    if (position === 'WF') {
      // Inverted winger: right-footer on left wing, or left-footer on right wing
      const isInverted =
        (isLeftSlot  && foot === 'right') ||
        (isRightSlot && foot === 'left');
      // Natural winger: foot matches the side
      const isNatural =
        (isLeftSlot  && foot === 'left') ||
        (isRightSlot && foot === 'right');

      if (isInverted) {
        // Inside-forward: cuts inside → finishing & curve are the money stats
        w['finishing'] = (w['finishing'] ?? 0) * 1.4;
        w['curve']     = (w['curve']     ?? 0) * 1.4;
      } else if (isNatural) {
        // Traditional winger: hugs the line → crossing is the primary weapon
        w['crossing'] = (w['crossing'] ?? 0) * 1.5;
      }
    }

    // ── Weak-foot quality scaling ─────────────────────────
    // Only penalise actions on the weak-foot side when we know which side the
    // slot is on. A FB/WB/WM on the wrong side of their preferred foot will
    // be less reliable with crosses, passes, and finishes.
    if (wfStat < 70 && ['FB', 'WB', 'WM', 'WF'].includes(position)) {
      const isWrongSide =
        (isLeftSlot  && foot === 'right') ||
        (isRightSlot && foot === 'left');

      if (isWrongSide) {
        // Actions requiring the weak foot under pressure are less reliable
        const penalty = 0.5 + (wfStat / 70) * 0.4; // 0.50 at wf=0 … 0.90 at wf=70
        w['crossing']     = (w['crossing']     ?? 0) * penalty;
        w['finishing']    = (w['finishing']    ?? 0) * penalty;
        w['curve']        = (w['curve']        ?? 0) * penalty;
        w['through_pass'] = (w['through_pass'] ?? 0) * penalty;
      }
    }
    // wfStat >= 70 → no asymmetric penalty; wfStat > 85 → both feet reliable
  }

  return w;
}

// ─────────────────────────────────────────────────────────────
// Core scoring formula
//
//   score = Σ(stat_value × weight) / Σ(99 × weight) × 100
//
// Result is clamped to [1, 99].
// ─────────────────────────────────────────────────────────────

export function calcPositionFitScore(player: Player, position: Position, slotX?: number): number {
  const hasFullStats =
    player.stats.pac > 0 ||
    player.stats.sho > 0 ||
    player.stats.pas > 0 ||
    player.stats.dri > 0 ||
    player.stats.def > 0 ||
    player.stats.phy > 0;

  // Activity players may only have base data and role ratings, not full stats.
  // Score only explicit role/main positions so unrelated slots do not win by tie (e.g. GK).
  if (!hasFullStats) {
    const roleRating = player.roleRatings.find((r) => r.position === position);
    if (roleRating) {
      return Math.round((roleRating.overall / 99) * 100);
    }
    if (position === player.position) {
      return Math.round((player.overall / 99) * 100);
    }
    return 1;
  }

  const positionType = getPositionType(player, position);

  // ── GK special case ─────────────────────────────────────────
  // Mock/inferred stats set GK values to 25. For actual goalkeepers,
  // anchor the score primarily on roleRating/OVR so poor mock GK stats
  // don't make a GK look better as a field player.
  // Outfield players on GK are heavily capped — they're not goalkeepers.
  if (position === 'GK') {
    if (positionType === 'primary') {
      // Trust the role rating as the primary signal for real GKs
      const gkRole = player.roleRatings.find((r) => r.position === 'GK');
      const anchorOvr = gkRole?.overall ?? player.overall;
      // Blend: 70% from role OVR, 30% from weighted stats (so elite GK stats still matter)
      const statScore = computeRawStatScore(player, position, slotX);
      const roleScore = (anchorOvr / 99) * 100;
      return Math.round(roleScore * 0.7 + statScore * 0.3);
    }
    // Outfield player on GK — heavy cap
    const statScore = computeRawStatScore(player, position, slotX);
    return Math.round(Math.min(statScore, 18));
  }

  // ── Non-GK positions ────────────────────────────────────────
  const statScore = computeRawStatScore(player, position, slotX);

  // Apply role-based penalty multiplier
  // Primary: no penalty, Secondary: moderate, Out-of-position: significant
  const penaltyMultiplier =
    positionType === 'primary' ? 1.0 :
    positionType === 'secondary' ? SECONDARY_FIT_MULTIPLIER :
    OUT_OF_POSITION_FIT_MULTIPLIER;

  // Extra cap for GK playing outfield
  if (player.position === 'GK') {
    return Math.round(Math.min(statScore * penaltyMultiplier, 25));
  }

  return Math.round(Math.max(1, Math.min(statScore * penaltyMultiplier, 99)));
}

/** Raw weighted-stat score (0–100) without role penalties or GK blending. */
function computeRawStatScore(player: Player, position: Position, slotX?: number): number {
  const base = WEIGHTS[position as string];
  if (!base) return 50;

  const w = applyContextModifiers(base, player, position, slotX);

  // Use effective stats so secondary/out-of-position stat penalties apply
  const effectiveStats = getEffectiveStats(player, position);
  const stats = effectiveStats as unknown as Record<string, number>;

  let numerator   = 0;
  let denominator = 0;

  for (const [stat, weight] of Object.entries(w)) {
    if (weight <= 0 || stat === '_meta') continue;
    const value = stats[stat] ?? 0;
    numerator   += value  * weight;
    denominator += 99     * weight;
  }

  if (denominator === 0) return 50;

  return (numerator / denominator) * 100;
}

export function enrichPlayerWithScores(player: Player): PlayerWithScores {
  const fit_scores = {} as Record<Position, number>;
  const positionType = {} as Record<Position, 'primary' | 'secondary' | 'out'>;
  const effectiveStats = {} as Record<Position, PlayerStats>;

  for (const pos of ALL_POSITIONS) {
    fit_scores[pos] = calcPositionFitScore(player, pos);
    positionType[pos] = getPositionType(player, pos);
    effectiveStats[pos] = getEffectiveStats(player, pos);
  }

  return { ...player, fit_scores, positionType, effectiveStats };
}

// ─────────────────────────────────────────────────────────────
// Human-readable explanation of why a foot/side combo is good
// or bad — used in the UI tooltip.
// ─────────────────────────────────────────────────────────────

export function explainFootFit(player: Player, position: Position, slotX?: number): string | null {
  if (!player.preferred_foot || position === 'GK') return null;

  const foot   = player.preferred_foot;
  const wfStat = player.stats.weak_foot ?? 70;

  // Without slot-side context we can only give generic weak-foot warnings
  // for non-wide positions (CM, ST, etc.) — not side-specific WF/FB hints.
  if (slotX === undefined) {
    if (wfStat < 60) {
      return 'Schwacher Schwachfuß — kann auf breiten Positionen problematisch sein.';
    }
    return null;
  }

  const isLeftSlot  = slotX < 40;
  const isRightSlot = slotX > 60;

  if (position === 'WF') {
    const isInverted =
      (isLeftSlot  && foot === 'right') ||
      (isRightSlot && foot === 'left');
    const isNatural =
      (isLeftSlot  && foot === 'left') ||
      (isRightSlot && foot === 'right');

    if (isInverted) {
      return wfStat < 70
        ? 'Invertierter Flügelstürmer — schwache Flanken, aber Cut-Inside-Stärke.'
        : 'Guter Inverted Winger: Abschluss & Kurve profitieren.';
    }
    if (isNatural) {
      return 'Natürliche Seite: Flanken & Liniendribblings werden verstärkt.';
    }
  }

  if (['FB', 'WB', 'WM'].includes(position)) {
    const isWrongSide =
      (isLeftSlot  && foot === 'right') ||
      (isRightSlot && foot === 'left');
    if (isWrongSide && wfStat < 70) {
      return 'Weak-Foot-Risiko: Flanken & Pässe auf dieser Seite weniger verlässlich.';
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Debug helper: returns top-N weighted stats for a player/pos
// ─────────────────────────────────────────────────────────────

export interface WeightedStatContribution {
  stat: string;
  value: number;
  weight: number;
  contribution: number;
  missingContribution: number;
}

function weightedStatContributions(
  player: Player,
  position: Position,
  slotX?: number,
): WeightedStatContribution[] {
  const base = WEIGHTS[position as string];
  if (!base) return [];

  const w = applyContextModifiers(base, player, position, slotX);
  const stats = player.stats as unknown as Record<string, number>;

  return Object.entries(w)
    .filter(([stat, weight]) => weight > 0 && stat !== '_meta')
    .map(([stat, weight]) => {
      const value = stats[stat] ?? 0;
      return {
        stat,
        value,
        weight,
        contribution: value * weight,
        // How many weighted points this stat leaves on the table vs. a perfect 99.
        // This identifies the biggest brake, not just the lowest raw stat.
        missingContribution: Math.max(0, 99 - value) * weight,
      };
    });
}

export function topWeightedStats(
  player: Player,
  position: Position,
  n = 5,
  slotX?: number,
): WeightedStatContribution[] {
  return weightedStatContributions(player, position, slotX)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, n);
}

export function weakestWeightedStat(
  player: Player,
  position: Position,
  slotX?: number,
): WeightedStatContribution | null {
  const entries = weightedStatContributions(player, position, slotX);
  if (entries.length === 0) return null;

  return entries.sort((a, b) => {
    const gap = b.missingContribution - a.missingContribution;
    if (gap !== 0) return gap;
    return b.weight - a.weight;
  })[0] ?? null;
}

// Re-export PlayerStats so callers can import it from this module
export type { PlayerStats };
