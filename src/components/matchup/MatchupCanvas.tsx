'use client';

import { PlayerWithScores, Position, ALL_POSITIONS } from '@/lib/scraper/types';

interface Props {
  myPlayers: PlayerWithScores[];
  opponentPlayers: PlayerWithScores[];
  myClubName: string;
  opponentClubName: string;
}

function bestPlayerForPosition(players: PlayerWithScores[], pos: Position): PlayerWithScores | undefined {
  const candidates = players.filter((p) => p.fit_scores[pos] > 0);
  if (!candidates.length) return undefined;
  return candidates.reduce((best, p) => (p.fit_scores[pos] > best.fit_scores[pos] ? p : best));
}

const FORMATION_POSITIONS: Position[][] = [
  ['GK'],
  ['FB', 'CB', 'CB', 'FB'],
  ['DM', 'CM'],
  ['WF', 'AM', 'WF'],
  ['ST'],
];

export function MatchupCanvas({ myPlayers, opponentPlayers, myClubName, opponentClubName }: Props) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-white">
        {myClubName || 'Mein Team'} vs {opponentClubName || 'Gegner'}
      </h3>

      <div className="space-y-2">
        {FORMATION_POSITIONS.map((row, rowIdx) => (
          <div key={rowIdx} className="flex justify-center gap-3 flex-wrap">
            {row.map((pos) => {
              const myBest = bestPlayerForPosition(myPlayers, pos);
              const oppBest = bestPlayerForPosition(opponentPlayers, pos);
              const myScore = myBest?.fit_scores[pos] ?? 0;
              const oppScore = oppBest?.fit_scores[pos] ?? 0;

              return (
                <div
                  key={pos}
                  className="flex flex-col items-center gap-1 min-w-[120px] rounded-lg border border-slate-800 bg-slate-950/70 p-2"
                >
                  <p className="text-[10px] text-slate-500">{pos}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-400 font-medium text-right w-8">
                      {myScore}
                    </span>
                    <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-600 rounded-l"
                        style={{ width: `${Math.max(0, Math.min(100, (myScore / (myScore + oppScore || 1)) * 100))}%` }}
                      />
                      <div
                        className="h-full bg-amber-600 rounded-r"
                        style={{ width: `${Math.max(0, Math.min(100, (oppScore / (myScore + oppScore || 1)) * 100))}%` }}
                      />
                    </div>
                    <span className="text-xs text-amber-400 font-medium text-left w-8">
                      {oppScore}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 truncate max-w-[110px] text-center">
                    {myBest?.name ?? '-'} / {oppBest?.name ?? '-'}
                  </p>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
