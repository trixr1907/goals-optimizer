import { describe, expect, it } from 'vitest';
import { ALL_POSITIONS, PlayerStats, PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import { inferFullStats } from '@/lib/scraper/infer-stats';
import { solveHungarian } from './hungarian-solver';

const ZERO_STATS = inferFullStats(0, 0, 0, 0, 0, 0);

function scoreMap(stFit: number): Record<Position, number> {
  return Object.fromEntries(
    ALL_POSITIONS.map((position) => [position, position === 'ST' ? stFit : 1])
  ) as Record<Position, number>;
}

function statsMap(): Record<Position, PlayerStats> {
  return Object.fromEntries(
    ALL_POSITIONS.map((position) => [position, ZERO_STATS])
  ) as Record<Position, PlayerStats>;
}

function positionTypeMap(primary: Position): Record<Position, 'primary' | 'secondary' | 'out'> {
  return Object.fromEntries(
    ALL_POSITIONS.map((position) => [position, position === primary ? 'primary' : 'out'])
  ) as Record<Position, 'primary' | 'secondary' | 'out'>;
}

function player(id: string, name: string, stFit: number): PlayerWithScores {
  return {
    id,
    name,
    position: 'ST',
    overall: stFit,
    rarity: 'Rare',
    stats: ZERO_STATS,
    roleRatings: [{ position: 'ST', overall: stFit }],
    secondaryPositions: [],
    fit_scores: scoreMap(stFit),
    positionType: positionTypeMap('ST'),
    effectiveStats: statsMap(),
  };
}

describe('solveHungarian biasFn', () => {
  it('uses biasFn for assignment decisions while reporting the honest un-biased fit', () => {
    const slots: LineupSlot[] = [{ position: 'ST', x: 50, y: 10 }];
    const playerA = player('a', 'Higher true fit', 80);
    const playerB = player('b', 'Lower true fit with bias', 70);

    const balanced = solveHungarian([playerA, playerB], slots);
    expect(balanced).toEqual([{ slotIndex: 0, playerId: 'a', fit: 80 }]);

    const biased = solveHungarian(
      [playerA, playerB],
      slots,
      (candidate) => candidate.id === 'b' ? 15 : 0
    );

    expect(biased).toEqual([{ slotIndex: 0, playerId: 'b', fit: 70 }]);
  });
});
