/**
 * upgrade-roi.test.ts — Unit tests for upgrade-roi.ts v1
 *
 * Covers all scenarios verified by OpenHands:
 *   - Full headroom + near tier → INVEST_NOW
 *   - Tier cross (Uncommon→Rare at 79.x) → INVEST_NOW
 *   - Old player (≥34) → SELL_OR_LEGEND
 *   - No aging data → NO_DATA
 *   - Maxed (remaining = 0) → MAXED
 *   - No cost (xp_next_upgrade absent) → partial confidence, still has action
 *   - rankByUpgradePriority ordering
 */

import { describe, it, expect } from 'vitest';
import { upgradeRoiV1, rankByUpgradePriority, rarityOf } from './upgrade-roi';
import type { Player } from '@/lib/scraper/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> = {}): Pick<Player, 'name' | 'overall' | 'age' | 'roleRatings' | 'aging' | 'xp_next_upgrade' | 'upgrade_count'> {
  return {
    name: 'Test Player',
    overall: 70,
    age: 22,
    roleRatings: [{ position: 'CM', overall: 70 }],
    aging: {
      currentAge: 22,
      targetRating: 80,
      upgradesRemaining: 3,
      potentialRange: [78, 82],
    },
    xp_next_upgrade: undefined,
    upgrade_count: undefined,
    ...overrides,
  };
}

// "Galati" — high headroom, near tier cross (Uncommon→Rare at 70→79+)
const GALATI = makePlayer({
  name: 'Galati',
  overall: 68,
  age: 21,
  roleRatings: [{ position: 'ST', overall: 68 }],
  aging: {
    currentAge: 21,
    targetRating: 85,
    upgradesRemaining: 4,
    potentialRange: [82, 88],
  },
  xp_next_upgrade: 500_000,
});

// "NearTier" — exactly crosses Uncommon(60-69) → Rare(70-79)
const NEAR_TIER = makePlayer({
  name: 'NearTier',
  overall: 65,
  age: 23,
  roleRatings: [{ position: 'CM', overall: 65 }],
  aging: {
    currentAge: 23,
    targetRating: 75,
    upgradesRemaining: 2,
    potentialRange: [72, 76],
  },
  xp_next_upgrade: 300_000,
});

// "Krona" — old player (36 years)
const KRONA = makePlayer({
  name: 'Krona',
  overall: 87,
  age: 36,
  roleRatings: [{ position: 'GK', overall: 87 }],
  aging: {
    currentAge: 36,
    targetRating: 88,
    upgradesRemaining: 1,
    potentialRange: [87, 89],
  },
});

// No aging data (Basic player from profile)
const NO_AGING = makePlayer({
  name: 'NoAging',
  overall: 62,
  age: 24,
  aging: undefined,
  roleRatings: [{ position: 'CB', overall: 62 }],
});

// Maxed player
const MAXED_PLAYER = makePlayer({
  name: 'Maxed',
  overall: 82,
  age: 28,
  aging: {
    currentAge: 28,
    targetRating: 82,
    upgradesRemaining: 0,
    potentialRange: [82, 82],
  },
});

// No age, no cost — tests partial confidence
const NO_AGE_NO_COST = makePlayer({
  name: 'NoAgeCost',
  overall: 72,
  age: undefined,
  xp_next_upgrade: undefined,
  aging: {
    currentAge: 22,
    targetRating: 80,
    upgradesRemaining: 2,
    potentialRange: [78, 82],
  },
});

// ── rarityOf ─────────────────────────────────────────────────────────────────

describe('rarityOf', () => {
  it('maps OVR ranges correctly', () => {
    expect(rarityOf(30)).toBe('Basic');
    expect(rarityOf(59)).toBe('Basic');
    expect(rarityOf(60)).toBe('Common');
    expect(rarityOf(65)).toBe('Common');
    expect(rarityOf(70)).toBe('Uncommon');
    expect(rarityOf(75)).toBe('Uncommon');
    expect(rarityOf(80)).toBe('Rare');
    expect(rarityOf(84)).toBe('Rare');
    expect(rarityOf(85)).toBe('Epic');
    expect(rarityOf(90)).toBe('Legendary');
    expect(rarityOf(95)).toBe('Mythic');
  });

  it('handles boundary values', () => {
    expect(rarityOf(59)).toBe('Basic');
    expect(rarityOf(60)).toBe('Common');
    expect(rarityOf(69)).toBe('Common');
    expect(rarityOf(70)).toBe('Uncommon');
    expect(rarityOf(79)).toBe('Uncommon');
    expect(rarityOf(80)).toBe('Rare');
  });
});

// ── upgradeRoiV1 — core scenarios ────────────────────────────────────────────

describe('upgradeRoiV1 — core scenarios', () => {
  it('Galati (high headroom, tier cross) → INVEST_NOW', () => {
    const result = upgradeRoiV1(GALATI);
    expect(result.available).toBe(true);
    expect(result.action).toBe('INVEST_NOW');
    expect(result.crosses_rarity_tier).toBe(true);
    expect(result.expected_gain_per_upgrade).toBeGreaterThan(0);
    expect(result.total_headroom).toBeGreaterThan(0);
    expect(result.roi).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('NearTier (Uncommon→Rare cross) → INVEST_NOW', () => {
    const result = upgradeRoiV1(NEAR_TIER);
    expect(result.action).toBe('INVEST_NOW');
    expect(result.crosses_rarity_tier).toBe(true);
    expect(result.next_rarity).toBeTruthy();
  });

  it('Krona (age=36) → SELL_OR_LEGEND', () => {
    const result = upgradeRoiV1(KRONA);
    expect(result.action).toBe('SELL_OR_LEGEND');
    expect(result.confidence).toBe(1);
    expect(result.basis).toBe('full');
  });

  it('No aging data → NO_DATA', () => {
    const result = upgradeRoiV1(NO_AGING);
    expect(result.available).toBe(false);
    expect(result.action).toBe('NO_DATA');
    expect(result.confidence).toBe(0);
    expect(result.basis).toBe('thin');
    expect(result.missing).toContain('aging.potentialRange');
  });

  it('Maxed player → MAXED', () => {
    const result = upgradeRoiV1(MAXED_PLAYER);
    expect(result.action).toBe('MAXED');
    expect(result.upgrades_remaining).toBe(0);
  });
});

// ── confidence levels ─────────────────────────────────────────────────────────

describe('upgradeRoiV1 — confidence', () => {
  it('full data (ceiling + age + cost) → confidence 1.0', () => {
    const result = upgradeRoiV1({ ...GALATI });
    expect(result.confidence).toBe(1);
    expect(result.basis).toBe('full');
    expect(result.missing).not.toContain('xp_next_upgrade');
  });

  it('no age + no cost → thin confidence, but still has action', () => {
    const result = upgradeRoiV1(NO_AGE_NO_COST);
    expect(result.available).toBe(true);
    expect(result.action).not.toBe('NO_DATA');
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.basis).toBe('thin');
    expect(result.missing).toContain('xp_next_upgrade');
    expect(result.missing).toContain('age');
    expect(result.roi).toBeUndefined();
    expect(result.note).toContain('Upgrade-Kosten noch nicht verfügbar');
  });

  it('no cost alone → confidence 0.67 (2/3 pillars)', () => {
    const p = makePlayer({ xp_next_upgrade: undefined });
    const result = upgradeRoiV1(p);
    expect(result.confidence).toBeCloseTo(0.67, 1);
    expect(result.missing).toContain('xp_next_upgrade');
    expect(result.missing).not.toContain('age');
  });
});

// ── ROI calculation ───────────────────────────────────────────────────────────

describe('upgradeRoiV1 — ROI', () => {
  it('ROI is OVR-gain per 100k XP', () => {
    // Galati: headroom = 88-68=20, remaining=4, gain=5, cost=500k
    // roi = 5/500000 * 100000 = 1.0
    const result = upgradeRoiV1(GALATI);
    expect(result.roi).toBeCloseTo(1.0, 1);
  });

  it('roi is undefined when xp_next_upgrade is missing', () => {
    const result = upgradeRoiV1(makePlayer({ xp_next_upgrade: undefined }));
    expect(result.roi).toBeUndefined();
  });
});

// ── action logic ──────────────────────────────────────────────────────────────

describe('upgradeRoiV1 — action logic', () => {
  it('large headroom (≥8) without tier cross → INVEST', () => {
    const p = makePlayer({
      overall: 71,
      roleRatings: [{ position: 'CM', overall: 71 }],
      // Same rarity as ceiling (both Rare = 70-79), headroom=8
      aging: {
        currentAge: 22,
        targetRating: 79,
        upgradesRemaining: 1,
        potentialRange: [79, 79],
      },
    });
    const result = upgradeRoiV1(p);
    // headroom = 79-71 = 8, no tier cross (both Rare)
    expect(result.action).toBe('INVEST');
    expect(result.crosses_rarity_tier).toBe(false);
  });

  it('small headroom without tier cross → HOLD', () => {
    const p = makePlayer({
      overall: 77,
      roleRatings: [{ position: 'CM', overall: 77 }],
      aging: {
        currentAge: 25,
        targetRating: 79,
        upgradesRemaining: 2,
        potentialRange: [78, 79],
      },
    });
    const result = upgradeRoiV1(p);
    // headroom = 79-77 = 2, Rare→Rare no tier cross
    expect(result.action).toBe('HOLD');
  });

  it('INVEST_NOW takes precedence over headroom threshold', () => {
    // headroom < 8 but crosses tier
    const p = makePlayer({
      overall: 69,
      roleRatings: [{ position: 'WF', overall: 69 }],
      aging: {
        currentAge: 22,
        targetRating: 73,
        upgradesRemaining: 2,
        potentialRange: [71, 73],
      },
    });
    const result = upgradeRoiV1(p);
    // 69 = Uncommon, 69+2=71 = Rare → crosses tier
    expect(result.crosses_rarity_tier).toBe(true);
    expect(result.action).toBe('INVEST_NOW');
  });
});

// ── rankByUpgradePriority ─────────────────────────────────────────────────────

describe('rankByUpgradePriority', () => {
  it('orders INVEST_NOW before INVEST before HOLD', () => {
    const players = [
      makePlayer({ name: 'HoldPlayer', overall: 77, aging: { currentAge: 25, targetRating: 79, upgradesRemaining: 2, potentialRange: [78, 79] } }),
      GALATI,
      makePlayer({ name: 'InvestPlayer', overall: 71, aging: { currentAge: 22, targetRating: 80, upgradesRemaining: 2, potentialRange: [78, 80] } }),
    ];
    const ranked = rankByUpgradePriority(players);
    expect(ranked[0].roi.action).toBe('INVEST_NOW');
    const actions = ranked.map(r => r.roi.action);
    expect(actions.indexOf('INVEST_NOW')).toBeLessThan(actions.indexOf('INVEST'));
  });

  it('handles empty array', () => {
    expect(rankByUpgradePriority([])).toEqual([]);
  });

  it('returns name and overall alongside roi', () => {
    const ranked = rankByUpgradePriority([GALATI]);
    expect(ranked[0].name).toBe('Galati');
    expect(ranked[0].overall).toBe(68);
    expect(ranked[0].roi).toBeDefined();
  });
});
