'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { apiPath, appPath } from '@/lib/app-url';
import { useSquadStore } from '@/lib/store/squad-store';
import { recommendationToLineup, recommendFormations } from '@/lib/optimizer/formation-optimizer';
import { useLineupStore } from '@/lib/store/lineup-store';
import { useRouter } from 'next/navigation';
import type { LiveMetaSnapshot } from '@/lib/meta/goalsverse-meta';

function scoreColor(value: number) {
  if (value >= 78) return 'text-emerald-300 bg-emerald-950/40 border-emerald-900';
  if (value >= 68) return 'text-amber-300 bg-amber-950/40 border-amber-900';
  return 'text-red-300 bg-red-950/40 border-red-900';
}

function findLive(live: LiveMetaSnapshot | null, key: string) {
  return live?.formations.find((f) => f.key.toLowerCase() === key.toLowerCase()) ?? null;
}

export default function MetaPage() {
  const router = useRouter();
  const { players, _hasHydrated } = useSquadStore();
  const { setFormation, autoFill } = useLineupStore();
  const [liveMeta, setLiveMeta] = useState<LiveMetaSnapshot | null>(null);
  const [metaStatus, setMetaStatus] = useState<'loading' | 'ok' | 'fallback' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetch(apiPath('/api/meta'))
      .then((res) => res.json())
      .then((data: LiveMetaSnapshot) => {
        if (cancelled) return;
        setLiveMeta(data);
        setMetaStatus(data.source === 'goalsverse' ? 'ok' : 'fallback');
      })
      .catch(() => !cancelled && setMetaStatus('error'));
    return () => { cancelled = true; };
  }, []);

  const recommendations = useMemo(() => {
    const base = recommendFormations(players);
    if (!liveMeta) return base;
    return base
      .map((rec) => {
        const live = findLive(liveMeta, rec.formation.name) ?? findLive(liveMeta, rec.formationKey);
        if (!live) return rec;
        const liveWinrate = live.winRate * 100;
        const liveUsage = live.matchShare * 100;
        const metaScore = liveWinrate * 0.65 + liveUsage * 0.35;
        const squadMatch = Math.max(0, Math.min(100, rec.averageFit * 0.9 + metaScore * 0.1));
        return {
          ...rec,
          metaScore,
          squadMatch,
          formation: {
            ...rec.formation,
            winrate_current_patch: liveWinrate,
            usage_rate: liveUsage,
          },
          reasons: [
            `${squadMatch.toFixed(0)}% Kader-Meta mit Live-Meta von goalsverse (${live.matches} Matches).`,
            ...rec.reasons.slice(1),
          ],
        };
      })
      .sort((a, b) => b.squadMatch - a.squadMatch);
  }, [players, liveMeta]);

  const best = recommendations[0];

  function applyRecommendation(index: number) {
    const rec = recommendations[index];
    if (!rec) return;
    setFormation(rec.formation.name, rec.formation.slots);
    setTimeout(() => {
      autoFill(recommendationToLineup(rec));
      router.push('/lineup');
    }, 0);
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        {!_hasHydrated || players.length < 11 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
            <p className="text-slate-400">Lade mindestens 11 Spieler, damit der Formation-Optimizer sinnvoll rechnen kann.</p>
            <a href={appPath('/')} className="text-sm text-emerald-400 underline">Zum Import</a>
          </div>
        ) : (
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Meta Center</h2>
                <p className="mt-1 text-sm text-slate-500">Formation-Ranking aus Kader-Meta, Live-Meta-Winrate und Risiko-Warnungen.</p>
                <p className="mt-2 text-xs text-slate-600">
                  Meta-Daten: {metaStatus === 'ok' ? `Live von goalsverse · Patch ${liveMeta?.patch ?? '?'} · ${liveMeta?.matches ?? '?'} Matches` : metaStatus === 'fallback' ? 'Fallback aus lokaler Config' : metaStatus === 'loading' ? 'Lade goalsverse…' : 'Live-Meta nicht erreichbar'}
                </p>
              </div>
              {best && (
                <div className={`rounded-xl border px-4 py-3 text-right ${scoreColor(best.squadMatch)}`}>
                  <p className="text-xs opacity-80">Beste Empfehlung</p>
                  <p className="text-xl font-bold">{best.formation.name} · {best.squadMatch.toFixed(0)}%</p>
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {recommendations.slice(0, 3).map((rec, index) => {
                const live = findLive(liveMeta, rec.formation.name) ?? findLive(liveMeta, rec.formationKey);
                return (
                  <section key={rec.formationKey} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Top {index + 1}</p>
                        <h3 className="text-xl font-bold text-white">{rec.formation.name}</h3>
                        <p className="text-xs text-slate-500">{rec.formation.playstyle} · {rec.formation.skill_cohort}</p>
                      </div>
                      <div className={`rounded-xl border px-3 py-2 text-center ${scoreColor(rec.squadMatch)}`}>
                        <p className="text-lg font-bold">{rec.squadMatch.toFixed(0)}%</p>
                        <p className="text-[10px] opacity-80">Kader-Meta</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg bg-slate-950/60 p-2"><p className="text-slate-500">Ø Meta</p><p className="font-mono text-white">{rec.averageFit.toFixed(1)}</p></div>
                      <div className="rounded-lg bg-slate-950/60 p-2"><p className="text-slate-500">Winrate</p><p className="font-mono text-white">{rec.formation.winrate_current_patch?.toFixed(1) ?? '-'}%</p></div>
                      <div className="rounded-lg bg-slate-950/60 p-2"><p className="text-slate-500">Usage</p><p className="font-mono text-white">{rec.formation.usage_rate?.toFixed(1) ?? '-'}%</p></div>
                    </div>

                    {live && (
                      <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                        <span className="rounded bg-slate-950/50 px-2 py-1">{live.matches} Matches</span>
                        <span className="rounded bg-slate-950/50 px-2 py-1">{live.wins}W / {live.losses}L</span>
                        <span className="rounded bg-slate-950/50 px-2 py-1">GD {live.avgGoalDiff.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      {rec.reasons.slice(0, 3).map((reason) => <p key={reason} className="text-sm text-slate-300">• {reason}</p>)}
                    </div>

                    <div>
                      <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Startelf</p>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        {rec.assignments.map((item) => (
                          <div key={item.slotKey} className="flex items-center justify-between rounded bg-slate-950/50 px-2 py-1">
                            <span className="text-slate-400">{item.slot.position}</span>
                            <span className="truncate px-2 text-slate-200">{item.player.name}</span>
                            <span className={item.fit >= 70 ? 'text-emerald-400' : 'text-amber-400'}>{item.fit.toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {rec.warnings.length > 0 && (
                      <div className="rounded-xl border border-amber-900/70 bg-amber-950/30 p-3 text-xs text-amber-200 space-y-1">
                        {rec.warnings.slice(0, 2).map((warning) => <p key={warning}>⚠️ {warning}</p>)}
                      </div>
                    )}

                    <button onClick={() => applyRecommendation(index)} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500">
                      Diese Formation anwenden
                    </button>
                  </section>
                );
              })}
            </div>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="text-lg font-bold text-white">Alle Formationen</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="py-2">Formation</th><th>Kader-Meta</th><th>Ø Meta</th><th>Live Meta</th><th>Matches</th><th>Größtes Risiko</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {recommendations.map((rec) => {
                      const live = findLive(liveMeta, rec.formation.name) ?? findLive(liveMeta, rec.formationKey);
                      return (
                        <tr key={rec.formationKey} className="text-slate-300">
                          <td className="py-3 font-semibold text-white">{rec.formation.name}</td>
                          <td>{rec.squadMatch.toFixed(0)}%</td>
                          <td>{rec.averageFit.toFixed(1)}</td>
                          <td>{rec.formation.winrate_current_patch?.toFixed(1) ?? '-'}% / {rec.formation.usage_rate?.toFixed(1) ?? '-'}%</td>
                          <td>{live?.matches ?? '-'}</td>
                          <td className="max-w-md text-xs text-slate-500">{rec.warnings[0] ?? 'Keine harte Warnung.'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
