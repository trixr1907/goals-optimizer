import { Player, PlayerWithScores, Position, ALL_POSITIONS } from '@/lib/scraper/types';
import posWeights from '@/config/position-weights.json';

const WEIGHTS = posWeights as Record<string, Record<string, number>>;
const MAX_RAW_WEIGHT = 5.0;

// GOALS weak-foot works like a multiplier on technical actions with the weak foot.
// If the real stat is unknown, assume a conservative 70% weak-foot.
function weakFootMultiplier(player: Player): number {
  const value = player.weak_foot ?? 70;
  if (value <= 5) return Math.max(0.45, Math.min(1, value / 5)); // star-like fallback
  return Math.max(0.45, Math.min(1, value / 99));
}

function sideFootBonus(player: Player, position: Position): number {
  if (!player.preferred_foot || position === 'GK') return 0;

  const wf = weakFootMultiplier(player);
  const technicalReliability = wf * 100;

  // Traditional wide role: left foot on left / right foot on right improves crossing.
  const isLeftWide = position === 'LB' || position === 'LWB' || position === 'LM' || position === 'LW';
  const isRightWide = position === 'RB' || position === 'RWB' || position === 'RM' || position === 'RW';
  const naturalSide =
    (isLeftWide && player.preferred_foot === 'left') ||
    (isRightWide && player.preferred_foot === 'right');

  // Inverted winger / inside-forward: opposite foot on advanced wing helps shooting/cutting in.
  const invertedForward =
    (position === 'LW' && player.preferred_foot === 'right') ||
    (position === 'RW' && player.preferred_foot === 'left');

  if (naturalSide) {
    // Bonus is larger for wing-backs/mids where crossing/clearance under pressure matters.
    return ['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM'].includes(position) ? 3 : 1;
  }

  if (invertedForward) {
    // Inverted wingers are only a net-positive if weak-foot is good enough for passes/crosses.
    return technicalReliability >= 75 ? 3 : -2;
  }

  // Central roles tolerate footedness well if weak-foot is solid.
  if (position === 'CM' || position === 'CAM' || position === 'CF' || position === 'ST') {
    return technicalReliability >= 80 ? 1 : 0;
  }

  // Wrong side with weak weak-foot: passing/crossing out of pressure suffers.
  return technicalReliability < 70 ? -4 : -1;
}

export function calcPositionFitScore(player: Player, position: Position): number {
  const w = WEIGHTS[position as string];
  if (!w) return 50;

  const raw =
    player.stats.pac * (w.pac ?? 0) +
    player.stats.sho * (w.sho ?? 0) +
    player.stats.pas * (w.pas ?? 0) +
    player.stats.dri * (w.dri ?? 0) +
    player.stats.def * (w.def ?? 0) +
    player.stats.phy * (w.phy ?? 0);

  const norm = raw / MAX_RAW_WEIGHT;
  const adjusted = norm + sideFootBonus(player, position);
  return Math.round(Math.max(1, Math.min(adjusted, 99)));
}

export function enrichPlayerWithScores(player: Player): PlayerWithScores {
  const fit_scores = {} as Record<Position, number>;
  for (const pos of ALL_POSITIONS) {
    fit_scores[pos] = calcPositionFitScore(player, pos);
  }
  return { ...player, fit_scores };
}

export function explainFootFit(player: Player, position: Position): string | null {
  if (!player.preferred_foot || position === 'GK') return null;
  const bonus = sideFootBonus(player, position);
  if (bonus >= 3) return 'Starker Foot-Fit: Rolle passt gut zum bevorzugten Fuß.';
  if (bonus <= -3) return 'Weak-Foot-Risiko: falsche Seite kann Pässe/Flanken/Abschlüsse schwächen.';
  return null;
}
