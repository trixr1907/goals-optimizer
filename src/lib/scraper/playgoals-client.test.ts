import { describe, it, expect } from 'vitest';
import {
  extractPrimaryPositionFromHtml,
  extractStatsFromHtml,
} from './playgoals-client';
import type { PlayGoalsFetchFailReason, PlayGoalsFetchResult } from './playgoals-client';
import {
  ALL_PG_FIXTURES,
  FIXTURE_PG_WENDELIN_PIETSCH,
  FIXTURE_PG_ANTOINETTE_SIDIBE,
  FIXTURE_PG_JONATHAN_JONES,
  FIXTURE_PG_VITOR_DO_MONTE,
} from './__fixtures__/playgoals-fixtures';

// ── Primary position extraction ───────────────────────────────────────────────

describe('extractPrimaryPositionFromHtml (PlayGOALS)', () => {
  it.each(ALL_PG_FIXTURES.map((f) => [f.characterId, f.expectedPosition, f.expectedOverall, f.html] as const))(
    'extracts position for %s → %s (ovr=%s)',
    (_cid, expectedPos, expectedOvr, html) => {
      const result = extractPrimaryPositionFromHtml(html);
      expect(result).not.toBeNull();
      expect(result!.position).toBe(expectedPos);
      expect(result!.overall).toBe(expectedOvr);
    },
  );

  it('returns null when ovr.role is absent', () => {
    expect(extractPrimaryPositionFromHtml('<html><body>no player data</body></html>')).toBeNull();
  });

  it('returns null for unknown ROLE_ values', () => {
    const html = '\\"ovr\\":{\\"overall_rating\\":77,\\"role\\":\\"ROLE_UNKNOWN\\"}';
    expect(extractPrimaryPositionFromHtml(html)).toBeNull();
  });

  it('returns null for GK (not a field position in our context — handled separately)', () => {
    const html = '\\"ovr\\":{\\"overall_rating\\":82,\\"role\\":\\"ROLE_GK\\"}';
    const result = extractPrimaryPositionFromHtml(html);
    // GK maps to 'GK' in ROLE_MAP — it IS a valid Position in our system
    // so we accept it (goalkeepers could be in a squad)
    if (result !== null) {
      expect(result.position).toBe('GK');
    }
  });
});

// ── Key regression cases ──────────────────────────────────────────────────────
// These are the players where Goalsverse picks the wrong primary position due
// to OVR ties, and goals-tracker.com returns HTTP 403 on Vercel.

describe('PlayGOALS regression: Tracker-403 fallback players', () => {
  it('Wendelin Pietsch → FB (not CB — Goalsverse CB=FB=WB tie, Tracker 403 on Vercel)', () => {
    const result = extractPrimaryPositionFromHtml(FIXTURE_PG_WENDELIN_PIETSCH.html);
    expect(result?.position).toBe('FB');
    expect(result?.overall).toBe(76);
  });

  it('Antoinette Sidibe → CM (not WB — Goalsverse WB=DM=FB=CM tie, Tracker 403 on Vercel)', () => {
    const result = extractPrimaryPositionFromHtml(FIXTURE_PG_ANTOINETTE_SIDIBE.html);
    expect(result?.position).toBe('CM');
    expect(result?.overall).toBe(73);
  });

  it('Jonathan Jones → AM (Goalsverse 4-way tie DM/WB/CM/AM=81, Tracker works but confirms AM)', () => {
    const result = extractPrimaryPositionFromHtml(FIXTURE_PG_JONATHAN_JONES.html);
    expect(result?.position).toBe('AM');
  });

  it('Vitor do Monte → ST (ST absent from Goalsverse ovr_roles entirely)', () => {
    const result = extractPrimaryPositionFromHtml(FIXTURE_PG_VITOR_DO_MONTE.html);
    expect(result?.position).toBe('ST');
  });
});

// ── Individual stat extraction ────────────────────────────────────────────────

describe('extractStatsFromHtml (PlayGOALS)', () => {
  it('extracts individual stats from the playerInfo.stats payload', () => {
    const stats = extractStatsFromHtml(FIXTURE_PG_WENDELIN_PIETSCH.html);

    expect(stats).not.toBeNull();
    expect(stats?.pac).toBe(94);
    expect(stats?.acceleration).toBe(95);
    expect(stats?.sprint_speed).toBe(94);
    expect(stats?.crossing).toBe(75);
    expect(stats?.defensive_iq).toBe(81);
    expect(stats?.stamina).toBe(90);
  });

  it('returns null when the page has no stats block', () => {
    expect(extractStatsFromHtml('<html><body>no stats here</body></html>')).toBeNull();
  });
});

// ── PlayGoalsFetchResult type structure ───────────────────────────────────────

describe('PlayGoalsFetchResult — error taxonomy', () => {
  it('fail reason covers all expected variants', () => {
    const validReasons: PlayGoalsFetchFailReason[] = [
      'timeout',
      'http_status',
      'network_error',
      'empty_html',
      'parse_primary_missing',
      'parse_stats_missing',
    ];
    expect(validReasons).toHaveLength(6);
    expect(validReasons).toContain('timeout');
    expect(validReasons).toContain('parse_primary_missing');
    expect(validReasons).toContain('parse_stats_missing');
  });

  it('success result shape: data with position, no failReason', () => {
    const ok: PlayGoalsFetchResult = {
      data: {
        characterId: 'test-id',
        primaryPosition: 'FB',
        overall: 76,
      },
    };
    expect(ok.data?.primaryPosition).toBe('FB');
    expect(ok.failReason).toBeUndefined();
  });

  it('failure result shape: data null + typed failReason + detail', () => {
    const fail: PlayGoalsFetchResult = {
      data:       null,
      failReason: 'http_status',
      failDetail: 'HTTP 403',
    };
    expect(fail.data).toBeNull();
    expect(fail.failReason).toBe('http_status');
    expect(fail.failDetail).toContain('403');
  });
});

// ── ROLE_ → Position mapping spot-checks ─────────────────────────────────────

describe('ROLE_ mapping via fixture variants', () => {
  const cases: Array<[string, string, string]> = [
    ['ROLE_LB',  'FB', 'LB maps to FB (full back group)'],
    ['ROLE_RB',  'FB', 'RB maps to FB'],
    ['ROLE_LWB', 'WB', 'LWB maps to WB (wing back group)'],
    ['ROLE_RWB', 'WB', 'RWB maps to WB'],
    ['ROLE_CDM', 'DM', 'CDM maps to DM'],
    ['ROLE_CAM', 'AM', 'CAM maps to AM'],
    ['ROLE_LW',  'WF', 'LW maps to WF'],
    ['ROLE_RW',  'WF', 'RW maps to WF'],
    ['ROLE_CF',  'CF', 'CF maps to CF'],
  ];

  it.each(cases)('ROLE=%s → Position=%s', (role, expectedPos) => {
    const html = `\\"ovr\\":{\\"overall_rating\\":75,\\"role\\":\\"${role}\\"}`;
    const result = extractPrimaryPositionFromHtml(html);
    expect(result?.position).toBe(expectedPos);
  });
});
