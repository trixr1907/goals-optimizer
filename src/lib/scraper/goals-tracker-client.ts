/**
 * Goals-Tracker Enrichment Client
 *
 * goals-tracker.com is the authoritative source for:
 *   - primaryPosition  (their badge = what PlayGOALS shows)
 *   - roleRatings      (the visible Positions pitch — different ratings than Goalsverse ovr_roles)
 *
 * URL pattern: https://goals-tracker.com/player/{characterId}
 * (characterId = UUID without the "goalsverse-" prefix)
 *
 * The page is a Next.js App Router app with two relevant rendering artefacts:
 *
 *   1. Lime badge  — "AM  81 OVR  full rating" in the SSR header area.
 *      This is the authoritative primary position.
 *
 *   2. Positions pitch  — the interactive football-pitch SVG with position buttons.
 *      Each non-GK, non-disabled button shows a 2-3 char label + its Tracker OVR rating.
 *      LB and RB both appear as "FB"; LWB and RWB as "WB"; etc.
 *      We aggregate these by max rating per position group.
 *      This is the authoritative roleRatings source — it shows a completely
 *      different set of numbers than Goalsverse ovr_roles (different OVR formula).
 *
 * NOTE: We do NOT use __next_f.push ovr_roles for roleRatings — those are
 * Goalsverse-equivalent values, not the visible Tracker ratings.
 */

import type { PlayerRoleRating, Position } from './types';
import { ALL_POSITIONS } from './types';

const TRACKER_BASE = 'https://goals-tracker.com';
const TRACKER_TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; GOALS Squad Optimizer/1.0)';

/** All valid GOALS position labels for validation */
const VALID_POSITIONS = new Set<string>(ALL_POSITIONS);

export interface TrackerPlayerData {
  characterId: string;
  /** Primary position extracted from the rendered HTML badge (most authoritative) */
  primaryPosition: Position | null;
  /**
   * Role ratings from the Positions pitch buttons (Tracker's own OVR formula).
   * Empty array means the pitch section was not found / parseable — caller should
   * keep Goalsverse roleRatings and set roleRatingsSource='goalsverse'.
   */
  roleRatings: PlayerRoleRating[];
  /** Match stats — fetched but not consumed by the enrichment layer yet */
  matchStats?: {
    matchesPlayed?: number;
    goals?: number;
    assists?: number;
  };
}

// ── Timeout helper ─────────────────────────────────────────────────────────

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

// ── HTML parsing ───────────────────────────────────────────────────────────

/**
 * Extract the primary position badge from the static server-rendered HTML.
 *
 * The tracker renders a lime-green badge (style="background:#9EFF00") containing
 * the 2-3 letter position abbreviation followed by the OVR span and "full rating".
 *
 * Example fragment (from the attributes panel header):
 *   <span style="background:#9EFF00;color:#...">AM</span>
 *   <span ...>81<!-- --> OVR</span>
 *   <span ...>full rating</span>
 */
export function extractPrimaryPositionFromHtml(html: string): Position | null {
  // Pattern: lime badge position + OVR number + "full rating" label
  const badge = html.match(
    /style="background:#9EFF00[^"]*"[^>]*>([A-Z]{2,3})<\/span>\s*<span[^>]*>\s*\d+\s*(?:<!--[^>]*-->)?\s*OVR<\/span>/
  );
  if (badge) {
    const pos = badge[1] as string;
    if (VALID_POSITIONS.has(pos)) return pos as Position;
  }

  // Fallback: broader pattern with "full rating" anchor
  const fullRating = html.match(
    /([A-Z]{2,3})\s*<\/span><span[^>]*>\s*(\d+)\s*(?:<!--[^>]*-->)?\s*OVR\s*<\/span>\s*<span[^>]*>full rating<\/span>/
  );
  if (fullRating) {
    const pos = fullRating[1] as string;
    if (VALID_POSITIONS.has(pos)) return pos as Position;
  }

  return null;
}

/**
 * Extract role ratings from the visible Positions pitch in the tracker HTML.
 *
 * The tracker renders an interactive football-pitch SVG with buttons for each
 * position. Each enabled button (cursor:pointer, not cursor:default) shows:
 *   <span>FB</span><span style="color:...">76</span>
 *
 * The pitch contains both LB + RB (both labelled "FB"), LWB + RWB (both "WB"), etc.
 * We aggregate: per position label, keep the highest rating seen.
 *
 * The pitch section is anchored by "Tap a position" text and contains
 * the football field SVG followed by all position buttons.
 *
 * Returns empty array if the pitch section is not found or yields no results.
 */
export function extractRoleRatingsFromHtml(html: string): PlayerRoleRating[] {
  // Anchor: the pitch section header text
  const pitchStart = html.indexOf('Tap a position');
  if (pitchStart < 0) return [];

  // Limit scan to ~15 KB after the anchor (the whole pitch is within this range)
  const chunk = html.slice(pitchStart, pitchStart + 15_000);

  // Each position button has the structure:
  //   <button ... style="...cursor:pointer...">
  //     <span ...>FB</span>
  //     <span ... style="color:...">76</span>
  //   </button>
  //
  // Disabled positions (e.g. GK for a field player) use cursor:default and
  // have no rating span — we skip them by requiring a rating.
  const buttonPattern =
    /<button[^>]*style="([^"]*)"[^>]*>\s*<span[^>]*>([A-Z]{1,3})<\/span>(?:\s*<span[^>]*style="([^"]*)"[^>]*>([\d]+)<\/span>)?/g;

  const ratingMap = new Map<string, number>();
  let match: RegExpExecArray | null;

  while ((match = buttonPattern.exec(chunk)) !== null) {
    const btnStyle  = match[1];
    const posLabel  = match[2];
    const ratingStr = match[4]; // may be undefined for disabled buttons

    // Skip disabled positions (no rating or cursor:default)
    if (!ratingStr || btnStyle.includes('cursor:default')) continue;

    // Only accept known position labels
    if (!VALID_POSITIONS.has(posLabel)) continue;

    const rating = parseInt(ratingStr, 10);
    const current = ratingMap.get(posLabel) ?? 0;
    if (rating > current) ratingMap.set(posLabel, rating);
  }

  if (ratingMap.size === 0) return [];

  return Array.from(ratingMap.entries()).map(([position, overall]) => ({
    position: position as Position,
    overall,
  }));
}

/**
 * Extract basic match stats from the rendered HTML.
 * Shown as number + label below the player card.
 * Stored for future use — not yet consumed by the enrichment layer.
 */
export function extractMatchStatsFromHtml(html: string): TrackerPlayerData['matchStats'] {
  const matchesM = html.match(/<span[^>]*>(\d+)<\/span>[^<]*<span[^>]*>Matches<\/span>/);
  const goalsM   = html.match(/<span[^>]*>(\d+)<\/span>[^<]*<span[^>]*>Goals<\/span>/);
  const assistsM = html.match(/<span[^>]*>(\d+)<\/span>[^<]*<span[^>]*>Assists<\/span>/);

  const stats: TrackerPlayerData['matchStats'] = {};
  if (matchesM) stats.matchesPlayed = parseInt(matchesM[1], 10);
  if (goalsM)   stats.goals         = parseInt(goalsM[1], 10);
  if (assistsM) stats.assists       = parseInt(assistsM[1], 10);
  return stats;
}

// ── Network fetch ──────────────────────────────────────────────────────────

/**
 * Fetch and parse data for a single player from goals-tracker.com.
 *
 * @param characterId - UUID (with or without "goalsverse-" prefix)
 * @returns TrackerPlayerData or null if the fetch fails or player not found
 */
export async function fetchTrackerPlayerData(
  characterId: string,
): Promise<TrackerPlayerData | null> {
  // Strip the "goalsverse-" prefix if present (defensive normalisation)
  const rawId = characterId.startsWith('goalsverse-')
    ? characterId.slice('goalsverse-'.length)
    : characterId;

  const url = `${TRACKER_BASE}/player/${rawId}`;
  const { signal, clear } = withTimeout(TRACKER_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    const primaryPosition = extractPrimaryPositionFromHtml(html);
    const roleRatings      = extractRoleRatingsFromHtml(html);
    const matchStats       = extractMatchStatsFromHtml(html);

    // If we couldn't extract anything useful, treat as a miss
    if (primaryPosition === null && roleRatings.length === 0) return null;

    return { characterId: rawId, primaryPosition, roleRatings, matchStats };
  } catch {
    // Timeout, network error, etc. — caller decides how to handle
    return null;
  } finally {
    clear();
  }
}
