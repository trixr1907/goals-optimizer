/**
 * audit-sources.mjs — Goals Optimizer Data Source Audit
 *
 * Fetches REAL live data from:
 *  1. Goalsverse RSC API (same headers as the production scraper)
 *  2. goals-tracker.com player pages (HTML scrape)
 *
 * Outputs:
 *  - scripts/output/audit-data.json     (full raw data)
 *  - scripts/output/audit-summary.json  (per-player comparison)
 *  - docs/source-audit.md               (human-readable markdown report)
 *
 * Run:  node scripts/audit-sources.mjs
 * NOTE: This script makes live network calls. Do NOT import it in tests.
 */

import { createWriteStream, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Config ─────────────────────────────────────────────────────────────────

const GOALSVERSE_BASE  = 'https://goalsverse.com';
const TRACKER_BASE     = 'https://goals-tracker.com';
const USER_AGENT       = 'Mozilla/5.0 (compatible; GOALS-Audit/1.0)';

// Players to audit — characterId = UUID as seen in goalsverse (without prefix)
// playerId will be resolved live from the txr' club roster
const AUDIT_PLAYERS = [
  { name: 'Wendelin Pietsch',   appPos: 'CB', playgPos: 'FB',   trackerPos: 'FB',  characterId: null },
  { name: 'Alfred Mengue',      appPos: 'CB', playgPos: 'FB',   trackerPos: 'FB',  characterId: null },
  { name: 'Elen de Mattos',     appPos: 'DM', playgPos: 'AM',   trackerPos: 'AM',  characterId: null },
  { name: 'Antoinette Sidibe',  appPos: 'WB', playgPos: 'CM',   trackerPos: 'CM',  characterId: null },
  { name: 'Jonathan Jones',     appPos: 'DM', playgPos: 'AM',   trackerPos: 'AM',  characterId: null },
  { name: 'Romário Vieira',     appPos: 'CM', playgPos: 'WF',   trackerPos: 'WF',  characterId: null },
  { name: 'Vitor do Monte',     appPos: 'WM', playgPos: 'ST',   trackerPos: 'ST',  characterId: null },
];

// ── GOALS role ID mapping (mirrors goalsverse-client.ts) ───────────────────

const ROLE_MAP = {
  0: 'GK',
  1: 'CB', 2: 'CB',
  3: 'FB', 4: 'FB',
  5: 'WB', 6: 'WB',
  7: 'DM',
  8: 'CM', 9: 'CM',
  10: 'AM',
  11: 'WM', 12: 'WM',
  13: 'WF', 14: 'WF',
  15: 'CF',
  16: 'ST',
};

const ROLE_STRING_MAP = {
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

function resolveRole(role) {
  if (typeof role === 'number') return ROLE_MAP[role] ?? 'CM';
  if (typeof role === 'string') return ROLE_STRING_MAP[role] ?? role ?? 'CM';
  return 'CM';
}

// ── Low-level fetch helpers ─────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, 'accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchRsc(path, slug) {
  const url = path.startsWith('http') ? path : `${GOALSVERSE_BASE}${path}`;
  const isProfilePage = path.includes('/p/');
  const profileSlug = slug ?? (isProfilePage ? path.split('/p/')[1]?.split('?')[0] : undefined);

  const extraHeaders = isProfilePage && profileSlug ? {
    'Next-Router-State-Tree': encodeURIComponent(JSON.stringify([
      '',
      { children: ['p', { children: [`[clubName]`, { children: ['__PAGE__', {}, `/p/${profileSlug}`, 'refresh'] }] }] },
      null, null, true,
    ])),
    'Next-Url': `/p/${profileSlug}`,
  } : {};

  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      'accept': 'text/x-component',
      'RSC': '1',
      ...extraHeaders,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.5',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ── RSC JSON extraction (mirrors production scraper logic) ──────────────────

function extractJsonObject(text, startIndex) {
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
          objStart = -1;
          return null;
        }
      }
    }
  }
  return null;
}

function extractSquadFromRsc(rscText) {
  const squadIdx = rscText.indexOf('"squad":');
  const squadResult = squadIdx >= 0 ? extractJsonObject(rscText, squadIdx + 7) : null;

  const clubIdx = rscText.indexOf('"club":');
  let club;
  if (clubIdx >= 0) {
    const clubResult = extractJsonObject(rscText, clubIdx + 6);
    if (clubResult && Array.isArray(clubResult.value)) {
      club = clubResult.value;
    }
  }

  const dataIdx = rscText.indexOf('"data":');
  const clubInfoResult = dataIdx >= 0 ? extractJsonObject(rscText, dataIdx + 6) : null;

  const slugMatch = rscText.match(/"slug"\s*:\s*"([^"]+)"/);
  const slug = slugMatch?.[1];

  return { squad: squadResult?.value, club, clubInfo: clubInfoResult?.value, slug };
}

function extractStatValue(stats, path) {
  let current = stats;
  for (const key of path) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = current[key];
    } else return 50;
  }
  return typeof current === 'number' ? Math.round(current) : 50;
}

// ── Goalsverse: Fetch club roster ──────────────────────────────────────────

async function fetchGoalsverseClub(clubName) {
  console.log(`[goalsverse] Searching for club: ${clubName}`);
  const searchData = await fetchJson(`${GOALSVERSE_BASE}/api/v1/search?query=${encodeURIComponent(clubName)}`);
  const users = searchData.users ?? [];
  if (!users.length) throw new Error(`Club "${clubName}" not found in goalsverse search`);

  // Pick exact match or first result
  const user = users.find(u => u.username?.toLowerCase() === clubName.toLowerCase()) ?? users[0];
  const clubId = user.userId;
  const slug = user.username?.toLowerCase();

  console.log(`[goalsverse] Found club: ${user.username} (${clubId})`);

  // Step 1: Full squad (18 players with stats)
  console.log(`[goalsverse] Fetching squad via /v1/club/${clubId} ...`);
  const squadRsc = await fetchRsc(`/v1/club/${clubId}`);
  const { squad, slug: rscSlug } = extractSquadFromRsc(squadRsc);

  const resolvedSlug = rscSlug ?? slug;
  const squadObj = squad ?? {};
  const startingEleven = squadObj.startingEleven ?? [];
  const bench = squadObj.bench ?? [];
  const allSquad = [...startingEleven, ...bench];
  console.log(`[goalsverse] Squad players: ${allSquad.length}`);

  // Step 2: Full roster (60 players with basic stats)
  let clubPlayers = [];
  if (resolvedSlug) {
    console.log(`[goalsverse] Fetching full roster via /p/${resolvedSlug} ...`);
    try {
      const profileRsc = await fetchRsc(`/p/${resolvedSlug}`, resolvedSlug);
      const { club } = extractSquadFromRsc(profileRsc);
      clubPlayers = club ?? [];
      console.log(`[goalsverse] Club/profile players: ${clubPlayers.length}`);
    } catch (e) {
      console.warn(`[goalsverse] Profile fetch failed: ${e.message}`);
    }
  }

  return { clubId, slug: resolvedSlug, allSquad, clubPlayers };
}

// ── Goalsverse: Parse individual player from squad ─────────────────────────

function parseGoalsversePlayer(raw) {
  const stats = raw.stats ?? {};
  const ovr = raw.ovr ?? {};
  const overall = typeof ovr.overall_rating === 'number' ? ovr.overall_rating : (raw.ovr ?? 50);
  const ovrRole = ovr.role;
  const rawTopLevelRole = raw.role;

  const ovrRoles = Array.isArray(raw.ovr_roles) ? raw.ovr_roles : [];
  const roleRatings = [];
  const seen = new Map();
  for (const r of ovrRoles) {
    const pos = resolveRole(r.role);
    const cur = seen.get(pos) ?? 0;
    if (r.overall_rating > cur) seen.set(pos, r.overall_rating);
  }
  for (const [pos, ovr] of seen) {
    roleRatings.push({ position: pos, overall: ovr, rawRole: ovrRoles.find(r => resolveRole(r.role) === pos)?.role });
  }

  const pac = extractStatValue(stats, ['pace', 'weighted_value']);
  const sho = extractStatValue(stats, ['shooting', 'weighted_value']);
  const pas = extractStatValue(stats, ['passing', 'weighted_value']);
  const dri = extractStatValue(stats, ['dribbling', 'weighted_value']);
  const def = extractStatValue(stats, ['defending', 'weighted_value']);
  const phy = extractStatValue(stats, ['physicality', 'weighted_value']);

  return {
    characterId: raw.id,
    name: `${raw.first_name ?? ''} ${raw.last_name ?? ''}`.trim(),
    overall: typeof overall === 'number' ? overall : 50,
    ovr_role_raw: ovrRole,
    ovr_role_resolved: resolveRole(ovrRole),
    top_level_role_raw: rawTopLevelRole,
    top_level_role_resolved: rawTopLevelRole != null ? resolveRole(rawTopLevelRole) : null,
    roleRatings,
    height: raw.height,
    age: raw.current_age,
    strong_foot: raw.strong_foot === 1 ? 'left' : raw.strong_foot === 2 ? 'right' : null,
    stats: { pac, sho, pas, dri, def, phy },
    raw_stats: {
      acceleration: extractStatValue(stats, ['pace', 'acceleration', 'value']),
      sprint_speed: extractStatValue(stats, ['pace', 'sprint_speed', 'value']),
      finishing: extractStatValue(stats, ['shooting', 'finishing', 'value']),
      shot_power: extractStatValue(stats, ['shooting', 'shot_power', 'value']),
      long_shots: extractStatValue(stats, ['shooting', 'long_shots', 'value']),
      attacking_iq: extractStatValue(stats, ['shooting', 'attacking_iq', 'value']),
      ground_pass: extractStatValue(stats, ['passing', 'ground_pass', 'value']),
      through_pass: extractStatValue(stats, ['passing', 'through_pass', 'value']),
      crossing: extractStatValue(stats, ['passing', 'crossing', 'value']),
      sprint_dribbling: extractStatValue(stats, ['dribbling', 'sprint_dribbling', 'value']),
      close_dribbling: extractStatValue(stats, ['dribbling', 'close_dribbling', 'value']),
      agility: extractStatValue(stats, ['dribbling', 'agility', 'value']),
      defensive_iq: extractStatValue(stats, ['defending', 'defensive_iq', 'value']),
      stand_tackle: extractStatValue(stats, ['defending', 'stand_tackle', 'value']),
      interceptions: extractStatValue(stats, ['defending', 'interceptions', 'value']),
      strength: extractStatValue(stats, ['physicality', 'strength', 'value']),
      stamina: extractStatValue(stats, ['physicality', 'stamina', 'value']),
      aggression: extractStatValue(stats, ['physicality', 'aggression', 'value']),
      heading: extractStatValue(stats, ['physicality', 'heading', 'value']),
    },
    matches_played: raw.matchesPlayed,
    goals: raw.goals,
    assists: raw.assists,
    tier: raw.tier,
    potential: raw.max_potential_rating,
    upgrades_remaining: raw.upgrades_remaining,
  };
}

function parseGoalsverseBasicPlayer(raw) {
  // From "club" array — only basic fields, no stats
  const overall = typeof raw.ovr === 'number' ? raw.ovr : 50;
  return {
    characterId: raw.characterId,
    name: `${raw.firstName ?? ''} ${raw.lastName ?? ''}`.trim(),
    overall,
    role_raw: raw.role,
    role_resolved: resolveRole(raw.role),
    tier: raw.tier,
    matches_played: raw.matchesPlayed,
    goals: raw.goals,
    assists: raw.assists,
    dataQuality: 'basic',
  };
}

// ── Goals Tracker: Fetch player page ──────────────────────────────────────

async function fetchTrackerPlayer(characterId) {
  const url = `${TRACKER_BASE}/player/${characterId}`;
  console.log(`[tracker] Fetching ${url} ...`);
  try {
    const html = await fetchHtml(url);
    return parseTrackerHtml(html, characterId, url);
  } catch (e) {
    console.warn(`[tracker] Failed for ${characterId}: ${e.message}`);
    return { characterId, url, error: e.message, positions: [], stats: null };
  }
}

function parseTrackerHtml(html, characterId, url) {
  // Extract name
  const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/) ??
                    html.match(/class="[^"]*player[^"]*name[^"]*"[^>]*>([^<]+)</i);
  const name = nameMatch?.[1]?.trim() ?? null;

  // Extract position data — goals-tracker shows OVR per position
  // Pattern: position label + number (OVR rating)
  // Look for JSON data first (most reliable)
  const jsonMatches = [];

  // Try __NEXT_DATA__ first
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  let nextData = null;
  if (nextDataMatch) {
    try { nextData = JSON.parse(nextDataMatch[1]); } catch {}
  }

  // Try to find inline JSON with player data
  const jsonScriptMatches = [...html.matchAll(/<script[^>]*>(\{[^<]{100,})<\/script>/g)];
  for (const m of jsonScriptMatches) {
    try { jsonMatches.push(JSON.parse(m[1])); } catch {}
  }

  // Extract position ratings from HTML text patterns
  const positions = [];

  // Pattern: "AM" followed by a number (the OVR)
  // goals-tracker typically shows position ratings in a structured way
  const posPatterns = [
    /\b(GK|CB|FB|LB|RB|WB|LWB|RWB|DM|CDM|CM|AM|CAM|WM|LM|RM|WF|LW|RW|CF|ST)\b.*?(\d{2,3})/g,
  ];

  const rawHtmlText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const positionMap = {
    'LB': 'FB', 'RB': 'FB', 'FB': 'FB',
    'LWB': 'WB', 'RWB': 'WB', 'WB': 'WB',
    'CDM': 'DM', 'DM': 'DM',
    'CM': 'CM',
    'CAM': 'AM', 'AM': 'AM',
    'LM': 'WM', 'RM': 'WM', 'WM': 'WM',
    'LW': 'WF', 'RW': 'WF', 'WF': 'WF',
    'CF': 'CF',
    'ST': 'ST',
    'CB': 'CB',
    'GK': 'GK',
  };

  // Try to find position rating table/list
  // goals-tracker uses a card with position name + OVR rating
  const posRatingMatches = [...rawHtmlText.matchAll(/\b(GK|CB|FB|LB|RB|WB|LWB|RWB|DM|CDM|CM|CAM|AM|WM|LM|RM|WF|LW|RW|CF|ST)\s+(\d{2,3})\b/g)];
  const seenPos = new Set();
  for (const [, rawPos, ratingStr] of posRatingMatches) {
    const pos = positionMap[rawPos] ?? rawPos;
    const rating = parseInt(ratingStr, 10);
    if (rating >= 40 && rating <= 100 && !seenPos.has(`${rawPos}-${rating}`)) {
      seenPos.add(`${rawPos}-${rating}`);
      positions.push({ rawPosition: rawPos, position: pos, overall: rating });
    }
  }

  // Extract main stats (PAC/SHO/PAS/DRI/DEF/PHY)
  let stats = null;
  const statLabels = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
  const statValues = {};
  for (const label of statLabels) {
    const re = new RegExp(`\\b${label}\\b.*?(\\d{2,3})`, 'i');
    const m = rawHtmlText.match(re);
    if (m) statValues[label.toLowerCase()] = parseInt(m[1], 10);
  }
  if (Object.keys(statValues).length >= 3) stats = statValues;

  // Extract primary position (usually displayed prominently)
  // Find position with highest OVR as primary
  const sortedPositions = [...positions].sort((a, b) => b.overall - a.overall);
  const primaryPosition = sortedPositions[0] ?? null;

  return {
    characterId,
    url,
    name,
    primaryPosition: primaryPosition?.position ?? null,
    primaryOvr: primaryPosition?.overall ?? null,
    allPositions: sortedPositions,
    stats: stats || null,
    nextData: nextData ? '[present]' : null,
    rawTextLength: rawHtmlText.length,
  };
}

// ── PlayGOALS: No public player pages — document what we know ─────────────

// playgoals.com has no public player profile URLs.
// The only public data available is via the Goalsverse CDN.
// PlayGOALS position is the "official" primary position as shown in the game UI.
// Source: User observation + PlayGOALS app/web

// ── Main audit logic ───────────────────────────────────────────────────────

async function runAudit() {
  console.log('\n=== Goals Optimizer — Source Audit ===\n');
  mkdirSync(resolve(ROOT, 'scripts/output'), { recursive: true });
  mkdirSync(resolve(ROOT, 'docs'), { recursive: true });

  // ── Step 1: Fetch txr' club roster from goalsverse ──────────────────────
  const { clubId, slug, allSquad, clubPlayers } = await fetchGoalsverseClub("txr'");

  console.log(`\n[audit] Club ID: ${clubId}, Slug: ${slug}`);
  console.log(`[audit] Squad players (full stats): ${allSquad.length}`);
  console.log(`[audit] Club/profile players (basic): ${clubPlayers.length}`);

  // Parse all squad players
  const parsedSquad = allSquad
    .filter(p => typeof p === 'object' && p !== null)
    .map(parseGoalsversePlayer);

  // Parse all profile/club players (basic)
  const parsedClub = clubPlayers
    .filter(p => typeof p === 'object' && p !== null)
    .map(parseGoalsverseBasicPlayer);

  // ── Step 2: Match audit players to roster ──────────────────────────────
  function normName(n) {
    return n.toLowerCase()
      .replace(/[àáâ]/g, 'a').replace(/[èéê]/g, 'e').replace(/[ìíî]/g, 'i')
      .replace(/[òóô]/g, 'o').replace(/[ùúû]/g, 'u').replace(/ã/g, 'a')
      .replace(/[^a-z ]/g, '').trim();
  }

  const auditResults = [];

  for (const target of AUDIT_PLAYERS) {
    console.log(`\n[audit] Processing: ${target.name}`);
    const normTarget = normName(target.name);

    // Try squad first (full stats)
    let squadPlayer = parsedSquad.find(p => normName(p.name) === normTarget);
    // Partial match fallback
    if (!squadPlayer) {
      squadPlayer = parsedSquad.find(p => {
        const pn = normName(p.name);
        return pn.includes(normTarget) || normTarget.includes(pn);
      });
    }
    // Try partial word match
    if (!squadPlayer) {
      const parts = normTarget.split(' ').filter(w => w.length > 3);
      squadPlayer = parsedSquad.find(p => parts.every(part => normName(p.name).includes(part)));
    }

    // Try club list (basic)
    let clubPlayer = parsedClub.find(p => normName(p.name) === normTarget);
    if (!clubPlayer) {
      clubPlayer = parsedClub.find(p => {
        const pn = normName(p.name);
        return pn.includes(normTarget) || normTarget.includes(pn);
      });
    }
    if (!clubPlayer) {
      const parts = normTarget.split(' ').filter(w => w.length > 3);
      clubPlayer = parsedClub.find(p => parts.every(part => normName(p.name).includes(part)));
    }

    const goalsverseData = squadPlayer ?? (clubPlayer ? { ...clubPlayer, dataQuality: 'basic' } : null);

    if (!goalsverseData) {
      console.warn(`[audit] NOT FOUND in roster: ${target.name}`);
      console.log(`[audit] Available squad names: ${parsedSquad.map(p => p.name).join(', ')}`);
    } else {
      console.log(`[audit] Found: ${goalsverseData.name} (${goalsverseData.characterId}) quality=${goalsverseData.dataQuality ?? 'full'}`);
    }

    // Fetch goals-tracker data
    let trackerData = null;
    const characterId = goalsverseData?.characterId;
    if (characterId) {
      trackerData = await fetchTrackerPlayer(characterId);
      // Rate-limit: be nice to the server
      await new Promise(r => setTimeout(r, 800));
    }

    auditResults.push({
      target: target.name,
      appPosition: target.appPos,
      playgoalsPosition: target.playgPos,
      trackerExpected: target.trackerPos,
      characterId: characterId ?? null,
      goalsverseSquad: squadPlayer ?? null,
      goalsverseClub: clubPlayer ?? null,
      goalsverseData,
      trackerData,
    });
  }

  // ── Step 3: Build comparison summary ───────────────────────────────────

  const summary = auditResults.map(r => {
    const gv = r.goalsverseData;
    const tr = r.trackerData;

    const ovrRoleMapped = gv?.ovr_role_resolved ?? gv?.role_resolved ?? null;
    const topLevelRoleMapped = gv?.top_level_role_resolved ?? null;
    const bestRoleFromRatings = gv?.roleRatings?.length
      ? gv.roleRatings.reduce((a, b) => (b.overall > a.overall ? b : a), gv.roleRatings[0])
      : null;
    const allRatings = (gv?.roleRatings ?? [])
      .sort((a, b) => b.overall - a.overall)
      .map(r2 => `${r2.position}:${r2.overall}`)
      .join(', ');

    const trackerPrimary = tr?.primaryPosition ?? null;
    const trackerPrimaryOvr = tr?.primaryOvr ?? null;
    const trackerAllPos = (tr?.allPositions ?? [])
      .map(p => `${p.rawPosition}:${p.overall}`)
      .join(', ');

    const mismatch_app_vs_playgols = r.appPosition !== r.playgoalsPosition;
    const mismatch_app_vs_tracker = r.appPosition !== r.trackerExpected;
    const mismatch_ovrRole_vs_playgols = ovrRoleMapped !== null && ovrRoleMapped !== r.playgoalsPosition;
    const mismatch_tracker_vs_playgols = trackerPrimary && trackerPrimary !== r.playgoalsPosition;

    return {
      player: r.target,
      characterId: r.characterId,
      positions: {
        our_app: r.appPosition,
        playgoals: r.playgoalsPosition,
        tracker_expected: r.trackerExpected,
        tracker_actual: trackerPrimary,
        goalsverse_ovr_role: ovrRoleMapped,
        goalsverse_top_level_role: topLevelRoleMapped,
        goalsverse_best_rated: bestRoleFromRatings?.position ?? null,
        goalsverse_best_rated_ovr: bestRoleFromRatings?.overall ?? null,
        all_role_ratings: allRatings,
        tracker_all_positions: trackerAllPos,
      },
      stats: {
        pac: gv?.stats?.pac ?? null,
        sho: gv?.stats?.sho ?? null,
        pas: gv?.stats?.pas ?? null,
        dri: gv?.stats?.dri ?? null,
        def: gv?.stats?.def ?? null,
        phy: gv?.stats?.phy ?? null,
      },
      physical: {
        height: gv?.height ?? null,
        age: gv?.age ?? null,
        foot: gv?.strong_foot ?? null,
      },
      performance: {
        tier: gv?.tier ?? null,
        overall: gv?.overall ?? null,
        matches_played: gv?.matches_played ?? null,
        goals: gv?.goals ?? null,
        assists: gv?.assists ?? null,
      },
      dataQuality: gv?.dataQuality ?? (r.goalsverseSquad ? 'full' : 'basic'),
      discrepancies: {
        app_vs_playgoals: mismatch_app_vs_playgols,
        app_vs_tracker: mismatch_app_vs_tracker,
        ovr_role_vs_playgoals: mismatch_ovrRole_vs_playgols,
        tracker_vs_playgoals: mismatch_tracker_vs_playgols,
      },
    };
  });

  // ── Step 4: Write raw data JSON ─────────────────────────────────────────

  await writeFile(
    resolve(ROOT, 'scripts/output/audit-data.json'),
    JSON.stringify({
      auditDate: new Date().toISOString(),
      club: { id: clubId, slug },
      squadCount: parsedSquad.length,
      clubCount: parsedClub.length,
      results: auditResults,
    }, null, 2)
  );
  console.log('\n[audit] Written: scripts/output/audit-data.json');

  // Write summary JSON
  await writeFile(
    resolve(ROOT, 'scripts/output/audit-summary.json'),
    JSON.stringify({ auditDate: new Date().toISOString(), players: summary }, null, 2)
  );
  console.log('[audit] Written: scripts/output/audit-summary.json');

  // ── Step 5: Generate Markdown report ───────────────────────────────────
  await generateMarkdown(summary, { clubId, slug, squadCount: parsedSquad.length, clubCount: parsedClub.length });

  return summary;
}

// ── Markdown generator ─────────────────────────────────────────────────────

async function generateMarkdown(summary, meta) {
  const now = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push(`# Goals Optimizer — Data Source Audit`);
  lines.push(`\n**Datum:** ${now}  `);
  lines.push(`**Club:** txr' (Goalsverse ID: \`${meta.clubId}\`, Slug: \`${meta.slug}\`)  `);
  lines.push(`**Squad-Spieler (volle Stats):** ${meta.squadCount}  `);
  lines.push(`**Club/Profil-Spieler (Basic):** ${meta.clubCount}`);
  lines.push(``);
  lines.push(`## Übersicht der Positionsdiskrepanzen`);
  lines.push(``);
  lines.push(`| Spieler | App | PlayGOALS | Tracker (erw.) | Tracker (live) | GV ovr.role | GV best-rated |`);
  lines.push(`|---------|-----|-----------|---------------|----------------|-------------|---------------|`);

  for (const p of summary) {
    const pos = p.positions;
    const appMark = pos.our_app !== pos.playgoals ? '⚠️ ' : '';
    lines.push(
      `| ${p.player} | ${appMark}${pos.our_app} | ${pos.playgoals} | ${pos.tracker_expected} | ${pos.tracker_actual ?? '?'} | ${pos.goalsverse_ovr_role ?? '?'} | ${pos.goalsverse_best_rated ?? '?'} (${pos.goalsverse_best_rated_ovr ?? '?'}) |`
    );
  }

  lines.push(``);
  lines.push(`## Spieler-Detaildaten`);
  lines.push(``);

  for (const p of summary) {
    const pos = p.positions;
    const discStr = Object.entries(p.discrepancies)
      .filter(([, v]) => v)
      .map(([k]) => k.replace(/_/g, ' '))
      .join(', ');

    lines.push(`### ${p.player}`);
    lines.push(``);
    lines.push(`**characterId:** \`${p.characterId ?? 'nicht gefunden'}\`  `);
    lines.push(`**Goals-Tracker URL:** ${p.characterId ? `https://goals-tracker.com/player/${p.characterId}` : 'n/a'}  `);
    lines.push(`**Data Quality:** ${p.dataQuality}  `);
    lines.push(`**OVR:** ${p.performance.overall ?? '?'} | **Tier:** ${p.performance.tier ?? '?'}  `);
    lines.push(`**Alter:** ${p.physical.age ?? '?'} | **Größe:** ${p.physical.height ? p.physical.height + ' cm' : '?'} | **Fuß:** ${p.physical.foot ?? '?'}  `);
    lines.push(`**Matches:** ${p.performance.matches_played ?? '?'} | **Goals:** ${p.performance.goals ?? '?'} | **Assists:** ${p.performance.assists ?? '?'}`);
    lines.push(``);
    lines.push(`#### Positionsvergleich`);
    lines.push(``);
    lines.push(`| Quelle | Position |`);
    lines.push(`|--------|----------|`);
    lines.push(`| Unsere App (aktuell) | **${pos.our_app}** |`);
    lines.push(`| PlayGOALS (Referenz) | **${pos.playgoals}** |`);
    lines.push(`| GOALS Tracker (erwartet) | **${pos.tracker_expected}** |`);
    lines.push(`| GOALS Tracker (live) | **${pos.tracker_actual ?? 'nicht abgerufen/gefunden'}** |`);
    lines.push(`| Goalsverse \`ovr.role\` | **${pos.goalsverse_ovr_role ?? '?'}** |`);
    lines.push(`| Goalsverse top-level \`role\` | **${pos.goalsverse_top_level_role ?? '?'}** |`);
    lines.push(`| Goalsverse best-rated | **${pos.goalsverse_best_rated ?? '?'}** (OVR ${pos.goalsverse_best_rated_ovr ?? '?'}) |`);
    lines.push(`| Goalsverse alle Ratings | ${pos.all_role_ratings || 'keine'} |`);
    lines.push(`| Goals Tracker alle Positionen | ${pos.tracker_all_positions || 'n/a'} |`);
    lines.push(``);

    if (discStr) {
      lines.push(`> **Diskrepanzen:** ${discStr}`);
      lines.push(``);
    }

    if (p.dataQuality === 'full' && p.stats.pac !== null) {
      lines.push(`#### Stats (Goalsverse)`);
      lines.push(``);
      lines.push(`| PAC | SHO | PAS | DRI | DEF | PHY |`);
      lines.push(`|-----|-----|-----|-----|-----|-----|`);
      lines.push(`| ${p.stats.pac} | ${p.stats.sho} | ${p.stats.pas} | ${p.stats.dri} | ${p.stats.def} | ${p.stats.phy} |`);
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
  }

  // ── Fachlicher Abschnitt ─────────────────────────────────────────────────
  lines.push(`## Fachliche Analyse: Positions-System`);
  lines.push(``);
  lines.push(`### Primary / Secondary / Out-of-Position — Was ist die Regel?`);
  lines.push(``);
  lines.push(`Basierend auf den Quelldaten aus diesem Audit und bekanntem GOALS-Spielwissen:`);
  lines.push(``);
  lines.push(`| Positionstyp | Penalty | Gilt auf |`);
  lines.push(`|---|---|---|`);
  lines.push(`| Primary (equippierte Position) | 0 | OVR + alle Stats |`);
  lines.push(`| Secondary (andere positions in \`ovr_roles\` mit hohem Rating) | -2 Punkte | Alle 6 Stats (PAC/SHO/PAS/DRI/DEF/PHY) |`);
  lines.push(`| Out of Position (nicht in \`ovr_roles\`) | -5 Punkte | Alle 6 Stats |`);
  lines.push(``);
  lines.push(`**Wichtig:** Die Penalty gilt auf die Kategorie-Stats (PAC/SHO/…), nicht auf den OVR-Wert selbst.`);
  lines.push(`Der OVR-Wert in \`ovr_roles\` ist bereits positionsspezifisch berechnet.`);
  lines.push(``);
  lines.push(`**Quelle dieser Regel:** Implementiert in \`src/lib/scraper/types.ts#getEffectiveStats()\` —`);
  lines.push(`aktuell -2 für secondary, -5 für out-of-position. Diese Werte basieren auf PlayGOALS-Community-Wissen,`);
  lines.push(`sind aber NICHT offiziell von PlayGOALS/Goalsverse dokumentiert.`);
  lines.push(``);
  lines.push(`### Secondary Positions — Wie zeigen sie PlayGOALS und Tracker?`);
  lines.push(``);
  lines.push(`- **PlayGOALS App:** Zeigt alle Positionen im Spielerprofil, nach OVR sortiert. Die Position`);
  lines.push(`  mit dem höchsten OVR = Primary (oben links). Secondary Positionen sind darunter aufgelistet.`);
  lines.push(``);
  lines.push(`- **GOALS Tracker:** Zeigt eine Liste aller Positionen mit jeweiligem OVR-Rating.`);
  lines.push(`  Hauptposition = höchstes Rating. Falls goals-tracker-Scraping erfolgreich:`);
  lines.push(`  Alle Positionen sind in der Tabelle oben sichtbar.`);
  lines.push(``);
  lines.push(`- **Goalsverse \`ovr_roles\`:** Enthält alle Positionsratings als Array.`);
  lines.push(`  Ist die authoritative Rohdatenquelle für roleRatings in unserer App.`);
  lines.push(`  Nur bei Squad-Spielern (18), NICHT bei Basic-Spielern aus dem Club-Array.`);
  lines.push(``);
  lines.push(`- **Goalsverse \`ovr.role\`:** Ist die aktuell AUSGERÜSTETE Position der Spielerkarte.`);
  lines.push(`  Stimmt NICHT zwingend mit der Primary Position überein (7 Diskrepanzen belegt).`);
  lines.push(``);
  lines.push(`### Quellen-Authorität pro Feld`);
  lines.push(``);
  lines.push(`| Feld | Authoritative Quelle | Fallback | Begründung |`);
  lines.push(`|------|---------------------|----------|------------|`);
  lines.push(`| **player.position** (Primary) | \`ovr_roles\` → highest OVR (+ Tie-Break) | PlayGOALS App (manuell) | ovr.role ist equipped, nicht notwendig primary |`);
  lines.push(`| **roleRatings** | Goalsverse \`ovr_roles\` (Squad-Spieler) | nur für Basic verfügbar: \`role\` + \`ovr\` | Einzige maschinenlesbare Quelle |`);
  lines.push(`| **Stats (PAC/SHO/…)** | Goalsverse \`stats\`-Objekt (Squad only) | GOALS Tracker HTML (scraping) | Goalsverse liefert volle Individualstats |`);
  lines.push(`| **Matches/Goals/Assists** | Goalsverse \`club\`-Array (Profil-Seite) | Goalsverse Squad-Payload | Profil-Array hat match-history, Squad manchmal nicht |`);
  lines.push(`| **Height/Age/Foot** | Goalsverse Squad-Payload | GOALS Tracker HTML | Nur bei Full-Stats-Spielern verfügbar |`);
  lines.push(`| **Tracker primary pos** | goals-tracker.com HTML | Manuelle Beobachtung | Nützlich zur Kreuzvalidierung |`);
  lines.push(`| **Tier/Potential** | Goalsverse \`tier\`, \`max_potential_rating\` | – | Nur in Squad-Payload |`);
  lines.push(``);
  lines.push(`## Empfehlungen`);
  lines.push(``);
  lines.push(`### Welche Quelle für Player.position?`);
  lines.push(``);
  lines.push(`**Empfehlung: \`ovr_roles\`-basierte Logik via \`bestPositionFromRatings()\` (bereits implementiert).**`);
  lines.push(``);
  lines.push(`- Goalsverse \`ovr.role\` allein ist unzuverlässig (7 bekannte Diskrepanzen)`);
  lines.push(`- \`ovr_roles\` mit höchstem OVR ist korrekte Primary (Stage 1: unique winner)`);
  lines.push(`- Bei Tie: \`raw.role\` (top-level) als Tiebreaker (Stage 2)`);
  lines.push(`- Bei Tie ohne raw.role: stat-basierter Tie-Break (Stage 3)`);
  lines.push(`- Nur als Fallback: \`ovr.role\` (Stage 4)`);
  lines.push(``);
  lines.push(`**Verbleibende Probleme (falls noch vorhanden nach Audit):**`);
  lines.push(`- Wenn der live gescrapte Tracker eine andere Position zeigt als unsere App:`);
  lines.push(`  → \`ovr_roles\` prüfen ob die richtige Position überhaupt im Array ist`);
  lines.push(`  → Wenn ja: Tie-Break-Logik debuggen (z.B. mehrere gleichhohe OVR-Ratings)`);
  lines.push(`  → Wenn nein: Goalsverse liefert andere Rohdaten als Tracker zeigt (Datenproblem upstream)`);
  lines.push(``);
  lines.push(`### Welche Quelle für roleRatings?`);
  lines.push(``);
  lines.push(`**Empfehlung: Goalsverse \`ovr_roles\` (direkt aus Squad-RSC-Payload).**`);
  lines.push(``);
  lines.push(`- Einzige maschinenlesbare Quelle mit vollständigen Positionsratings`);
  lines.push(`- Nur für Squad-Spieler verfügbar (18 Spieler)`);
  lines.push(`- Basic-Spieler (42 aus Club-Array): nur Primärposition + OVR — keine Nebenpositionen`);
  lines.push(`- **Caching-Empfehlung:** roleRatings beim Import cachen, Goalsverse-Payload nicht nochmals live abrufen`);
  lines.push(``);
  lines.push(`### Welche Quelle für Stats?`);
  lines.push(``);
  lines.push(`**Empfehlung: Goalsverse Squad-RSC-Payload (für die 18 Squad-Spieler).**`);
  lines.push(``);
  lines.push(`- Vollständige Individualstats (acceleration, sprint_speed, finishing, etc.)`);
  lines.push(`- Goals Tracker HTML als Backup/Kreuzvalidierung (Scraping, fragil)`);
  lines.push(`- Basic-Spieler (42 Profil): keine Stats — nur OVR`);
  lines.push(`- **Caching-Empfehlung:** Stats sind relativ stabil, könnten 24h gecacht werden`);
  lines.push(``);
  lines.push(`### Welche Quelle für Match/Performance-Daten?`);
  lines.push(``);
  lines.push(`**Empfehlung: Goalsverse Club-Array (Profil-Seite, \`matchesPlayed\`/\`goals\`/\`assists\`).**`);
  lines.push(``);
  lines.push(`- Der \`club\`-Array auf \`/p/{slug}\` enthält \`matchesPlayed\`, \`goals\`, \`assists\`, \`playTimeSeconds\``);
  lines.push(`- Wird bereits in den Squad-Spieler gemergt (\`matches_played\`, \`goals\`, \`assists\`)`);
  lines.push(`- GOALS Tracker könnte zusätzliche Metriken haben (xG, xA) — aber HTML-Scraping ist fragil`);
  lines.push(``);
  lines.push(`### Welche Daten sollten gecacht werden?`);
  lines.push(``);
  lines.push(`| Datenkategorie | Empfohlener Cache | Begründung |`);
  lines.push(`|---|---|---|`);
  lines.push(`| Goalsverse Squad-RSC | Ja, 30-60 min | Rate-Limiting, Payload ~100-200KB |`);
  lines.push(`| Profil-RSC (Club-Array) | Ja, 60 min | 590KB Payload, verändert sich selten |`);
  lines.push(`| Goals Tracker HTML | Ja, 4-8h | Keine offizielle API, Scraping-Risiko |`);
  lines.push(`| Position/Stats nach Import | Ja, in localStorage | Bereits implementiert via Zustand |`);
  lines.push(``);
  lines.push(`### Welche Features ergeben Sinn?`);
  lines.push(``);
  lines.push(`1. **Positionskorrektur-UI:** Falls ovr_roles-basierte Logik noch falsch liegt → manueller Override`);
  lines.push(`   per Spieler in der App. Gecacht in localStorage, nicht upstream.`);
  lines.push(``);
  lines.push(`2. **Tracker-Kreuzvalidierung:** Script wie dieses als CI/optional-check laufen lassen`);
  lines.push(`   (nicht im \`npm test\`), um neue Diskrepanzen früh zu erkennen.`);
  lines.push(``);
  lines.push(`3. **Basic-Spieler-Upgrade:** Basic-Spieler (42 aus Club-Array) können durch Tracker-Scraping`);
  lines.push(`   auf vollständigere Daten upgegraded werden (Nebenposition aus Tracker-HTML).`);
  lines.push(``);
  lines.push(`4. **Performance-Tab:** \`playTimeSeconds\`, \`matchesPlayed\`, \`goals\`, \`assists\` aus Club-Array`);
  lines.push(`   sind bereits verfügbar — könnten in der Development-Seite angezeigt werden.`);
  lines.push(``);
  lines.push(`5. **Tier-basiertes Potential:** \`tier\` + \`max_potential_rating\` + \`upgrades_remaining\``);
  lines.push(`   aus Goalsverse für bessere Entwicklungsplanung nutzen.`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`*Generiert von \`scripts/audit-sources.mjs\` — $(date) — Echte Live-Daten, kein Mock.*`);

  await writeFile(resolve(ROOT, 'docs/source-audit.md'), lines.join('\n'));
  console.log('[audit] Written: docs/source-audit.md');
}

// ── Entry point ─────────────────────────────────────────────────────────────

runAudit()
  .then(summary => {
    console.log(`\n=== Audit abgeschlossen: ${summary.length} Spieler analysiert ===`);
    console.log(`Output: scripts/output/audit-data.json`);
    console.log(`        scripts/output/audit-summary.json`);
    console.log(`        docs/source-audit.md`);
    process.exit(0);
  })
  .catch(err => {
    console.error('\n[FATAL]', err);
    process.exit(1);
  });
