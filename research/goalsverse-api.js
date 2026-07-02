/**
 * Tiefe Analyse der goalsverse.com API-Endpunkte
 */

const https = require('https');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: opts.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': opts.accept || 'application/json,text/html;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de,en-US;q=0.9,en;q=0.8',
        ...opts.headers,
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: data,
        url,
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function prettyJson(str) {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str.slice(0, 500);
  }
}

async function testEndpoint(label, url, opts = {}) {
  console.log(`\n--- ${label} ---`);
  console.log(`URL: ${url}`);
  try {
    const res = await fetch(url, opts);
    const isJson = res.headers['content-type']?.includes('json');
    console.log(`Status: ${res.status} | Content-Type: ${res.headers['content-type'] || 'unknown'}`);
    console.log(`Body (${res.body.length} chars):`);
    if (isJson) {
      console.log(prettyJson(res.body).slice(0, 2000));
    } else {
      console.log(res.body.slice(0, 800).replace(/\s+/g, ' '));
    }
  } catch (err) {
    console.log(`FEHLER: ${err.message}`);
  }
}

(async () => {
  console.log('🔬 GOALSVERSE.COM API-ANALYSE');
  console.log('================================\n');

  // 1. Search API
  await testEndpoint('Search API (nach "test")', 'https://goalsverse.com/api/v1/search?query=test', { accept: 'application/json' });

  // 2. Clubs Liste
  await testEndpoint('Clubs Liste', 'https://goalsverse.com/api/v1/clubs', { accept: 'application/json' });

  // 3. Meta
  await testEndpoint('Meta (HTML)', 'https://goalsverse.com/v1/meta');
  await testEndpoint('Meta (JSON)', 'https://goalsverse.com/v1/meta', { accept: 'application/json' });

  // 4. Eine bekannte Club-UUID testen (aus dem vorherigen Scan)
  const knownClubId = '0affa4b3-925c-468d-9e8d-c68c8bf7b0d1';
  await testEndpoint(`Club Details (UUID: ${knownClubId})`, `https://goalsverse.com/v1/club/${knownClubId}`);
  await testEndpoint(`Club API (UUID: ${knownClubId})`, `https://goalsverse.com/api/v1/club/${knownClubId}`, { accept: 'application/json' });

  // 5. Eine bekannte Card testen
  const knownCardId = 'bab8bbed-a85c-4719-a62c-d59a0fb77b37';
  const knownCardSub = '974f5e48-d22c-5bb8-9b67-d3adcdabd031';
  await testEndpoint('Card Details', `https://goalsverse.com/v1/card/${knownCardId}/${knownCardSub}`);
  await testEndpoint('Card API', `https://goalsverse.com/api/v1/card/${knownCardId}/${knownCardSub}`, { accept: 'application/json' });

  // 6. Teste ob es einen "players" oder "roster" Endpunkt gibt
  await testEndpoint('Club Players (geraten)', `https://goalsverse.com/api/v1/club/${knownClubId}/players`, { accept: 'application/json' });
  await testEndpoint('Club Roster (geraten)', `https://goalsverse.com/api/v1/club/${knownClubId}/roster`, { accept: 'application/json' });
  await testEndpoint('Club Squad (geraten)', `https://goalsverse.com/api/v1/club/${knownClubId}/squad`, { accept: 'application/json' });
  await testEndpoint('Club Activity (geraten)', `https://goalsverse.com/api/v1/club/${knownClubId}/activity`, { accept: 'application/json' });

  console.log('\n✅ ANALYSE ABGESCHLOSSEN');
})();
