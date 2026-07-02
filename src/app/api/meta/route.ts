import { NextResponse } from 'next/server';
import { fetchGoalsverseLiveMeta } from '@/lib/meta/goalsverse-meta';
import formationsData from '@/config/formations.json';

type StaticFormationMeta = {
  usage_rate?: number;
  winrate_current_patch?: number;
};

export const revalidate = 60 * 30; // 30 min

export async function GET() {
  try {
    const live = await fetchGoalsverseLiveMeta();
    return NextResponse.json(live);
  } catch (error) {
    // Fallback to bundled static meta so the UI never hard-fails.
    const fallbackFormations = Object.entries(formationsData as Record<string, StaticFormationMeta>).map(([key, value]) => ({
      key,
      matches: 0,
      matchShare: (value.usage_rate ?? 0) / 100,
      players: 0,
      playerShare: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: (value.winrate_current_patch ?? 50) / 100,
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
