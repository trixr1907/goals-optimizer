'use client';

import { PlayerWithScores, Position, ALL_POSITIONS } from '@/lib/scraper/types';

interface Props {
  myPlayers: PlayerWithScores[];
  opponentPlayers: PlayerWithScores[];
}

function avgFitScore(players: PlayerWithScores[], pos: Position): number {
  const scores = players.map((p) => p.fit_scores[pos]).filter((s) => s > 0);
  if (!scores.length) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function topPlayersByPosition(players: PlayerWithScores[], pos: Position, n: number): PlayerWithScores[] {
  return [...players]
    .filter((p) => p.fit_scores[pos] > 0)
    .sort((a, b) => b.fit_scores[pos] - a.fit_scores[pos])
    .slice(0, n);
}

interface PositionAdvantage {
  position: Position;
  myAvg: number;
  oppAvg: number;
  advantage: 'mine' | 'opponent' | 'even';
  diff: number;
  myTop: PlayerWithScores[];
  oppTop: PlayerWithScores[];
}

export function MatchupAnalysis({ myPlayers, opponentPlayers }: Props) {
  const advantages: PositionAdvantage[] = ALL_POSITIONS.map((pos) => {
    const myAvg = avgFitScore(myPlayers, pos);
    const oppAvg = avgFitScore(opponentPlayers, pos);
    const diff = Math.abs(myAvg - oppAvg);
    let advantage: PositionAdvantage['advantage'] = 'even';
    if (diff >= 3) {
      advantage = myAvg > oppAvg ? 'mine' : 'opponent';
    }
    return {
      position: pos,
      myAvg,
      oppAvg,
      advantage,
      diff,
      myTop: topPlayersByPosition(myPlayers, pos, 3),
      oppTop: topPlayersByPosition(opponentPlayers, pos, 3),
    };
  });

  const myWins = advantages.filter((a) => a.advantage === 'mine').length;
  const oppWins = advantages.filter((a) => a.advantage === 'opponent').length;
  const even = advantages.filter((a) => a.advantage === 'even').length;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Positions-Analyse</h3>
        <div className="flex gap-3 text-[10px]">
          <span className="text-emerald-400">{myWins}× Vorteil</span>
          <span className="text-slate-500">{even}× ausgeglichen</span>
          <span className="text-amber-400">{oppWins}× Gegner-Vorteil</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {advantages.map((adv) => (
          <div
            key={adv.position}
            className={`rounded-lg border p-2 text-center ${
              adv.advantage === 'mine'
                ? 'border-emerald-900/60 bg-emerald-950/20'
                : adv.advantage === 'opponent'
                ? 'border-amber-900/60 bg-amber-950/20'
                : 'border-slate-800 bg-slate-950/30'
            }`}
          >
            <p className="text-xs font-medium text-white">{adv.position}</p>
            <div className="flex justify-center gap-2 mt-1">
              <span className={`text-xs font-mono ${adv.advantage === 'mine' ? 'text-emerald-400' : 'text-slate-400'}`}>
                {adv.myAvg}
              </span>
              <span className="text-[10px] text-slate-600">vs</span>
              <span className={`text-xs font-mono ${adv.advantage === 'opponent' ? 'text-amber-400' : 'text-slate-400'}`}>
                {adv.oppAvg}
              </span>
            </div>
            {adv.diff >= 3 && (
              <p className={`text-[10px] mt-0.5 ${adv.advantage === 'mine' ? 'text-emerald-500' : 'text-amber-500'}`}>
                {adv.advantage === 'mine' ? 'Dein Vorteil' : 'Gegner-Vorteil'}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Top players comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['ST', 'CM', 'CB', 'GK'] as Position[]).map((pos) => {
          const myTop = advantages.find((a) => a.position === pos);
          if (!myTop) return null;
          return (
            <div key={pos} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-[10px] text-slate-500 uppercase mb-2">{pos} — Top 3 Vergleich</p>
              <div className="flex gap-4 text-[10px]">
                <div className="flex-1 space-y-0.5">
                  <p className="text-emerald-400 font-medium">Mein Team</p>
                  {myTop.myTop.map((p) => (
                    <p key={p.id} className="text-slate-400 flex justify-between">
                      <span className="truncate mr-1">{p.name}</span>
                      <span className="text-emerald-400">{p.fit_scores[pos]}</span>
                    </p>
                  ))}
                  {myTop.myTop.length === 0 && <p className="text-slate-600">-</p>}
                </div>
                <div className="flex-1 space-y-0.5">
                  <p className="text-amber-400 font-medium">Gegner</p>
                  {myTop.oppTop.map((p) => (
                    <p key={p.id} className="text-slate-400 flex justify-between">
                      <span className="truncate mr-1">{p.name}</span>
                      <span className="text-amber-400">{p.fit_scores[pos]}</span>
                    </p>
                  ))}
                  {myTop.oppTop.length === 0 && <p className="text-slate-600">-</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
