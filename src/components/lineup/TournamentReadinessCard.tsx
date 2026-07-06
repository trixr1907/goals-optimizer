'use client';

import { useMemo } from 'react';
import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import {
  calculateStartingElevenOvr,
  evaluateTournamentRequirements,
  TournamentEligibilityResult,
} from '@/lib/tournaments/tournament-eligibility';
import {
  recommendTournamentLineup,
  TournamentLineupResult,
} from '@/lib/tournaments/tournament-lineup-recommender';
import { CURRENT_TOURNAMENTS } from '@/config/tournaments';

interface TournamentReadinessCardProps {
  slots: LineupSlot[];
  lineup: Record<string, string | null>;
  players: PlayerWithScores[];
  slotKeyFor: (pos: Position, idx: number) => string;
  /** Called when user confirms applying a recommended lineup */
  onApplyRecommendation?: (recommendation: TournamentLineupResult) => void;
}

function StatusBadge({ status }: { status: TournamentEligibilityResult['eligible'] }) {
  if (status === true)
    return <span className="text-xs font-semibold text-emerald-400">✓ Geeignet</span>;
  if (status === false)
    return <span className="text-xs font-semibold text-red-400">✗ Nicht geeignet</span>;
  // null = no OVR requirement could be evaluated (e.g. only Retired/Duplicated)
  return <span className="text-xs text-slate-500">— n/a</span>;
}

function EligibleDot({ eligible }: { eligible: boolean | null }) {
  if (eligible === true) return <span className="text-emerald-400 text-xs">✓</span>;
  if (eligible === false) return <span className="text-red-400 text-xs">✗</span>;
  return <span className="text-slate-500 text-xs">—</span>;
}

/** Validates that a recommendation has exactly 11 unique players and a formation. */
function isApplyable(rec: TournamentLineupResult): boolean {
  if (!rec.formationKey) return false;
  if (rec.assignments.length !== 11) return false;
  const ids = rec.assignments.map((a) => a.player.id);
  return new Set(ids).size === 11;
}

export function TournamentReadinessCard({
  slots,
  lineup,
  players,
  slotKeyFor,
  onApplyRecommendation,
}: TournamentReadinessCardProps) {
  // Resolve the starting eleven from the current lineup (first 11 slots only)
  const startingEleven = useMemo<PlayerWithScores[]>(() => {
    const playerById = new Map(players.map((p) => [p.id, p]));
    return slots
      .slice(0, 11)
      .map((slot, idx) => {
        const key = slotKeyFor(slot.position, idx);
        const pid = lineup[key];
        return pid ? (playerById.get(pid) ?? null) : null;
      })
      .filter((p): p is PlayerWithScores => p !== null);
  }, [slots, lineup, players, slotKeyFor]);

  const filledCount = startingEleven.length;
  const squadOvr = useMemo(() => calculateStartingElevenOvr(startingEleven), [startingEleven]);

  const results = useMemo<TournamentEligibilityResult[]>(() => {
    if (filledCount < 11) return [];
    return CURRENT_TOURNAMENTS.map((t) => evaluateTournamentRequirements(startingEleven, t));
  }, [startingEleven, filledCount]);

  // Recommendations run against the full squad pool (independent of current lineup)
  const recommendations = useMemo(() => {
    if (players.length < 11) return [];
    return CURRENT_TOURNAMENTS.map((t) => recommendTournamentLineup(players, t));
  }, [players]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Turnier-Bereitschaft
          </p>
          <h3 className="text-base font-bold text-white">
            Aktuelle Startelf
          </h3>
        </div>
        {squadOvr !== null && (
          <div className="text-right shrink-0">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Squad OVR</p>
            <p className="text-2xl font-bold text-white font-mono">{squadOvr}</p>
          </div>
        )}
      </div>

      {filledCount < 11 ? (
        <p className="text-sm text-slate-400 py-1">
          Fülle zuerst deine Startelf
          <span className="ml-1 text-slate-500">({filledCount}/11 besetzt)</span>
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {results.map((res) => {
            // Find the primary requirement text for display (OVR Max or OVR Min)
            const ovrReq = res.requirements.find(
              (r) => r.key === 'OVR Max' || r.key === 'OVR Min',
            );
            const notEvaluated = res.requirements.filter((r) => r.status === 'notEvaluated');

            return (
              <div
                key={res.tournamentName}
                className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 ${
                  res.eligible === true
                    ? 'border-emerald-800 bg-emerald-950/20'
                    : res.eligible === false
                    ? 'border-red-900 bg-red-950/20'
                    : 'border-slate-700 bg-slate-900/30'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{res.tournamentName}</p>
                  {ovrReq && (
                    <p className="text-[11px] text-slate-500">
                      {ovrReq.key}: {ovrReq.value}
                    </p>
                  )}
                  {notEvaluated.length > 0 && (
                    <p className="text-[11px] text-slate-600">
                      {notEvaluated.map((r) => r.key).join(', ')} nicht bewertet
                    </p>
                  )}
                </div>
                <StatusBadge status={res.eligible} />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Knockout ──────────────────────────────────────────────────────── */}
      <div className="pt-2 border-t border-slate-800">
        <div className="rounded-lg border border-slate-700 bg-slate-900/30 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-white">Knockout</p>
            <span className="text-[11px] text-slate-400">Wochenendmodus</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Offener Modus ohne OVR-Limit — nutze deine stärkste Startelf und kompakte Meta-Taktik.
          </p>
          <p className="text-[11px] text-slate-500">
            Leaderboard-Details findest du im Spiel oder im Debug-Bereich.
          </p>
        </div>
      </div>

      {/* ── Empfohlene Startelfen pro Turnier ──────────────────────────────── */}
      {recommendations.length > 0 && (
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Empfohlene Startelfen
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recommendations.map((rec) => {
              const ovrReq = CURRENT_TOURNAMENTS.find(
                (t) => t.name === rec.tournamentName,
              )?.requirements.find((r) => r.key === 'OVR Max' || r.key === 'OVR Min');

              // "Anwenden" only for eligible recommendations with valid data
              const canApply = rec.eligible === true && isApplyable(rec) && !!onApplyRecommendation;

              return (
                <div
                  key={rec.tournamentName}
                  className={`rounded-lg border px-3 py-2 space-y-1 ${
                    rec.eligible === true
                      ? 'border-emerald-800 bg-emerald-950/10'
                      : rec.eligible === false
                      ? 'border-red-900 bg-red-950/10'
                      : 'border-slate-700 bg-slate-900/20'
                  }`}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-white truncate">
                      {rec.tournamentName}
                    </p>
                    <EligibleDot eligible={rec.eligible} />
                  </div>

                  {/* Formation + OVR info */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-400 truncate">
                      {rec.formationName || '—'}
                    </p>
                    {rec.squadOvr !== null && (
                      <p className="text-[11px] font-mono text-slate-300 shrink-0">
                        OVR {rec.squadOvr}
                        {ovrReq && (
                          <span className="text-slate-500 ml-1">
                            /{ovrReq.key === 'OVR Max' ? '≤' : '≥'}{ovrReq.value}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Ø Fit */}
                  {rec.averageFit > 0 && (
                    <p className="text-[11px] text-slate-500">
                      Ø Fit {rec.averageFit.toFixed(0)}
                    </p>
                  )}

                  {/* Primary warning (first only, keep compact) */}
                  {rec.warnings.length > 0 && (
                    <p className="text-[11px] text-amber-500/80 line-clamp-2">
                      {rec.warnings[0]}
                    </p>
                  )}

                  {/* Apply button — only for eligible + valid recommendations */}
                  {canApply ? (
                    <button
                      type="button"
                      onClick={() => onApplyRecommendation(rec)}
                      className="mt-1 w-full px-2 py-1 rounded text-[11px] font-semibold bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
                    >
                      Anwenden
                    </button>
                  ) : rec.eligible === false ? (
                    <p className="text-[11px] text-slate-600 mt-1">
                      Nicht anwendbar — Anforderungen nicht erfüllbar
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
