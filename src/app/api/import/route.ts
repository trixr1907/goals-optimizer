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

function summarizeImport(players: ReturnType<typeof enrichPlayerWithScores>[]) {
  const diagnostics = {
    full: 0,
    basic: 0,
    warnings: 0,
    positionSources: {} as Record<string, number>,
    roleRatingSources: {} as Record<string, number>,
  };

  for (const player of players) {
    if (player.dataQuality === 'full') diagnostics.full += 1;
    else diagnostics.basic += 1;

    const positionSource = player.positionSource ?? 'unknown';
    const roleRatingsSource = player.roleRatingsSource ?? 'unknown';
    diagnostics.positionSources[positionSource] = (diagnostics.positionSources[positionSource] ?? 0) + 1;
    diagnostics.roleRatingSources[roleRatingsSource] = (diagnostics.roleRatingSources[roleRatingsSource] ?? 0) + 1;
    diagnostics.warnings += player.sourceWarnings?.length ?? 0;
  }

  return diagnostics;
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
        diagnostics: summarizeImport(enriched),
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
      diagnostics: summarizeImport(enriched),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), source: 'goalsverse' }, { status: 500 });
  }
}
