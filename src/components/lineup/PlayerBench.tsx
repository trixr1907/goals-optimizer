'use client';

import { useDraggable } from '@dnd-kit/core';
import { PlayerWithScores, Position } from '@/lib/scraper/types';

const RARITY_BADGE: Record<string, string> = {
  Basic: 'bg-slate-600',
  Uncommon: 'bg-green-700',
  Rare: 'bg-blue-700',
  Epic: 'bg-purple-700',
  Legendary: 'bg-amber-600',
  Mythic: 'bg-red-700',
  Iconic: 'bg-cyan-700',
};

function BenchPlayer({ player, targetPosition }: { player: PlayerWithScores; targetPosition?: Position }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `bench-${player.id}`,
    data: { playerId: player.id, fromBench: true },
  });

  const fitScore = targetPosition ? (player.fit_scores[targetPosition] ?? 0) : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 rounded-lg p-2 cursor-grab select-none transition-opacity ${
        isDragging ? 'opacity-30' : 'hover:bg-slate-800/60'
      }`}
    >
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${RARITY_BADGE[player.rarity] ?? 'bg-slate-600'} text-white`}>
        {player.overall}
      </span>
      <span className="text-sm text-white flex-1 truncate">{player.name}</span>
      <span className="text-xs text-slate-500">{player.position}</span>
      {fitScore !== null && (
        <span className={`text-xs font-mono font-bold ${
          fitScore >= 85 ? 'text-emerald-400' : fitScore >= 70 ? 'text-amber-400' : 'text-red-400'
        }`}>
          {fitScore.toFixed(0)}
        </span>
      )}
    </div>
  );
}

interface PlayerBenchProps {
  benchPlayers: PlayerWithScores[];
  hoveredPosition?: Position;
}

export function PlayerBench({ benchPlayers, hoveredPosition }: PlayerBenchProps) {
  const sorted = [...benchPlayers].sort((a, b) => {
    if (hoveredPosition) {
      return (b.fit_scores[hoveredPosition] ?? 0) - (a.fit_scores[hoveredPosition] ?? 0);
    }
    return b.overall - a.overall;
  });

  return (
    <div className="flex flex-col gap-0.5 max-h-[600px] overflow-y-auto pr-1">
      {sorted.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-4">Alle Spieler in Aufstellung</p>
      )}
      {sorted.map(p => (
        <BenchPlayer key={p.id} player={p} targetPosition={hoveredPosition} />
      ))}
    </div>
  );
}
