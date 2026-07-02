/**
 * Recherche-Script: Testet verschiedene GOALS-Datenquellen
 * auf verfügbare API-Endpunkte und Datenstrukturen.
 *
 * Ausführen: node research/apis.js
 */

const https = require('https');
const http = require('http');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.request(url, {
      method: opts.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

function findJsonEndpoints(html, baseUrl) {
  // Suche nach URL-Patterns die wie APIs aussehen
  const patterns = [
    /["'](\/api\/[^"']+)["']/g,
    /["'](\/v\d+\/[^"']+)["']/g,
    /["'](\/graphql[^"']*)["']/g,
    /fetch\(["']([^"']+)["']/g,
    /axios\.[a-z]+\(["']([^"']+)["']/g,
  ];

  const found = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let url = match[1];
      if (url.startsWith('/')) url = baseUrl + url;
      found.add(url);
    }
  }

  // Suche nach _next/data oder __NEXT_DATA__
  const nextData = html.match(/__NEXT_DATA__\s*=\s*(\{.*?\});?<\/script>/s);
  if (nextData) {
    try {
      const parsed = JSON.parse(nextData[1]);
      found.add(`[NEXT_DATA] props: ${Object.keys(parsed.props || {}).join(', ')}`);
    } catch {}
  }

  return [...found];
}

function findApiHints(html) {
  const hints = [];
  if (html.includes('window.__DATA__')) hints.push('window.__DATA__');
  if (html.includes('window.__INITIAL_STATE__')) hints.push('window.__INITIAL_STATE__');
  if (html.includes('application/ld+json')) hints.push('JSON-LD schema');
  if (html.includes('_next/data')) hints.push('Next.js data fetching');
  if (html.includes('graphql')) hints.push('GraphQL references');
  if (html.includes('/api/')) hints.push('API routes referenced');
  return hints;
}

async function testSite(name, url, testPaths = []) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 TESTE: ${name}`);
  console.log(`   URL: ${url}`);
  console.log('='.repeat(60));

  try {
    const res = await fetch(url);
    console.log(`   Status: ${res.status}`);
    console.log(`   Content-Type: ${res.headers['content-type'] || 'unknown'}`);
    console.log(`   Body-Länge: ${res.body.length} chars`);

    const hints = findApiHints(res.body);
    if (hints.length) console.log(`   API-Hinweise: ${hints.join(', ')}`);

    const endpoints = findJsonEndpoints(res.body, url);
    if (endpoints.length) {
      console.log(`   Gefundene Endpunkte (${endpoints.length}):`);
      endpoints.forEach(e => console.log(`      → ${e}`));
    } else {
      console.log(`   Keine API-Endpunkte im HTML gefunden.`);
    }

    // Teste zusätzliche Pfade
    for (const path of testPaths) {
      const testUrl = path.startsWith('http') ? path : url + path;
      try {
        const testRes = await fetch(testUrl, { headers: { Accept: 'application/json' } });
        const isJson = testRes.headers['content-type']?.includes('json');
        console.log(`   Test ${path}: HTTP ${testRes.status}${isJson ? ' (JSON!)' : ''}`);
        if (isJson && testRes.body.length < 2000) {
          console.log(`      Body: ${testRes.body.slice(0, 300)}...`);
        }
      } catch (err) {
        console.log(`   Test ${path}: FEHLER - ${err.message}`);
      }
    }

  } catch (err) {
    console.log(`   FEHLER: ${err.message}`);
  }
}

(async () => {
  // 1. goalsverse.com
  await testSite('goalsverse.com (Hauptseite)', 'https://goalsverse.com', [
    '/api/v1/search?query=test',
    '/v1/meta',
    '/v1/clubs',
    '/api/v1/clubs',
  ]);

  // 2. playgoals.com
  await testSite('playgoals.com (Hauptseite)', 'https://playgoals.com', [
    '/en/stats-guide',
    '/en/player-attributes',
    '/api/',
  ]);

  // 3. goalsmeta.com
  await testSite('goalsmeta.com', 'https://goalsmeta.com', [
    '/api/',
    '/v1/',
  ]);

  // 4. goals-tracker.com
  await testSite('goals-tracker.com', 'https://goals-tracker.com', [
    '/api/',
    '/v1/',
  ]);

  console.log('\n' + '='.repeat(60));
  console.log('✅ RECHERCHE ABGESCHLOSSEN');
  console.log('='.repeat(60));
})();
