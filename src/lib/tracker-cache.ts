/**
 * tracker-cache.ts — Client-side Cache für Tracker-exklusive Felder
 * ==================================================================
 * training_value (Bolt 1–8) und xp_next_upgrade sind nicht im
 * Goalsverse-Payload. Der Tracker liefert sie intermittierend (HTTP 200
 * oder 403). Erfolgreiche Antworten werden hier gecacht (TTL ~24h,
 * localStorage) und beim nächsten Import als Overlay gemergt.
 *
 * Source-free: kein Quellen-Name darf im Normal-UI erscheinen.
 * Diese Datei liegt im Lib-Layer, nicht im UI.
 *
 * Schema: { [playerId]: { training_value?, xp_next_upgrade?, cachedAt } }
 */

const CACHE_KEY = 'tracker_cache_v1';
const TTL_MS    = 24 * 60 * 60 * 1000; // 24 h

export interface TrackerCacheEntry {
  /** Bolt 1–8; undefined = not in tracker payload */
  training_value?: number;
  /** XP cost for next upgrade; undefined = not available */
  xp_next_upgrade?: number;
  /** Unix ms when this entry was written */
  cachedAt: number;
}

export type TrackerCache = Record<string, TrackerCacheEntry>;

// ── Persistence ──────────────────────────────────────────────────────────────

/** Load the full cache from localStorage. Returns {} on any error. */
export function loadCache(): TrackerCache {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as TrackerCache;
  } catch {
    return {};
  }
}

/** Persist the full cache to localStorage. Silently ignores quota errors. */
function saveCache(cache: TrackerCache): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // QuotaExceededError → not fatal
  }
}

// ── TTL ───────────────────────────────────────────────────────────────────────

function isExpired(entry: TrackerCacheEntry): boolean {
  return Date.now() - entry.cachedAt > TTL_MS;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up a player in the cache.
 * Returns null when missing or expired.
 */
export function getCachedEntry(playerId: string): TrackerCacheEntry | null {
  const cache = loadCache();
  const entry = cache[playerId];
  if (!entry || isExpired(entry)) return null;
  return entry;
}

/**
 * Write one or more entries into the cache.
 * Only writes when at least one Tracker-exclusive field is present —
 * avoids polluting the cache with empty entries.
 */
export function setCachedEntries(
  entries: Array<{ playerId: string; training_value?: number; xp_next_upgrade?: number }>
): void {
  const cache = loadCache();
  const now   = Date.now();

  for (const entry of entries) {
    if (entry.training_value === undefined && entry.xp_next_upgrade === undefined) continue;
    cache[entry.playerId] = {
      ...(entry.training_value  !== undefined ? { training_value:  entry.training_value  } : {}),
      ...(entry.xp_next_upgrade !== undefined ? { xp_next_upgrade: entry.xp_next_upgrade } : {}),
      cachedAt: now,
    };
  }

  saveCache(cache);
}

/**
 * Prune all expired entries from the cache.
 * Call once at app start to keep localStorage lean.
 */
export function pruneExpiredEntries(): void {
  const cache   = loadCache();
  const pruned  = Object.fromEntries(
    Object.entries(cache).filter(([, entry]) => !isExpired(entry))
  );
  saveCache(pruned);
}

/**
 * Merge cached Tracker fields into an array of players coming from a fresh
 * Goalsverse import. Only fills in fields that are currently undefined/missing.
 *
 * NEVER overwrites a field that already has a value — the live import result
 * always wins over the cache.
 *
 * Returns a new array (players are shallow-cloned when modified).
 */
export function mergeWithTrackerCache<T extends {
  id: string;
  training_value?: number;
  xp_next_upgrade?: number;
}>(players: T[]): T[] {
  const cache = loadCache();

  return players.map((player) => {
    const entry = cache[player.id];
    if (!entry || isExpired(entry)) return player;

    let changed = false;
    const patch: Partial<T> = {};

    if (player.training_value == null && entry.training_value !== undefined) {
      (patch as { training_value?: number }).training_value = entry.training_value;
      changed = true;
    }
    if (player.xp_next_upgrade == null && entry.xp_next_upgrade !== undefined) {
      (patch as { xp_next_upgrade?: number }).xp_next_upgrade = entry.xp_next_upgrade;
      changed = true;
    }

    return changed ? { ...player, ...patch } : player;
  });
}

/**
 * Given a set of freshly imported players, extract those whose Tracker-
 * exclusive fields are populated and write them to the cache.
 * Call this after a successful import to fill the cache over time.
 */
export function hydrateCache<T extends {
  id: string;
  training_value?: number;
  xp_next_upgrade?: number;
}>(players: T[]): void {
  const toWrite = players
    .filter((p) => p.training_value != null || p.xp_next_upgrade != null)
    .map((p) => ({
      playerId:        p.id,
      training_value:  p.training_value,
      xp_next_upgrade: p.xp_next_upgrade,
    }));

  if (toWrite.length > 0) setCachedEntries(toWrite);
}
