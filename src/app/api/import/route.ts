import { NextRequest, NextResponse } from 'next/server';
import { getClubRoster } from '@/lib/scraper/goalsverse-client';
import { enrichPlayerWithScores } from '@/lib/scoring/position-fit';
import { MOCK_PLAYERS } from '@/lib/scraper/mock-data';

export async function POST(req: NextRequest) {
  try {
    const { clubName } = await req.json();
    const normalizedClubName = String(clubName ?? '').trim();

    if (!normalizedClubName) {
      return NextResponse.json({ error: 'clubName fehlt' }, { status: 400 });
    }

    if (normalizedClubName.toLowerCase() === 'demo') {
      const enriched = MOCK_PLAYERS.map(enrichPlayerWithScores);
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
          clubUrl: live.clubUrl,
          clubName: live.clubName,
          error: live.reason ?? 'Kein Live-Kader gefunden.',
        },
        { status: 404 }
      );
    }

    const enriched = live.players.map(enrichPlayerWithScores);
    return NextResponse.json({
      players: enriched,
      count: enriched.length,
      source: 'goalsverse',
      clubUrl: live.clubUrl,
      clubName: live.clubName,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), source: 'goalsverse' }, { status: 500 });
  }
}
