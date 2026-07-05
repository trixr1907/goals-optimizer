import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import { calcPositionFitScore } from '@/lib/scoring/position-fit';
import { PRIMARY_BONUS, SECONDARY_BONUS } from './optimizer-constants';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Munkres = require('munkres-js');

export interface HungarianAssignment {
  slotIndex: number;
  playerId: string;
  fit: number;
}

export type OptimizationMode = 'balanced' | 'offensiv' | 'defensiv' | 'gegenMeta';

export function solveHungarian(
  players: PlayerWithScores[],
  slots: LineupSlot[],
  biasFn?: (player: PlayerWithScores, position: Position) => number,
): HungarianAssignment[] {
  const slotCount = slots.length;
  const playerCount = players.length;

  if (slotCount === 0 || playerCount < slotCount) return [];

  const size = Math.max(playerCount, slotCount);
  const matrix: number[][] = [];

  for (let playerIndex = 0; playerIndex < size; playerIndex++) {
    const row: number[] = [];
    const player = players[playerIndex];

    for (let slotIndex = 0; slotIndex < size; slotIndex++) {
      if (player && slotIndex < slotCount) {
        const slot = slots[slotIndex];
        // Recompute with slot.x so foot/side modifiers fire correctly.
        // Falls back to cached fit_scores when full stats are unavailable (activity players).
        const fit = player.stats.pac > 0 || player.stats.dri > 0 || player.stats.def > 0
          ? calcPositionFitScore(player, slot.position, slot.x)
          : (player.fit_scores[slot.position] ?? 0);

        // Position-type bonus: primary > secondary > out-of-position.
        // Applied here as a base so the solver always respects positional legality,
        // even when no biasFn is provided (e.g. in unit tests or direct calls).
        const posType = player.positionType?.[slot.position] ?? 'out';
        const posTypeBias =
          posType === 'primary' ? PRIMARY_BONUS :
          posType === 'secondary' ? SECONDARY_BONUS :
          0;

        // Additional caller-supplied bias (tactic/mode preferences) on top.
        const callerBias = biasFn ? biasFn(player, slot.position) : 0;

        // Lower cost = better. Subtract bonuses to reduce cost for preferred assignments.
        row.push(100 - fit - posTypeBias - callerBias);
      } else {
        row.push(0);
      }
    }

    matrix.push(row);
  }

  const assignments = Munkres(matrix) as Array<[number, number]>;

  return assignments
    .filter(([playerIndex, slotIndex]) => playerIndex < playerCount && slotIndex < slotCount)
    .map(([playerIndex, slotIndex]) => {
      const slot = slots[slotIndex];
      const player = players[playerIndex];
      // Report the honest fit, not the biased one
      const fit = player.stats.pac > 0 || player.stats.dri > 0 || player.stats.def > 0
        ? calcPositionFitScore(player, slot.position, slot.x)
        : (player.fit_scores[slot.position] ?? 0);
      return { slotIndex, playerId: player.id, fit };
    })
    .sort((a, b) => a.slotIndex - b.slotIndex);
}
