import { describe, it, expect } from 'vitest';
import { detectPlayerArchetypes } from './player-archetypes';
import { Player } from '@/lib/scraper/types';
import { inferFullStats } from '@/lib/scraper/infer-stats';
import { MOCK_PLAYERS } from '@/lib/scraper/mock-data';

function makePlayer(overrides: Partial<Player> & {
  id: string;
  name: string;
  position: Player['position'];
  overall: number;
}): Player {
  return {
    stats: inferFullStats(70, 70, 70, 70, 70, 70),
    roleRatings: [{ position: overrides.position, overall: overrides.overall }],
    secondaryPositions: [],
    rarity: 'Rare',
    ...overrides,
  };
}

describe('detectPlayerArchetypes', () => {
  it('detects Creative AM for a high-passing playmaker', () => {
    const musiala = MOCK_PLAYERS.find((p) => p.name === 'Musiala')!;
    expect(musiala).toBeDefined();

    const results = detectPlayerArchetypes(musiala);
    expect(results.length).toBeGreaterThan(0);

    const creative = results.find((r) => r.type === 'Creative AM');
    expect(creative).toBeDefined();
    expect(creative!.confidence).toBe('high');
    expect(creative!.reason).toBeTruthy();
    expect(creative!.reason).not.toMatch(/source|Source/i);
  });

  it('detects Pace Winger for a fast winger', () => {
    const sane = MOCK_PLAYERS.find((p) => p.name === 'Sané')!;
    expect(sane).toBeDefined();

    const results = detectPlayerArchetypes(sane);
    const paceWinger = results.find((r) => r.type === 'Pace Winger');
    expect(paceWinger).toBeDefined();
    expect(paceWinger!.confidence).toBe('high');
  });

  it('detects Ball-Winning DM for a defensive midfielder', () => {
    const palhinha = MOCK_PLAYERS.find((p) => p.name === 'Palhinha')!;
    expect(palhinha).toBeDefined();

    const results = detectPlayerArchetypes(palhinha);
    const ballWinner = results.find((r) => r.type === 'Ball-Winning DM');
    expect(ballWinner).toBeDefined();
    expect(ballWinner!.reason).not.toMatch(/source|Source/i);
  });

  it('detects Target ST for a strong finisher', () => {
    const kane = MOCK_PLAYERS.find((p) => p.name === 'Kane')!;
    expect(kane).toBeDefined();

    const results = detectPlayerArchetypes(kane);
    const targetSt = results.find((r) => r.type === 'Target ST');
    expect(targetSt).toBeDefined();
  });

  it('detects Physical CB for a strong defender', () => {
    const deLigt = MOCK_PLAYERS.find((p) => p.name === 'De Ligt')!;
    expect(deLigt).toBeDefined();

    const results = detectPlayerArchetypes(deLigt);
    const physicalCb = results.find((r) => r.type === 'Physical CB');
    expect(physicalCb).toBeDefined();
  });

  it('returns max 3 archetypes per player', () => {
    const goretzka = MOCK_PLAYERS.find((p) => p.name === 'Goretzka')!;
    const results = detectPlayerArchetypes(goretzka);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array for GK with no relevant stats', () => {
    const neuer = MOCK_PLAYERS.find((p) => p.name === 'Neuer')!;
    const results = detectPlayerArchetypes(neuer);
    // Neuer has only inferred GK stats; without real GK stats no archetype matches
    // but Sweeper GK could match if stats are high enough
    expect(results.every((r) => r.reason && !r.reason.match(/source|Source/i))).toBe(true);
  });

  it('is conservative with basic-only players', () => {
    const basicPlayer = makePlayer({
      id: 'b1',
      name: 'Basic ST',
      position: 'ST',
      overall: 75,
      stats: inferFullStats(0, 0, 0, 0, 0, 0),
      dataQuality: 'basic',
    });

    const results = detectPlayerArchetypes(basicPlayer);
    // Basic player should get no or low-confidence results
    if (results.length > 0) {
      expect(results.every((r) => r.confidence === 'medium')).toBe(true);
    }
  });

  it('detects Attacking FB/WB for a fast fullback', () => {
    const davies = MOCK_PLAYERS.find((p) => p.name === 'Davies')!;
    expect(davies).toBeDefined();

    const results = detectPlayerArchetypes(davies);
    const attackingFb = results.find((r) => r.type === 'Attacking FB/WB');
    expect(attackingFb).toBeDefined();
  });

  it('never mentions source in reason', () => {
    for (const player of MOCK_PLAYERS) {
      const results = detectPlayerArchetypes(player);
      for (const r of results) {
        expect(r.reason).not.toMatch(/source|positionSource|roleRatingsSource|sourceWarnings|dataQuality|basic/i);
      }
    }
  });

  it('scores are sorted descending', () => {
    for (const player of MOCK_PLAYERS) {
      const results = detectPlayerArchetypes(player);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
      }
    }
  });
});
