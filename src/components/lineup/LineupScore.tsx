'use client';

import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';

interface LineupScoreProps {
  slots: LineupSlot[];
  lineup: Record<string, string | null>;
  players: PlayerWithScores[];
  slotKeyFor: (pos: Position, idx: number) => string;
}

export function LineupScore({ slots, lineup, players, slotKeyFor }: LineupScoreProps) {
  const filled = slots
    .map((slot, idx) => {
      const key = slotKeyFor(slot.position, idx);
      const pid = lineup[key];
      const player = pid ? players.find(p => p.id === pid) : null;
      return { slot, player };
    })
    .filter(({ player }) => player !== null);

  if (filled.length === 0) return null;

  const totalFit = filled.reduce((sum, { slot, player }) =>
    sum + (player!.fit_scores[slot.position] ?? 0), 0
  );
  const avgFit = totalFit / filled.length;
  const avgOvr = filled.reduce((s, { player }) => s + player!.overall, 0) / filled.length;

  const color = avgFit >= 85 ? 'text-emerald-400' : avgFit >= 70 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="flex gap-6 items-center justify-center py-3 border-b border-slate-800">
      <div className="text-center">
        <p className="text-xs text-slate-500 uppercase tracking-wide">Ø OVR</p>
        <p className="text-2xl font-bold text-white">{avgOvr.toFixed(1)}</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-slate-500 uppercase tracking-wide">Ø Meta</p>
        <p className={`text-2xl font-bold ${color}`}>{avgFit.toFixed(1)}</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-slate-500 uppercase tracking-wide">Besetzt</p>
        <p className="text-2xl font-bold text-white">{filled.length}/11</p>
      </div>
    </div>
  );
}
