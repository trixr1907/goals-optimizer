/**
 * Versucht React Server Components (RSC) direkt von goalsverse.com abzurufen.
 * Next.js App Router liefert bei richtigem Accept-Header Flight-Payloads.
 */

const https = require('https');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': opts.accept || 'text/html,application/xhtml+xml',
        'Accept-Language': 'de,en-US;q=0.9,en;q=0.8',
        'RSC': '1',
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
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

const CLUB_ID = '0affa4b3-925c-468d-9e8d-c68c8bf7b0d1';

(async () => {
  // Test 1: RSC Header
  console.log('--- Test 1: RSC=1 Header ---');
  const r1 = await fetch(`https://goalsverse.com/v1/club/${CLUB_ID}`, {
    headers: { 'RSC': '1', 'Accept': 'text/x-component' }
  });
  console.log(`Status: ${r1.status}, Content-Type: ${r1.headers['content-type']}`);
  console.log(`Body length: ${r1.body.length}`);
  console.log(`First 800 chars:\n${r1.body.slice(0, 800)}`);

  // Test 2: Next.js Data URL
  console.log('\n--- Test 2: _next/data URL (Pages Router pattern) ---');
  const r2 = await fetch(`https://goalsverse.com/_next/data/xyz/v1/club/${CLUB_ID}.json`);
  console.log(`Status: ${r2.status}, Content-Type: ${r2.headers['content-type']}`);
  if (r2.status === 200) {
    console.log(`Body: ${r2.body.slice(0, 1000)}`);
  }

  // Test 3: OG Image API
  console.log('\n--- Test 3: OG Image API ---');
  const r3 = await fetch(`https://goalsverse.com/api/og/club?id=${CLUB_ID}`, {
    accept: 'application/json'
  });
  console.log(`Status: ${r3.status}, Content-Type: ${r3.headers['content-type']}`);
  console.log(`Body: ${r3.body.slice(0, 500)}`);

  // Test 4: Search for club by username to get exact userId
  console.log('\n--- Test 4: Search for "Turbulence" ---');
  const r4 = await fetch('https://goalsverse.com/api/v1/search?query=Turbulence', {
    accept: 'application/json'
  });
  console.log(`Status: ${r4.status}`);
  try {
    const data = JSON.parse(r4.body);
    if (data.users?.length) {
      const user = data.users[0];
      console.log('User found:', JSON.stringify(user, null, 2).slice(0, 1500));
    }
  } catch (e) {
    console.log('Parse error:', e.message);
  }

  // Test 5: Try to find any API endpoint that returns player data
  console.log('\n--- Test 5: Various API guesses ---');
  const guesses = [
    `/api/v1/user/${CLUB_ID}`,
    `/api/v1/users/${CLUB_ID}`,
    `/api/v1/club/${CLUB_ID}/stats`,
    `/api/v1/player/${CLUB_ID}`,
  ];
  for (const path of guesses) {
    const r = await fetch(`https://goalsverse.com${path}`, { accept: 'application/json' });
    console.log(`${path}: HTTP ${r.status}`);
  }

})();
