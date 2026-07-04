import { describe, it, expect } from 'vitest';
import { analyzeSquad } from './squad-analysis';
import { Player } from '@/lib/scraper/types';
import { inferFullStats } from '@/lib/scraper/infer-stats';
import { MOCK_PLAYERS } from '@/lib/scraper/mock-data';

function mp(o: Partial<Player> & { id: string; name: string; position: Player['position']; overall: number }): Player {
  return { stats: inferFullStats(70, 70, 70, 70, 70, 70), roleRatings: [{ position: o.position, overall: o.overall }], secondaryPositions: [], rarity: 'Rare', ...o };
}

describe('analyzeSquad', () => {
  it('handles empty squad', () => {
    const r = analyzeSquad([]);
    expect(r.strengths).toEqual([]);
    expect(r.weaknesses).toEqual([]);
    expect(r.recommendations).toEqual([]);
    expect(r.keyPlayers).toEqual([]);
  });

  it('detects creative AM/WF strength from MOCK_PLAYERS', () => {
    const report = analyzeSquad(MOCK_PLAYERS);
    const found = report.strengths.find((s) => s.includes('kreative') || s.includes('Creative'));
    expect(found).toBeDefined();
  });

  it('detects missing DM in squad without one', () => {
    const squad: Player[] = [
      mp({ id: 's1', name: 'ST A', position: 'ST', overall: 85, stats: inferFullStats(85, 90, 70, 80, 30, 65) }),
      mp({ id: 's2', name: 'ST B', position: 'ST', overall: 82, stats: inferFullStats(88, 85, 65, 78, 25, 60) }),
      mp({ id: 'w1', name: 'WF A', position: 'WF', overall: 83, stats: inferFullStats(92, 76, 75, 86, 30, 48) }),
      mp({ id: 'w2', name: 'WF B', position: 'WF', overall: 80, stats: inferFullStats(90, 72, 74, 85, 28, 45) }),
      mp({ id: 'm1', name: 'CM A', position: 'CM', overall: 82, stats: inferFullStats(70, 65, 78, 72, 55, 68) }),
      mp({ id: 'm2', name: 'CM B', position: 'CM', overall: 81, stats: inferFullStats(72, 62, 80, 74, 52, 65) }),
      mp({ id: 'm3', name: 'CM C', position: 'CM', overall: 80, stats: inferFullStats(68, 60, 82, 76, 50, 62) }),
      mp({ id: 'd1', name: 'CB A', position: 'CB', overall: 84, stats: inferFullStats(58, 35, 55, 50, 86, 84) }),
      mp({ id: 'd2', name: 'CB B', position: 'CB', overall: 83, stats: inferFullStats(55, 32, 52, 48, 84, 86) }),
      mp({ id: 'f1', name: 'FB A', position: 'FB', overall: 82, stats: inferFullStats(85, 55, 74, 78, 68, 62) }),
      mp({ id: 'g1', name: 'GK', position: 'GK', overall: 84, stats: inferFullStats(50, 30, 70, 40, 45, 65) }),
    ];
    const report = analyzeSquad(squad);
    const dmWeak = report.weaknesses.find((w) =>
      w.includes('Abräumer') || w.includes('Ball-Winning') || w.includes('DM')
    );
    expect(dmWeak).toBeDefined();
  });

  it('flags basic-data uncertainty without source mentions', () => {
    const players: Player[] = [
      ...MOCK_PLAYERS.slice(0, 3).map((p) => ({ ...p, dataQuality: 'full' as const })),
      mp({ id: 'b1', name: 'Basic ST', position: 'ST', overall: 70, stats: inferFullStats(0, 0, 0, 0, 0, 0), dataQuality: 'basic' }),
      mp({ id: 'b2', name: 'Basic CB', position: 'CB', overall: 68, stats: inferFullStats(0, 0, 0, 0, 0, 0), dataQuality: 'basic' }),
    ];
    const report = analyzeSquad(players);
    const allText = [...report.strengths, ...report.weaknesses, ...report.recommendations].join(' ');
    expect(allText).toMatch(/Basisdaten|unsicher/i);
    expect(allText).not.toMatch(/source|positionSource|roleRatingsSource|sourceWarnings|goals-tracker|playgoals/i);
  });

  it('returns key players from MOCK_PLAYERS', () => {
    const report = analyzeSquad(MOCK_PLAYERS);
    expect(report.keyPlayers.length).toBeGreaterThan(0);
    expect(report.keyPlayers.length).toBeLessThanOrEqual(5);
    for (const kp of report.keyPlayers) {
      expect(kp.name).toBeTruthy();
      expect(kp.playerId).toBeTruthy();
      expect(kp.archetypes.length).toBeGreaterThan(0);
    }
  });

  it('caps arrays at 4 each', () => {
    const report = analyzeSquad(MOCK_PLAYERS);
    expect(report.strengths.length).toBeLessThanOrEqual(4);
    expect(report.weaknesses.length).toBeLessThanOrEqual(4);
    expect(report.recommendations.length).toBeLessThanOrEqual(4);
  });

  it('never mentions source in output', () => {
    const report = analyzeSquad(MOCK_PLAYERS);
    const all = [...report.strengths, ...report.weaknesses, ...report.recommendations,
      ...report.keyPlayers.map((k) => k.summary)].join(' ');
    expect(all).not.toMatch(/source|positionSource|roleRatingsSource|sourceWarnings|scraper/i);
  });
});
