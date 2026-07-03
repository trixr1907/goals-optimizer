/**
 * PlayGOALS Enrichment Client
 *
 * playgoals.com is the official GOALS player database and the secondary
 * authoritative source for player.position (used as fallback when goals-tracker.com
 * returns HTTP 403 on Vercel).
 *
 * URL pattern: https://playgoals.com/en/player/{characterId}
 * (redirects to https://playgoals.com/en/player/{uuid}/{Name})
 *
 * The page is a Next.js App Router app. Player data is embedded as a
 * double-escaped JSON string inside __next_f.push() script fragments.
 * The relevant field is:
 *
 *   \"ovr\":{\"overall_rating\":76,\"role\":\"ROLE_FB\"}
 *
 * This is the official primary position in PlayGOALS' own OVR model.
 *
 * We do NOT try to extract roleRatings from PlayGOALS here — the ovr_roles
 * field in this page has the same values as Goalsverse (same data source),
 * so it adds no new information. Only primaryPosition is extracted.
 */

import type { Position } from './types';
import { ALL_POSITIONS } from './types';

const PLAYGOALS_BASE    = 'https://playgoals.com';
const PLAYGOALS_TIMEOUT = 15_000;
const USER_AGENT        = 'Mozilla/5.0 (compatible; GOALS Squad Optimizer/1.0)';

const VALID_POSITIONS = new Set<string>(ALL_POSITIONS);

/** GOALS role string → our Position abbreviation */
const ROLE_MAP: Record<string, Position> = {
  ROLE_GK:  'GK',
  ROLE_CB:  'CB', ROLE_LCB: 'CB', ROLE_RCB: 'CB',
  ROLE_LB:  'FB', ROLE_RB:  'FB', ROLE_FB:  'FB',
  ROLE_LWB: 'WB', ROLE_RWB: 'WB', ROLE_WB:  'WB',
  ROLE_DM:  'DM', ROLE_CDM: 'DM',
  ROLE_CM:  'CM', ROLE_LCM: 'CM', ROLE_RCM: 'CM',
  ROLE_AM:  'AM', ROLE_CAM: 'AM',
  ROLE_LM:  'WM', ROLE_RM:  'WM', ROLE_WM:  'WM',
  ROLE_LW:  'WF', ROLE_RW:  'WF', ROLE_WF:  'WF',
  ROLE_CF:  'CF',
  ROLE_ST:  'ST', ROLE_LS:  'ST', ROLE_RS:  'ST',
};

// ── Error taxonomy ─────────────────────────────────────────────────────────

export type PlayGoalsFetchFailReason =
  | 'timeout'
  | 'http_status'
  | 'network_error'
  | 'empty_html'
  | 'parse_primary_missing';

export interface PlayGoalsPlayerData {
  characterId: string;
  /** Primary position from ovr.role (GOALS' official primary position) */
  primaryPosition: Position;
  /** Overall rating from ovr.overall_rating */
  overall: number;
}

export interface PlayGoalsFetchResult {
  data: PlayGoalsPlayerData | null;
  failReason?: PlayGoalsFetchFailReason;
  failDetail?: string;
}

// ── Timeout helper ─────────────────────────────────────────────────────────

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

// ── HTML parsing ───────────────────────────────────────────────────────────

/**
 * Extract the primary position from a PlayGOALS player page.
 *
 * Player data is embedded as a double-escaped JSON string inside
 * __next_f.push([1,"..."]) script tags. The relevant field (in the
 * decoded file, not in memory) looks like:
 *
 *   \"ovr\":{\"overall_rating\":76,\"role\":\"ROLE_FB\"}
 *
 * The regex matches the single-escaped form as it appears in the actual
 * file bytes (one level of JSON-escaping within the JS string literal).
 */
export function extractPrimaryPositionFromHtml(
  html: string,
): { position: Position; overall: number } | null {
  // Match: \"ovr\":{\"overall_rating\":N,\"role\":\"ROLE_XX\"}
  // The actual bytes in the file use single-backslash escaping of quotes.
  const m = html.match(
    /\\"ovr\\":\{\\"overall_rating\\":(\d+),\\"role\\":\\"([^"\\]+)\\"/,
  );
  if (!m) return null;

  const rawRole = m[2];
  const overall = parseInt(m[1], 10);
  const position = ROLE_MAP[rawRole];

  if (!position || !VALID_POSITIONS.has(position)) return null;

  return { position, overall };
}

// ── Fetch ──────────────────────────────────────────────────────────────────

/**
 * Fetch and parse player data from playgoals.com.
 *
 * @param characterId - UUID (with or without "goalsverse-" prefix)
 * @returns PlayGoalsFetchResult — always resolves, never rejects.
 */
export async function fetchPlayGoalsPlayerData(
  characterId: string,
): Promise<PlayGoalsFetchResult> {
  const rawId = characterId.startsWith('goalsverse-')
    ? characterId.slice('goalsverse-'.length)
    : characterId;

  const url   = `${PLAYGOALS_BASE}/en/player/${rawId}`;
  const { signal, clear } = withTimeout(PLAYGOALS_TIMEOUT);

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

    const parsed = extractPrimaryPositionFromHtml(html);
    if (!parsed) {
      return {
        data:       null,
        failReason: 'parse_primary_missing',
        failDetail: `html ${html.length}b, ovr.role absent`,
      };
    }

    return {
      data: {
        characterId: rawId,
        primaryPosition: parsed.position,
        overall:         parsed.overall,
      },
    };
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
