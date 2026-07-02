/**
 * Extrahiert den kompletten Squad aus dem RSC-Payload.
 */

const https = require('https');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/x-component',
        'RSC': '1',
        ...opts.headers,
      },
      timeout: 20000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

function extractSquadFromRsc(rscText) {
  // Finde den Squad-Bereich im Payload
  const squadMarker = '"squad":';
  const squadIdx = rscText.indexOf(squadMarker);
  if (squadIdx < 0) {
    return { error: 'Squad marker not found' };
  }

  // Extrahiere das JSON-Objekt nach "squad":
  let start = squadIdx + squadMarker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;

  for (let i = start; i < rscText.length; i++) {
    const ch = rscText[i];
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
        const jsonStr = rscText.slice(objStart, i + 1);
        try {
          return JSON.parse(jsonStr);
        } catch (e) {
          return { error: 'JSON parse failed', message: e.message, snippet: jsonStr.slice(0, 200) };
        }
      }
    }
  }

  return { error: 'Could not find complete squad object' };
}

function extractClubInfoFromRsc(rscText) {
  // Suche nach dem Club-Info-Bereich
  const match = rscText.match(/"data":\s*(\{[\s\S]*?"username"[\s\S]*?\}),\s*"children"/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {}
  }
  return null;
}

function mapPlayerFromGoalsverse(player) {
  const stats = player.stats || {};
  const s = stats;

  // Extrahiere Einzelstats
  const pace = s.pace || {};
  const passing = s.passing || {};
  const shooting = s.shooting || {};
  const defending = s.defending || {};
  const dribbling = s.dribbling || {};
  const physical = s.physical || {};
  const goalkeeping = s.goalkeeping || {};

  return {
    id: player.id,
    name: player.name || player.id?.slice(0, 8),
    position: mapRoleToPosition(player.ovr?.role),
    overall: player.ovr?.overall_rating || 0,
    rarity: mapTierToRarity(player.tier),
    age: player.age,
    height_cm: player.height,
    preferred_foot: player.foot === 0 ? 'right' : player.foot === 1 ? 'left' : undefined,
    training_value: player.potential?.training_value,
    stats: {
      // Pace
      pac: Math.round(pace.weighted_value || 50),
      acceleration: Math.round(pace.acceleration?.value || 50),
      sprint_speed: Math.round(pace.sprint_speed?.value || 50),

      // Shooting
      sho: Math.round(shooting.weighted_value || 50),
      finishing: Math.round(shooting.finishing?.value || 50),
      shot_power: Math.round(shooting.shot_power?.value || 50),
      long_shots: Math.round(shooting.long_shots?.value || 50),
      penalties: Math.round(shooting.penalties?.value || 50),
      weak_foot: Math.round(shooting.weak_foot?.value || 50),

      // Passing
      pas: Math.round(passing.weighted_value || 50),
      ground_pass: Math.round(passing.ground_pass?.value || 50),
      lofted_pass: Math.round(passing.lofted_pass?.value || 50),
      through_pass: Math.round(passing.through_pass?.value || 50),
      crossing: Math.round(passing.crossing?.value || 50),
      curve: Math.round(passing.curve?.value || 50),
      free_kick_accuracy: Math.round(passing.free_kicks?.value || 50),

      // Dribbling
      dri: Math.round(dribbling.weighted_value || 50),
      sprint_dribbling: Math.round(dribbling.sprint_dribbling?.value || 50),
      close_dribbling: Math.round(dribbling.close_dribbling?.value || 50),
      skills: Math.round(dribbling.skills?.value || 50),
      agility: Math.round(dribbling.agility?.value || 50),
      balance: Math.round(dribbling.balance?.value || 50),
      first_touch: Math.round(dribbling.first_touch?.value || 50),

      // Defending
      def: Math.round(defending.weighted_value || 50),
      defensive_iq: Math.round(defending.defensive_iq?.value || 50),
      stand_tackle: Math.round(defending.stand_tackle?.value || 50),
      slide_tackle: Math.round(defending.slide_tackle?.value || 50),
      jockeying: Math.round(defending.jockeying?.value || 50),
      interceptions: Math.round(defending.interceptions?.value || 50),
      blocking: Math.round(defending.blocking?.value || 50),

      // Physical
      phy: Math.round(physical.weighted_value || 50),
      strength: Math.round(physical.strength?.value || 50),
      aggression: Math.round(physical.aggression?.value || 50),
      stamina: Math.round(physical.stamina?.value || 50),
      heading: Math.round(physical.heading?.value || 50),
      jumping: Math.round(physical.jumping?.value || 50),

      // Goalkeeping
      div: Math.round(goalkeeping.diving?.value || 0),
      kic: Math.round(goalkeeping.kicking?.value || 0),
      reflexes: Math.round(goalkeeping.reflexes?.value || 0),
      positioning: Math.round(goalkeeping.positioning?.value || 0),
      catching: Math.round(goalkeeping.catching?.value || 0),
      parrying: Math.round(goalkeeping.parrying?.value || 0),
    }
  };
}

// GOALS role IDs zu Positionen
const ROLE_MAP = {
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

function mapRoleToPosition(roleId) {
  return ROLE_MAP[roleId] || 'CM';
}

function mapTierToRarity(tier) {
  const map = {
    0: 'Basic',
    1: 'Uncommon',
    2: 'Rare',
    3: 'Epic',
    4: 'Legendary',
    5: 'Mythic',
    6: 'Iconic',
  };
  return map[tier] || 'Basic';
}

(async () => {
  const CLUB_ID = '0affa4b3-925c-468d-9e8d-c68c8bf7b0d1';
  console.log('🔬 EXTRAKTION DES SQUADS AUS RSC-PAYLOAD\n');

  const res = await fetch(`https://goalsverse.com/v1/club/${CLUB_ID}`);
  console.log(`RSC-Payload geladen: ${res.body.length} chars\n`);

  const squad = extractSquadFromRsc(res.body);

  if (squad.error) {
    console.log('Fehler:', squad.error, squad.message || '');
    return;
  }

  console.log('Squad-Struktur gefunden!');
  console.log('Keys:', Object.keys(squad).join(', '));
  console.log('Formation ID:', squad.formation);
  console.log('Starting Eleven count:', squad.startingEleven?.length);
  console.log('Bench count:', squad.bench?.length);

  // Extrahiere und zeige die ersten 3 Spieler
  const allPlayers = [...(squad.startingEleven || []), ...(squad.bench || [])];
  console.log(`\nGesamtspieler: ${allPlayers.length}\n`);

  console.log('--- Erster Spieler (vollständig) ---');
  if (allPlayers[0]) {
    const mapped = mapPlayerFromGoalsverse(allPlayers[0]);
    console.log(JSON.stringify(mapped, null, 2));
  }

  console.log('\n--- Zweiter Spieler (kompakt) ---');
  if (allPlayers[1]) {
    const p = allPlayers[1];
    console.log(`Name: ${p.name || '?'}`);
    console.log(`Position: ${mapRoleToPosition(p.ovr?.role)}`);
    console.log(`OVR: ${p.ovr?.overall_rating}`);
    console.log(`Tier: ${mapTierToRarity(p.tier)}`);
    console.log(`Stats keys: ${Object.keys(p.stats || {}).join(', ')}`);
  }

  // Zeige alle Spieler als Liste
  console.log('\n--- Alle Spieler ---');
  allPlayers.forEach((p, i) => {
    const pos = mapRoleToPosition(p.ovr?.role);
    const ovr = p.ovr?.overall_rating || '?';
    const rarity = mapTierToRarity(p.tier);
    const name = p.name || `Player ${i+1}`;
    console.log(`${i+1}. ${name} | ${pos} | OVR ${ovr} | ${rarity}`);
  });

})();
