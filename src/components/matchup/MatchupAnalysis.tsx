'use client';

import { PlayerWithScores, Position, ALL_POSITIONS } from '@/lib/scraper/types';
import { analyzeMatchup, MatchupInsight } from '@/lib/analysis/matchup-analysis';

interface Props {
  myPlayers: PlayerWithScores[];
  opponentPlayers: PlayerWithScores[];
  myClubName?: string;
  opponentClubName?: string;
}

// ── Position comparison helpers ───────────────────────────────────────────────

function avgFitScore(players: PlayerWithScores[], pos: Position): number {
  const scores = players
    .map((p) => p.fit_scores[pos])
    .filter((s): s is number => typeof s === 'number' && s > 0);
  if (!scores.length) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

interface PositionAdvantage {
  position: Position;
  myAvg: number;
  oppAvg: number;
  advantage: 'mine' | 'opponent' | 'even';
  diff: number;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: MatchupInsight }) {
  const color =
    insight.severity === 'high'
      ? 'border-red-900/60 bg-red-950/20 text-red-400'
      : insight.severity === 'medium'
      ? 'border-amber-900/50 bg-amber-950/20 text-amber-400'
      : 'border-slate-700 bg-slate-950/30 text-slate-400';

  return (
    <div className={`rounded-lg border p-3 ${color.split(' ').slice(0, 2).join(' ')}`}>
      <p className={`text-xs font-semibold mb-0.5 ${color.split(' ')[2]}`}>{insight.label}</p>
      <p className="text-[11px] text-slate-400 leading-relaxed">{insight.detail}</p>
    </div>
  );
}

function StrengthCard({ insight }: { insight: MatchupInsight }) {
  const color =
    insight.severity === 'high'
      ? 'border-emerald-900/60 bg-emerald-950/20 text-emerald-400'
      : 'border-emerald-900/40 bg-emerald-950/10 text-emerald-500';

  return (
    <div className={`rounded-lg border p-3 ${color.split(' ').slice(0, 2).join(' ')}`}>
      <p className={`text-xs font-semibold mb-0.5 ${color.split(' ')[2]}`}>{insight.label}</p>
      <p className="text-[11px] text-slate-400 leading-relaxed">{insight.detail}</p>
    </div>
  );
}

function SectionHeading({ children, color = 'text-slate-500' }: { children: React.ReactNode; color?: string }) {
  return (
    <p className={`text-[10px] uppercase tracking-widest font-semibold mb-2 ${color}`}>
      {children}
    </p>
  );
}

function VerdictBadge({ verdict }: { verdict: 'favorable' | 'neutral' | 'difficult' }) {
  if (verdict === 'favorable') {
    return (
      <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-2 py-0.5 rounded-full">
        Günstiges Duell
      </span>
    );
  }
  if (verdict === 'difficult') {
    return (
      <span className="text-[11px] font-semibold text-red-400 bg-red-950/40 border border-red-900/50 px-2 py-0.5 rounded-full">
        Schwieriges Duell
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
      Ausgeglichenes Duell
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MatchupAnalysis({ myPlayers, opponentPlayers, myClubName, opponentClubName }: Props) {

  // ── Position comparison (keep the existing detail grid) ──────────────────
  const advantages: PositionAdvantage[] = ALL_POSITIONS
    .map((pos) => {
      const myAvg = avgFitScore(myPlayers, pos);
      const oppAvg = avgFitScore(opponentPlayers, pos);
      const diff = Math.abs(myAvg - oppAvg);
      let advantage: PositionAdvantage['advantage'] = 'even';
      if (diff >= 3) advantage = myAvg > oppAvg ? 'mine' : 'opponent';
      return { position: pos, myAvg, oppAvg, advantage, diff };
    })
    .filter((a) => a.myAvg > 0 || a.oppAvg > 0);

  const myWins = advantages.filter((a) => a.advantage === 'mine');
  const oppWins = advantages.filter((a) => a.advantage === 'opponent');
  const even = advantages.filter((a) => a.advantage === 'even');

  const myAvgMeta = myPlayers.length
    ? Math.round(myPlayers.reduce((s, p) => s + (p.fit_scores[p.position] ?? 0), 0) / myPlayers.length)
    : 0;
  const oppAvgMeta = opponentPlayers.length
    ? Math.round(opponentPlayers.reduce((s, p) => s + (p.fit_scores[p.position] ?? 0), 0) / opponentPlayers.length)
    : 0;

  const myStrengthPositions = [...myWins].sort((a, b) => b.diff - a.diff).slice(0, 4);
  const oppStrengthPositions = [...oppWins].sort((a, b) => b.diff - a.diff).slice(0, 4);

  // ── Tactical analysis ────────────────────────────────────────────────────
  const analysis = analyzeMatchup(myPlayers, opponentPlayers);

  return (
    <div className="space-y-4">

      {/* ── Card 1: Gegner-Zusammenfassung ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">

        {/* Gesamt-Score */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className={`rounded-lg border p-3 ${myAvgMeta > oppAvgMeta ? 'border-emerald-900/60 bg-emerald-950/20' : 'border-slate-800 bg-slate-950/30'}`}>
            <p className="text-[10px] text-slate-500 uppercase mb-1">{myClubName || 'Mein Team'}</p>
            <p className={`text-2xl font-bold font-mono ${myAvgMeta > oppAvgMeta ? 'text-emerald-400' : 'text-slate-300'}`}>{myAvgMeta}</p>
            <p className="text-[10px] text-slate-600">Ø Meta</p>
          </div>
          <div className="rounded-lg border border-slate-800 p-3 flex flex-col items-center justify-center gap-1.5">
            <p className="text-[10px] text-slate-600">Vorteile</p>
            <p className="text-sm font-mono">
              <span className="text-emerald-400">{myWins.length}</span>
              <span className="text-slate-700 mx-1">|</span>
              <span className="text-slate-500">{even.length}</span>
              <span className="text-slate-700 mx-1">|</span>
              <span className="text-amber-400">{oppWins.length}</span>
            </p>
            <VerdictBadge verdict={analysis.verdict} />
          </div>
          <div className={`rounded-lg border p-3 ${oppAvgMeta > myAvgMeta ? 'border-amber-900/60 bg-amber-950/20' : 'border-slate-800 bg-slate-950/30'}`}>
            <p className="text-[10px] text-slate-500 uppercase mb-1">{opponentClubName || 'Gegner'}</p>
            <p className={`text-2xl font-bold font-mono ${oppAvgMeta > myAvgMeta ? 'text-amber-400' : 'text-slate-300'}`}>{oppAvgMeta}</p>
            <p className="text-[10px] text-slate-600">Ø Meta</p>
          </div>
        </div>

        {/* Positions-Stärken links/rechts */}
        {(myStrengthPositions.length > 0 || oppStrengthPositions.length > 0) && (
          <div className="grid grid-cols-2 gap-3">
            {myStrengthPositions.length > 0 && (
              <div>
                <SectionHeading color="text-emerald-500">Deine Stärken</SectionHeading>
                <div className="space-y-1">
                  {myStrengthPositions.map((a) => (
                    <div key={a.position} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-white w-6">{a.position}</span>
                      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, (a.diff / 20) * 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-emerald-500 font-mono">+{a.diff}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {oppStrengthPositions.length > 0 && (
              <div>
                <SectionHeading color="text-amber-500">Gegner-Stärken</SectionHeading>
                <div className="space-y-1">
                  {oppStrengthPositions.map((a) => (
                    <div key={a.position} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-white w-6">{a.position}</span>
                      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-600 rounded-full" style={{ width: `${Math.min(100, (a.diff / 20) * 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-amber-500 font-mono">+{a.diff}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Card 2: Linienvergleich ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <SectionHeading>Linienvergleich</SectionHeading>
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

      {/* ── Card 3: Risiken & Chancen ── */}
      {(analysis.risks.length > 0 || analysis.strengths.length > 0) && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
          {analysis.risks.length > 0 && (
            <div>
              <SectionHeading color="text-red-500">Risiken</SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {analysis.risks.map((insight, i) => (
                  <InsightCard key={i} insight={insight} />
                ))}
              </div>
            </div>
          )}
          {analysis.strengths.length > 0 && (
            <div>
              <SectionHeading color="text-emerald-500">Chancen</SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {analysis.strengths.map((insight, i) => (
                  <StrengthCard key={i} insight={insight} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Card 4: Empfehlungen ── */}
      {(analysis.recommendations.length > 0 || analysis.suggestedTacticalAdjustments.length > 0) && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
          {analysis.recommendations.length > 0 && (
            <div>
              <SectionHeading color="text-sky-500">Empfehlungen</SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {analysis.recommendations.map((insight, i) => (
                  <div key={i} className="rounded-lg border border-sky-900/40 bg-sky-950/20 p-3">
                    <p className="text-xs font-semibold text-sky-400 mb-0.5">{insight.label}</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{insight.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {analysis.suggestedTacticalAdjustments.length > 0 && (
            <div>
              <SectionHeading color="text-violet-500">Taktische Stellschrauben</SectionHeading>
              <ul className="space-y-1.5">
                {analysis.suggestedTacticalAdjustments.map((adj, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-slate-300">
                    <span className="mt-0.5 text-violet-500 shrink-0">›</span>
                    <span>{adj}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
