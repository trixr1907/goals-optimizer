import { NextRequest, NextResponse } from 'next/server';
import { getClubRoster } from '@/lib/scraper/goalsverse-client';
import { enrichPlayerWithScores } from '@/lib/scoring/position-fit';
import { MOCK_PLAYERS } from '@/lib/scraper/mock-data';

function importErrorMessage(code?: string, fallback = 'Live-Import fehlgeschlagen.'): string {
  switch (code) {
    case 'club_not_found': return 'Club nicht gefunden.';
    case 'goalsverse_timeout': return 'Goalsverse hat nicht rechtzeitig geantwortet.';
    case 'rsc_payload_incomplete': return 'Goalsverse-Daten unvollständig: RSC-Payload enthält keinen Kader.';
    case 'no_players_found': return 'Keine Spieler im Goalsverse-Kader gefunden.';
    case 'network_error': return 'Netzwerk- oder Goalsverse-API-Fehler.';
    default: return fallback;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { clubName } = await req.json();
    const normalizedClubName = String(clubName ?? '').trim();

    if (!normalizedClubName) {
      return NextResponse.json({ error: 'clubName fehlt' }, { status: 400 });
    }

    if (normalizedClubName.toLowerCase() === 'demo') {
      const enriched = MOCK_PLAYERS
        .map((player) => ({ ...player, dataQuality: 'full' as const, positionSource: 'heuristic' as const }))
        .map(enrichPlayerWithScores);
      return NextResponse.json({
        players: enriched,
        count: enriched.length,
        source: 'demo',
        message: 'Demo-Kader geladen.',
      });
    }

    const live = await getClubRoster(normalizedClubName);

    if (!live.players.length) {
      return NextResponse.json(
        {
          players: [],
          count: 0,
          source: 'goalsverse',
          clubId: live.clubId,
          clubUrl: live.clubUrl,
          clubName: live.clubName,
          error: live.reason ?? 'Kein Live-Kader gefunden.',
          errorCode: live.errorCode ?? 'no_players_found',
          message: importErrorMessage(live.errorCode, live.reason),
        },
        { status: 404 }
      );
    }

    const enriched = live.players.map(enrichPlayerWithScores);
    return NextResponse.json({
      players: enriched,
      count: enriched.length,
      source: 'goalsverse',
      clubId: live.clubId,
      clubUrl: live.clubUrl,
      clubName: live.clubName,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), source: 'goalsverse' }, { status: 500 });
  }
}
