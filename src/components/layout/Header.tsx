'use client';

import { useSquadStore } from '@/lib/store/squad-store';

export function Header() {
  const players = useSquadStore((s) => s.players);
  const clubName = useSquadStore((s) => s.clubName);

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900/80 px-6 backdrop-blur">
      <div>
        <h1 className="text-sm font-semibold text-white">
          {clubName ? `${clubName}` : 'GOALS Squad Optimizer'}
        </h1>
      </div>
      <div className="flex items-center gap-4">
        {players.length > 0 && (
          <span className="text-xs text-slate-400">
            {players.length} Spieler importiert
          </span>
        )}
      </div>
    </header>
  );
}
