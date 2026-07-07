/**
 * /api/debug-payload — Sprint B: einmaliger Raw-Payload-Inspector
 *
 * Holt den echten Goalsverse-RSC-Payload für einen Club und gibt die
 * relevanten Dev-Felder der ersten 5 Squad-Spieler zurück.
 *
 * WICHTIG: Dieser Endpoint ist nur für lokale Analyse gedacht.
 * Er loggt keine Secrets und zeigt nur Dev-Felder, keine Stats.
 *
 * Nutzung: GET /api/debug-payload?club=txr'
 */

import { NextRequest, NextResponse } from 'next/server';

// Wir rufen die internen Funktionen direkt auf — daher den Client importieren
// und den Raw-RSC-Text selbst parsen.

const GOALSVERSE_BASE = 'https://goalsverse.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; GOALS Squad Optimizer/1.0; SprintB-Debug)';

async function fetchRscRaw(path: string): Promise<string> {
  const url = `${GOALSVERSE_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'text/x-component',
      'User-Agent': USER_AGENT,
      'Next-Router-State-Tree': '%5B%22%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D',
      'Rsc': '1',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

// Minimal RSC JSON-Extraktor — sucht nach dem Squad-Objekt
function extractPlayersFromRsc(rscText: string): unknown[] {
  const chunks = rscText.split(/\n/);
  for (const chunk of chunks) {
    const colon = chunk.indexOf(':');
    if (colon < 0) continue;
    const json = chunk.slice(colon + 1).trim();
    if (!json.startsWith('{') && !json.startsWith('[')) continue;
    try {
      const parsed = JSON.parse(json);
      // Look for startingEleven (the squad endpoint)
      if (parsed?.startingEleven && Array.isArray(parsed.startingEleven)) {
        return [...(parsed.startingEleven as unknown[]), ...(parsed.bench ?? []) as unknown[]];
      }
    } catch { /* skip */ }
  }
  return [];
}

function resolveClubId(rscText: string): string | null {
  const chunks = rscText.split(/\n/);
  for (const chunk of chunks) {
    const colon = chunk.indexOf(':');
    if (colon < 0) continue;
    const json = chunk.slice(colon + 1).trim();
    if (!json.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      // Club search response has items[].id or club.id
      if (Array.isArray(parsed.items)) {
        const first = (parsed.items as Record<string, unknown>[])[0];
        if (first?.id) return String(first.id);
      }
    } catch { /* skip */ }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const clubName = req.nextUrl.searchParams.get('club') ?? "txr'";

  try {
    // Step 1: resolve club ID via search (matches goalsverse-client.ts logic)
    const searchRes = await fetch(
      `${GOALSVERSE_BASE}/api/v1/search?query=${encodeURIComponent(clubName.trim())}`,
      { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000) }
    );
    const searchData = await searchRes.json() as { users?: Array<{ userId?: string; username?: string; displayName?: string }> };
    const users = searchData.users ?? [];
    const hit = users.find(u => u.userId) ?? null;
    const clubId = hit?.userId ?? null;

    if (!clubId) {
      return NextResponse.json({ error: 'Club nicht gefunden', clubName, searchHits: users.slice(0, 3) }, { status: 404 });
    }

    // Step 2: fetch squad RSC
    const squadRsc = await fetchRscRaw(`/v1/club/${clubId}`);
    const rawPlayers = extractPlayersFromRsc(squadRsc);

    if (rawPlayers.length === 0) {
      return NextResponse.json({
        error: 'Keine Spieler im RSC-Payload gefunden',
        clubId,
        rscPreview: squadRsc.slice(0, 500),
      }, { status: 404 });
    }

    // Step 3: für jeden der ersten 5 Spieler die Dev-Felder extrahieren
    const devFieldAudit = (rawPlayers as Record<string, unknown>[]).slice(0, 8).map((raw) => {
      const potential = raw.potential;
      return {
        name: raw.name ?? raw.firstName ?? raw.id,
        overall: raw.overall,
        // Bekannter Pfad
        'current_age':              raw.current_age,
        'max_potential_rating':     raw.max_potential_rating,
        'upgrades_remaining':       raw.upgrades_remaining,
        'current_xp':               raw.current_xp,
        // Das kritische Feld
        'potential (ganzes Obj)':   potential,
        'potential.training_value': typeof potential === 'object' && potential !== null
          ? (potential as Record<string, unknown>).training_value
          : '(potential is null/undefined)',
        // Alternativpfade
        'top-level training_value': raw.training_value,
        'bolt':                     raw.bolt,
        'lightning':                raw.lightning,
        'trainingValue (camel)':    raw.trainingValue,
        // Alle top-level keys für vollständigen Überblick
        '_all_keys': Object.keys(raw).filter(k => !['stats', 'ovr_roles'].includes(k)),
      };
    });

    // Aggregat: wie viele haben non-null potential?
    const withPotential = (rawPlayers as Record<string, unknown>[]).filter(
      r => r.potential != null
    ).length;
    const withTrainingValue = (rawPlayers as Record<string, unknown>[]).filter(
      r => typeof r.potential === 'object' && r.potential !== null &&
           typeof (r.potential as Record<string, unknown>).training_value === 'number'
    ).length;

    return NextResponse.json({
      clubId,
      clubName,
      totalRawPlayers: rawPlayers.length,
      aggregate: {
        withPotentialObject: withPotential,
        withTrainingValueInPotential: withTrainingValue,
        withCurrentAge: (rawPlayers as Record<string, unknown>[]).filter(r => typeof r.current_age === 'number').length,
        withXpCurrent:  (rawPlayers as Record<string, unknown>[]).filter(r => typeof r.current_xp === 'number').length,
      },
      sample: devFieldAudit,
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
