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

import type { PlayerStats, Position } from './types';
import { ALL_POSITIONS } from './types';
import { extractRawId } from '@/lib/player-id';

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
  | 'parse_primary_missing'
  | 'parse_stats_missing';

export interface PlayGoalsPlayerData {
  characterId: string;
  /** Primary position from ovr.role (GOALS' official primary position) */
  primaryPosition: Position;
  /** Overall rating from ovr.overall_rating */
  overall: number;
  /** Individual player stats from playerInfo.stats when present on the page. */
  stats?: PlayerStats;
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


interface JsonResult {
  value: unknown;
  endIndex: number;
}

function extractJsonObject(text: string, startIndex: number): JsonResult | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{' || ch === '[') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      if (depth === 0) continue;
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          return { value: JSON.parse(text.slice(objStart, i + 1)), endIndex: i };
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function statValue(stats: Record<string, unknown>, path: string[]): number {
  let current: unknown = stats;
  for (const key of path) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return 0;
    }
  }
  return typeof current === 'number' ? Math.round(current) : 0;
}

function mapPlayGoalsStats(stats: Record<string, unknown>): PlayerStats {
  return {
    pac: statValue(stats, ['pace', 'weighted_value']),
    acceleration: statValue(stats, ['pace', 'acceleration', 'value']),
    sprint_speed: statValue(stats, ['pace', 'sprint_speed', 'value']),

    sho: statValue(stats, ['shooting', 'weighted_value']),
    finishing: statValue(stats, ['shooting', 'finishing', 'value']),
    shot_power: statValue(stats, ['shooting', 'shot_power', 'value']),
    long_shots: statValue(stats, ['shooting', 'long_shots', 'value']),
    penalties: statValue(stats, ['shooting', 'penalties', 'value']),
    weak_foot: statValue(stats, ['shooting', 'weak_foot', 'value']),
    attacking_iq: statValue(stats, ['shooting', 'attacking_iq', 'value']),

    pas: statValue(stats, ['passing', 'weighted_value']),
    ground_pass: statValue(stats, ['passing', 'ground_pass', 'value']),
    lofted_pass: statValue(stats, ['passing', 'lofted_pass', 'value']),
    through_pass: statValue(stats, ['passing', 'through_pass', 'value']),
    crossing: statValue(stats, ['passing', 'crossing', 'value']),
    curve: statValue(stats, ['passing', 'curve', 'value']),
    free_kick_accuracy: statValue(stats, ['passing', 'free_kicks', 'value']),

    dri: statValue(stats, ['dribbling', 'weighted_value']),
    sprint_dribbling: statValue(stats, ['dribbling', 'sprint_dribbling', 'value']),
    close_dribbling: statValue(stats, ['dribbling', 'close_dribbling', 'value']),
    skills: statValue(stats, ['dribbling', 'skills', 'value']),
    agility: statValue(stats, ['dribbling', 'agility', 'value']),
    balance: statValue(stats, ['dribbling', 'balance', 'value']),
    first_touch: statValue(stats, ['dribbling', 'first_touch', 'value']),

    def: statValue(stats, ['defending', 'weighted_value']),
    defensive_iq: statValue(stats, ['defending', 'defensive_iq', 'value']),
    stand_tackle: statValue(stats, ['defending', 'stand_tackle', 'value']),
    slide_tackle: statValue(stats, ['defending', 'slide_tackle', 'value']),
    jockeying: statValue(stats, ['defending', 'jockeying', 'value']),
    interceptions: statValue(stats, ['defending', 'interceptions', 'value']),
    blocking: statValue(stats, ['defending', 'blocking', 'value']),

    phy: statValue(stats, ['physicality', 'weighted_value']),
    strength: statValue(stats, ['physicality', 'strength', 'value']),
    aggression: statValue(stats, ['physicality', 'aggression', 'value']),
    stamina: statValue(stats, ['physicality', 'stamina', 'value']),
    heading: statValue(stats, ['physicality', 'heading', 'value']),
    jumping: statValue(stats, ['physicality', 'jumping', 'value']),

    div: statValue(stats, ['goalkeeping', 'diving', 'weighted_value']),
    reflexes: statValue(stats, ['goalkeeping', 'reflexes', 'weighted_value']),
    positioning: statValue(stats, ['goalkeeping', 'awareness', 'positioning', 'value']),
    catching: statValue(stats, ['goalkeeping', 'handling', 'catching', 'value']),
    parrying: statValue(stats, ['goalkeeping', 'handling', 'parrying', 'value']),
    rushing: statValue(stats, ['goalkeeping', 'awareness', 'rushing', 'value']),
    command_of_area: statValue(stats, ['goalkeeping', 'awareness', 'command_of_area', 'value']),
    penalty_saving: statValue(stats, ['goalkeeping', 'awareness', 'penalty_saving', 'value']),
    throwing: statValue(stats, ['goalkeeping', 'distribution', 'throwing', 'value']),
    kicking_power: statValue(stats, ['goalkeeping', 'distribution', 'kicking_power', 'value']),
  };
}

export function extractStatsFromHtml(html: string): PlayerStats | null {
  // Next embeds playerInfo as an escaped string. Decoding quote escapes turns it
  // back into JSON-like text where the existing balanced-object scanner works.
  const decoded = html.replace(/\\"/g, '"');
  const statsIdx = decoded.indexOf('"stats":');
  if (statsIdx < 0) return null;

  const parsed = extractJsonObject(decoded, statsIdx + 8);
  if (!parsed || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    return null;
  }

  const mapped = mapPlayGoalsStats(parsed.value as Record<string, unknown>);
  const hasUsableStats = Object.values(mapped).some((value) => typeof value === 'number' && value > 0);
  return hasUsableStats ? mapped : null;
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
  const rawId = extractRawId(characterId);

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
    const stats = extractStatsFromHtml(html);
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
        ...(stats ? { stats } : {}),
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
