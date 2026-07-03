/**
 * Goals-Tracker Enrichment Client
 *
 * goals-tracker.com is the authoritative source for:
 *   - primaryPosition  (their badge = what PlayGOALS shows)
 *   - roleRatings      (the visible Positions pitch — different OVR formula than Goalsverse)
 *
 * URL pattern: https://goals-tracker.com/player/{characterId}
 * (characterId = UUID without the "goalsverse-" prefix)
 *
 * The page is a Next.js App Router app. Two relevant rendering artefacts:
 *
 *   1. Lime badge  — "AM  81 OVR  full rating" in the SSR header.
 *      Authoritative primary position.
 *
 *   2. Positions pitch  — football-pitch SVG with interactive position buttons.
 *      Each non-disabled button shows label + Tracker OVR rating.
 *      LB+RB both render as "FB", LWB+RWB as "WB" — aggregated by max.
 *      Authoritative roleRatings source.
 *
 * NOTE: __next_f.push ovr_roles is NOT used for roleRatings — those equal Goalsverse values.
 *
 * Vercel notes:
 *   - 15 s timeout (up from 10 s) — Pietsch/Mengue pages are 147–178 KB, largest in the squad,
 *     and were the exact two timing out on Vercel's US edge location.
 *   - 1 retry with 400 ms backoff for timeout/network/parse-miss failures.
 *   - Concurrency 3 (down from 5) to reduce simultaneous connections from Vercel.
 */

import type { PlayerRoleRating, Position } from './types';
import { ALL_POSITIONS } from './types';

const TRACKER_BASE       = 'https://goals-tracker.com';
const TRACKER_TIMEOUT_MS = 15_000;   // 15 s — covers largest pages on Vercel edge
const RETRY_COUNT        = 1;        // one retry on transient failures
const RETRY_DELAY_MS     = 400;      // backoff between attempts
export const TRACKER_CONCURRENCY = 3; // exported so goalsverse-client can import it

const USER_AGENT = 'Mozilla/5.0 (compatible; GOALS Squad Optimizer/1.0)';

/** All valid GOALS position labels for validation */
const VALID_POSITIONS = new Set<string>(ALL_POSITIONS);

// ── Error taxonomy ─────────────────────────────────────────────────────────

/** Distinguishable failure reasons for sourceWarnings. */
export type TrackerFetchFailReason =
  | 'timeout'
  | 'http_status'
  | 'network_error'
  | 'empty_html'
  | 'parse_primary_missing'
  | 'parse_roleRatings_missing';

export interface TrackerFetchResult {
  data: TrackerPlayerData | null;
  /** Set when the fetch/parse failed — populated into player.sourceWarnings. */
  failReason?: TrackerFetchFailReason;
  /** Human-readable detail for sourceWarnings. */
  failDetail?: string;
}

export interface TrackerPlayerData {
  characterId: string;
  /** Primary position extracted from the rendered HTML badge (most authoritative) */
  primaryPosition: Position | null;
  /**
   * Role ratings from the Positions pitch buttons (Tracker's own OVR formula).
   * Empty array → pitch section absent/unparseable → caller keeps Goalsverse roleRatings.
   */
  roleRatings: PlayerRoleRating[];
  /** Match stats — stored for future use, not consumed by enrichment layer yet */
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
 * Pattern: lime badge (background:#9EFF00) → position label → OVR number → "full rating"
 *
 * Example fragment (attributes panel header):
 *   <span style="background:#9EFF00;color:#1a1f25">AM</span>
 *   <span style="color:#9EFF00">81<!-- --> OVR</span>
 *   <span class="hidden ...">full rating</span>
 */
export function extractPrimaryPositionFromHtml(html: string): Position | null {
  // Primary pattern: lime badge + OVR span
  const badge = html.match(
    /style="background:#9EFF00[^"]*"[^>]*>([A-Z]{2,3})<\/span>\s*<span[^>]*>\s*\d+\s*(?:<!--[^>]*-->)?\s*OVR<\/span>/,
  );
  if (badge) {
    const pos = badge[1] as string;
    if (VALID_POSITIONS.has(pos)) return pos as Position;
  }

  // Fallback: "full rating" anchor — handles minor whitespace variations
  const fullRating = html.match(
    /([A-Z]{2,3})\s*<\/span><span[^>]*>\s*(\d+)\s*(?:<!--[^>]*-->)?\s*OVR\s*<\/span>\s*<span[^>]*>full rating<\/span>/,
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
 * The tracker renders an interactive football-pitch SVG with buttons for each position.
 * Each enabled button (cursor:pointer) shows a label + rating.
 * Disabled positions (cursor:default, e.g. GK for field players) have no rating — skipped.
 *
 * Symmetric slots: LB+RB both render as "FB", LWB+RWB as "WB" → aggregate with max().
 *
 * Section anchor: "Tap a position" text (always present in the pitch header).
 * We scan 15 KB after the anchor — the full pitch fits within this window.
 *
 * Returns empty array if the pitch section is absent or yields no valid entries.
 */
export function extractRoleRatingsFromHtml(html: string): PlayerRoleRating[] {
  const pitchStart = html.indexOf('Tap a position');
  if (pitchStart < 0) return [];

  const chunk = html.slice(pitchStart, pitchStart + 15_000);

  // Button structure:
  //   <button ... style="...cursor:pointer...">
  //     <span ...>FB</span>
  //     <span ... style="color:...">76</span>
  //   </button>
  const buttonPattern =
    /<button[^>]*style="([^"]*)"[^>]*>\s*<span[^>]*>([A-Z]{1,3})<\/span>(?:\s*<span[^>]*style="([^"]*)"[^>]*>([\d]+)<\/span>)?/g;

  const ratingMap = new Map<string, number>();
  let match: RegExpExecArray | null;

  while ((match = buttonPattern.exec(chunk)) !== null) {
    const btnStyle  = match[1];
    const posLabel  = match[2];
    const ratingStr = match[4];

    if (!ratingStr || btnStyle.includes('cursor:default')) continue;
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
 * Extract match stats shown below the player card.
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

// ── Single attempt ─────────────────────────────────────────────────────────

/**
 * One fetch+parse attempt. Returns a TrackerFetchResult with either data or a
 * typed failure reason — never throws.
 */
async function fetchOnce(rawId: string): Promise<TrackerFetchResult> {
  const url = `${TRACKER_BASE}/player/${rawId}`;
  const { signal, clear } = withTimeout(TRACKER_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal,
      redirect: 'follow',
      cache:    'no-store',
      headers: {
        'user-agent': USER_AGENT,
        accept:       'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      return {
        data:       null,
        failReason: 'http_status',
        failDetail: `HTTP ${res.status}`,
      };
    }

    const html = await res.text();

    if (!html || html.length < 500) {
      return {
        data:       null,
        failReason: 'empty_html',
        failDetail: `body ${html.length} bytes`,
      };
    }

    const primaryPosition = extractPrimaryPositionFromHtml(html);
    const roleRatings     = extractRoleRatingsFromHtml(html);
    const matchStats      = extractMatchStatsFromHtml(html);

    // Both missing → nothing useful extracted
    if (primaryPosition === null && roleRatings.length === 0) {
      return {
        data:       null,
        failReason: 'parse_primary_missing',
        failDetail: `html ${html.length}b, badge absent, pitch absent`,
      };
    }

    // Partial parse — still return data with warnings encoded in failReason
    if (primaryPosition === null) {
      return {
        data:       { characterId: rawId, primaryPosition: null, roleRatings, matchStats },
        failReason: 'parse_primary_missing',
        failDetail: `html ${html.length}b, badge absent`,
      };
    }
    if (roleRatings.length === 0) {
      return {
        data:       { characterId: rawId, primaryPosition, roleRatings: [], matchStats },
        failReason: 'parse_roleRatings_missing',
        failDetail: `html ${html.length}b, pitch absent`,
      };
    }

    return { data: { characterId: rawId, primaryPosition, roleRatings, matchStats } };

  } catch (err) {
    const isAbort =
      err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
    return {
      data:       null,
      failReason: isAbort ? 'timeout' : 'network_error',
      failDetail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clear();
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch and parse data for a single player from goals-tracker.com.
 *
 * Retries once (RETRY_COUNT=1) with a short backoff on transient failures
 * (timeout, network_error, parse misses). HTTP errors and empty HTML are
 * not retried since a second attempt is unlikely to help.
 *
 * @param characterId - UUID (with or without "goalsverse-" prefix)
 * @returns TrackerFetchResult — always resolves, never rejects.
 */
export async function fetchTrackerPlayerData(
  characterId: string,
): Promise<TrackerFetchResult> {
  const rawId = characterId.startsWith('goalsverse-')
    ? characterId.slice('goalsverse-'.length)
    : characterId;

  // Reasons worth retrying
  const retryable: Set<TrackerFetchFailReason> = new Set([
    'timeout',
    'network_error',
    'parse_primary_missing',
    'parse_roleRatings_missing',
  ]);

  let result = await fetchOnce(rawId);

  for (let attempt = 0; attempt < RETRY_COUNT; attempt++) {
    // Stop if we have complete data or a non-retryable failure
    if (result.data?.primaryPosition !== null && result.data?.roleRatings.length) break;
    if (result.failReason && !retryable.has(result.failReason)) break;
    if (!result.failReason && result.data !== null) break; // success

    await new Promise<void>((r) => setTimeout(r, RETRY_DELAY_MS));
    result = await fetchOnce(rawId);
  }

  return result;
}
