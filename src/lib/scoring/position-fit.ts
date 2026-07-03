import { Player, PlayerWithScores, Position, ALL_POSITIONS, getPositionType, getEffectiveStats } from '@/lib/scraper/types';
import type { PlayerStats } from '@/lib/scraper/types';
import detailedWeights from '@/config/position-weights-detailed.json';

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
  if (foot) {
    const isInvertedLeft  = position === 'WF' && foot === 'right';
    const isInvertedRight = position === 'WF' && foot === 'left';
    const isNaturalLeft   = position === 'WF' && foot === 'left';
    const isNaturalRight  = position === 'WF' && foot === 'right';

    if (isInvertedLeft || isInvertedRight) {
      // Inside-forward: cuts inside → finishing & curve are the money stats
      w['finishing'] = (w['finishing'] ?? 0) * 1.4;
      w['curve']     = (w['curve']     ?? 0) * 1.4;
    }

    if (isNaturalLeft || isNaturalRight) {
      // Traditional winger: hugs the line → crossing is the primary weapon
      w['crossing'] = (w['crossing'] ?? 0) * 1.5;
    }

    // ── Weak-foot quality scaling ─────────────────────────
    // wfStat < 70: penalise all stats normally executed with the weak foot.
    //   The penalty shrinks the weights of the *wrong* foot's dominant actions,
    //   simulating reduced reliability. We scale down bilateral technical stats.
    // wfStat > 85: both feet are reliable → no asymmetric modifier needed.
    if (wfStat < 70) {
      // Determine which side the player's weak foot is
      const isOnWrongSide =
        (['FB','WB','WM','WF'].includes(position) && foot === 'right') ||
        (['FB','WB','WM','WF'].includes(position) && foot === 'left');

      if (isOnWrongSide) {
        // Actions requiring the weak foot under pressure are less reliable
        const penalty = 0.5 + (wfStat / 70) * 0.4; // 0.50 at wf=0 … 0.90 at wf=70
        w['crossing']  = (w['crossing']  ?? 0) * penalty;
        w['finishing'] = (w['finishing'] ?? 0) * penalty;
        w['curve']     = (w['curve']     ?? 0) * penalty;
        w['through_pass'] = (w['through_pass'] ?? 0) * penalty;
      }
    }
    // wfStat > 85 → no change: both feet treated as equally good
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

export function calcPositionFitScore(player: Player, position: Position): number {
  const base = WEIGHTS[position as string];
  if (!base) return 50;

  const w = applyContextModifiers(base, player, position);

  const stats = player.stats as unknown as Record<string, number>;

  let numerator   = 0;
  let denominator = 0;

  for (const [stat, weight] of Object.entries(w)) {
    if (weight <= 0 || stat === '_meta') continue;
    const value = stats[stat] ?? 0;
    numerator   += value  * weight;
    denominator += 99     * weight;
  }

  if (denominator === 0) return 50;

  const raw = (numerator / denominator) * 100;
  return Math.round(Math.max(1, Math.min(raw, 99)));
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

export function explainFootFit(player: Player, position: Position): string | null {
  if (!player.preferred_foot || position === 'GK') return null;

  const foot   = player.preferred_foot;
  const wfStat = player.stats.weak_foot ?? 70;

  const isInverted =
    (position === 'WF' && foot === 'right') ||
    (position === 'WF' && foot === 'left');
  const isNatural =
    (position === 'WF' && foot === 'left') ||
    (position === 'WF' && foot === 'right');
  const isWrongSideWide =
    (['FB','WB','WM'].includes(position) && foot === 'right') ||
    (['FB','WB','WM'].includes(position) && foot === 'left');

  if (isInverted) {
    return wfStat < 70
      ? 'Invertierter Flügelstürmer — schwache Flanken, aber Cut-Inside-Stärke.'
      : 'Guter Inverted Winger: Abschluss & Kurve profitieren.';
  }
  if (isNatural) {
    return 'Natürliche Seite: Flanken & Liniendribblings werden verstärkt.';
  }
  if (isWrongSideWide && wfStat < 70) {
    return 'Weak-Foot-Risiko: Flanken & Pässe auf dieser Seite weniger verlässlich.';
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Debug helper: returns top-N weighted stats for a player/pos
// ─────────────────────────────────────────────────────────────

export function topWeightedStats(
  player: Player,
  position: Position,
  n = 5,
): Array<{ stat: string; value: number; weight: number; contribution: number }> {
  const base = WEIGHTS[position as string];
  if (!base) return [];

  const w = applyContextModifiers(base, player, position);
  const stats = player.stats as unknown as Record<string, number>;

  const entries = Object.entries(w)
    .filter(([stat, weight]) => weight > 0 && stat !== '_meta')
    .map(([stat, weight]) => ({
      stat,
      value:        stats[stat] ?? 0,
      weight,
      contribution: (stats[stat] ?? 0) * weight,
    }))
    .sort((a, b) => b.contribution - a.contribution);

  return entries.slice(0, n);
}

// Re-export PlayerStats so callers can import it from this module
export type { PlayerStats };
