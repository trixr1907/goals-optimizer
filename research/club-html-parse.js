/**
 * Extrahiert Daten aus der goalsverse.com Club-HTML-Seite
 * durch Suche nach __NEXT_DATA__, Flight-Payloads, etc.
 */

const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

(async () => {
  const clubUrl = 'https://goalsverse.com/v1/club/0affa4b3-925c-468d-9e8d-c68c8bf7b0d1';
  console.log(`Lade Club-Seite: ${clubUrl}\n`);

  const res = await fetch(clubUrl);
  const html = res.body;

  // 1. Suche nach __NEXT_DATA__
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (nextDataMatch) {
    console.log('✅ __NEXT_DATA__ gefunden!');
    try {
      const data = JSON.parse(nextDataMatch[1]);
      console.log('Keys:', Object.keys(data).join(', '));
      if (data.props) console.log('Props keys:', Object.keys(data.props).join(', '));
      if (data.props?.pageProps) console.log('pageProps keys:', Object.keys(data.props.pageProps).join(', '));

      // Speichere relevante Daten
      const relevant = data.props?.pageProps || data.props;
      console.log('\n--- Relevante Daten (erste 3000 chars) ---');
      console.log(JSON.stringify(relevant, null, 2).slice(0, 3000));
    } catch (e) {
      console.log('Fehler beim Parsen:', e.message);
    }
  } else {
    console.log('❌ Kein __NEXT_DATA__ gefunden');
  }

  // 2. Suche nach Flight-Payloads (self.__next_f)
  const flightMatches = html.match(/self\.__next_f\.push\(\[\d+,.*?\]\)/gs);
  if (flightMatches) {
    console.log(`\n✅ ${flightMatches.length} Flight-Payloads gefunden`);
    // Extrahiere den ersten interessanten Payload
    for (let i = 0; i < Math.min(flightMatches.length, 5); i++) {
      const payload = flightMatches[i];
      if (payload.includes('player') || payload.includes('squad') || payload.includes('card')) {
        console.log(`\n--- Flight Payload ${i} (erste 500 chars) ---`);
        console.log(payload.slice(0, 500));
      }
    }
  } else {
    console.log('\n❌ Keine Flight-Payloads gefunden');
  }

  // 3. Suche nach JSON-LD
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  if (jsonLdMatch) {
    console.log('\n✅ JSON-LD gefunden:');
    console.log(jsonLdMatch[1].slice(0, 500));
  }

  // 4. Suche nach "squad", "player", "card" im HTML
  console.log('\n--- HTML-Snippets mit "squad" ---');
  const squadMatches = html.match(/squad.{0,200}/gi);
  if (squadMatches) {
    squadMatches.slice(0, 5).forEach((m, i) => console.log(`${i}: ${m.replace(/\s+/g, ' ').slice(0, 200)}`));
  }

  console.log('\n--- HTML-Snippets mit "player_card" ---');
  const cardMatches = html.match(/player_card.{0,200}/gi);
  if (cardMatches) {
    cardMatches.slice(0, 5).forEach((m, i) => console.log(`${i}: ${m.replace(/\s+/g, ' ').slice(0, 200)}`));
  }

})();
