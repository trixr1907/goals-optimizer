/**
 * true-value.test.ts — Unit tests for true-value.ts v2
 *
 * Verifies confidence-aware graceful degradation:
 *   - full data   → confidence 1.0, basis 'full', score > 0
 *   - no training_value → confidence 0.5, basis 'partial', missing includes 'training_value'
 *   - only OVR (thin)  → confidence 0.25, basis 'thin'
 *   - age >= 34        → devTag 'sell_or_legend'
 *   - thin data        → devTag 'uncertain'
 */

import { describe, it, expect } from 'vitest';
import {
  trueValue,
  devTag,
  toDevRow,
  rankByTrueValue,
  upgradeRoi,
  lifecycleFactor,
  currentRating,
  type TrueValueResult,
} from './true-value';
import type { Player } from '@/lib/scraper/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'gv-test-001',
    name: 'Test Player',
    position: 'CM',
    overall: 75,
    rarity: 'Rare',
    stats: { pac: 70, sho: 65, pas: 78, dri: 72, def: 60, phy: 68 } as Player['stats'],
    roleRatings: [{ position: 'CM', overall: 75 }],
    secondaryPositions: [],
    ...overrides,
  };
}

/** Full data: all fields present */
const FULL_PLAYER = makePlayer({
  overall: 75,
  age: 21,
  training_value: 7,
  xp_current: 500000,
  aging: {
    currentAge: 21,
    targetRating: 85,
    upgradesRemaining: 3,
    potentialRange: [82, 88],
  },
  roleRatings: [
    { position: 'CM', overall: 75 },
    { position: 'AM', overall: 72 },
  ],
});

/** Live-Realität txr': Basic player — no training_value, no aging */
const BASIC_PLAYER_NO_DEV = makePlayer({
  overall: 62,
  age: undefined,
  training_value: undefined,
  xp_current: undefined,
  aging: undefined,
  dataQuality: 'basic',
});

/** Partial: has aging but no training_value (most full goalsverse players live) */
const PARTIAL_PLAYER = makePlayer({
  overall: 72,
  age: 22,
  training_value: undefined,
  xp_current: 255142,
  aging: {
    currentAge: 22,
    targetRating: 73,
    upgradesRemaining: 1,
    potentialRange: [72, 74],
  },
});

/** Old player near retirement */
const OLD_PLAYER = makePlayer({
  overall: 87,
  age: 35,
  training_value: 3,
  aging: {
    currentAge: 35,
    targetRating: 87,
    upgradesRemaining: 0,
    potentialRange: [87, 87],
  },
});

/** Young cornerstone */
const YOUNG_CORNERSTONE = makePlayer({
  overall: 65,
  age: 19,
  training_value: 8,
  aging: {
    currentAge: 19,
    targetRating: 90,
    upgradesRemaining: 5,
    potentialRange: [85, 95],
  },
  roleRatings: [{ position: 'CM', overall: 65 }],
});

// ── lifecycleFactor ───────────────────────────────────────────────────────────

describe('lifecycleFactor', () => {
  it('returns 1 for very young players', () => {
    expect(lifecycleFactor(21)).toBe(1);
  });
  it('returns 0 for retirement age', () => {
    expect(lifecycleFactor(37)).toBe(0);
  });
  it('returns 0 for over-retirement', () => {
    expect(lifecycleFactor(40)).toBe(0);
  });
  it('returns value between 0 and 1 for mid-age', () => {
    const f = lifecycleFactor(29);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(1);
  });
});

// ── currentRating ─────────────────────────────────────────────────────────────

describe('currentRating', () => {
  it('returns overall when no roleRatings', () => {
    expect(currentRating({ overall: 70, roleRatings: [] })).toBe(70);
  });
  it('returns max of overall and roleRatings', () => {
    expect(currentRating({
      overall: 70,
      roleRatings: [{ position: 'CM', overall: 75 }, { position: 'AM', overall: 68 }],
    })).toBe(75);
  });
  it('returns overall when all roleRatings are lower', () => {
    expect(currentRating({
      overall: 80,
      roleRatings: [{ position: 'DM', overall: 72 }],
    })).toBe(80);
  });
});

// ── trueValue — confidence levels ─────────────────────────────────────────────

describe('trueValue confidence', () => {
  it('full player → confidence 1.0, basis full, no missing', () => {
    const result: TrueValueResult = trueValue(FULL_PLAYER);
    expect(result.confidence).toBe(1.0);
    expect(result.basis).toBe('full');
    expect(result.missing).toHaveLength(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it('partial player (aging present, no training_value) → confidence 0.5, basis partial', () => {
    const result = trueValue(PARTIAL_PLAYER);
    expect(result.confidence).toBe(0.5);
    expect(result.basis).toBe('partial');
    expect(result.missing).toContain('training_value');
    expect(result.missing).not.toContain('aging');
  });

  it('basic player (no aging, no age, no training_value) → confidence 0.25, basis thin', () => {
    const result = trueValue(BASIC_PLAYER_NO_DEV);
    expect(result.confidence).toBe(0.25);
    expect(result.basis).toBe('thin');
    expect(result.missing).toContain('training_value');
    expect(result.missing).toContain('aging');
    expect(result.missing).toContain('age');
  });

  it('full player has higher score than same-ovr basic player', () => {
    // Full data should score higher than thin data for same OVR + good potential
    const fullResult = trueValue(FULL_PLAYER);
    const thinResult = trueValue(BASIC_PLAYER_NO_DEV);
    // Full with good potential should clearly beat thin with only OVR=62
    expect(fullResult.score).toBeGreaterThan(thinResult.score);
  });

  it('score is in range 0..100 for all fixture types', () => {
    for (const player of [FULL_PLAYER, PARTIAL_PLAYER, BASIC_PLAYER_NO_DEV, OLD_PLAYER, YOUNG_CORNERSTONE]) {
      const { score } = trueValue(player);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ── trueValue — score sanity ──────────────────────────────────────────────────

describe('trueValue score sanity', () => {
  it('young high-TV player scores higher than old maxed player', () => {
    const young = trueValue(YOUNG_CORNERSTONE);
    const old   = trueValue(OLD_PLAYER);
    // Young 65-OVR with TV=8, age=19, 5 upgrades remaining vs. old 87 no upgrades
    expect(young.score).toBeGreaterThan(old.score);
  });

  it('training_value=0 does not silently zero the score (v2 fix vs v1)', () => {
    // v1: tvLeverage = 0/8 = 0 → headroomN = 0 → score collapses
    // v2: missing tv → neutral leverage 0.5 → score stays reasonable
    const playerWithMissingTV = makePlayer({
      overall: 72,
      age: 22,
      training_value: undefined, // not 0 — just absent
      aging: {
        currentAge: 22,
        targetRating: 80,
        upgradesRemaining: 2,
        potentialRange: [78, 82],
      },
    });
    const result = trueValue(playerWithMissingTV);
    // Must not collapse to near-zero just because training_value is absent
    expect(result.score).toBeGreaterThan(30);
    expect(result.missing).toContain('training_value');
  });

  it('returns a hint string', () => {
    expect(trueValue(FULL_PLAYER).hint).toBeTruthy();
    expect(trueValue(PARTIAL_PLAYER).hint).toBeTruthy();
    expect(trueValue(BASIC_PLAYER_NO_DEV).hint).toBeTruthy();
  });
});

// ── trueValue — manual training_value overrides ───────────────────────────────

describe('trueValue manual training_value overrides', () => {
  it('uses an override as complete data when training_value is the only missing field', () => {
    const result = trueValue(PARTIAL_PLAYER, undefined, { trainingValueOverride: 6 });

    expect(result.confidence).toBe(1.0);
    expect(result.basis).toBe('full');
    expect(result.missing).not.toContain('training_value');
  });

  it('scores a missing training_value player with override leverage instead of neutral 4/8', () => {
    const player = makePlayer({
      overall: 60,
      age: 21,
      training_value: undefined,
      aging: {
        currentAge: 21,
        targetRating: 75,
        upgradesRemaining: 3,
        potentialRange: [75, 90],
      },
    });
    const neutral = trueValue(player);
    const overridden = trueValue(player, undefined, { trainingValueOverride: 8 });

    expect(overridden.score).toBeGreaterThan(neutral.score);
  });

  it('rounds decimal overrides before scoring', () => {
    const rounded = trueValue(PARTIAL_PLAYER, undefined, { trainingValueOverride: 6 });
    const decimal = trueValue(PARTIAL_PLAYER, undefined, { trainingValueOverride: 5.6 });

    expect(decimal.score).toBe(rounded.score);
    expect(decimal.confidence).toBe(1.0);
  });

  it('ignores out-of-range overrides and keeps missing metadata explicit', () => {
    const result = trueValue(PARTIAL_PLAYER, undefined, { trainingValueOverride: 9 });

    expect(result.confidence).toBe(0.5);
    expect(result.basis).toBe('partial');
    expect(result.missing).toContain('training_value');
  });
});


// ── devTag ────────────────────────────────────────────────────────────────────

describe('devTag', () => {
  it('young high-TV full player → cornerstone', () => {
    expect(devTag(YOUNG_CORNERSTONE)).toBe('cornerstone');
  });

  it('old player (age >= 34) → sell_or_legend regardless of TV', () => {
    expect(devTag(OLD_PLAYER)).toBe('sell_or_legend');
  });

  it('thin player (no aging, no age) → uncertain', () => {
    expect(devTag(BASIC_PLAYER_NO_DEV)).toBe('uncertain');
  });

  it('develop: has training_value >= 5 and upgrades remaining', () => {
    const player = makePlayer({
      overall: 70,
      age: 25,
      training_value: 6,
      aging: {
        currentAge: 25,
        targetRating: 80,
        upgradesRemaining: 2,
        potentialRange: [78, 82],
      },
    });
    const tag = devTag(player);
    expect(['develop', 'cornerstone']).toContain(tag);
  });
});

// ── toDevRow ──────────────────────────────────────────────────────────────────

describe('toDevRow', () => {
  it('full player row has confidence 1, no nulls for known fields', () => {
    const row = toDevRow(FULL_PLAYER);
    expect(row.confidence).toBe(1.0);
    expect(row.age).toBe(21);
    expect(row.training_value).toBe(7);
    expect(row.potential_min).toBe(82);
    expect(row.potential_max).toBe(88);
    expect(row.upgrades_remaining).toBe(3);
    expect(row.true_value).toBeGreaterThan(0);
    expect(row.basis).toBe('full');
  });

  it('basic player row has null for missing dev fields', () => {
    const row = toDevRow(BASIC_PLAYER_NO_DEV);
    expect(row.age).toBeNull();
    expect(row.training_value).toBeNull();
    expect(row.potential_min).toBeNull();
    expect(row.potential_max).toBeNull();
    expect(row.upgrades_remaining).toBeNull();
    expect(row.xp_current).toBeNull();
    expect(row.confidence).toBe(0.25);
    expect(row.basis).toBe('thin');
    expect(row.missing.length).toBeGreaterThan(0);
  });

  it('tag is present on all rows', () => {
    for (const player of [FULL_PLAYER, PARTIAL_PLAYER, BASIC_PLAYER_NO_DEV]) {
      const row = toDevRow(player);
      expect(row.tag).toBeTruthy();
      expect(row.hint).toBeTruthy();
    }
  });
});

// ── rankByTrueValue ───────────────────────────────────────────────────────────

describe('rankByTrueValue', () => {
  it('returns array sorted by true_value descending', () => {
    const rows = rankByTrueValue([BASIC_PLAYER_NO_DEV, FULL_PLAYER, OLD_PLAYER, YOUNG_CORNERSTONE]);
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i].true_value).toBeGreaterThanOrEqual(rows[i + 1].true_value);
    }
  });

  it('handles empty array', () => {
    expect(rankByTrueValue([])).toEqual([]);
  });

  it('handles single player', () => {
    const rows = rankByTrueValue([FULL_PLAYER]);
    expect(rows).toHaveLength(1);
  });
});

// ── upgradeRoi ────────────────────────────────────────────────────────────────

describe('upgradeRoi', () => {
  it('returns NO_DATA when xp_next_upgrade is missing (Sprint B guard)', () => {
    const result = upgradeRoi({
      age: 22,
      aging: { currentAge: 22, targetRating: 80, upgradesRemaining: 2, potentialRange: [78, 82] },
      xp_next_upgrade: undefined,
      upgrade_count: undefined,
    });
    expect(result.available).toBe(false);
    expect(result.action).toBe('NO_DATA');
    expect(result.note).toContain('xp_next_upgrade');
  });

  it('returns MAXED when upgradesRemaining <= 0', () => {
    const result = upgradeRoi({
      age: 25,
      aging: { currentAge: 25, targetRating: 75, upgradesRemaining: 0, potentialRange: [75, 75] },
      xp_next_upgrade: undefined,
      upgrade_count: undefined,
    });
    expect(result.action).toBe('MAXED');
  });

  it('returns UPGRADE with roi when all data present', () => {
    const result = upgradeRoi({
      age: 22,
      aging: { currentAge: 22, targetRating: 80, upgradesRemaining: 2, potentialRange: [78, 82] },
      xp_next_upgrade: 500000,
      upgrade_count: 1,
    });
    expect(result.available).toBe(true);
    expect(result.action).toBe('UPGRADE');
    expect(result.roi).toBeGreaterThan(0);
    expect(result.cost_xp).toBe(500000);
  });
});
