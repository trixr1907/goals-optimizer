import { Player, PlayerStats, Position, Rarity, PlayerRoleRating, PlayerAging, ALL_POSITIONS } from './types';

const GOALSVERSE_BASE = 'https://goalsverse.com';
const CDN_BASE = 'https://cdn.playgoals.com/character/prod';
const USER_AGENT = 'Mozilla/5.0 (compatible; GOALS Squad Optimizer/1.0)';

function characterImageUrl(characterId?: string): string | undefined {
  if (!characterId) return undefined;
  const rawId = characterId.startsWith('goalsverse-')
    ? characterId.slice('goalsverse-'.length)
    : characterId;
  return `${CDN_BASE}/${rawId}.png?w=128`;
}

// GOALS role IDs → Positionen
const ROLE_MAP: Record<number, Position> = {
  0: 'GK',
  1: 'CB', 2: 'CB',
  3: 'FB', 4: 'FB',   // LB, RB → FB
  5: 'WB', 6: 'WB',   // LWB, RWB → WB
  7: 'DM',            // CDM → DM
  8: 'CM', 9: 'CM',
  10: 'AM',           // CAM → AM
  11: 'WM', 12: 'WM', // LM, RM → WM
  13: 'WF', 14: 'WF', // LW, RW → WF
  15: 'CF',
  16: 'ST',
};

// Newer API format uses string role names (e.g. "ROLE_AM") instead of numbers
const ROLE_STRING_MAP: Record<string, Position> = {
  'ROLE_GK': 'GK',
  'ROLE_CB': 'CB',
  'ROLE_FB': 'FB', 'ROLE_LB': 'FB', 'ROLE_RB': 'FB',
  'ROLE_WB': 'WB', 'ROLE_LWB': 'WB', 'ROLE_RWB': 'WB',
  'ROLE_DM': 'DM', 'ROLE_CDM': 'DM',
  'ROLE_CM': 'CM',
  'ROLE_AM': 'AM', 'ROLE_CAM': 'AM',
  'ROLE_WM': 'WM', 'ROLE_LM': 'WM', 'ROLE_RM': 'WM',
  'ROLE_WF': 'WF', 'ROLE_LW': 'WF', 'ROLE_RW': 'WF',
  'ROLE_CF': 'CF',
  'ROLE_ST': 'ST',
};

// Unified resolver for both number and string role formats
function resolveRole(role: number | string | undefined): Position {
  if (typeof role === 'number') return (ROLE_MAP[role] ?? 'CM') as Position;
  if (typeof role === 'string') return (ROLE_STRING_MAP[role] ?? 'CM') as Position;
  return 'CM';
}

function mapOvrToRarity(ovr: number): Rarity {
  if (ovr >= 95) return 'Mythic';
  if (ovr >= 90) return 'Legendary';
  if (ovr >= 85) return 'Epic';
  if (ovr >= 80) return 'Rare';
  if (ovr >= 70) return 'Uncommon';
  if (ovr >= 60) return 'Common';
  return 'Basic';
}

type GoalsverseFetchResult = {
  players: Player[];
  clubId?: string;
  clubUrl?: string;
  clubName?: string;
  reason?: string;
  errorCode?: ImportErrorCode;
};

export type ImportErrorCode =
  | 'club_not_found'
  | 'goalsverse_timeout'
  | 'rsc_payload_incomplete'
  | 'no_players_found'
  | 'network_error';

export function classifyImportError(reason: string): ImportErrorCode {
  const lower = reason.toLowerCase();
  if (lower.includes('nicht gefunden')) return 'club_not_found';
  if (lower.includes('timeout') || lower.includes('zeitüberschreitung')) return 'goalsverse_timeout';
  if (lower.includes('rsc') || lower.includes('payload') || lower.includes('squad-daten')) return 'rsc_payload_incomplete';
  if (lower.includes('keine spieler') || lower.includes('keine spieler extrahiert')) return 'no_players_found';
  return 'network_error';
}

type GoalsverseSearchUser = {
  userId?: string;
  username?: string;
  external_platforms?: {
    steam?: { persona_name?: string } | null;
    playstation?: { online_id?: string } | null;
    xbox?: { gamertag?: string } | null;
    epic?: { display_name?: string } | null;
  };
};

/* ── Low-level fetch helpers ─────────────────────────────────────────────── */

const FETCH_TIMEOUT_MS = 12_000; // 12 s — enough for slow goalsverse responses

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

async function fetchJson<T>(url: string): Promise<T> {
  const { signal, clear } = withTimeout(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal,
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('goalsverse: Anfrage-Timeout (12 s)');
    throw err;
  } finally {
    clear();
  }
}

async function fetchRsc(path: string, slug?: string): Promise<string> {
  const url = path.startsWith('http') ? path : `${GOALSVERSE_BASE}${path}`;
  const { signal, clear } = withTimeout(FETCH_TIMEOUT_MS);
  try {
    // For profile pages (/p/{slug}), include Next.js router headers so the server
    // returns the full data payload (including the "club" array with 60+ players).
    // Without these headers, Next.js returns an abbreviated RSC shell (~35 lines, no player data).
    const isProfilePage = path.startsWith('/p/') || (path.startsWith('http') && path.includes('/p/'));
    const profileSlug = slug ?? (isProfilePage ? path.split('/p/')[1]?.split('?')[0] : undefined);
    const extraHeaders: Record<string, string> = isProfilePage && profileSlug
      ? {
          'Next-Router-State-Tree': encodeURIComponent(JSON.stringify([
            '',
            { children: ['p', { children: [`[clubName]`, { children: ['__PAGE__', {}, `/p/${profileSlug}`, 'refresh'] }] }] },
            null, null, true,
          ])),
          'Next-Url': `/p/${profileSlug}`,
        }
      : {};

    const res = await fetch(url, {
      signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/x-component', RSC: '1', ...extraHeaders },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('goalsverse: Anfrage-Timeout (12 s)');
    throw err;
  } finally {
    clear();
  }
}

/* ── Search / resolve club ───────────────────────────────────────────────── */

function normalizedName(input: string): string {
  return input.trim().toLowerCase().replace(/['`]/g, "'").replace(/\s+/g, '');
}

function searchUserMatches(user: GoalsverseSearchUser, query: string): boolean {
  const wanted = normalizedName(query);
  const candidates = [
    user.username,
    user.external_platforms?.steam?.persona_name,
    user.external_platforms?.playstation?.online_id,
    user.external_platforms?.xbox?.gamertag,
    user.external_platforms?.epic?.display_name,
  ]
    .filter(Boolean)
    .map((v) => normalizedName(String(v)));
  return candidates.some((c) => c === wanted);
}

async function resolveClubId(clubName: string): Promise<string | null> {
  const uuid = clubName.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (uuid) return uuid;

  const data = await fetchJson<{ users?: GoalsverseSearchUser[] }>(
    `${GOALSVERSE_BASE}/api/v1/search?query=${encodeURIComponent(clubName.trim())}`
  );
  const users = data.users ?? [];
  const exact = users.find((u) => u.userId && searchUserMatches(u, clubName));
  const fallback = exact ?? users.find((u) => u.userId);
  return fallback?.userId ?? null;
}

/* ── RSC parsing ─────────────────────────────────────────────────────────── */

interface JsonResult {
  value: unknown;
  endIndex: number; // index of the closing } or ] in the source text
}

/**
 * Scan `text` starting at `startIndex` for the first complete JSON object or
 * array and return both the parsed value AND the end index so callers can skip
 * past it instead of re-scanning the same characters.
 *
 * Returns null when no valid JSON structure is found from startIndex onwards.
 *
 * Complexity: O(n) in the length of the matched JSON fragment — the caller
 * must advance by endIndex+1 to keep the full scan linear.
 */
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
      if (depth === 0) continue; // unmatched closing bracket — skip
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          const value = JSON.parse(text.slice(objStart, i + 1));
          return { value, endIndex: i };
        } catch {
          // Malformed JSON at this position — reset and keep scanning
          objStart = -1;
          return null; // one bad structure → bail; caller advances by 1
        }
      }
    }
  }
  return null;
}

function extractSquadFromRsc(rscText: string): { squad?: unknown; club?: unknown[]; clubInfo?: unknown; slug?: string } {
  const squadIdx = rscText.indexOf('"squad":');
  const squadResult = squadIdx >= 0 ? extractJsonObject(rscText, squadIdx + 7) : null;

  // "club" array: full roster with 60+ players (only present on /p/{slug} with full headers)
  const clubIdx = rscText.indexOf('"club":');
  let club: unknown[] | undefined;
  if (clubIdx >= 0) {
    const clubResult = extractJsonObject(rscText, clubIdx + 6);
    if (clubResult && Array.isArray(clubResult.value)) {
      club = clubResult.value as unknown[];
    }
  }

  const dataIdx = rscText.indexOf('"data":');
  const clubInfoResult = dataIdx >= 0 ? extractJsonObject(rscText, dataIdx + 6) : null;

  // Extract slug from RSC payload — appears as "slug":"turbulence"
  const slugMatch = rscText.match(/"slug"\s*:\s*"([^"]+)"/);
  const slug = slugMatch?.[1];

  return {
    squad:    squadResult?.value,
    club,
    clubInfo: clubInfoResult?.value,
    slug,
  };
}

/* ── Activity page player extraction ─────────────────────────────────────── */

// Minimal player shape from the activity/profile RSC
// The activity page returns: { characterId, name, role (number), ovr (number), tier, starts, startPct, linkable }
// NOT firstName/lastName — the full squad page uses first_name/last_name but activity uses a single "name" field.
interface ActivityPlayer {
  characterId?: string;
  id?: string;
  // Activity page format: single "name" string
  name?: string;
  // Full squad page format: split first/last name
  firstName?: string;
  lastName?: string;
  first_name?: string;
  last_name?: string;
  role?: number;
  tier?: number;
  ovr?: number | { overall_rating?: number; role?: number | string };
  ovr_roles?: Array<{ role: number | string; overall_rating: number }>;
  matchesPlayed?: number;
  goals?: number;
  assists?: number;
  // Activity page stats
  starts?: number;
}

export function mapActivityPlayerToBasic(ap: ActivityPlayer): Player {
  const rawId = ap.characterId ?? ap.id ?? 'unknown';

  // Activity page uses a single "name" field; full squad page splits first/last
  const firstName = ap.firstName ?? ap.first_name ?? '';
  const lastName  = ap.lastName  ?? ap.last_name  ?? '';
  const name =
    ap.name?.trim() ||                          // activity page: single "name" field
    `${firstName} ${lastName}`.trim() ||        // squad page: split name
    rawId.slice(0, 8);

  const role    = typeof ap.role === 'number' ? ap.role : 8;
  const overall = typeof ap.ovr === 'number'
    ? ap.ovr
    : typeof ap.ovr === 'object' && ap.ovr !== null
    ? (ap.ovr as { overall_rating?: number }).overall_rating ?? 50
    : 50;

  // Placeholder stats — zero for all individual stats (no stats data on activity page)
  const emptyStats: PlayerStats = {
    pac: 0, sho: 0, pas: 0, dri: 0, def: 0, phy: 0,
    acceleration: 0, sprint_speed: 0,
    finishing: 0, shot_power: 0, long_shots: 0, penalties: 0, weak_foot: 0, attacking_iq: 0,
    ground_pass: 0, lofted_pass: 0, through_pass: 0, crossing: 0, curve: 0, free_kick_accuracy: 0,
    sprint_dribbling: 0, close_dribbling: 0, skills: 0, agility: 0, balance: 0, first_touch: 0,
    defensive_iq: 0, stand_tackle: 0, slide_tackle: 0, jockeying: 0, interceptions: 0, blocking: 0,
    strength: 0, aggression: 0, stamina: 0, heading: 0, jumping: 0,
    div: 0, kic: 0, reflexes: 0, positioning: 0, catching: 0, parrying: 0,
  };

  // Primary position from equipped role (ovr.role wins over top-level role field)
  const ovrObj = (typeof ap.ovr === 'object' && ap.ovr !== null) ? ap.ovr as { overall_rating?: number; role?: number | string } : null;
  const equippedRole = ovrObj?.role ?? ap.role;
  const mappedPosition: Position = (typeof equippedRole !== 'undefined' ? resolveRole(equippedRole as number | string) : (ROLE_MAP[role] ?? 'CM')) as Position;

  // Collect secondary positions from ovr_roles if present in the RSC payload
  const ovrRoles = Array.isArray(ap.ovr_roles) ? ap.ovr_roles : [];
  const roleRatingsMap = new Map<Position, number>();
  for (const r of ovrRoles) {
    const pos = resolveRole(r.role);
    if (!ALL_POSITIONS.includes(pos)) continue;
    const current = roleRatingsMap.get(pos) ?? 0;
    if (r.overall_rating > current) roleRatingsMap.set(pos, r.overall_rating);
  }
  const roleRatings: PlayerRoleRating[] = Array.from(roleRatingsMap.entries())
    .map(([position, ovr]) => ({ position, overall: ovr }));

  const secondaryPositions: Position[] = roleRatings
    .filter((r) => r.overall >= overall - 10 && r.position !== mappedPosition)
    .map((r) => r.position);

  return {
    id: `goalsverse-${rawId}`,
    name,
    position: mappedPosition,
    overall,
    rarity: mapOvrToRarity(overall),
    stats: emptyStats,
    image_url: characterImageUrl(rawId),
    // Activity page has "starts" instead of "matchesPlayed" — use whichever is present
    matches_played: ap.matchesPlayed ?? ap.starts,
    goals: ap.goals,
    assists: ap.assists,
    roleRatings: roleRatings.length > 0 ? roleRatings : [{ position: mappedPosition, overall }],
    secondaryPositions,
    dataQuality: 'basic',
  };
}

/* ── Player mapping (full squad) ─────────────────────────────────────────── */
function extractStatValue(stats: Record<string, unknown>, path: string[]): number {
  let current: unknown = stats;
  for (const key of path) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return 50;
    }
  }
  return typeof current === 'number' ? Math.round(current) : 50;
}

function mapPlayerFromGoalsverse(raw: Record<string, unknown>): Player {
  const stats = (raw.stats as Record<string, unknown>) || {};

  const firstName = (raw.first_name as string) || '';
  const lastName  = (raw.last_name  as string) || '';
  const name = `${firstName} ${lastName}`.trim() || (raw.id as string)?.slice(0, 8) || 'Unknown';

  const ovr = (raw.ovr as Record<string, unknown>) || {};
  // ovr.role is the EQUIPPED card role — this IS the primary position
  const ovrRole = ovr.role; // may be number or string depending on API version
  const overall = typeof ovr.overall_rating === 'number' ? ovr.overall_rating : 50;

  const height = typeof raw.height === 'number' ? raw.height : undefined;
  const age    = typeof raw.current_age === 'number' ? raw.current_age : undefined;
  const foot   = typeof raw.strong_foot === 'number' ? raw.strong_foot : undefined;

  // Raw character ID (without "goalsverse-" prefix) for CDN URL
  const rawId = raw.id as string;

  // ovr_roles: supports both number format [{role:10,...}] and string format [{role:"ROLE_AM",...}]
  const ovrRoles = Array.isArray(raw.ovr_roles)
    ? (raw.ovr_roles as Array<{ role: number | string; overall_rating: number }>)
    : [];

  // Mappe auf GOALS-Positionen — unified resolver handles both formats
  const roleRatingsRaw: PlayerRoleRating[] = ovrRoles
    .map((r) => ({
      position: resolveRole(r.role),
      overall: r.overall_rating ?? 0,
    }))
    .filter((r) => ALL_POSITIONS.includes(r.position));

  // Aggregiere: pro GOALS-Position nur der höchste OVR (LB+RB → max = FB)
  const roleRatingsMap = new Map<Position, number>();
  for (const r of roleRatingsRaw) {
    const current = roleRatingsMap.get(r.position) ?? 0;
    if (r.overall > current) roleRatingsMap.set(r.position, r.overall);
  }
  const roleRatings: PlayerRoleRating[] = Array.from(roleRatingsMap.entries())
    .map(([position, overall]) => ({ position, overall }));

  // Primary position = ovr.role (the EQUIPPED card role, not the highest in ovr_roles)
  const equippedPosition = resolveRole(ovrRole as number | string | undefined);

  // Overall from equipped card
  const equippedOverall = overall;

  // Secondary = all ovr_roles positions with OVR >= equippedOverall - 10, excluding primary.
  // Threshold is intentionally wide: GOALS players regularly play multiple positions with
  // significant OVR gaps (e.g. AM 85 → CF 81 → CM 80 are all valid secondary slots).
  const secondaryPositions: Position[] = roleRatings
    .filter((r) => r.overall >= equippedOverall - 10 && r.position !== equippedPosition)
    .map((r) => r.position);

  // Aging data
  const aging: PlayerAging | undefined =
    typeof raw.current_age === 'number' || typeof raw.max_potential_rating === 'number'
      ? {
          currentAge: typeof raw.current_age === 'number' ? raw.current_age : 0,
          targetRating: typeof raw.max_potential_rating === 'number' ? raw.max_potential_rating : equippedOverall,
          upgradesRemaining: typeof raw.upgrades_remaining === 'number' ? raw.upgrades_remaining : 0,
          potentialRange: [
            Math.max(0, (typeof raw.max_potential_rating === 'number' ? raw.max_potential_rating : equippedOverall)
              - (typeof raw.upgrades_remaining === 'number' ? raw.upgrades_remaining : 0)),
            (typeof raw.max_potential_rating === 'number' ? raw.max_potential_rating : equippedOverall)
              + (typeof raw.upgrades_remaining === 'number' ? raw.upgrades_remaining : 0),
          ] as [number, number],
        }
      : undefined;

  const playerStats: PlayerStats = {
    // Pace
    pac:           extractStatValue(stats, ['pace', 'weighted_value']),
    acceleration:  extractStatValue(stats, ['pace', 'acceleration', 'value']),
    sprint_speed:  extractStatValue(stats, ['pace', 'sprint_speed', 'value']),

    // Shooting
    sho:           extractStatValue(stats, ['shooting', 'weighted_value']),
    finishing:     extractStatValue(stats, ['shooting', 'finishing', 'value']),
    shot_power:    extractStatValue(stats, ['shooting', 'shot_power', 'value']),
    long_shots:    extractStatValue(stats, ['shooting', 'long_shots', 'value']),
    penalties:     extractStatValue(stats, ['shooting', 'penalties', 'value']),
    weak_foot:     extractStatValue(stats, ['shooting', 'weak_foot', 'value']),
    attacking_iq:  extractStatValue(stats, ['shooting', 'attacking_iq', 'value']),

    // Passing
    pas:                extractStatValue(stats, ['passing', 'weighted_value']),
    ground_pass:        extractStatValue(stats, ['passing', 'ground_pass', 'value']),
    lofted_pass:        extractStatValue(stats, ['passing', 'lofted_pass', 'value']),
    through_pass:       extractStatValue(stats, ['passing', 'through_pass', 'value']),
    crossing:           extractStatValue(stats, ['passing', 'crossing', 'value']),
    curve:              extractStatValue(stats, ['passing', 'curve', 'value']),
    free_kick_accuracy: extractStatValue(stats, ['passing', 'free_kicks', 'value']),

    // Dribbling
    dri:              extractStatValue(stats, ['dribbling', 'weighted_value']),
    sprint_dribbling: extractStatValue(stats, ['dribbling', 'sprint_dribbling', 'value']),
    close_dribbling:  extractStatValue(stats, ['dribbling', 'close_dribbling', 'value']),
    skills:           extractStatValue(stats, ['dribbling', 'skills', 'value']),
    agility:          extractStatValue(stats, ['dribbling', 'agility', 'value']),
    balance:          extractStatValue(stats, ['dribbling', 'balance', 'value']),
    first_touch:      extractStatValue(stats, ['dribbling', 'first_touch', 'value']),

    // Defending
    def:           extractStatValue(stats, ['defending', 'weighted_value']),
    defensive_iq:  extractStatValue(stats, ['defending', 'defensive_iq', 'value']),
    stand_tackle:  extractStatValue(stats, ['defending', 'stand_tackle', 'value']),
    slide_tackle:  extractStatValue(stats, ['defending', 'slide_tackle', 'value']),
    jockeying:     extractStatValue(stats, ['defending', 'jockeying', 'value']),
    interceptions: extractStatValue(stats, ['defending', 'interceptions', 'value']),
    blocking:      extractStatValue(stats, ['defending', 'blocking', 'value']),

    // Physical
    phy:        extractStatValue(stats, ['physicality', 'weighted_value']),
    strength:   extractStatValue(stats, ['physicality', 'strength', 'value']),
    aggression: extractStatValue(stats, ['physicality', 'aggression', 'value']),
    stamina:    extractStatValue(stats, ['physicality', 'stamina', 'value']),
    heading:    extractStatValue(stats, ['physicality', 'heading', 'value']),
    jumping:    extractStatValue(stats, ['physicality', 'jumping', 'value']),

    // Goalkeeping
    div:              extractStatValue(stats, ['goalkeeping', 'diving', 'weighted_value']),
    kic:              extractStatValue(stats, ['goalkeeping', 'distribution', 'weighted_value']),
    reflexes:         extractStatValue(stats, ['goalkeeping', 'reflexes', 'weighted_value']),
    positioning:      extractStatValue(stats, ['goalkeeping', 'awareness', 'positioning', 'value']),
    catching:         extractStatValue(stats, ['goalkeeping', 'handling', 'catching', 'value']),
    parrying:         extractStatValue(stats, ['goalkeeping', 'handling', 'parrying', 'value']),
    rushing:          extractStatValue(stats, ['goalkeeping', 'awareness', 'rushing', 'value']),
    command_of_area:  extractStatValue(stats, ['goalkeeping', 'awareness', 'command_of_area', 'value']),
    penalty_saving:   extractStatValue(stats, ['goalkeeping', 'awareness', 'penalty_saving', 'value']),
    throwing:         extractStatValue(stats, ['goalkeeping', 'distribution', 'throwing', 'value']),
    kicking_power:    extractStatValue(stats, ['goalkeeping', 'distribution', 'kicking_power', 'value']),
  };

  // GK fallback — goalsverse sometimes assigns wrong role to goalkeepers
  let finalPosition = equippedPosition;
  if (finalPosition !== 'GK' && playerStats.div > 80) {
    finalPosition = 'GK';
  }

  return {
    id: `goalsverse-${rawId}`,
    name,
    position: finalPosition,
    overall,
    rarity: mapOvrToRarity(overall),
    stats: playerStats,
    age,
    height_cm: height,
    preferred_foot: foot === 1 ? 'left' : foot === 2 ? 'right' : undefined,
    training_value: typeof raw.potential === 'object' && raw.potential !== null
      ? (raw.potential as Record<string, unknown>).training_value as number | undefined
      : undefined,
    xp_current: typeof raw.current_xp === 'number' ? raw.current_xp : undefined,
    image_url: characterImageUrl(rawId),
    roleRatings: roleRatings.length > 0 ? roleRatings : [{ position: finalPosition, overall: overall }],
    secondaryPositions,
    aging,
    dataQuality: 'full',
  };
}

/* ── Resolve username from club ID (for activity page) ───────────────────── */

/**
 * Fetch the username (slug) for a given user/club ID.
 * The activity page is at /p/{username} — we need the username, not the UUID.
 * Falls back to null if the API call fails or returns no username.
 */
async function resolveUsernameForClub(clubId: string): Promise<string | null> {
  try {
    const data = await fetchJson<{ username?: string; display_name?: string }>(`${GOALSVERSE_BASE}/api/v1/users/${encodeURIComponent(clubId)}`);
    return data.username ?? data.display_name ?? null;
  } catch {
    return null;
  }
}

/* ── Public API ──────────────────────────────────────────────────────────── */

export async function getClubRoster(clubName: string): Promise<GoalsverseFetchResult> {
  const clubId = await resolveClubId(clubName);
  if (!clubId) {
    const reason = `Club "${clubName}" wurde auf goalsverse nicht gefunden.`;
    return { players: [], reason, errorCode: 'club_not_found' };
  }

  try {
    // ── Step 1: Load /v1/club/{id} — gives 11 starters + 7 bench with full stats ──
    const rscText = await fetchRsc(`/v1/club/${clubId}`);
    const { squad, clubInfo, slug } = extractSquadFromRsc(rscText);

    if (!squad || typeof squad !== 'object') {
      const reason = 'Squad-Daten nicht im RSC-Payload gefunden.';
      return { players: [], clubId, reason, errorCode: 'rsc_payload_incomplete' };
    }

    const squadObj = squad as Record<string, unknown>;
    const startingEleven = (squadObj.startingEleven as unknown[]) || [];
    const bench          = (squadObj.bench          as unknown[]) || [];
    const allRawSquad    = [...startingEleven, ...bench];

    // Map squad players (full stats)
    const squadPlayers = allRawSquad
      .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      .map(mapPlayerFromGoalsverse);

    // Index squad by id for fast lookup during merge
    const squadById = new Map(squadPlayers.map((p) => [p.id, p]));

    const clubUsername = clubInfo && typeof clubInfo === 'object'
      ? (clubInfo as Record<string, unknown>).username as string | undefined
      : undefined;

    // ── Step 2: Load /p/{slug} with full Next.js RSC headers ──
    // This returns the "club" array: 60+ players with basic stats (firstName, lastName, role, ovr).
    // Without the Next-Router-State-Tree header, the server returns an abbreviated shell with no player data.
    // Priority for slug: RSC slug > club API username > /api/v1/users/{id} lookup > original search term
    let profilePlayers: Player[] = [];

    let resolvedSlug = slug ?? clubUsername ?? null;

    // If still no slug and clubId is a UUID, do a dedicated username lookup
    if (!resolvedSlug && /^[0-9a-f-]{36}$/i.test(clubId)) {
      resolvedSlug = await resolveUsernameForClub(clubId);
    }

    // Last resort: use the original search input only if it doesn't look like a UUID
    if (!resolvedSlug && !/^[0-9a-f-]{36}$/i.test(clubName)) {
      resolvedSlug = clubName;
    }

    if (resolvedSlug) {
      try {
        // Pass the slug so fetchRsc can build the correct Next-Router-State-Tree header
        const profileRsc = await fetchRsc(`/p/${encodeURIComponent(resolvedSlug)}`, resolvedSlug);
        const { club } = extractSquadFromRsc(profileRsc);

        if (club && club.length > 0) {
          // Profile "club" array has firstName/lastName + basic stats — same ActivityPlayer shape
          profilePlayers = (club as ActivityPlayer[])
            .filter((p): p is ActivityPlayer => typeof p === 'object' && p !== null)
            .map(mapActivityPlayerToBasic);
        }
      } catch {
        // Profile page is best-effort — don't fail the whole import if it 404s
      }
    }

    // ── Step 3: Merge — squad (full stats) wins over profile (basic) ──
    // Players in squad keep their full stats. Non-squad players from profile are added as basic entries.
    const merged: Player[] = [...squadPlayers];
    const addedIds = new Set(squadPlayers.map((p) => p.id));

    for (const pp of profilePlayers) {
      if (!addedIds.has(pp.id) && !squadById.has(pp.id)) {
        merged.push(pp);
        addedIds.add(pp.id);
      } else {
        // Copy image_url + match stats onto the squad player if missing
        const existing = squadById.get(pp.id);
        if (existing) {
          if (!existing.image_url && pp.image_url) existing.image_url = pp.image_url;
          if (pp.matches_played !== undefined) existing.matches_played = pp.matches_played;
          if (pp.goals !== undefined)          existing.goals          = pp.goals;
          if (pp.assists !== undefined)        existing.assists        = pp.assists;
        }
      }
    }

    return {
      players: merged,
      clubId,
      // Club profile URL on goalsverse — human-readable page, not the raw API endpoint
      clubUrl: resolvedSlug
        ? `${GOALSVERSE_BASE}/p/${encodeURIComponent(resolvedSlug)}`
        : `${GOALSVERSE_BASE}/v1/club/${clubId}`,
      clubName: clubUsername || clubName,
      reason: merged.length ? undefined : 'Squad gefunden, aber keine Spieler extrahiert.',
      errorCode: merged.length ? undefined : 'no_players_found',
    };
  } catch (err) {
    const reason = `Fehler beim Abrufen: ${err instanceof Error ? err.message : String(err)}`;
    return {
      players: [],
      clubId,
      reason,
      errorCode: classifyImportError(reason),
    };
  }
}

// ScraperClient registration — future sources implement the same interface
import type { ScraperClient } from './base-client';
export const goalsverseClient: ScraperClient = {
  name: 'goalsverse',
  baseUrl: 'https://goalsverse.com',
  getClubRoster,
};
