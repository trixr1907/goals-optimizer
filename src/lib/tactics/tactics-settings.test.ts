import { describe, expect, it } from 'vitest';
import formationsData from '@/config/formations.json';
import { inferFullStats } from '@/lib/scraper/infer-stats';
import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import {
  FORMATION_TACTICAL_PROFILES,
  GOALS_TACTIC_FORMATION_KEYS,
  PLAYER_RULES_BY_POSITION,
  recommendTacticalSettings,
} from './tactics-settings';

const POSITIONS: Position[] = ['GK', 'CB', 'FB', 'WB', 'DM', 'CM', 'AM', 'WM', 'WF', 'CF', 'ST'];

function player(id: string, position: Position, stats: ReturnType<typeof inferFullStats>): PlayerWithScores {
  return {
    id,
    name: id,
    position,
    overall: 80,
    rarity: 'Rare',
    stats,
    roleRatings: [{ position, overall: 80 }],
    secondaryPositions: [],
    fit_scores: Object.fromEntries(POSITIONS.map((pos) => [pos, pos === position ? 90 : 50])) as Record<Position, number>,
    positionType: Object.fromEntries(POSITIONS.map((pos) => [pos, pos === position ? 'primary' : 'out'])) as Record<Position, 'primary' | 'secondary' | 'out'>,
    effectiveStats: Object.fromEntries(POSITIONS.map((pos) => [pos, stats])) as Record<Position, typeof stats>,
    dataQuality: 'full',
  };
}

function filled(items: Array<[string, Position, PlayerWithScores]>) {
  return items.map(([slotKey, position, p], index) => ({
    slotKey,
    slot: { position, x: 50, y: 50 + index } as LineupSlot,
    player: p,
  }));
}

function baseLineup(overrides: Array<[string, Position, PlayerWithScores]> = []) {
  const byKey = new Map(overrides.map((item) => [item[0], item]));
  const defaults: Array<[string, Position, PlayerWithScores]> = [
    ['GK-0', 'GK', player('GK', 'GK', inferFullStats(60, 35, 60, 50, 40, 70))],
    ['CB-1', 'CB', player('CB 1', 'CB', inferFullStats(76, 35, 58, 55, 82, 78))],
    ['CB-2', 'CB', player('CB 2', 'CB', inferFullStats(76, 35, 58, 55, 82, 78))],
    ['FB-3', 'FB', player('FB 1', 'FB', inferFullStats(80, 45, 70, 70, 72, 74))],
    ['FB-4', 'FB', player('FB 2', 'FB', inferFullStats(80, 45, 70, 70, 72, 74))],
    ['DM-5', 'DM', player('DM', 'DM', inferFullStats(72, 45, 76, 70, 80, 78))],
    ['CM-6', 'CM', player('CM 1', 'CM', inferFullStats(72, 55, 78, 76, 64, 72))],
    ['AM-7', 'AM', player('AM', 'AM', inferFullStats(78, 70, 82, 82, 45, 66))],
    ['WF-8', 'WF', player('WF', 'WF', inferFullStats(84, 75, 72, 82, 35, 68))],
    ['ST-9', 'ST', player('ST', 'ST', inferFullStats(82, 82, 66, 78, 35, 74))],
    ['WF-10', 'WF', player('WF 2', 'WF', inferFullStats(84, 75, 72, 82, 35, 68))],
  ];
  return filled(defaults.map((item) => byKey.get(item[0]) ?? item));
}

describe('tactics settings model', () => {
  it('formation config and profiles contain all 14 GOALS formations', () => {
    expect(Object.keys(formationsData).sort()).toEqual([...GOALS_TACTIC_FORMATION_KEYS].sort());
    expect(Object.keys(FORMATION_TACTICAL_PROFILES).sort()).toEqual([...GOALS_TACTIC_FORMATION_KEYS].sort());
  });

  it('clamps defensive depth to 1-100', () => {
    const settings = recommendTacticalSettings([], '4-3-3 Attack');
    expect(settings.defensiveDepth).toBeGreaterThanOrEqual(1);
    expect(settings.defensiveDepth).toBeLessThanOrEqual(100);
  });

  it('recommends depth <= 42 for slow CBs', () => {
    const lineup = baseLineup([
      ['CB-1', 'CB', player('Slow CB 1', 'CB', inferFullStats(58, 35, 55, 50, 82, 78))],
      ['CB-2', 'CB', player('Slow CB 2', 'CB', inferFullStats(60, 35, 55, 50, 82, 78))],
    ]);
    expect(recommendTacticalSettings(lineup, '4-3-3').defensiveDepth).toBeLessThanOrEqual(42);
  });

  it('recommends depth >= 48 for fast CBs and a good DM', () => {
    const lineup = baseLineup([
      ['CB-1', 'CB', player('Fast CB 1', 'CB', inferFullStats(86, 35, 62, 62, 84, 80))],
      ['CB-2', 'CB', player('Fast CB 2', 'CB', inferFullStats(84, 35, 62, 62, 84, 80))],
      ['DM-5', 'DM', player('Elite DM', 'DM', inferFullStats(78, 45, 80, 72, 86, 82))],
    ]);
    expect(recommendTacticalSettings(lineup, '4-3-3').defensiveDepth).toBeGreaterThanOrEqual(48);
  });

  it('recommends Short for a strong CM/AM axis', () => {
    const lineup = baseLineup([
      ['CM-6', 'CM', player('Creator CM', 'CM', inferFullStats(74, 62, 86, 84, 60, 70))],
      ['AM-7', 'AM', player('Creator AM', 'AM', inferFullStats(78, 74, 88, 88, 42, 66))],
    ]);
    expect(recommendTacticalSettings(lineup, '4-2-3-1').buildUpPlay).toBe('Short');
  });

  it('recommends Long for fast ST/WF plus passer', () => {
    const lineup = baseLineup([
      ['ST-9', 'ST', player('Runner ST', 'ST', inferFullStats(92, 82, 68, 80, 35, 74))],
      ['CM-6', 'CM', player('Deep Passer', 'CM', inferFullStats(72, 55, 86, 74, 64, 72))],
      ['AM-7', 'AM', player('Average AM', 'AM', inferFullStats(72, 65, 72, 72, 45, 66))],
    ]);
    expect(recommendTacticalSettings(lineup, '4-4-2').buildUpPlay).toBe('Long');
  });

  it('sets the most defensive CM to Defend when no DM exists', () => {
    const lineup = baseLineup([
      ['DM-5', 'CM', player('Defensive CM', 'CM', inferFullStats(74, 45, 76, 72, 84, 80))],
      ['CM-6', 'CM', player('Creative CM', 'CM', inferFullStats(74, 60, 84, 84, 55, 70))],
    ]);
    const settings = recommendTacticalSettings(lineup, '4-4-2');
    expect(settings.playerRules['DM-5']).toBe('Defend');
  });

  it('never recommends player rules outside allowed rules', () => {
    const lineup = baseLineup();
    const settings = recommendTacticalSettings(lineup, '3-4-3');
    for (const item of lineup) {
      expect(PLAYER_RULES_BY_POSITION[item.slot.position]).toContain(settings.playerRules[item.slotKey]);
    }
  });
});
