/**
 * Parst den Next.js RSC Flight-Payload und extrahiert Spielerdaten.
 */

const https = require('https');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': opts.accept || 'text/html',
        'RSC': '1',
        ...opts.headers,
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function extractDataFromRsc(rscText) {
  const lines = rscText.split('\n').filter(l => l.trim());
  const results = {
    players: [],
    squadInfo: null,
    clubInfo: null,
    rawJsonChunks: [],
  };

  // Suche nach JSON-ähnlichen Strukturen in den Zeilen
  for (const line of lines) {
    // Versuche, den Inhalt nach der ersten Zahl: zu parsen
    const contentMatch = line.match(/^\d+:(.*)$/);
    if (!contentMatch) continue;
    const content = contentMatch[1];

    // Suche nach JSON-Objekten/Arrays
    const jsonCandidates = [];

    // Muster: {...} oder [...]
    let depth = 0;
    let inString = false;
    let escaped = false;
    let startIdx = -1;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"' && !inString) { inString = true; continue; }
      if (ch === '"' && inString) { inString = false; continue; }
      if (inString) continue;

      if (ch === '{' || ch === '[') {
        if (depth === 0) startIdx = i;
        depth++;
      } else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0 && startIdx >= 0) {
          jsonCandidates.push(content.slice(startIdx, i + 1));
          startIdx = -1;
        }
      }
    }

    for (const candidate of jsonCandidates) {
      const parsed = tryParseJson(candidate);
      if (!parsed) continue;

      // Prüfe ob es Spielerdaten enthält
      const str = JSON.stringify(parsed);
      if (str.includes('position') && str.includes('overall') && str.includes('stats')) {
        results.rawJsonChunks.push(parsed);
      }
      if (str.includes('squad') && str.includes('formation')) {
        results.squadInfo = parsed;
      }
      if (str.includes('username') && str.includes('skill_rating')) {
        results.clubInfo = parsed;
      }
    }
  }

  return results;
}

(async () => {
  const CLUB_ID = '0affa4b3-925c-468d-9e8d-c68c8bf7b0d1';
  console.log('Lade RSC-Payload...\n');

  const res = await fetch(`https://goalsverse.com/v1/club/${CLUB_ID}`, {
    headers: { 'Accept': 'text/x-component', 'RSC': '1' }
  });

  console.log(`Status: ${res.status}, Länge: ${res.body.length}\n`);

  // Suche nach relevanten Keywords im Payload
  const keywords = ['"position"', '"overall"', '"stats"', '"squad"', '"formation"', '"player"', '"card"', '"rarity"'];
  for (const kw of keywords) {
    const count = (res.body.match(new RegExp(kw, 'g')) || []).length;
    console.log(`Vorkommen von ${kw}: ${count}`);
  }

  console.log('\n--- Extrahiere Daten ---');
  const extracted = extractDataFromRsc(res.body);

  console.log(`Gefundene JSON-Chunks mit Spielerdaten: ${extracted.rawJsonChunks.length}`);
  console.log(`Squad-Info: ${extracted.squadInfo ? 'JA' : 'NEIN'}`);
  console.log(`Club-Info: ${extracted.clubInfo ? 'JA' : 'NEIN'}`);

  if (extracted.rawJsonChunks.length > 0) {
    console.log('\n--- Erster Chunk (erste 2000 chars) ---');
    console.log(JSON.stringify(extracted.rawJsonChunks[0], null, 2).slice(0, 2000));
  }

  if (extracted.rawJsonChunks.length > 1) {
    console.log('\n--- Zweiter Chunk (erste 2000 chars) ---');
    console.log(JSON.stringify(extracted.rawJsonChunks[1], null, 2).slice(0, 2000));
  }

  // Versuche eine andere Herangehensweise: suche nach "squad" im Payload
  console.log('\n--- Suche nach "squad" Kontext ---');
  const squadIdx = res.body.indexOf('"squad"');
  if (squadIdx >= 0) {
    console.log(res.body.slice(Math.max(0, squadIdx - 200), squadIdx + 800));
  }

})();
