/**
 * Tiefere Analyse des RSC-Payloads: Namen und echte Stats finden.
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

(async () => {
  const CLUB_ID = '0affa4b3-925c-468d-9e8d-c68c8bf7b0d1';
  const res = await fetch(`https://goalsverse.com/v1/club/${CLUB_ID}`);
  const text = res.body;

  // 1. Suche nach "name" im Kontext von Spielern
  console.log('--- Suche nach "name" in der Nähe von player IDs ---');
  const playerId = '46ea6bec-c4bb-5f08-8825-4e010fb5d425';
  const idIdx = text.indexOf(playerId);
  if (idIdx >= 0) {
    console.log(`Kontext um ID (±300 chars):`);
    console.log(text.slice(Math.max(0, idIdx - 300), idIdx + 300));
  }

  // 2. Suche nach "firstName" oder "lastName"
  console.log('\n--- Suche nach firstName/lastName ---');
  const nameMatches = text.match(/"(firstName|lastName|displayName|playerName)":"([^"]+)"/g);
  if (nameMatches) {
    console.log(`Gefunden: ${nameMatches.length} Namen`);
    nameMatches.slice(0, 20).forEach(m => console.log('  ' + m));
  } else {
    console.log('Keine firstName/lastName gefunden');
  }

  // 3. Suche nach "fullName"
  console.log('\n--- Suche nach fullName ---');
  const fullNameMatches = text.match(/"fullName":"([^"]+)"/g);
  if (fullNameMatches) {
    fullNameMatches.slice(0, 20).forEach(m => console.log('  ' + m));
  }

  // 4. Suche nach bekannten GOALS-Spielernamen (Muster: Große Buchstaben)
  console.log('\n--- Suche nach möglichen Spielernamen (Pattern) ---');
  const namePattern = /"([A-Z][a-z]+\s[A-Z][a-z]+)"/g;
  const possibleNames = new Set();
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    possibleNames.add(match[1]);
  }
  console.log(`Mögliche Namen (${possibleNames.size}):`);
  [...possibleNames].slice(0, 30).forEach(n => console.log('  ' + n));

  // 5. Prüfe ob Stats wirklich alle gleich sind
  console.log('\n--- Stats-Analyse für Spieler 1 ---');
  const player1Start = text.indexOf('"46ea6bec-c4bb-5f08-8825-4e010fb5d425"');
  if (player1Start >= 0) {
    const snippet = text.slice(player1Start, player1Start + 2000);
    // Suche nach value-Paaren
    const valueMatches = snippet.match(/"value":(\d+)/g);
    if (valueMatches) {
      console.log('Gefundene value-Werte:', valueMatches.slice(0, 20).join(', '));
    }
  }

  // 6. Suche nach "weighted_value" Unterschieden
  console.log('\n--- Suche nach weighted_value Variationen ---');
  const weightedMatches = text.match(/"weighted_value":(\d+)/g);
  if (weightedMatches) {
    const values = weightedMatches.map(m => parseInt(m.match(/\d+/)[0]));
    const unique = [...new Set(values)].sort((a, b) => a - b);
    console.log('Einzigartige weighted_values:', unique.join(', '));
    console.log('Anzahl:', values.length);
  }

  // 7. Versuche, den kompletten Squad-Bereich als Roh-Text zu speichern
  console.log('\n--- Squad-Bereich (erste 3000 chars nach "squad":) ---');
  const squadIdx = text.indexOf('"squad":');
  if (squadIdx >= 0) {
    console.log(text.slice(squadIdx, squadIdx + 3000));
  }

})();
