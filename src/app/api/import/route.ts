import { NextRequest, NextResponse } from 'next/server';
import { getClubRoster } from '@/lib/scraper/goalsverse-client';
import { enrichPlayerWithScores } from '@/lib/scoring/position-fit';
import { MOCK_PLAYERS } from '@/lib/scraper/mock-data';
import type { ApiResponse } from '@/lib/api-types';

/** Canonical error codes surfaced to the client. */
const ERROR_CODES = {
  club_not_found: 'club_not_found',
  goalsverse_timeout: 'goalsverse_timeout',
  rsc_payload_incomplete: 'rsc_payload_incomplete',
  no_players_found: 'no_players_found',
  network_error: 'network_error',
  invalid_club_name: 'invalid_club_name',
} as const;

function importErrorMessage(code?: string, fallback = 'Live-Import fehlgeschlagen.'): string {
  switch (code) {
    case ERROR_CODES.club_not_found: return 'Club nicht gefunden.';
    case ERROR_CODES.goalsverse_timeout: return 'Goalsverse hat nicht rechtzeitig geantwortet.';
    case ERROR_CODES.rsc_payload_incomplete: return 'Goalsverse-Daten unvollständig: RSC-Payload enthält keinen Kader.';
    case ERROR_CODES.no_players_found: return 'Keine Spieler im Goalsverse-Kader gefunden.';
    case ERROR_CODES.network_error: return 'Netzwerk- oder Goalsverse-API-Fehler.';
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

function fail(error: string, status: number, errorCode?: string) {
  return NextResponse.json(
    { success: false, error, errorCode } satisfies ApiResponse<never>,
    { status }
  );
}

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('Ungültiges JSON.', 400);
    }

    const clubName = typeof body === 'object' && body !== null && 'clubName' in body
      ? (body as { clubName?: unknown }).clubName
      : undefined;
    const normalizedClubName = String(clubName ?? '').trim();

    if (!normalizedClubName) {
      return fail('clubName fehlt', 400);
    }

    if (normalizedClubName.length < 2) {
      return fail('clubName ist zu kurz', 400, ERROR_CODES.invalid_club_name);
    }

    if (normalizedClubName.length > 100) {
      return fail('clubName ist zu lang', 400, ERROR_CODES.invalid_club_name);
    }

    if (!/^[\p{L}\p{N}\s'_.-]+$/u.test(normalizedClubName)) {
      return fail('clubName enthält ungültige Zeichen', 400, ERROR_CODES.invalid_club_name);
    }

    if (normalizedClubName.toLowerCase() === 'demo') {
      const enriched = MOCK_PLAYERS
        .map((player) => ({ ...player, dataQuality: 'full' as const, positionSource: 'heuristic' as const }))
        .map(enrichPlayerWithScores);
      return NextResponse.json({
        success: true,
        data: {
          players: enriched,
          count: enriched.length,
          source: 'demo' as const,
          clubName: 'Demo',
          diagnostics: summarizeImport(enriched),
        },
      } satisfies ApiResponse<unknown>);
    }

    const live = await getClubRoster(normalizedClubName);

    if (!live.players.length) {
      return NextResponse.json(
        {
          success: false,
          error: importErrorMessage(live.errorCode, live.reason),
          errorCode: live.errorCode ?? ERROR_CODES.no_players_found,
          data: {
            players: [],
            count: 0,
            source: 'goalsverse' as const,
            clubId: live.clubId,
            clubUrl: live.clubUrl,
            clubName: live.clubName,
          },
        } satisfies ApiResponse<unknown, unknown>,
        { status: 404 }
      );
    }

    const enriched = live.players.map(enrichPlayerWithScores);
    return NextResponse.json({
      success: true,
      data: {
        players: enriched,
        count: enriched.length,
        source: 'goalsverse' as const,
        clubId: live.clubId,
        clubUrl: live.clubUrl,
        clubName: live.clubName,
        diagnostics: summarizeImport(enriched),
      },
    } satisfies ApiResponse<unknown>);
  } catch (err) {
    return fail(String(err), 500);
  }
}
