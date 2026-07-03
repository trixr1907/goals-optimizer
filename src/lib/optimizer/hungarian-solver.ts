import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import { calcPositionFitScore } from '@/lib/scoring/position-fit';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Munkres = require('munkres-js');

export interface HungarianAssignment {
  slotIndex: number;
  playerId: string;
  fit: number;
}

export type OptimizationMode = 'balanced' | 'offensiv' | 'defensiv' | 'gegenMeta';

export function clonePlayersWithFitBias(
  players: PlayerWithScores[],
  slots: LineupSlot[],
  mode: OptimizationMode,
  getRoleBias: (player: PlayerWithScores, position: Position, mode: OptimizationMode) => number,
): PlayerWithScores[] {
  if (mode === 'balanced') return players;

  const slotPositions = new Set(slots.map((slot) => slot.position));

  return players.map((player) => {
    const fitScores = { ...player.fit_scores };

    slotPositions.forEach((position) => {
      fitScores[position] = (fitScores[position] ?? 0) + getRoleBias(player, position, mode);
    });

    return {
      ...player,
      fit_scores: fitScores,
    };
  });
}

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
        // Apply optional bias to the cost, not the fit — bias affects optimization
        // but the reported fit stays honest.
        const bias = biasFn ? biasFn(player, slot.position) : 0;
        // Lower cost = better. Bias improves (reduces) cost for preferred players.
        row.push(100 - fit - bias);
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
