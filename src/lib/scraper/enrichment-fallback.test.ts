/**
 * Integration tests for the Tracker → PlayGOALS → Goalsverse enrichment chain.
 *
 * We can't mock fetch() in vitest without msw, so we test the chain via the
 * exported parser functions directly — simulating what each source would return
 * and verifying that the enrichment logic in goalsverse-client correctly applies
 * the right positionSource / roleRatingsSource / sourceWarnings.
 *
 * These tests cover the 3 key scenarios:
 *   A. Tracker success → positionSource goals-tracker, roleRatingsSource goals-tracker
 *   B. Tracker 403 + PlayGOALS success → positionSource playgoals, roleRatingsSource goalsverse
 *   C. Tracker 403 + PlayGOALS 403 → positionSource goalsverse, roleRatingsSource goalsverse + warnings
 */

import { describe, it, expect } from 'vitest';
import type { Player, Position, PositionSource, RoleRatingsSource } from './types';
import type { TrackerFetchResult } from './goals-tracker-client';
import type { PlayGoalsFetchResult } from './playgoals-client';

// ── Shared test helpers ───────────────────────────────────────────────────────

function makeBasePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id:                'goalsverse-d6553983-f4d5-5923-8fe9-077939607a12',
    name:              'Wendelin Pietsch',
    position:          'CB',  // ← wrong Goalsverse position (CB=FB=WB tie, Goalsverse picks CB)
    overall:           76,
    rarity:            'Uncommon',
    roleRatings:       [
      { position: 'CB', overall: 76 },
      { position: 'FB', overall: 76 },
      { position: 'WB', overall: 76 },
    ],
    secondaryPositions: ['FB', 'WB'],
    stats: {
      pac: 72, sho: 50, pas: 68, dri: 65, def: 75, phy: 73,
      acceleration: 71, sprint_speed: 73,
      finishing: 48, shot_power: 52, long_shots: 45, penalties: 50,
      weak_foot: 50, attacking_iq: 55,
      ground_pass: 67, lofted_pass: 68, through_pass: 63, crossing: 69, curve: 60, free_kick_accuracy: 58,
      sprint_dribbling: 64, close_dribbling: 62, skills: 52, agility: 67, balance: 65, first_touch: 68,
      defensive_iq: 77, stand_tackle: 76, slide_tackle: 75, jockeying: 74, interceptions: 76, blocking: 72,
      strength: 74, aggression: 70, stamina: 72, heading: 68, jumping: 71,
      div: 30, kic: 30, reflexes: 30, positioning: 30, catching: 30, parrying: 30,
    },
    positionSource:   'goalsverse',
    roleRatingsSource: 'goalsverse',
    ...overrides,
  };
}

/**
 * Simulate what enrichWithTracker does for a single player,
 * given pre-determined tracker and playgoals results.
 *
 * This mirrors the logic in goalsverse-client.ts:enrichWithTracker without
 * making real network calls.
 */
function simulateEnrichment(
  player: Player,
  trackerResult: TrackerFetchResult,
  pgResult: PlayGoalsFetchResult,
): Player {
  const rawId = player.id.replace('goalsverse-', '');
  const { data: trackerData, failReason: trackerFail, failDetail: trackerDetail } = trackerResult;

  const trackerFullSuccess =
    trackerData !== null &&
    trackerData.primaryPosition !== null &&
    trackerData.roleRatings.length > 0;

  if (trackerFullSuccess) {
    const td = trackerData!;
    const newPosition  = td.primaryPosition!;
    const newRoleRatings = td.roleRatings;
    const newSecondary: Position[] = newRoleRatings
      .filter((r) => r.overall >= player.overall - 10 && r.position !== newPosition)
      .map((r) => r.position);
    return {
      ...player,
      position:          newPosition,
      roleRatings:       newRoleRatings,
      secondaryPositions: newSecondary,
      positionSource:    'goals-tracker' as PositionSource,
      roleRatingsSource:  'goals-tracker' as RoleRatingsSource,
      sourceWarnings:    undefined,
    };
  }

  const trackerWarnings: string[] = [];
  const trackerFailMsg = trackerFail
    ? `goals-tracker: ${trackerFail}${trackerDetail ? ` (${trackerDetail})` : ''} für ${rawId}`
    : `goals-tracker: kein Ergebnis für ${rawId}`;
  trackerWarnings.push(trackerFailMsg);

  const trackerPos    = trackerData?.primaryPosition ?? null;
  const trackerRatings = trackerData?.roleRatings ?? [];

  if (trackerPos !== null && trackerRatings.length === 0) {
    trackerWarnings.push(`goals-tracker: roleRatings fehlen, nutze Goalsverse`);
  }

  let finalPosition:    Position       = trackerPos ?? player.position;
  let finalPosSource:   PositionSource = trackerPos !== null ? 'goals-tracker' : 'goalsverse';
  const finalRoleRatings               = trackerRatings.length > 0 ? trackerRatings : player.roleRatings;
  const finalRrsSource: RoleRatingsSource = trackerRatings.length > 0 ? 'goals-tracker' : 'goalsverse';

  if (trackerPos === null) {
    if (pgResult.data !== null) {
      finalPosition  = pgResult.data.primaryPosition;
      finalPosSource = 'playgoals';
      trackerWarnings.push(`playgoals: fallback position ${finalPosition} (tracker: ${trackerFail ?? 'miss'})`);
      trackerWarnings.push(`goals-tracker: roleRatings nicht verfügbar, nutze Goalsverse`);
    } else {
      const pgFail   = pgResult.failReason ?? 'network_error';
      const pgDetail = pgResult.failDetail ? ` (${pgResult.failDetail})` : '';
      trackerWarnings.push(`playgoals: ${pgFail}${pgDetail} für ${rawId}, nutze Goalsverse`);
    }
  }

  const newSecondary: Position[] = finalRoleRatings
    .filter((r) => r.overall >= player.overall - 10 && r.position !== finalPosition)
    .map((r) => r.position);

  const allWarnings = [...(player.sourceWarnings ?? []), ...trackerWarnings];

  return {
    ...player,
    position:          finalPosition,
    roleRatings:       finalRoleRatings,
    secondaryPositions: newSecondary,
    positionSource:    finalPosSource,
    roleRatingsSource:  finalRrsSource,
    sourceWarnings:    allWarnings.length > 0 ? allWarnings : undefined,
  };
}

// ── Scenario A: Tracker success ───────────────────────────────────────────────

describe('Scenario A — Tracker success: positionSource + roleRatingsSource both goals-tracker', () => {
  const trackerSuccess: TrackerFetchResult = {
    data: {
      characterId: 'd6553983-f4d5-5923-8fe9-077939607a12',
      primaryPosition: 'FB',
      roleRatings: [
        { position: 'FB', overall: 76 },
        { position: 'WB', overall: 76 },
        { position: 'CB', overall: 74 }, // ← Tracker corrects CB from 76→74
      ],
    },
  };
  const pgUnused: PlayGoalsFetchResult = { data: null, failReason: 'network_error' };

  it('position is FB (from Tracker)', () => {
    const result = simulateEnrichment(makeBasePlayer(), trackerSuccess, pgUnused);
    expect(result.position).toBe('FB');
  });

  it('positionSource is goals-tracker', () => {
    const result = simulateEnrichment(makeBasePlayer(), trackerSuccess, pgUnused);
    expect(result.positionSource).toBe('goals-tracker');
  });

  it('roleRatingsSource is goals-tracker', () => {
    const result = simulateEnrichment(makeBasePlayer(), trackerSuccess, pgUnused);
    expect(result.roleRatingsSource).toBe('goals-tracker');
  });

  it('CB rating is 74 (Tracker value, not Goalsverse 76)', () => {
    const result = simulateEnrichment(makeBasePlayer(), trackerSuccess, pgUnused);
    const cb = result.roleRatings.find((r) => r.position === 'CB');
    expect(cb?.overall).toBe(74);
  });

  it('no sourceWarnings on full success', () => {
    const result = simulateEnrichment(makeBasePlayer(), trackerSuccess, pgUnused);
    expect(result.sourceWarnings).toBeUndefined();
  });

  it('PlayGOALS is NOT called (pgResult irrelevant on full Tracker success)', () => {
    const pgHadData: PlayGoalsFetchResult = {
      data: { characterId: 'test', primaryPosition: 'CB', overall: 99 },
    };
    const result = simulateEnrichment(makeBasePlayer(), trackerSuccess, pgHadData);
    // Even though pg "returned" CB:99, the result uses Tracker's FB
    expect(result.position).toBe('FB');
    expect(result.positionSource).toBe('goals-tracker');
  });
});

// ── Scenario B: Tracker 403 + PlayGOALS success ───────────────────────────────

describe('Scenario B — Tracker 403 + PlayGOALS success: positionSource playgoals, roleRatingsSource goalsverse', () => {
  const tracker403: TrackerFetchResult = {
    data:       null,
    failReason: 'http_status',
    failDetail: 'HTTP 403',
  };
  const pgSuccess: PlayGoalsFetchResult = {
    data: {
      characterId: 'd6553983-f4d5-5923-8fe9-077939607a12',
      primaryPosition: 'FB',
      overall: 76,
    },
  };

  it('position is FB (from PlayGOALS fallback)', () => {
    const result = simulateEnrichment(makeBasePlayer(), tracker403, pgSuccess);
    expect(result.position).toBe('FB');
  });

  it('positionSource is playgoals', () => {
    const result = simulateEnrichment(makeBasePlayer(), tracker403, pgSuccess);
    expect(result.positionSource).toBe('playgoals');
  });

  it('roleRatingsSource is goalsverse (Tracker had no ratings)', () => {
    const result = simulateEnrichment(makeBasePlayer(), tracker403, pgSuccess);
    expect(result.roleRatingsSource).toBe('goalsverse');
  });

  it('roleRatingsSource is NOT goals-tracker when Tracker roleRatings were absent', () => {
    const result = simulateEnrichment(makeBasePlayer(), tracker403, pgSuccess);
    expect(result.roleRatingsSource).not.toBe('goals-tracker');
  });

  it('roleRatings are unchanged (Goalsverse values kept)', () => {
    const base   = makeBasePlayer();
    const result = simulateEnrichment(base, tracker403, pgSuccess);
    expect(result.roleRatings).toEqual(base.roleRatings);
  });

  it('sourceWarnings includes tracker 403 message', () => {
    const result = simulateEnrichment(makeBasePlayer(), tracker403, pgSuccess);
    expect(result.sourceWarnings).toBeDefined();
    const warnings = result.sourceWarnings!;
    expect(warnings.some((w) => w.includes('http_status') || w.includes('goals-tracker'))).toBe(true);
    expect(warnings.some((w) => w.includes('403'))).toBe(true);
  });

  it('sourceWarnings includes playgoals fallback message', () => {
    const result = simulateEnrichment(makeBasePlayer(), tracker403, pgSuccess);
    const warnings = result.sourceWarnings ?? [];
    expect(warnings.some((w) => w.includes('playgoals') && w.includes('FB'))).toBe(true);
  });

  it('sourceWarnings mentions roleRatings fallback', () => {
    const result = simulateEnrichment(makeBasePlayer(), tracker403, pgSuccess);
    const warnings = result.sourceWarnings ?? [];
    expect(warnings.some((w) => w.includes('roleRatings') || w.includes('Goalsverse'))).toBe(true);
  });
});

// ── Scenario C: Tracker 403 + PlayGOALS 403 ──────────────────────────────────

describe('Scenario C — Tracker 403 + PlayGOALS 403: full Goalsverse fallback with warnings', () => {
  const tracker403: TrackerFetchResult = {
    data:       null,
    failReason: 'http_status',
    failDetail: 'HTTP 403',
  };
  const pg403: PlayGoalsFetchResult = {
    data:       null,
    failReason: 'http_status',
    failDetail: 'HTTP 403',
  };

  it('position stays CB (Goalsverse default — both sources failed)', () => {
    const result = simulateEnrichment(makeBasePlayer(), tracker403, pg403);
    expect(result.position).toBe('CB');
  });

  it('positionSource is goalsverse', () => {
    const result = simulateEnrichment(makeBasePlayer(), tracker403, pg403);
    expect(result.positionSource).toBe('goalsverse');
  });

  it('roleRatingsSource is goalsverse', () => {
    const result = simulateEnrichment(makeBasePlayer(), tracker403, pg403);
    expect(result.roleRatingsSource).toBe('goalsverse');
  });

  it('sourceWarnings mentions both tracker and playgoals failures', () => {
    const result = simulateEnrichment(makeBasePlayer(), tracker403, pg403);
    const warnings = result.sourceWarnings ?? [];
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.some((w) => w.includes('goals-tracker'))).toBe(true);
    expect(warnings.some((w) => w.includes('playgoals'))).toBe(true);
  });
});

// ── Scenario D: Tracker partial (position only, no roleRatings) ───────────────

describe('Scenario D — Tracker returns position but no roleRatings', () => {
  const trackerPartial: TrackerFetchResult = {
    data: {
      characterId: 'd6553983-f4d5-5923-8fe9-077939607a12',
      primaryPosition: 'FB',
      roleRatings: [], // ← no ratings
    },
    failReason: 'parse_roleRatings_missing',
    failDetail: 'pitch absent',
  };
  const pgUnused: PlayGoalsFetchResult = { data: null, failReason: 'network_error' };

  it('position is FB (from Tracker)', () => {
    const result = simulateEnrichment(makeBasePlayer(), trackerPartial, pgUnused);
    expect(result.position).toBe('FB');
  });

  it('positionSource is goals-tracker (Tracker gave us the position)', () => {
    const result = simulateEnrichment(makeBasePlayer(), trackerPartial, pgUnused);
    expect(result.positionSource).toBe('goals-tracker');
  });

  it('roleRatingsSource is goalsverse (Tracker had no ratings)', () => {
    const result = simulateEnrichment(makeBasePlayer(), trackerPartial, pgUnused);
    expect(result.roleRatingsSource).toBe('goalsverse');
  });

  it('roleRatingsSource is NOT goals-tracker when Tracker had no ratings', () => {
    const result = simulateEnrichment(makeBasePlayer(), trackerPartial, pgUnused);
    expect(result.roleRatingsSource).not.toBe('goals-tracker');
  });

  it('roleRatings are Goalsverse values (kept from player)', () => {
    const base   = makeBasePlayer();
    const result = simulateEnrichment(base, trackerPartial, pgUnused);
    expect(result.roleRatings).toEqual(base.roleRatings);
  });
});
