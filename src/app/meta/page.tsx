'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { apiPath, appPath } from '@/lib/app-url';
import { useSquadStore } from '@/lib/store/squad-store';
import {
  recommendationToLineup,
  recommendFormations,
  type FormationRecommendation,
} from '@/lib/optimizer/formation-optimizer';
import { useLineupStore } from '@/lib/store/lineup-store';
import { useRouter } from 'next/navigation';
import type { LiveMetaSnapshot } from '@/lib/meta/goalsverse-meta';
import {
  defaultFocusForPosition,
  POSITION_TACTICAL_ROLES,
  type TacticalRole,
  type TacticalFocus,
} from '@/lib/tactics/tactics-settings';
import type { Position } from '@/lib/scraper/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(value: number) {
  if (value >= 78) return 'text-emerald-300 bg-emerald-950/40 border-emerald-900';
  if (value >= 68) return 'text-amber-300 bg-amber-950/40 border-amber-900';
  return 'text-red-300 bg-red-950/40 border-red-900';
}

function fitBadge(fit: number) {
  if (fit >= 80) return 'bg-emerald-600 text-white';
  if (fit >= 70) return 'bg-emerald-900 text-emerald-200';
  if (fit >= 60) return 'bg-amber-900 text-amber-200';
  return 'bg-red-900 text-red-200';
}

function focusEmoji(focus: TacticalFocus) {
  if (focus === 'Attack') return '⚡';
  if (focus === 'Defend') return '🛡️';
  return '⚖️';
}

function roleLabel(role: TacticalRole): string {
  const map: Partial<Record<TacticalRole, string>> = {
    'Striker': 'Stürmer',
    'Deep Lying Forward': 'Hänge Spitze',
    'Wide Forward': 'Flügel',
    'Attacking Midfielder': 'Offensiv MF',
    'Central Midfielder': 'Zentral MF',
    'Defensive Midfielder': 'Defensiv MF',
    'Wide Midfielder': 'Außen MF',
    'Wing Back': 'Wingback',
    'Full Back': 'Außenverteidi.',
    'Centre Back': 'Innenvert.',
    'Ball Playing Defender': 'Spielend. IV',
    'Advanced Centre Back': 'Vorwärts IV',
    'Goalkeeper': 'Torwart',
    'Sweeper Keeper': 'Herauslaufend',
  };
  return map[role] ?? role;
}

function getBestRole(position: Position): TacticalRole {
  const roles = POSITION_TACTICAL_ROLES[position];
  return roles && roles.length > 0 ? roles[0] : 'Central Midfielder';
}

function getOvrColor(ovr: number) {
  if (ovr >= 85) return 'text-yellow-300 font-bold';
  if (ovr >= 80) return 'text-emerald-300 font-bold';
  if (ovr >= 75) return 'text-sky-300';
  return 'text-slate-300';
}

function pitchRowLabel(y: number) {
  if (y >= 80) return 'TOR';
  if (y >= 60) return 'ABWEHR';
  if (y >= 35) return 'MITTELFELD';
  return 'ANGRIFF';
}

function findLive(live: LiveMetaSnapshot | null, key: string) {
  return live?.formations.find((f) => f.key.toLowerCase() === key.toLowerCase()) ?? null;
}

// Rank badge per index
const RANK_STYLES = [
  { label: '#1', border: 'border-emerald-600', glow: 'shadow-emerald-900/40', badge: 'bg-emerald-600', header: 'text-emerald-400' },
  { label: '#2', border: 'border-sky-700', glow: 'shadow-sky-900/30', badge: 'bg-sky-700', header: 'text-sky-400' },
  { label: '#3', border: 'border-slate-600', glow: 'shadow-slate-900/20', badge: 'bg-slate-600', header: 'text-slate-400' },
];

// ---------------------------------------------------------------------------
// BestElfCard — one card per top recommendation
// ---------------------------------------------------------------------------

interface BestElfCardProps {
  rec: FormationRecommendation;
  rank: number; // 0-based
  onApply: () => void;
}

function BestElfCard({ rec, rank, onApply }: BestElfCardProps) {
  const style = RANK_STYLES[rank] ?? RANK_STYLES[2];

  const squadOvr = Math.round(
    rec.assignments.reduce((sum, a) => sum + a.player.overall, 0) / rec.assignments.length,
  );

  // Group by pitch row, consistent order
  const rows = useMemo(() => {
    const rowMap = new Map<string, typeof rec.assignments>();
    const sorted = [...rec.assignments].sort((a, b) => b.slot.y - a.slot.y);
    for (const a of sorted) {
      const label = pitchRowLabel(a.slot.y);
      if (!rowMap.has(label)) rowMap.set(label, []);
      rowMap.get(label)!.push(a);
    }
    const order = ['TOR', 'ABWEHR', 'MITTELFELD', 'ANGRIFF'];
    return order
      .filter((k) => rowMap.has(k))
      .map((k) => ({ label: k, items: rowMap.get(k)! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec]);

  return (
    <section
      className={`flex flex-col rounded-2xl border-2 ${style.border} bg-slate-900/70 shadow-lg ${style.glow} overflow-hidden`}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 p-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className={`shrink-0 rounded-lg ${style.badge} px-2 py-0.5 text-xs font-bold text-white`}>
            {style.label}
          </span>
          <div>
            <h3 className="text-xl font-extrabold text-white leading-tight">{rec.formation.name}</h3>
            <p className={`text-xs ${style.header}`}>{rec.formation.playstyle ?? 'Ausgewogen'}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-slate-500">Fit</p>
            <p className="text-base font-bold text-white">{rec.squadMatch.toFixed(0)}%</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-slate-500">OVR</p>
            <p className="text-base font-bold text-white">{squadOvr}</p>
          </div>
        </div>
      </div>

      {/* Teamsheet */}
      <div className="flex-1 p-3 space-y-2.5">
        {rows.map(({ label, items }) => (
          <div key={label}>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-600 mb-1">{label}</p>
            <div className="space-y-1">
              {items.map((a) => {
                const role = getBestRole(a.slot.position);
                const focus = defaultFocusForPosition(a.slot.position);
                return (
                  <div
                    key={a.slotKey}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-800/50 border border-slate-700/40 px-2 py-1.5"
                  >
                    {/* Position pill */}
                    <span className="shrink-0 w-7 text-center text-[10px] font-bold rounded bg-slate-700 text-slate-300 px-0.5 py-0.5">
                      {a.slot.position}
                    </span>
                    {/* Name */}
                    <span className="flex-1 min-w-0 text-xs font-semibold text-white truncate">
                      {a.player.name}
                    </span>
                    {/* Role + Focus (compact) */}
                    <span className="shrink-0 text-[9px] text-slate-500 hidden sm:block">
                      {focusEmoji(focus)}&nbsp;{roleLabel(role)}
                    </span>
                    {/* OVR */}
                    <span className={`shrink-0 text-xs ${getOvrColor(a.player.overall)}`}>
                      {a.player.overall}
                    </span>
                    {/* Fit badge */}
                    <span className={`shrink-0 text-[10px] font-bold rounded px-1 py-0.5 ${fitBadge(a.fit)}`}>
                      {a.fit.toFixed(0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Warnings */}
      {rec.warnings.length > 0 && (
        <div className="mx-3 mb-2 rounded-lg border border-amber-900/50 bg-amber-950/20 px-2.5 py-1.5">
          <p className="text-[10px] text-amber-300 truncate">⚠️ {rec.warnings[0]}</p>
        </div>
      )}

      {/* Apply */}
      <div className="p-3 pt-0">
        <button
          onClick={onApply}
          className={`w-full rounded-xl ${rank === 0 ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'} active:scale-95 transition-all px-3 py-2.5 text-sm font-bold text-white`}
        >
          {rank === 0 ? '✅ Anwenden & zum Pitch' : '↗ Diese anwenden'}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MetaPage() {
  const router = useRouter();
  const { players, _hasHydrated } = useSquadStore();
  const { setFormation, autoFill, setFormationWithLineup } = useLineupStore();
  const [liveMeta, setLiveMeta] = useState<LiveMetaSnapshot | null>(null);
  const [metaStatus, setMetaStatus] = useState<'loading' | 'ok' | 'fallback' | 'error'>('loading');
  // null = not yet computed, [] = computed but empty (< 11 players)
  const [topThree, setTopThree] = useState<FormationRecommendation[] | null>(null);
  const [computing, setComputing] = useState(false);

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
        const squadMatch = Math.max(0, Math.min(100, rec.averageFit));
        return {
          ...rec,
          squadMatch,
          liveWinrate,
          liveUsage: live.matchShare * 100,
          reasons: [
            `${squadMatch.toFixed(0)}% Squad-Fit. Live-Meta: ${liveWinrate.toFixed(1)}% WR bei ${live.matches} Matches.`,
            ...rec.reasons.slice(1),
          ],
        };
      })
      .sort((a, b) => b.squadMatch - a.squadMatch);
  }, [players, liveMeta]);

  const best = recommendations[0];

  function computeBestThree() {
    setComputing(true);
    // Micro-delay so the button renders disabled before the sync work
    setTimeout(() => {
      const recs = recommendFormations(players);
      setTopThree(recs.slice(0, 3));
      setComputing(false);
    }, 30);
  }

  function applyFromTopThree(index: number) {
    const rec = topThree?.[index];
    if (!rec) return;
    const assignments: Record<string, string> = {};
    for (const a of rec.assignments) assignments[a.slotKey] = a.player.id;
    setFormationWithLineup(rec.formation.name, rec.formation.slots, assignments);
    router.push(appPath('/lineup'));
  }

  function applyRecommendation(index: number) {
    const rec = recommendations[index];
    if (!rec) return;
    setFormation(rec.formation.name, rec.formation.slots);
    setTimeout(() => {
      autoFill(recommendationToLineup(rec));
      router.push(appPath('/lineup'));
    }, 0);
  }

  const insufficientPlayers = !_hasHydrated || players.length < 11;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        {insufficientPlayers ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
            <p className="text-slate-400">
              Lade mindestens 11 Spieler, damit der Formation-Optimizer sinnvoll rechnen kann.
            </p>
            <a href={appPath('/')} className="text-sm text-emerald-400 underline">
              Zum Import
            </a>
          </div>
        ) : (
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Page header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Meta Center</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Formation-Ranking aus deinem Squad-Fit — plus echte Live-Meta als Kontext.
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Meta-Daten:{' '}
                  {metaStatus === 'ok'
                    ? `Live von goalsverse · Patch ${liveMeta?.patch ?? '?'} · ${liveMeta?.matches ?? '?'} Matches`
                    : metaStatus === 'fallback'
                    ? 'Live-Meta nicht erreichbar'
                    : metaStatus === 'loading'
                    ? 'Lade goalsverse…'
                    : 'Live-Meta nicht erreichbar'}
                </p>
              </div>
              {best && !topThree && (
                <div className={`rounded-xl border px-4 py-3 text-right ${scoreColor(best.squadMatch)}`}>
                  <p className="text-xs opacity-80">Beste Empfehlung</p>
                  <p className="text-xl font-bold">
                    {best.formation.name} · {best.squadMatch.toFixed(0)}%
                  </p>
                </div>
              )}
            </div>

            {/* ── BESTE 3 ELF SECTION ── */}
            {topThree ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">
                    ⚡ Beste 3 Elfen aus deinem Kader
                  </h3>
                  <button
                    onClick={() => setTopThree(null)}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    ↩ Zurücksetzen
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Position · Spieler · Rolle · OVR · Fit-Score — einmal klicken, direkt auf den Pitch.
                </p>
                <div className="grid gap-4 lg:grid-cols-3">
                  {topThree.map((rec, i) => (
                    <BestElfCard
                      key={rec.formationKey}
                      rec={rec}
                      rank={i}
                      onApply={() => applyFromTopThree(i)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-emerald-800/50 bg-emerald-950/10 flex flex-col items-center justify-center gap-4 py-10 px-6 text-center">
                <div>
                  <p className="text-4xl mb-2">⚡</p>
                  <h3 className="text-xl font-bold text-white">Beste 3 Elfen — Quick Pick</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Optimale Formation + Startelf + Rollen für jeden der 3 besten Setups aus deinem Kader.
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {players.length} Spieler im Kader — bereit zum Berechnen
                  </p>
                </div>
                <button
                  onClick={computeBestThree}
                  disabled={computing}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 active:scale-95 transition-all px-8 py-3.5 text-lg font-bold text-white shadow-xl shadow-emerald-900/50"
                >
                  {computing ? '⏳ Berechne…' : '⚡ Beste 3 Elfen berechnen'}
                </button>
              </div>
            )}

            {/* ── FORMATION RANKING ── */}
            <div>
              <h3 className="text-lg font-bold text-white mb-3">Formation-Ranking</h3>
              <div className="grid gap-4 lg:grid-cols-3">
                {recommendations.slice(0, 3).map((rec, index) => {
                  const live =
                    findLive(liveMeta, rec.formation.name) ??
                    findLive(liveMeta, rec.formationKey);
                  return (
                    <section
                      key={rec.formationKey}
                      className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">
                            Top {index + 1}
                          </p>
                          <h3 className="text-xl font-bold text-white">{rec.formation.name}</h3>
                          <p className="text-xs text-slate-500">
                            {rec.formation.playstyle ?? 'Squad-basiert'} · basierend auf deinem Kader
                          </p>
                        </div>
                        <div
                          className={`rounded-xl border px-3 py-2 text-center ${scoreColor(rec.squadMatch)}`}
                        >
                          <p className="text-lg font-bold">{rec.squadMatch.toFixed(0)}%</p>
                          <p className="text-[10px] opacity-80">Squad-Fit</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg bg-slate-950/60 p-2">
                          <p className="text-slate-500">Ø Fit</p>
                          <p className="font-mono text-white">{rec.averageFit.toFixed(1)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-950/60 p-2">
                          <p className="text-slate-500">Primary</p>
                          <p className="font-mono text-white">
                            {
                              rec.assignments.filter(
                                (item) =>
                                  item.player.positionType?.[item.slot.position] === 'primary',
                              ).length
                            }
                          </p>
                        </div>
                        <div className="rounded-lg bg-slate-950/60 p-2">
                          <p className="text-slate-500">Secondary</p>
                          <p className="font-mono text-white">
                            {
                              rec.assignments.filter(
                                (item) =>
                                  item.player.positionType?.[item.slot.position] === 'secondary',
                              ).length
                            }
                          </p>
                        </div>
                      </div>

                      {live && (
                        <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                          <span className="rounded bg-slate-950/50 px-2 py-1">
                            {live.matches} Matches
                          </span>
                          <span className="rounded bg-slate-950/50 px-2 py-1">
                            {live.wins}W / {live.losses}L
                          </span>
                          <span className="rounded bg-slate-950/50 px-2 py-1">
                            GD {live.avgGoalDiff.toFixed(2)}
                          </span>
                        </div>
                      )}

                      <div className="space-y-2">
                        {rec.reasons
                          .slice(0, 3)
                          .map((reason) => (
                            <p key={reason} className="text-sm text-slate-300">
                              • {reason}
                            </p>
                          ))}
                      </div>

                      <div>
                        <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                          Startelf
                        </p>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          {rec.assignments.map((item) => (
                            <div
                              key={item.slotKey}
                              className="flex items-center justify-between rounded bg-slate-950/50 px-2 py-1"
                            >
                              <span className="text-slate-400">{item.slot.position}</span>
                              <span className="truncate px-2 text-slate-200">
                                {item.player.name}
                              </span>
                              <span
                                className={
                                  item.fit >= 70 ? 'text-emerald-400' : 'text-amber-400'
                                }
                              >
                                {item.fit.toFixed(0)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {rec.warnings.length > 0 && (
                        <div className="rounded-xl border border-amber-900/70 bg-amber-950/30 p-3 text-xs text-amber-200 space-y-1">
                          {rec.warnings.slice(0, 2).map((warning) => (
                            <p key={warning}>⚠️ {warning}</p>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={() => applyRecommendation(index)}
                        className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                      >
                        Diese Formation anwenden
                      </button>
                    </section>
                  );
                })}
              </div>
            </div>

            {/* ── ALL FORMATIONS TABLE ── */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="text-lg font-bold text-white">Alle Formationen</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2">Formation</th>
                      <th>Squad-Fit</th>
                      <th>Ø Fit</th>
                      <th>Live-Kontext</th>
                      <th>Matches</th>
                      <th>Größtes Risiko</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {recommendations.map((rec) => {
                      const live =
                        findLive(liveMeta, rec.formation.name) ??
                        findLive(liveMeta, rec.formationKey);
                      return (
                        <tr key={rec.formationKey} className="text-slate-300">
                          <td className="py-3 font-semibold text-white">{rec.formation.name}</td>
                          <td>{rec.squadMatch.toFixed(0)}%</td>
                          <td>{rec.averageFit.toFixed(1)}</td>
                          <td>
                            {live
                              ? `${(live.winRate * 100).toFixed(1)}% WR / ${(live.matchShare * 100).toFixed(1)}% Usage`
                              : 'keine Live-Daten'}
                          </td>
                          <td>{live?.matches ?? '-'}</td>
                          <td className="max-w-md text-xs text-slate-500">
                            {rec.warnings[0] ?? 'Keine harte Warnung.'}
                          </td>
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
