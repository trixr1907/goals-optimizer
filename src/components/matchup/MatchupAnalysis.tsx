'use client';

import { PlayerWithScores, Position, ALL_POSITIONS } from '@/lib/scraper/types';

interface Props {
  myPlayers: PlayerWithScores[];
  opponentPlayers: PlayerWithScores[];
  myClubName?: string;
  opponentClubName?: string;
}

function avgFitScore(players: PlayerWithScores[], pos: Position): number {
  const scores = players
    .map((p) => p.fit_scores[pos])
    .filter((s): s is number => typeof s === 'number' && s > 0);
  if (!scores.length) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function topPlayersByPosition(players: PlayerWithScores[], pos: Position, n: number): PlayerWithScores[] {
  return [...players]
    .filter((p) => (p.fit_scores[pos] ?? 0) > 0)
    .sort((a, b) => (b.fit_scores[pos] ?? 0) - (a.fit_scores[pos] ?? 0))
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

export function MatchupAnalysis({ myPlayers, opponentPlayers, myClubName, opponentClubName }: Props) {
  // Only compare positions where at least one team has players
  const advantages: PositionAdvantage[] = ALL_POSITIONS
    .map((pos) => {
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
    })
    .filter((a) => a.myAvg > 0 || a.oppAvg > 0); // hide positions with no players on either side

  const myWins = advantages.filter((a) => a.advantage === 'mine');
  const oppWins = advantages.filter((a) => a.advantage === 'opponent');
  const even = advantages.filter((a) => a.advantage === 'even');

  // Ø Meta across all positions
  const myAvgMeta = myPlayers.length
    ? Math.round(myPlayers.reduce((s, p) => s + (p.fit_scores[p.position] ?? 0), 0) / myPlayers.length)
    : 0;
  const oppAvgMeta = opponentPlayers.length
    ? Math.round(opponentPlayers.reduce((s, p) => s + (p.fit_scores[p.position] ?? 0), 0) / opponentPlayers.length)
    : 0;

  // Top strengths (positions with biggest advantage)
  const myStrengths = [...myWins].sort((a, b) => b.diff - a.diff).slice(0, 4);
  const oppStrengths = [...oppWins].sort((a, b) => b.diff - a.diff).slice(0, 4);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-5">

      {/* ── Gesamt-Score ── */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className={`rounded-lg border p-3 ${myAvgMeta > oppAvgMeta ? 'border-emerald-900/60 bg-emerald-950/20' : 'border-slate-800 bg-slate-950/30'}`}>
          <p className="text-[10px] text-slate-500 uppercase mb-1">{myClubName || 'Mein Team'}</p>
          <p className={`text-2xl font-bold font-mono ${myAvgMeta > oppAvgMeta ? 'text-emerald-400' : 'text-slate-300'}`}>{myAvgMeta}</p>
          <p className="text-[10px] text-slate-600">Ø Meta</p>
        </div>
        <div className="rounded-lg border border-slate-800 p-3 flex flex-col items-center justify-center">
          <p className="text-[10px] text-slate-600 mb-1">Vorteile</p>
          <p className="text-sm font-mono">
            <span className="text-emerald-400">{myWins.length}</span>
            <span className="text-slate-700 mx-1">|</span>
            <span className="text-slate-500">{even.length}</span>
            <span className="text-slate-700 mx-1">|</span>
            <span className="text-amber-400">{oppWins.length}</span>
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${oppAvgMeta > myAvgMeta ? 'border-amber-900/60 bg-amber-950/20' : 'border-slate-800 bg-slate-950/30'}`}>
          <p className="text-[10px] text-slate-500 uppercase mb-1">{opponentClubName || 'Gegner'}</p>
          <p className={`text-2xl font-bold font-mono ${oppAvgMeta > myAvgMeta ? 'text-amber-400' : 'text-slate-300'}`}>{oppAvgMeta}</p>
          <p className="text-[10px] text-slate-600">Ø Meta</p>
        </div>
      </div>

      {/* ── Stärken-Zusammenfassung ── */}
      {(myStrengths.length > 0 || oppStrengths.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {myStrengths.length > 0 && (
            <div>
              <p className="text-[10px] text-emerald-500 uppercase tracking-wide font-semibold mb-1.5">
                Deine Stärken
              </p>
              <div className="space-y-1">
                {myStrengths.map((a) => (
                  <div key={a.position} className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-white w-6">{a.position}</span>
                    <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full"
                        style={{ width: `${Math.min(100, (a.diff / 20) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-emerald-500 font-mono">+{a.diff}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {oppStrengths.length > 0 && (
            <div>
              <p className="text-[10px] text-amber-500 uppercase tracking-wide font-semibold mb-1.5">
                Gegner-Stärken
              </p>
              <div className="space-y-1">
                {oppStrengths.map((a) => (
                  <div key={a.position} className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-white w-6">{a.position}</span>
                    <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-600 rounded-full"
                        style={{ width: `${Math.min(100, (a.diff / 20) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-amber-500 font-mono">+{a.diff}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Position für Position ── */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Positions-Vergleich</p>
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
                <span className={`text-xs font-mono ${adv.advantage === 'mine' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
                  {adv.myAvg}
                </span>
                <span className="text-[10px] text-slate-600">vs</span>
                <span className={`text-xs font-mono ${adv.advantage === 'opponent' ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                  {adv.oppAvg}
                </span>
              </div>
              {adv.diff >= 5 && (
                <p className={`text-[9px] mt-0.5 ${adv.advantage === 'mine' ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {adv.advantage === 'mine' ? '▲' : '▼'} {adv.diff}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Top 3 Vergleich für Schlüsselpositionen ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(['ST', 'CM', 'CB', 'GK'] as Position[]).map((pos) => {
          const adv = advantages.find((a) => a.position === pos);
          if (!adv || (adv.myTop.length === 0 && adv.oppTop.length === 0)) return null;
          return (
            <div key={pos} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className={`text-[10px] uppercase mb-2 font-semibold ${
                adv.advantage === 'mine' ? 'text-emerald-500'
                : adv.advantage === 'opponent' ? 'text-amber-500'
                : 'text-slate-500'
              }`}>
                {pos} — Top 3{adv.diff >= 3 ? ` (${adv.advantage === 'mine' ? '▲' : adv.advantage === 'opponent' ? '▼' : '≈'} ${adv.diff})` : ''}
              </p>
              <div className="flex gap-4 text-[10px]">
                <div className="flex-1 space-y-0.5">
                  <p className="text-emerald-400 font-medium mb-1">{myClubName || 'Mein Team'}</p>
                  {adv.myTop.map((p) => (
                    <p key={p.id} className="text-slate-400 flex justify-between gap-1">
                      <span className="truncate">{p.name}</span>
                      <span className="text-emerald-400 font-mono shrink-0">{p.fit_scores[pos]}</span>
                    </p>
                  ))}
                  {adv.myTop.length === 0 && <p className="text-slate-700">—</p>}
                </div>
                <div className="w-px bg-slate-800" />
                <div className="flex-1 space-y-0.5">
                  <p className="text-amber-400 font-medium mb-1">{opponentClubName || 'Gegner'}</p>
                  {adv.oppTop.map((p) => (
                    <p key={p.id} className="text-slate-400 flex justify-between gap-1">
                      <span className="truncate">{p.name}</span>
                      <span className="text-amber-400 font-mono shrink-0">{p.fit_scores[pos]}</span>
                    </p>
                  ))}
                  {adv.oppTop.length === 0 && <p className="text-slate-700">—</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
