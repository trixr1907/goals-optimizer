import { describe, it, expect } from 'vitest';
import { calcPositionFitScore, enrichPlayerWithScores } from './position-fit';
import { Player } from '@/lib/scraper/types';
import { inferFullStats } from '@/lib/scraper/infer-stats';

function makePlayer(overrides: Partial<Player> & { id: string; name: string; position: Player['position']; overall: number }): Player {
  return {
    stats: inferFullStats(70, 70, 70, 70, 70, 70),
    roleRatings: [{ position: overrides.position, overall: overrides.overall }],
    secondaryPositions: [],
    rarity: 'Rare',
    ...overrides,
  };
}

function gkStats() {
  return inferFullStats(50, 25, 40, 35, 30, 60);
}

describe('calcPositionFitScore — GK scoring', () => {
  it('primary GK scores higher on GK than on CB', () => {
    const neuer: Player = {
      id: 'gk1',
      name: 'Neuer',
      position: 'GK',
      overall: 90,
      rarity: 'Mythic',
      stats: gkStats(),
      roleRatings: [{ position: 'GK', overall: 90 }],
      secondaryPositions: [],
    };

    const gkFit = calcPositionFitScore(neuer, 'GK');
    const cbFit = calcPositionFitScore(neuer, 'CB');
    const stFit = calcPositionFitScore(neuer, 'ST');

    expect(gkFit).toBeGreaterThan(cbFit);
    expect(gkFit).toBeGreaterThan(stFit);
    expect(gkFit).toBeGreaterThan(50);
  });

  it('field player scores very low on GK', () => {
    const kane: Player = {
      id: 'st1',
      name: 'Kane',
      position: 'ST',
      overall: 91,
      rarity: 'Mythic',
      stats: inferFullStats(70, 94, 82, 78, 40, 78),
      roleRatings: [{ position: 'ST', overall: 91 }],
      secondaryPositions: [],
    };

    const gkFit = calcPositionFitScore(kane, 'GK');
    const stFit = calcPositionFitScore(kane, 'ST');

    // Field player on GK must be very low — much worse than their primary
    expect(gkFit).toBeLessThan(30);
    expect(stFit).toBeGreaterThan(gkFit);
  });
});

describe('calcPositionFitScore — role/position penalties', () => {
  const basePlayer = makePlayer({
    id: 'p1',
    name: 'Test Player',
    position: 'CM',
    overall: 85,
    secondaryPositions: ['AM'],
  });

  it('primary position scores >= secondary (comparable stats)', () => {
    const cmFit = calcPositionFitScore(basePlayer, 'CM');
    const amFit = calcPositionFitScore(basePlayer, 'AM');
    // Primary should not be worse than secondary
    expect(cmFit).toBeGreaterThanOrEqual(amFit);
  });

  it('secondary scores better than out-of-position (comparable stats)', () => {
    const amFit = calcPositionFitScore(basePlayer, 'AM');
    const cbFit = calcPositionFitScore(basePlayer, 'CB');
    // AM is secondary, CB is out — AM should be better (or at least not much worse)
    expect(amFit).toBeGreaterThan(cbFit);
  });

  it('out-of-position gets significant penalty', () => {
    const player = makePlayer({
      id: 'p2',
      name: 'Pure ST',
      position: 'ST',
      overall: 88,
      secondaryPositions: [],
      stats: inferFullStats(88, 92, 70, 80, 30, 75),
    });

    const stFit = calcPositionFitScore(player, 'ST');
    const cbFit = calcPositionFitScore(player, 'CB');
    const gkFit = calcPositionFitScore(player, 'GK');

    // Out-of-position should be significantly lower
    expect(stFit).toBeGreaterThan(cbFit + 10);
    expect(stFit).toBeGreaterThan(gkFit + 10);
  });
});

describe('enrichPlayerWithScores — demo Neuer', () => {
  it('Neuer GK-fit > CB-fit after enrichment', () => {
    const neuer: Player = {
      id: '1',
      name: 'Neuer',
      position: 'GK',
      overall: 90,
      rarity: 'Mythic',
      stats: inferFullStats(50, 30, 80, 40, 55, 78),
      roleRatings: [{ position: 'GK', overall: 90 }],
      secondaryPositions: [],
    };

    const enriched = enrichPlayerWithScores(neuer);
    expect(enriched.fit_scores['GK']).toBeGreaterThan(enriched.fit_scores['CB']);
    expect(enriched.fit_scores['GK']).toBeGreaterThan(45);
  });
});

describe('enrichPlayerWithScores — basic player without full stats', () => {
  it('uses roleRating OVR for known positions', () => {
    const player: Player = {
      id: 'basic1',
      name: 'Basic GK',
      position: 'GK',
      overall: 85,
      rarity: 'Rare',
      // Zero stats → no full stats path
      stats: inferFullStats(0, 0, 0, 0, 0, 0),
      roleRatings: [{ position: 'GK', overall: 85 }],
      secondaryPositions: [],
    };

    const enriched = enrichPlayerWithScores(player);
    // 85/99*100 ≈ 86
    expect(enriched.fit_scores['GK']).toBeGreaterThan(80);
    expect(enriched.fit_scores['ST']).toBe(1); // unrelated position
  });
});
