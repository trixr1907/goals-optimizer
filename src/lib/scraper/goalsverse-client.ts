import { Player, PlayerStats, Position, Rarity } from './types';

const GOALSVERSE_BASE = 'https://goalsverse.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; GOALS Squad Optimizer/1.0)';

// GOALS role IDs → Positionen
const ROLE_MAP: Record<number, Position> = {
  0: 'GK',
  1: 'CB', 2: 'CB',
  3: 'LB', 4: 'RB',
  5: 'LWB', 6: 'RWB',
  7: 'CDM',
  8: 'CM', 9: 'CM',
  10: 'CAM',
  11: 'LM', 12: 'RM',
  13: 'LW', 14: 'RW',
  15: 'CF',
  16: 'ST',
};

const TIER_TO_RARITY: Record<number, Rarity> = {
  0: 'Basic',
  1: 'Uncommon',
  2: 'Rare',
  3: 'Epic',
  4: 'Legendary',
  5: 'Mythic',
  6: 'Iconic',
};

type GoalsverseFetchResult = {
  players: Player[];
  clubUrl?: string;
  clubName?: string;
  reason?: string;
};

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchRsc(path: string): Promise<string> {
  const url = path.startsWith('http') ? path : `${GOALSVERSE_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/x-component',
      RSC: '1',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/* ── Search / resolve club ───────────────────────────────────────────────── */

function normalizedName(input: string): string {
  return input.trim().toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, '');
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
  // Direct UUID
  const uuid = clubName.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (uuid) return uuid;

  // Search API
  const data = await fetchJson<{ users?: GoalsverseSearchUser[] }>(
    `${GOALSVERSE_BASE}/api/v1/search?query=${encodeURIComponent(clubName.trim())}`
  );
  const users = data.users ?? [];
  const exact = users.find((u) => u.userId && searchUserMatches(u, clubName));
  const fallback = exact ?? users.find((u) => u.userId);
  return fallback?.userId ?? null;
}

/* ── RSC parsing ─────────────────────────────────────────────────────────── */

function extractJsonObject(text: string, startIndex: number): unknown | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"' && !inString) { inString = true; continue; }
    if (ch === '"' && inString) { inString = false; continue; }
    if (inString) continue;

    if (ch === '{' || ch === '[') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          return JSON.parse(text.slice(objStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractSquadFromRsc(rscText: string): { squad?: unknown; clubInfo?: unknown } {
  // Find squad object
  const squadIdx = rscText.indexOf('"squad":');
  const squad = squadIdx >= 0 ? extractJsonObject(rscText, squadIdx + 7) : null;

  // Find club info (first "data":{...} with username)
  const dataIdx = rscText.indexOf('"data":');
  const clubInfo = dataIdx >= 0 ? extractJsonObject(rscText, dataIdx + 6) : null;

  return { squad, clubInfo };
}

/* ── Player mapping ──────────────────────────────────────────────────────── */

function mapRoleToPosition(roleId: number): Position {
  return ROLE_MAP[roleId] || 'CM';
}

function mapTierToRarity(tier: number): Rarity {
  return TIER_TO_RARITY[tier] || 'Basic';
}

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

  // Build full name
  const firstName = (raw.first_name as string) || '';
  const lastName = (raw.last_name as string) || '';
  const name = `${firstName} ${lastName}`.trim() || (raw.id as string)?.slice(0, 8) || 'Unknown';

  const ovr = (raw.ovr as Record<string, unknown>) || {};
  const role = typeof ovr.role === 'number' ? ovr.role : 8;
  const overall = typeof ovr.overall_rating === 'number' ? ovr.overall_rating : 50;

  const tier = typeof raw.tier === 'number' ? raw.tier : 0;
  const height = typeof raw.height === 'number' ? raw.height : undefined;
  const age = typeof raw.current_age === 'number' ? raw.current_age : undefined;
  const foot = typeof raw.strong_foot === 'number' ? raw.strong_foot : undefined;

  // Extract all individual stats
  const playerStats: PlayerStats = {
    // Pace
    pac: extractStatValue(stats, ['pace', 'weighted_value']),
    acceleration: extractStatValue(stats, ['pace', 'acceleration', 'value']),
    sprint_speed: extractStatValue(stats, ['pace', 'sprint_speed', 'value']),

    // Shooting
    sho: extractStatValue(stats, ['shooting', 'weighted_value']),
    finishing: extractStatValue(stats, ['shooting', 'finishing', 'value']),
    shot_power: extractStatValue(stats, ['shooting', 'shot_power', 'value']),
    long_shots: extractStatValue(stats, ['shooting', 'long_shots', 'value']),
    penalties: extractStatValue(stats, ['shooting', 'penalties', 'value']),
    weak_foot: extractStatValue(stats, ['shooting', 'weak_foot', 'value']),
    attacking_iq: extractStatValue(stats, ['shooting', 'attacking_iq', 'value']),

    // Passing
    pas: extractStatValue(stats, ['passing', 'weighted_value']),
    ground_pass: extractStatValue(stats, ['passing', 'ground_pass', 'value']),
    lofted_pass: extractStatValue(stats, ['passing', 'lofted_pass', 'value']),
    through_pass: extractStatValue(stats, ['passing', 'through_pass', 'value']),
    crossing: extractStatValue(stats, ['passing', 'crossing', 'value']),
    curve: extractStatValue(stats, ['passing', 'curve', 'value']),
    free_kick_accuracy: extractStatValue(stats, ['passing', 'free_kicks', 'value']),

    // Dribbling
    dri: extractStatValue(stats, ['dribbling', 'weighted_value']),
    sprint_dribbling: extractStatValue(stats, ['dribbling', 'sprint_dribbling', 'value']),
    close_dribbling: extractStatValue(stats, ['dribbling', 'close_dribbling', 'value']),
    skills: extractStatValue(stats, ['dribbling', 'skills', 'value']),
    agility: extractStatValue(stats, ['dribbling', 'agility', 'value']),
    balance: extractStatValue(stats, ['dribbling', 'balance', 'value']),
    first_touch: extractStatValue(stats, ['dribbling', 'first_touch', 'value']),

    // Defending
    def: extractStatValue(stats, ['defending', 'weighted_value']),
    defensive_iq: extractStatValue(stats, ['defending', 'defensive_iq', 'value']),
    stand_tackle: extractStatValue(stats, ['defending', 'stand_tackle', 'value']),
    slide_tackle: extractStatValue(stats, ['defending', 'slide_tackle', 'value']),
    jockeying: extractStatValue(stats, ['defending', 'jockeying', 'value']),
    interceptions: extractStatValue(stats, ['defending', 'interceptions', 'value']),
    blocking: extractStatValue(stats, ['defending', 'blocking', 'value']),

    // Physical
    phy: extractStatValue(stats, ['physicality', 'weighted_value']),
    strength: extractStatValue(stats, ['physicality', 'strength', 'value']),
    aggression: extractStatValue(stats, ['physicality', 'aggression', 'value']),
    stamina: extractStatValue(stats, ['physicality', 'stamina', 'value']),
    heading: extractStatValue(stats, ['physicality', 'heading', 'value']),
    jumping: extractStatValue(stats, ['physicality', 'jumping', 'value']),

    // Goalkeeping
    div: extractStatValue(stats, ['goalkeeping', 'diving', 'weighted_value']),
    kic: extractStatValue(stats, ['goalkeeping', 'distribution', 'weighted_value']),
    reflexes: extractStatValue(stats, ['goalkeeping', 'reflexes', 'weighted_value']),
    positioning: extractStatValue(stats, ['goalkeeping', 'awareness', 'positioning', 'value']),
    catching: extractStatValue(stats, ['goalkeeping', 'handling', 'catching', 'value']),
    parrying: extractStatValue(stats, ['goalkeeping', 'handling', 'parrying', 'value']),
    rushing: extractStatValue(stats, ['goalkeeping', 'awareness', 'rushing', 'value']),
    command_of_area: extractStatValue(stats, ['goalkeeping', 'awareness', 'command_of_area', 'value']),
    penalty_saving: extractStatValue(stats, ['goalkeeping', 'awareness', 'penalty_saving', 'value']),
    throwing: extractStatValue(stats, ['goalkeeping', 'distribution', 'throwing', 'value']),
    kicking_power: extractStatValue(stats, ['goalkeeping', 'distribution', 'kicking_power', 'value']),
  };

  return {
    id: `goalsverse-${raw.id}`,
    name,
    position: mapRoleToPosition(role),
    overall,
    rarity: mapTierToRarity(tier),
    stats: playerStats,
    age,
    height_cm: height,
    preferred_foot: foot === 1 ? 'left' : foot === 2 ? 'right' : undefined,
    training_value: typeof raw.potential === 'object' && raw.potential !== null
      ? (raw.potential as Record<string, unknown>).training_value as number | undefined
      : undefined,
    xp_current: typeof raw.current_xp === 'number' ? raw.current_xp : undefined,
  };
}

/* ── Public API ──────────────────────────────────────────────────────────── */

export async function getClubRoster(clubName: string): Promise<GoalsverseFetchResult> {
  const clubId = await resolveClubId(clubName);
  if (!clubId) {
    return { players: [], reason: `Club "${clubName}" wurde auf goalsverse nicht gefunden.` };
  }

  try {
    const rscText = await fetchRsc(`/v1/club/${clubId}`);
    const { squad, clubInfo } = extractSquadFromRsc(rscText);

    if (!squad || typeof squad !== 'object') {
      return { players: [], reason: 'Squad-Daten nicht im RSC-Payload gefunden.' };
    }

    const squadObj = squad as Record<string, unknown>;
    const startingEleven = (squadObj.startingEleven as unknown[]) || [];
    const bench = (squadObj.bench as unknown[]) || [];
    const allRawPlayers = [...startingEleven, ...bench];

    const players = allRawPlayers
      .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      .map(mapPlayerFromGoalsverse);

    const clubUsername = clubInfo && typeof clubInfo === 'object'
      ? (clubInfo as Record<string, unknown>).username as string | undefined
      : undefined;

    return {
      players,
      clubUrl: `${GOALSVERSE_BASE}/v1/club/${clubId}`,
      clubName: clubUsername || clubName,
      reason: players.length ? undefined : 'Squad gefunden, aber keine Spieler extrahiert.',
    };
  } catch (err) {
    return {
      players: [],
      reason: `Fehler beim Abrufen: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
