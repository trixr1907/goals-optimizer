'use client';

// Radar chart for a single player's positional stats.
// Uses Recharts — SSR-safe via dynamic import wrapper.

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { PlayerWithScores } from '@/lib/scraper/types';

const STAT_LABELS: Record<string, string> = {
  pac: 'Pace',
  sho: 'Shooting',
  pas: 'Passing',
  dri: 'Dribbling',
  def: 'Defending',
  phy: 'Physicality',
};

interface StatRadarChartProps {
  playerA: PlayerWithScores;
  playerB?: PlayerWithScores | null;
  size?: number;
}

export function StatRadarChart({ playerA, playerB, size = 260 }: StatRadarChartProps) {
  // Build unified stat key list from both players
  const keys = Object.keys(playerA.stats).filter((k) => k in STAT_LABELS);

  const data = keys.map((key) => ({
    stat: STAT_LABELS[key] ?? key,
    [playerA.name]: playerA.stats[key as keyof typeof playerA.stats] ?? 0,
    ...(playerB
      ? { [playerB.name]: playerB.stats[key as keyof typeof playerB.stats] ?? 0 }
      : {}),
  }));

  const colorA = '#10b981'; // emerald-500
  const colorB = '#f59e0b'; // amber-400

  return (
    <div style={{ width: '100%', height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis
            dataKey="stat"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
          />
          <Radar
            name={playerA.name}
            dataKey={playerA.name}
            stroke={colorA}
            fill={colorA}
            fillOpacity={0.25}
            dot={false}
          />
          {playerB && (
            <Radar
              name={playerB.name}
              dataKey={playerB.name}
              stroke={colorB}
              fill={colorB}
              fillOpacity={0.2}
              dot={false}
            />
          )}
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
