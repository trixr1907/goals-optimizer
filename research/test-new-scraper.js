/**
 * Testet den neuen goalsverse-client.ts direkt (transpiliert für Node.js)
 */

const https = require('https');

const GOALSVERSE_BASE = 'https://goalsverse.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; GOALS Squad Optimizer/1.0)';

const ROLE_MAP = {
  0: 'GK', 1: 'CB', 2: 'CB', 3: 'LB', 4: 'RB',
  5: 'LWB', 6: 'RWB', 7: 'CDM', 8: 'CM', 9: 'CM',
  10: 'CAM', 11: 'LM', 12: 'RM', 13: 'LW', 14: 'RW',
  15: 'CF', 16: 'ST',
};

const TIER_TO_RARITY = {
  0: 'Basic', 1: 'Uncommon', 2: 'Rare', 3: 'Epic',
  4: 'Legendary', 5: 'Mythic', 6: 'Iconic',
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); }
    ).on('error', reject);
  });
}

function fetchRsc(path) {
  const url = path.startsWith('http') ? path : `${GOALSVERSE_BASE}${path}`;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/x-component', RSC: '1' } },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }
    ).on('error', reject);
  });
}

function extractJsonObject(text, startIndex) {
  let depth = 0, inString = false, escaped = false, objStart = -1;
  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"' && !inString) { inString = true; continue; }
    if (ch === '"' && inString) { inString = false; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}' || ch === ']') { depth--; if (depth === 0 && objStart >= 0) { try { return JSON.parse(text.slice(objStart, i + 1)); } catch { return null; } } }
  }
  return null;
}

function extractSquadFromRsc(rscText) {
  const squadIdx = rscText.indexOf('"squad":');
  const squad = squadIdx >= 0 ? extractJsonObject(rscText, squadIdx + 7) : null;
  const dataIdx = rscText.indexOf('"data":');
  const clubInfo = dataIdx >= 0 ? extractJsonObject(rscText, dataIdx + 6) : null;
  return { squad, clubInfo };
}

function extractStat(stats, path) {
  let current = stats;
  for (const key of path) {
    if (current && typeof current === 'object') current = current[key];
    else return 50;
  }
  return typeof current === 'number' ? Math.round(current) : 50;
}

function mapPlayer(raw) {
  const stats = raw.stats || {};
  const name = `${raw.first_name || ''} ${raw.last_name || ''}`.trim() || raw.id?.slice(0, 8);
  const role = raw.ovr?.role ?? 8;
  const overall = raw.ovr?.overall_rating ?? 50;

  return {
    id: `gv-${raw.id}`,
    name,
    position: ROLE_MAP[role] || 'CM',
    overall,
    rarity: TIER_TO_RARITY[raw.tier] || 'Basic',
    age: raw.current_age,
    height_cm: raw.height,
    preferred_foot: raw.strong_foot === 1 ? 'left' : raw.strong_foot === 2 ? 'right' : undefined,
    stats: {
      pac: extractStat(stats, ['pace', 'weighted_value']),
      acceleration: extractStat(stats, ['pace', 'acceleration', 'value']),
      sprint_speed: extractStat(stats, ['pace', 'sprint_speed', 'value']),
      sho: extractStat(stats, ['shooting', 'weighted_value']),
      finishing: extractStat(stats, ['shooting', 'finishing', 'value']),
      shot_power: extractStat(stats, ['shooting', 'shot_power', 'value']),
      long_shots: extractStat(stats, ['shooting', 'long_shots', 'value']),
      penalties: extractStat(stats, ['shooting', 'penalties', 'value']),
      weak_foot: extractStat(stats, ['shooting', 'weak_foot', 'value']),
      attacking_iq: extractStat(stats, ['shooting', 'attacking_iq', 'value']),
      pas: extractStat(stats, ['passing', 'weighted_value']),
      ground_pass: extractStat(stats, ['passing', 'ground_pass', 'value']),
      lofted_pass: extractStat(stats, ['passing', 'lofted_pass', 'value']),
      through_pass: extractStat(stats, ['passing', 'through_pass', 'value']),
      crossing: extractStat(stats, ['passing', 'crossing', 'value']),
      curve: extractStat(stats, ['passing', 'curve', 'value']),
      free_kick_accuracy: extractStat(stats, ['passing', 'free_kicks', 'value']),
      dri: extractStat(stats, ['dribbling', 'weighted_value']),
      sprint_dribbling: extractStat(stats, ['dribbling', 'sprint_dribbling', 'value']),
      close_dribbling: extractStat(stats, ['dribbling', 'close_dribbling', 'value']),
      skills: extractStat(stats, ['dribbling', 'skills', 'value']),
      agility: extractStat(stats, ['dribbling', 'agility', 'value']),
      balance: extractStat(stats, ['dribbling', 'balance', 'value']),
      first_touch: extractStat(stats, ['dribbling', 'first_touch', 'value']),
      def: extractStat(stats, ['defending', 'weighted_value']),
      defensive_iq: extractStat(stats, ['defending', 'defensive_iq', 'value']),
      stand_tackle: extractStat(stats, ['defending', 'stand_tackle', 'value']),
      slide_tackle: extractStat(stats, ['defending', 'slide_tackle', 'value']),
      jockeying: extractStat(stats, ['defending', 'jockeying', 'value']),
      interceptions: extractStat(stats, ['defending', 'interceptions', 'value']),
      blocking: extractStat(stats, ['defending', 'blocking', 'value']),
      phy: extractStat(stats, ['physicality', 'weighted_value']),
      strength: extractStat(stats, ['physicality', 'strength', 'value']),
      aggression: extractStat(stats, ['physicality', 'aggression', 'value']),
      stamina: extractStat(stats, ['physicality', 'stamina', 'value']),
      heading: extractStat(stats, ['physicality', 'heading', 'value']),
      jumping: extractStat(stats, ['physicality', 'jumping', 'value']),
      div: extractStat(stats, ['goalkeeping', 'diving', 'weighted_value']),
      kic: extractStat(stats, ['goalkeeping', 'distribution', 'weighted_value']),
      reflexes: extractStat(stats, ['goalkeeping', 'reflexes', 'weighted_value']),
      positioning: extractStat(stats, ['goalkeeping', 'awareness', 'positioning', 'value']),
      catching: extractStat(stats, ['goalkeeping', 'handling', 'catching', 'value']),
      parrying: extractStat(stats, ['goalkeeping', 'handling', 'parrying', 'value']),
    }
  };
}

(async () => {
  const clubName = 'Turbulence';
  console.log(`🔬 TEST: Importiere Club "${clubName}"\n`);

  // 1. Resolve Club ID
  const searchData = await fetchJson(`${GOALSVERSE_BASE}/api/v1/search?query=${encodeURIComponent(clubName)}`);
  const user = searchData.users?.[0];
  if (!user) { console.log('Club nicht gefunden'); return; }
  console.log(`Gefunden: ${user.username} (${user.userId})\n`);

  // 2. Fetch RSC
  const rscText = await fetchRsc(`/v1/club/${user.userId}`);
  console.log(`RSC-Payload: ${rscText.length} chars\n`);

  // 3. Extract squad
  const { squad, clubInfo } = extractSquadFromRsc(rscText);
  if (!squad) { console.log('Kein Squad gefunden'); return; }

  console.log('Squad Keys:', Object.keys(squad).join(', '));
  console.log('Formation ID:', squad.formation);
  console.log('Starting Eleven:', squad.startingEleven?.length);
  console.log('Bench:', squad.bench?.length);
  console.log('Club:', clubInfo?.username || clubName);

  // 4. Map players
  const allRaw = [...(squad.startingEleven || []), ...(squad.bench || [])];
  const players = allRaw.map(mapPlayer);

  console.log(`\n--- ${players.length} Spieler extrahiert ---\n`);

  players.forEach((p, i) => {
    console.log(`${String(i+1).padStart(2)}. ${p.name.padEnd(20)} | ${p.position.padEnd(3)} | OVR ${String(p.overall).padStart(2)} | ${p.rarity.padEnd(9)} | ` +
      `P${p.stats.pac} S${p.stats.sho} A${p.stats.pas} D${p.stats.dri} V${p.stats.def} K${p.stats.phy}`);
  });

  // 5. Zeige einen Spieler mit allen Stats
  console.log('\n--- Detaillierte Stats: Spieler 1 ---');
  console.log(JSON.stringify(players[0], null, 2));

})();
