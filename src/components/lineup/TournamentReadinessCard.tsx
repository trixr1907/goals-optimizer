'use client';

import { useMemo } from 'react';
import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import {
  calculateStartingElevenOvr,
  evaluateTournamentRequirements,
  TournamentEligibilityResult,
} from '@/lib/tournaments/tournament-eligibility';
import { CURRENT_TOURNAMENTS } from '@/config/tournaments';

interface TournamentReadinessCardProps {
  slots: LineupSlot[];
  lineup: Record<string, string | null>;
  players: PlayerWithScores[];
  slotKeyFor: (pos: Position, idx: number) => string;
}

function StatusBadge({ status }: { status: TournamentEligibilityResult['eligible'] }) {
  if (status === true)
    return <span className="text-xs font-semibold text-emerald-400">✓ Geeignet</span>;
  if (status === false)
    return <span className="text-xs font-semibold text-red-400">✗ Nicht geeignet</span>;
  // null = no OVR requirement could be evaluated (e.g. only Retired/Duplicated)
  return <span className="text-xs text-slate-500">— n/a</span>;
}

export function TournamentReadinessCard({
  slots,
  lineup,
  players,
  slotKeyFor,
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
    </div>
  );
}
