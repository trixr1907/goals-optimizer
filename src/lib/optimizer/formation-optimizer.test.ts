import { describe, it, expect } from 'vitest';
import { recommendFormations } from './formation-optimizer';
import { Player, PlayerWithScores } from '@/lib/scraper/types';
import { enrichPlayerWithScores } from '@/lib/scoring/position-fit';
import { inferFullStats } from '@/lib/scraper/infer-stats';

function s(pac: number, sho: number, pas: number, dri: number, def: number, phy: number) {
  return inferFullStats(pac, sho, pas, dri, def, phy);
}

const SQUAD: Player[] = [
  { id: '1', name: 'Neuer', position: 'GK', overall: 90, rarity: 'Mythic', stats: s(50, 30, 80, 40, 55, 78), roleRatings: [{ position: 'GK', overall: 90 }], secondaryPositions: [] },
  { id: '2', name: 'Davies', position: 'FB', overall: 87, rarity: 'Epic', stats: s(96, 60, 78, 85, 72, 70), roleRatings: [{ position: 'FB', overall: 87 }], secondaryPositions: [], preferred_foot: 'left' },
  { id: '3', name: 'De Ligt', position: 'CB', overall: 86, rarity: 'Epic', stats: s(62, 55, 65, 55, 88, 86), roleRatings: [{ position: 'CB', overall: 86 }], secondaryPositions: [] },
  { id: '4', name: 'Upamecano', position: 'CB', overall: 84, rarity: 'Rare', stats: s(78, 40, 62, 58, 84, 85), roleRatings: [{ position: 'CB', overall: 84 }], secondaryPositions: [] },
  { id: '5', name: 'Kimmich', position: 'FB', overall: 88, rarity: 'Epic', stats: s(70, 68, 88, 80, 78, 72), roleRatings: [{ position: 'FB', overall: 88 }], secondaryPositions: [], preferred_foot: 'right' },
  { id: '6', name: 'Goretzka', position: 'CM', overall: 86, rarity: 'Epic', stats: s(78, 82, 80, 75, 74, 86), roleRatings: [{ position: 'CM', overall: 86 }], secondaryPositions: [] },
  { id: '7', name: 'Musiala', position: 'AM', overall: 88, rarity: 'Legendary', stats: s(82, 78, 85, 92, 40, 58), roleRatings: [{ position: 'AM', overall: 88 }], secondaryPositions: [] },
  { id: '8', name: 'Sane', position: 'WF', overall: 86, rarity: 'Epic', stats: s(93, 82, 78, 88, 35, 55), roleRatings: [{ position: 'WF', overall: 86 }], secondaryPositions: [] },
  { id: '9', name: 'Coman', position: 'WF', overall: 85, rarity: 'Epic', stats: s(94, 74, 76, 88, 30, 52), roleRatings: [{ position: 'WF', overall: 85 }], secondaryPositions: [] },
  { id: '10', name: 'Kane', position: 'ST', overall: 91, rarity: 'Mythic', stats: s(70, 94, 82, 78, 40, 78), roleRatings: [{ position: 'ST', overall: 91 }], secondaryPositions: [] },
  { id: '11', name: 'Muller', position: 'CF', overall: 84, rarity: 'Legendary', stats: s(62, 82, 80, 74, 50, 64), roleRatings: [{ position: 'CF', overall: 84 }], secondaryPositions: [] },
  { id: '12', name: 'Olise', position: 'WF', overall: 83, rarity: 'Rare', stats: s(84, 76, 80, 86, 38, 52), roleRatings: [{ position: 'WF', overall: 83 }], secondaryPositions: [] },
  { id: '13', name: 'Laimer', position: 'CM', overall: 82, rarity: 'Rare', stats: s(76, 62, 74, 72, 76, 78), roleRatings: [{ position: 'CM', overall: 82 }], secondaryPositions: [] },
  { id: '14', name: 'Palhinha', position: 'DM', overall: 85, rarity: 'Epic', stats: s(62, 65, 72, 68, 86, 88), roleRatings: [{ position: 'DM', overall: 85 }], secondaryPositions: [] },
  { id: '15', name: 'Tel', position: 'ST', overall: 78, rarity: 'Uncommon', stats: s(88, 76, 64, 78, 28, 62), roleRatings: [{ position: 'ST', overall: 78 }], secondaryPositions: [] },
];

function enrichedSquad(): PlayerWithScores[] {
  return SQUAD.map(enrichPlayerWithScores);
}

describe('recommendFormations', () => {
  it('returns recommendations with enough players', () => {
    const players = enrichedSquad();
    const recs = recommendFormations(players);
    expect(recs.length).toBeGreaterThan(0);
  });

  it('returns empty with fewer than 11 players', () => {
    const players = enrichedSquad().slice(0, 10);
    expect(recommendFormations(players)).toEqual([]);
  });

  it('each recommendation has 11 unique players', () => {
    const recs = recommendFormations(enrichedSquad());
    for (const rec of recs) {
      const ids = rec.assignments.map((a) => a.player.id);
      expect(new Set(ids).size).toBe(11);
      expect(ids.length).toBe(11);
    }
  });

  it('best recommendation has GK in GK slot', () => {
    const recs = recommendFormations(enrichedSquad());
    const best = recs[0];
    const gkSlot = best.assignments.find((a) => a.slot.position === 'GK');
    expect(gkSlot).toBeDefined();
    expect(gkSlot!.player.position).toBe('GK');
  });

  it('no player appears twice in a recommendation', () => {
    const recs = recommendFormations(enrichedSquad());
    for (const rec of recs) {
      const ids = rec.assignments.map((a) => a.player.id);
      expect(ids.length).toBe(new Set(ids).size);
    }
  });
});

describe('variant assignments', () => {
  it('offensiv, defensiv, gegenMeta all produce 11-player assignments', () => {
    const players = enrichedSquad();
    const recs = recommendFormations(players);
    const best = recs[0];

    const variants = ['offensiv', 'defensiv', 'gegenMeta'] as const;
    for (const variant of variants) {
      const assignments = best.variants[variant];
      expect(assignments.length).toBe(11);
      const ids = assignments.map((a) => a.player.id);
      expect(new Set(ids).size).toBe(11);
    }
  });
});
