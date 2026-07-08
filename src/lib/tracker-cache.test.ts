/**
 * tracker-cache.test.ts — Unit tests for the client-side Tracker cache.
 *
 * localStorage is mocked via a simple in-memory store (no jsdom needed).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedEntry,
  setCachedEntries,
  mergeWithTrackerCache,
  hydrateCache,
  pruneExpiredEntries,
} from './tracker-cache';

// ── localStorage mock ───────────────────────────────────────────────────────

const store: Record<string, string> = {};

const localStorageMock = {
  getItem:    (k: string) => store[k] ?? null,
  setItem:    (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear:      () => { Object.keys(store).forEach((k) => delete store[k]); },
};

Object.defineProperty(global, 'window', {
  value:    { localStorage: localStorageMock },
  writable: true,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function clearStore() {
  localStorageMock.clear();
}

const ONE_DAY_MS = 25 * 60 * 60 * 1000; // >24h → expired

// ── getCachedEntry ───────────────────────────────────────────────────────────

describe('getCachedEntry', () => {
  beforeEach(clearStore);

  it('returns null when cache is empty', () => {
    expect(getCachedEntry('player-1')).toBeNull();
  });

  it('returns the entry when fresh', () => {
    setCachedEntries([{ playerId: 'p1', training_value: 5 }]);
    const result = getCachedEntry('p1');
    expect(result).not.toBeNull();
    expect(result!.training_value).toBe(5);
  });

  it('returns null when entry is expired (>24h old)', () => {
    setCachedEntries([{ playerId: 'p1', training_value: 5 }]);
    // Backdate cachedAt
    const raw = JSON.parse(localStorageMock.getItem('tracker_cache_v1')!);
    raw['p1'].cachedAt = Date.now() - ONE_DAY_MS;
    localStorageMock.setItem('tracker_cache_v1', JSON.stringify(raw));

    expect(getCachedEntry('p1')).toBeNull();
  });
});

// ── setCachedEntries ─────────────────────────────────────────────────────────

describe('setCachedEntries', () => {
  beforeEach(clearStore);

  it('stores a training_value entry', () => {
    setCachedEntries([{ playerId: 'p1', training_value: 7 }]);
    expect(getCachedEntry('p1')?.training_value).toBe(7);
  });

  it('stores an xp_next_upgrade entry', () => {
    setCachedEntries([{ playerId: 'p2', xp_next_upgrade: 12500 }]);
    expect(getCachedEntry('p2')?.xp_next_upgrade).toBe(12500);
  });

  it('does NOT write an entry when both fields are undefined', () => {
    setCachedEntries([{ playerId: 'p3' }]);
    expect(getCachedEntry('p3')).toBeNull();
  });

  it('writes multiple entries in one call', () => {
    setCachedEntries([
      { playerId: 'a', training_value: 3 },
      { playerId: 'b', xp_next_upgrade: 5000 },
    ]);
    expect(getCachedEntry('a')?.training_value).toBe(3);
    expect(getCachedEntry('b')?.xp_next_upgrade).toBe(5000);
  });
});

// ── mergeWithTrackerCache ────────────────────────────────────────────────────

describe('mergeWithTrackerCache', () => {
  beforeEach(clearStore);

  type MinPlayer = { id: string; training_value?: number; xp_next_upgrade?: number };

  it('fills in training_value from cache when player has none', () => {
    setCachedEntries([{ playerId: 'p1', training_value: 6 }]);
    const players: MinPlayer[] = [{ id: 'p1' }];
    const result = mergeWithTrackerCache(players);
    expect(result[0].training_value).toBe(6);
  });

  it('fills in xp_next_upgrade from cache when player has none', () => {
    setCachedEntries([{ playerId: 'p1', xp_next_upgrade: 8000 }]);
    const players: MinPlayer[] = [{ id: 'p1' }];
    const result = mergeWithTrackerCache(players);
    expect(result[0].xp_next_upgrade).toBe(8000);
  });

  it('does NOT overwrite existing training_value (live import wins)', () => {
    setCachedEntries([{ playerId: 'p1', training_value: 2 }]);
    const players: MinPlayer[] = [{ id: 'p1', training_value: 7 }];
    const result = mergeWithTrackerCache(players);
    expect(result[0].training_value).toBe(7); // live value preserved
  });

  it('returns unchanged reference when no cache hit', () => {
    const players: MinPlayer[] = [{ id: 'p-unknown' }];
    const result = mergeWithTrackerCache(players);
    expect(result[0]).toBe(players[0]);  // same reference — no clone
  });

  it('returns new object reference when a field was merged', () => {
    setCachedEntries([{ playerId: 'p1', training_value: 4 }]);
    const players: MinPlayer[] = [{ id: 'p1' }];
    const result = mergeWithTrackerCache(players);
    expect(result[0]).not.toBe(players[0]);  // cloned
  });

  it('does not affect players not in cache', () => {
    setCachedEntries([{ playerId: 'p1', training_value: 4 }]);
    const players: MinPlayer[] = [{ id: 'p1' }, { id: 'p2' }];
    const result = mergeWithTrackerCache(players);
    expect(result[1]).toBe(players[1]);  // p2 unchanged
    expect(result[1].training_value).toBeUndefined();
  });
});

// ── hydrateCache ─────────────────────────────────────────────────────────────

describe('hydrateCache', () => {
  beforeEach(clearStore);

  it('writes players with training_value to cache', () => {
    hydrateCache([{ id: 'p1', training_value: 5 }]);
    expect(getCachedEntry('p1')?.training_value).toBe(5);
  });

  it('writes players with xp_next_upgrade to cache', () => {
    hydrateCache([{ id: 'p2', xp_next_upgrade: 10000 }]);
    expect(getCachedEntry('p2')?.xp_next_upgrade).toBe(10000);
  });

  it('skips players with no Tracker-exclusive fields', () => {
    hydrateCache([{ id: 'p3' }]);
    expect(getCachedEntry('p3')).toBeNull();
  });
});

// ── pruneExpiredEntries ───────────────────────────────────────────────────────

describe('pruneExpiredEntries', () => {
  beforeEach(clearStore);

  it('removes expired entries and keeps fresh ones', () => {
    setCachedEntries([
      { playerId: 'fresh', training_value: 3 },
      { playerId: 'stale', training_value: 7 },
    ]);

    // Expire 'stale'
    const raw = JSON.parse(localStorageMock.getItem('tracker_cache_v1')!);
    raw['stale'].cachedAt = Date.now() - ONE_DAY_MS;
    localStorageMock.setItem('tracker_cache_v1', JSON.stringify(raw));

    pruneExpiredEntries();

    expect(getCachedEntry('fresh')).not.toBeNull();
    expect(getCachedEntry('stale')).toBeNull();
  });
});

// ── Extractor tests (verified against real Tracker HTML, 2026-07-08) ────────
// Audit result: training_value = NOT in Tracker HTML (always undefined)
//               xp_next_upgrade = from RSC payload "nextUpgradeXpRequirement"

import {
  extractTrainingValueFromHtml,
  extractXpNextUpgradeFromHtml,
} from './scraper/goals-tracker-client';

describe('extractTrainingValueFromHtml', () => {
  it('always returns undefined — field does not exist in Tracker HTML', () => {
    // Confirmed by live audit: word "training" not present anywhere on goals-tracker.com
    expect(extractTrainingValueFromHtml('<html>Training Value 5 bolt lightning</html>')).toBeUndefined();
    expect(extractTrainingValueFromHtml('')).toBeUndefined();
    expect(extractTrainingValueFromHtml('data-training-value="3"')).toBeUndefined();
  });
});

describe('extractXpNextUpgradeFromHtml', () => {
  it('extracts from RSC payload with escaped quotes (real Tracker format)', () => {
    // Real format: "nextUpgradeXpRequirement\":1500000
    const html = 'self.__next_f.push([1,"...\\\"nextUpgradeXpRequirement\\\":1500000,..."])';
    expect(extractXpNextUpgradeFromHtml(html)).toBe(1500000);
  });

  it('extracts from unescaped JSON (e.g. when already parsed)', () => {
    const html = '"nextUpgradeXpRequirement":1500000';
    expect(extractXpNextUpgradeFromHtml(html)).toBe(1500000);
  });

  it('returns undefined for maxed player (sentinel 4294967295)', () => {
    // Jonathan Jones (maxed): nextUpgradeXpRequirement = 4294967295
    const html = '"nextUpgradeXpRequirement\\":4294967295';
    expect(extractXpNextUpgradeFromHtml(html)).toBeUndefined();
  });

  it('returns undefined when field absent', () => {
    expect(extractXpNextUpgradeFromHtml('<html>nothing here</html>')).toBeUndefined();
  });

  it('returns undefined for zero or negative values', () => {
    expect(extractXpNextUpgradeFromHtml('"nextUpgradeXpRequirement":0')).toBeUndefined();
  });
});
