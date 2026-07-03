import { NextResponse } from 'next/server';
import { fetchGoalsverseLiveMeta } from '@/lib/meta/goalsverse-meta';
import formationsData from '@/config/formations.json';

export const revalidate = 60 * 30; // 30 min

export async function GET() {
  try {
    const live = await fetchGoalsverseLiveMeta();
    return NextResponse.json(live);
  } catch (error) {
    // Fallback only preserves known formation keys. It intentionally does not
    // invent winrates/usage values when goalsverse live meta is unavailable.
    const fallbackFormations = Object.keys(formationsData).map((key) => ({
      key,
      matches: 0,
      matchShare: 0,
      players: 0,
      playerShare: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: 0,
      avgGoalsFor: 0,
      avgGoalsAgainst: 0,
      avgGoalDiff: 0,
    }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source: 'fallback',
      error: String(error),
      formations: fallbackFormations,
    });
  }
}
