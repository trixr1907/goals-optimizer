import { describe, it, expect } from 'vitest';
import { analyzeSquad } from './squad-analysis';
import { Player, isValidPlayer, hasFullStats } from '@/lib/scraper/types';
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

// ── Robustness: stale LocalStorage data ──────────────────────────────────────

describe('analyzeSquad — stale / corrupt LocalStorage resilience', () => {
  it('does not crash when players array contains undefined entries', () => {
    const mixed = [undefined, null, MOCK_PLAYERS[0], undefined] as unknown as Player[];
    expect(() => analyzeSquad(mixed)).not.toThrow();
    const report = analyzeSquad(mixed);
    expect(report.keyPlayers.length).toBeGreaterThanOrEqual(0);
  });

  it('does not crash when players array is entirely null/undefined', () => {
    const broken = [null, undefined, null] as unknown as Player[];
    expect(() => analyzeSquad(broken)).not.toThrow();
    const report = analyzeSquad(broken);
    expect(report.strengths).toEqual([]);
    expect(report.weaknesses).toEqual([]);
    expect(report.recommendations).toEqual([]);
    expect(report.keyPlayers).toEqual([]);
  });

  it('handles player with missing dataQuality — falls back without crash', () => {
    const noQuality: Player = {
      ...mp({ id: 'nq1', name: 'NoQuality', position: 'ST', overall: 75 }),
      dataQuality: undefined,
    };
    expect(() => analyzeSquad([noQuality])).not.toThrow();
    // hasFullStats fallback: derives quality from stats content
    const report = analyzeSquad([noQuality]);
    expect(report.strengths.length).toBeGreaterThan(0);
  });

  it('handles player with missing stats object gracefully', () => {
    const noStats = {
      id: 'ns1', name: 'NoStats', position: 'CB', overall: 72,
      rarity: 'Basic', roleRatings: [], secondaryPositions: [],
      // stats intentionally omitted — simulates severely broken entry
    } as unknown as Player;
    // Should be filtered out by isValidPlayer — no crash
    expect(() => analyzeSquad([noStats])).not.toThrow();
  });
});

// ── isValidPlayer type guard ──────────────────────────────────────────────────

describe('isValidPlayer', () => {
  it('returns false for null', () => expect(isValidPlayer(null)).toBe(false));
  it('returns false for undefined', () => expect(isValidPlayer(undefined)).toBe(false));
  it('returns false for plain string', () => expect(isValidPlayer('x')).toBe(false));
  it('returns false for empty object', () => expect(isValidPlayer({})).toBe(false));

  it('returns false for object missing stats', () => {
    expect(isValidPlayer({ id: 'x', name: 'X', position: 'ST', overall: 70, roleRatings: [], secondaryPositions: [] })).toBe(false);
  });

  it('returns true for a valid Player', () => {
    expect(isValidPlayer(MOCK_PLAYERS[0])).toBe(true);
  });

  it('returns true for all MOCK_PLAYERS', () => {
    for (const p of MOCK_PLAYERS) {
      expect(isValidPlayer(p)).toBe(true);
    }
  });
});

// ── hasFullStats backfill logic ───────────────────────────────────────────────

describe('hasFullStats — dataQuality backfill', () => {
  it('returns true for explicit dataQuality=full', () => {
    const p = mp({ id: 'f1', name: 'Full', position: 'CM', overall: 80, dataQuality: 'full' });
    expect(hasFullStats(p)).toBe(true);
  });

  it('returns false for explicit dataQuality=basic', () => {
    const p = mp({ id: 'b1', name: 'Basic', position: 'CB', overall: 68, stats: inferFullStats(0, 0, 0, 0, 0, 0), dataQuality: 'basic' });
    expect(hasFullStats(p)).toBe(false);
  });

  it('derives full from stats content when dataQuality absent', () => {
    const p: Player = { ...mp({ id: 'nq1', name: 'NoQ', position: 'ST', overall: 74 }), dataQuality: undefined };
    // inferFullStats produces non-zero values → should classify as full
    expect(hasFullStats(p)).toBe(true);
  });

  it('derives basic when all stats are truly zero and dataQuality absent', () => {
    // Build a stats object with every single field set to 0 —
    // inferFullStats(0,...) still produces some non-zero values so we
    // construct the object manually to simulate a genuinely empty stats blob.
    const zeroStats = Object.fromEntries(
      ['pac','sho','pas','dri','def','phy',
       'acceleration','sprint_speed','finishing','shot_power','long_shots',
       'penalties','weak_foot','attacking_iq','ground_pass','lofted_pass',
       'through_pass','crossing','curve','free_kick_accuracy','sprint_dribbling',
       'close_dribbling','skills','agility','balance','first_touch',
       'defensive_iq','stand_tackle','slide_tackle','jockeying','interceptions',
       'blocking','strength','aggression','stamina','heading','jumping',
       'div','reflexes','kicking_power','positioning','catching','parrying',
      ].map((k) => [k, 0])
    );
    const p: Player = {
      ...mp({ id: 'z1', name: 'Zero', position: 'CB', overall: 65 }),
      stats: zeroStats as Player['stats'],
      dataQuality: undefined,
    };
    expect(hasFullStats(p)).toBe(false);
  });
});
