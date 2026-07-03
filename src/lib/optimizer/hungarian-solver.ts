import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';

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
        const fit = player.fit_scores[slots[slotIndex].position] ?? 0;
        row.push(100 - fit);
      } else {
        row.push(0);
      }
    }

    matrix.push(row);
  }

  const assignments = Munkres(matrix) as Array<[number, number]>;

  return assignments
    .filter(([playerIndex, slotIndex]) => playerIndex < playerCount && slotIndex < slotCount)
    .map(([playerIndex, slotIndex]) => ({
      slotIndex,
      playerId: players[playerIndex].id,
      fit: players[playerIndex].fit_scores[slots[slotIndex].position] ?? 0,
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex);
}
