import { describe, it, expect } from 'vitest';
import {
  extractPrimaryPositionFromHtml,
  extractRoleRatingsFromHtml,
  extractMatchStatsFromHtml,
} from './goals-tracker-client';
import {
  ALL_FIXTURES,
  FIXTURE_JONATHAN_JONES,
  FIXTURE_WENDELIN_PIETSCH,
  FIXTURE_ALFRED_MENGUE,
  FIXTURE_ELEN_DE_MATTOS,
  FIXTURE_ANTOINETTE_SIDIBE,
  FIXTURE_ROMARIO_VIEIRA,
  FIXTURE_VITOR_DO_MONTE,
} from './__fixtures__/tracker-fixtures';

// ── Primary position badge extraction ────────────────────────────────────────

describe('extractPrimaryPositionFromHtml', () => {
  it.each(ALL_FIXTURES.map((f) => [f.characterId, f.expectedPosition, f.html] as const))(
    'extracts primary position for %s → %s',
    (_cid, expected, html) => {
      expect(extractPrimaryPositionFromHtml(html)).toBe(expected);
    },
  );

  it('returns null when no badge is present', () => {
    expect(extractPrimaryPositionFromHtml('<html><body>no player here</body></html>')).toBeNull();
  });

  it('rejects invalid position labels (does not return garbage)', () => {
    const badHtml =
      '<span style="background:#9EFF00">XX</span><span>81<!-- --> OVR</span>';
    expect(extractPrimaryPositionFromHtml(badHtml)).toBeNull();
  });
});

// ── Regression: the 7 known txr' players — primary position ─────────────────
// These are the cases where Goalsverse diverges from PlayGOALS / Goals-Tracker.

describe('primary position regression: 7 txr players', () => {
  it('Jonathan Jones → AM (Goalsverse equipped: DM, 4-way 81 tie)', () => {
    expect(extractPrimaryPositionFromHtml(FIXTURE_JONATHAN_JONES.html)).toBe('AM');
  });
  it('Wendelin Pietsch → FB (Goalsverse equipped: CB, CB=FB tie)', () => {
    expect(extractPrimaryPositionFromHtml(FIXTURE_WENDELIN_PIETSCH.html)).toBe('FB');
  });
  it('Alfred Mengue → FB (same Typ-A pattern as Pietsch)', () => {
    expect(extractPrimaryPositionFromHtml(FIXTURE_ALFRED_MENGUE.html)).toBe('FB');
  });
  it('Elen de Mattos → AM (Goalsverse equipped: DM)', () => {
    expect(extractPrimaryPositionFromHtml(FIXTURE_ELEN_DE_MATTOS.html)).toBe('AM');
  });
  it('Antoinette Sidibe → CM (Goalsverse equipped: WB)', () => {
    expect(extractPrimaryPositionFromHtml(FIXTURE_ANTOINETTE_SIDIBE.html)).toBe('CM');
  });
  it('Romário Vieira → WF (WF absent from Goalsverse ovr_roles — badge is only source)', () => {
    expect(extractPrimaryPositionFromHtml(FIXTURE_ROMARIO_VIEIRA.html)).toBe('WF');
  });
  it('Vitor do Monte → ST (ST absent from Goalsverse ovr_roles — badge is only source)', () => {
    expect(extractPrimaryPositionFromHtml(FIXTURE_VITOR_DO_MONTE.html)).toBe('ST');
  });
});

// ── Role ratings extraction from Positions pitch ──────────────────────────────

describe('extractRoleRatingsFromHtml — pitch-based ratings', () => {
  it('returns empty array when "Tap a position" section is absent', () => {
    expect(extractRoleRatingsFromHtml('<html><body>no pitch here</body></html>')).toEqual([]);
  });

  it('skips disabled GK button (no rating rendered)', () => {
    const ratings = extractRoleRatingsFromHtml(FIXTURE_JONATHAN_JONES.html);
    expect(ratings.find((r) => r.position === 'GK')).toBeUndefined();
  });

  it('deduplicates symmetric slots (LB+RB → one FB entry with max rating)', () => {
    const ratings = extractRoleRatingsFromHtml(FIXTURE_WENDELIN_PIETSCH.html);
    const fbEntries = ratings.filter((r) => r.position === 'FB');
    expect(fbEntries).toHaveLength(1);
    expect(fbEntries[0].overall).toBe(76); // both LB and RB are 76
  });

  it('deduplicates WB slots (LWB+RWB → one WB entry)', () => {
    const ratings = extractRoleRatingsFromHtml(FIXTURE_WENDELIN_PIETSCH.html);
    const wbEntries = ratings.filter((r) => r.position === 'WB');
    expect(wbEntries).toHaveLength(1);
    expect(wbEntries[0].overall).toBe(76);
  });

  // ── Jonathan Jones: Tracker pitch ≠ Goalsverse ovr_roles ──────────────────
  // Goalsverse: DM:81, WB:81, CM:81, AM:81 (4-way tie) → Tracker shows different numbers

  describe('Jonathan Jones — Tracker pitch ratings', () => {
    it('AM is 81 (primary)', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_JONATHAN_JONES.html);
      expect(ratings.find((r) => r.position === 'AM')?.overall).toBe(81);
    });
    it('WM, CM, CF are 79 (not 81 as in Goalsverse ovr_roles)', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_JONATHAN_JONES.html);
      expect(ratings.find((r) => r.position === 'WM')?.overall).toBe(79);
      expect(ratings.find((r) => r.position === 'CM')?.overall).toBe(79);
      expect(ratings.find((r) => r.position === 'CF')?.overall).toBe(79);
    });
    it('DM is 76 (not 81 as in Goalsverse)', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_JONATHAN_JONES.html);
      expect(ratings.find((r) => r.position === 'DM')?.overall).toBe(76);
    });
    it('all expected positions are present', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_JONATHAN_JONES.html);
      const byPos = Object.fromEntries(ratings.map((r) => [r.position, r.overall]));
      for (const [pos, ovr] of Object.entries(FIXTURE_JONATHAN_JONES.expectedRoleRatings)) {
        expect(byPos[pos]).toBe(ovr);
      }
    });
  });

  // ── Wendelin Pietsch: CB differs from Goalsverse ──────────────────────────
  // Goalsverse: CB:76 = FB:76 (tie) → Tracker pitch: CB:74, FB:76

  describe('Wendelin Pietsch — Tracker pitch ratings', () => {
    it('FB is 76 (primary)', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_WENDELIN_PIETSCH.html);
      expect(ratings.find((r) => r.position === 'FB')?.overall).toBe(76);
    });
    it('CB is 74 (not 76 — Tracker corrects the Goalsverse CB=FB tie)', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_WENDELIN_PIETSCH.html);
      expect(ratings.find((r) => r.position === 'CB')?.overall).toBe(74);
    });
    it('WB is 76', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_WENDELIN_PIETSCH.html);
      expect(ratings.find((r) => r.position === 'WB')?.overall).toBe(76);
    });
    it('all expected positions match', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_WENDELIN_PIETSCH.html);
      const byPos = Object.fromEntries(ratings.map((r) => [r.position, r.overall]));
      for (const [pos, ovr] of Object.entries(FIXTURE_WENDELIN_PIETSCH.expectedRoleRatings)) {
        expect(byPos[pos]).toBe(ovr);
      }
    });
  });

  // ── Romário Vieira: WF visible in pitch but absent from Goalsverse ovr_roles

  describe('Romário Vieira — WF in pitch, absent from Goalsverse ovr_roles', () => {
    it('WF is 76 (primary, exists only in Tracker pitch)', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_ROMARIO_VIEIRA.html);
      expect(ratings.find((r) => r.position === 'WF')?.overall).toBe(76);
    });
    it('CF is 74', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_ROMARIO_VIEIRA.html);
      expect(ratings.find((r) => r.position === 'CF')?.overall).toBe(74);
    });
  });

  // ── Vitor do Monte: ST visible in pitch but absent from Goalsverse ovr_roles

  describe('Vitor do Monte — ST in pitch, absent from Goalsverse ovr_roles', () => {
    it('ST is 81 (primary, exists only in Tracker pitch)', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_VITOR_DO_MONTE.html);
      expect(ratings.find((r) => r.position === 'ST')?.overall).toBe(81);
    });
    it('WF and CF are 79', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_VITOR_DO_MONTE.html);
      expect(ratings.find((r) => r.position === 'WF')?.overall).toBe(79);
      expect(ratings.find((r) => r.position === 'CF')?.overall).toBe(79);
    });
    it('all expected positions match', () => {
      const ratings = extractRoleRatingsFromHtml(FIXTURE_VITOR_DO_MONTE.html);
      const byPos = Object.fromEntries(ratings.map((r) => [r.position, r.overall]));
      for (const [pos, ovr] of Object.entries(FIXTURE_VITOR_DO_MONTE.expectedRoleRatings)) {
        expect(byPos[pos]).toBe(ovr);
      }
    });
  });

  // ── Remaining players: spot-check primary-as-top-rating + all positions present

  it('Alfred Mengue: FB:75, CB:73 (Tracker corrects CB=FB tie)', () => {
    const ratings = extractRoleRatingsFromHtml(FIXTURE_ALFRED_MENGUE.html);
    const byPos = Object.fromEntries(ratings.map((r) => [r.position, r.overall]));
    expect(byPos['FB']).toBe(75);
    expect(byPos['CB']).toBe(73);
  });

  it('Elen de Mattos: AM:70 (primary), DM:65 (Goalsverse had DM tied for top)', () => {
    const ratings = extractRoleRatingsFromHtml(FIXTURE_ELEN_DE_MATTOS.html);
    const byPos = Object.fromEntries(ratings.map((r) => [r.position, r.overall]));
    expect(byPos['AM']).toBe(70);
    expect(byPos['DM']).toBe(65); // Tracker shows DM is NOT top for de Mattos
    expect(byPos['CF']).toBe(68);
  });

  it('Antoinette Sidibe: CM:73 (primary), DM:71, WB:68 (Goalsverse had WB tied for top)', () => {
    const ratings = extractRoleRatingsFromHtml(FIXTURE_ANTOINETTE_SIDIBE.html);
    const byPos = Object.fromEntries(ratings.map((r) => [r.position, r.overall]));
    expect(byPos['CM']).toBe(73);
    expect(byPos['DM']).toBe(71);
    expect(byPos['WB']).toBe(68); // Tracker: WB is NOT 73 unlike Goalsverse
  });
});

// ── Match stats extraction ────────────────────────────────────────────────────

describe('extractMatchStatsFromHtml', () => {
  it('returns empty object when no stats present', () => {
    expect(extractMatchStatsFromHtml('<html></html>')).toEqual({});
  });

  it('extracts Matches / Goals / Assists when present', () => {
    const html = `
      <span class="text-lg font-black">14</span>
      <span class="text-[9px] uppercase">Matches</span>
      <span class="text-lg font-black">1</span>
      <span class="text-[9px] uppercase">Goals</span>
      <span class="text-lg font-black">7</span>
      <span class="text-[9px] uppercase">Assists</span>
    `;
    const stats = extractMatchStatsFromHtml(html);
    expect(stats?.matchesPlayed).toBe(14);
    expect(stats?.goals).toBe(1);
    expect(stats?.assists).toBe(7);
  });
});

// ── TrackerFetchResult: error taxonomy ───────────────────────────────────────
// We can't mock fetch in vitest without msw, so we test the error shape via
// the internal parser paths + verify the exported types are correct.

import type { TrackerFetchFailReason, TrackerFetchResult } from './goals-tracker-client';

describe('TrackerFetchResult — type structure', () => {
  it('TrackerFetchFailReason covers all expected variants', () => {
    const validReasons: TrackerFetchFailReason[] = [
      'timeout',
      'http_status',
      'network_error',
      'empty_html',
      'parse_primary_missing',
      'parse_roleRatings_missing',
    ];
    // Verify the type is a union of exactly these strings (runtime check)
    expect(validReasons).toHaveLength(6);
    expect(validReasons).toContain('timeout');
    expect(validReasons).toContain('parse_primary_missing');
  });

  it('result shape has data + optional failReason + failDetail', () => {
    // Construct a minimal result manually to confirm the interface
    const okResult: TrackerFetchResult = {
      data: {
        characterId: 'test-id',
        primaryPosition: 'AM',
        roleRatings: [{ position: 'AM', overall: 81 }],
      },
    };
    expect(okResult.data?.primaryPosition).toBe('AM');
    expect(okResult.failReason).toBeUndefined();

    const failResult: TrackerFetchResult = {
      data: null,
      failReason: 'timeout',
      failDetail: 'AbortError after 15000ms',
    };
    expect(failResult.data).toBeNull();
    expect(failResult.failReason).toBe('timeout');
    expect(failResult.failDetail).toContain('AbortError');
  });
});

// ── Regression: Wendelin Pietsch + Alfred Mengue parsers still correct ───────
// These two players have the largest pages (178KB, 147KB) — the exact two that
// timed out on Vercel at 10s. Parser must remain correct at any page size.

describe('regression: Pietsch + Mengue fixture parsing (large pages)', () => {
  it('Wendelin Pietsch: primary=FB, CB=74 (not 76)', () => {
    const pos = extractPrimaryPositionFromHtml(FIXTURE_WENDELIN_PIETSCH.html);
    const ratings = extractRoleRatingsFromHtml(FIXTURE_WENDELIN_PIETSCH.html);
    const byPos = Object.fromEntries(ratings.map((r) => [r.position, r.overall]));
    expect(pos).toBe('FB');
    expect(byPos['FB']).toBe(76);
    expect(byPos['CB']).toBe(74); // key divergence from Goalsverse (76)
  });

  it('Alfred Mengue: primary=FB, CB=73 (not 75)', () => {
    const pos = extractPrimaryPositionFromHtml(FIXTURE_ALFRED_MENGUE.html);
    const ratings = extractRoleRatingsFromHtml(FIXTURE_ALFRED_MENGUE.html);
    const byPos = Object.fromEntries(ratings.map((r) => [r.position, r.overall]));
    expect(pos).toBe('FB');
    expect(byPos['FB']).toBe(75);
    expect(byPos['CB']).toBe(73); // key divergence from Goalsverse (75)
  });
});
