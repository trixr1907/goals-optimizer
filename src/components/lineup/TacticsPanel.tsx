'use client';

import { useState, useMemo } from 'react';
import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import { analyzeTactics, TacticsTip, TipCategory } from '@/lib/tactics/tactics-engine';
import { useTacticsStore } from '@/lib/store/tactics-store';
import { POSITION_ALLOWED_FOCUS, POSITION_TACTICAL_ROLES, recommendTacticalSettings } from '@/lib/tactics/tactics-settings';

const CAT_LABEL: Record<TipCategory, string> = {
  angriff: 'Angriff',
  verteidigung: 'Verteidigung',
  mittelfeld: 'Mittelfeld',
  torwart: 'Torwart',
  warnung: 'Warnung',
};

const CAT_COLOR: Record<TipCategory, string> = {
  angriff: 'border-emerald-800 bg-emerald-950/30',
  verteidigung: 'border-blue-800 bg-blue-950/30',
  mittelfeld: 'border-amber-800 bg-amber-950/30',
  torwart: 'border-purple-800 bg-purple-950/30',
  warnung: 'border-red-800 bg-red-950/30',
};

const CAT_BADGE: Record<TipCategory, string> = {
  angriff: 'bg-emerald-900/60 text-emerald-300',
  verteidigung: 'bg-blue-900/60 text-blue-300',
  mittelfeld: 'bg-amber-900/60 text-amber-300',
  torwart: 'bg-purple-900/60 text-purple-300',
  warnung: 'bg-red-900/60 text-red-300',
};


interface TacticsPanelProps {
  slots: LineupSlot[];
  lineup: Record<string, string | null>;
  players: PlayerWithScores[];
  benchPlayers: PlayerWithScores[];
  formationKey?: string;
  slotKeyFor: (pos: Position, idx: number) => string;
}

function TipCard({ tip }: { tip: TacticsTip }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border p-3 ${CAT_COLOR[tip.category]}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{tip.icon}</span>
            <span className="text-xs font-semibold text-white">{tip.headline}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${CAT_BADGE[tip.category]}`}>
              {CAT_LABEL[tip.category]}
            </span>
            <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>
      {open && (
        <p className="mt-2 text-xs text-slate-300 leading-relaxed border-t border-slate-700 pt-2">
          {tip.detail}
        </p>
      )}
    </div>
  );
}

export function TacticsPanel({ slots, lineup, players, benchPlayers, formationKey, slotKeyFor }: TacticsPanelProps) {
  const { settings } = useTacticsStore();
  const [catFilter, setCatFilter] = useState<TipCategory | 'alle'>('alle');

  const filled = useMemo(() =>
    slots
      .map((slot, idx) => {
        const key = slotKeyFor(slot.position, idx);
        const pid = lineup[key];
        const player = pid ? players.find((p) => p.id === pid) : null;
        return { slotKey: key, slot, player };
      })
      .filter((f) => f.player != null) as { slotKey: string; slot: LineupSlot; player: PlayerWithScores }[],
    [slots, lineup, players, slotKeyFor]
  );

  const analysis = useMemo(() => analyzeTactics(filled, settings), [filled, settings]);
  const tacticalSettings = useMemo(() => recommendTacticalSettings(filled, formationKey), [filled, formationKey]);

  if (filled.length < 3) return null;

  const filteredTips = catFilter === 'alle'
    ? analysis.tips
    : analysis.tips.filter((t) => t.category === catFilter);

  const categories = [...new Set(analysis.tips.map((t) => t.category))];

  return (
    <div className="space-y-4 text-sm">
      {/* Taktik-Analyse */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
        <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Taktik-Analyse</p>

        {analysis.overallWarnings.length > 0 && (
          <div className="space-y-1">
            {analysis.overallWarnings.map((w, i) => (
              <p key={i} className="text-xs text-red-400 flex items-start gap-1.5">
                <span className="shrink-0">⚠️</span> {w}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Konkrete Team-Settings */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
        <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Empfohlene Settings</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Defensive Depth</p>
            <p className="mt-1 text-2xl font-bold text-white">{tacticalSettings.defensiveDepth}</p>
            <p className="text-[11px] text-slate-500">Meta-kompakt: 40–45</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Build Up Play</p>
            <p className="mt-1 text-lg font-bold text-emerald-300">{tacticalSettings.buildUpPlay}</p>
            <p className="text-[11px] text-slate-500">Short / Balanced / Long</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Lineup-Status</p>
            <p className="mt-1 text-lg font-bold text-white">{filled.length}/11</p>
            <p className="text-[11px] text-slate-500">Bank: {benchPlayers.length}</p>
          </div>
        </div>
        {tacticalSettings.reasons.length > 0 && (
          <ul className="space-y-1 text-xs text-slate-400">
            {tacticalSettings.reasons.slice(0, 3).map((reason) => <li key={reason}>• {reason}</li>)}
          </ul>
        )}
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Player Rules</p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {filled.map((item) => {
              const tactical = tacticalSettings.playerTactical[item.slotKey];
              const role = tactical?.role ?? POSITION_TACTICAL_ROLES[item.slot.position][0] ?? '—';
              const focus = tactical?.focus ?? POSITION_ALLOWED_FOCUS[item.slot.position][0] ?? '—';
              const isDefend = focus === 'Defend';
              const isAttack = focus === 'Attack';
              const focusBadgeClass = isDefend
                ? 'shrink-0 rounded bg-blue-900/60 px-1.5 py-0.5 text-[10px] text-blue-200'
                : isAttack
                ? 'shrink-0 rounded bg-emerald-900/60 px-1.5 py-0.5 text-[10px] text-emerald-200'
                : 'shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300';
              return (
                <div key={item.slotKey} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-2">
                  <span className="min-w-0 truncate text-xs text-slate-300">{item.slot.position} · {item.player.name}</span>
                  <span className={focusBadgeClass} title={`Rolle: ${role}`}>
                    {role} — {focus}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Taktik-Tipps */}
      {analysis.tips.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
              Taktik-Tipps ({analysis.tips.length})
            </p>
          </div>

          {/* Kategorie-Filter */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setCatFilter('alle')}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${catFilter === 'alle' ? 'bg-slate-600 border-slate-500 text-white' : 'border-slate-700 text-slate-400'}`}
            >
              Alle
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${catFilter === cat ? 'bg-slate-600 border-slate-500 text-white' : 'border-slate-700 text-slate-400'}`}
              >
                {CAT_LABEL[cat]}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredTips.length === 0 ? (
              <p className="text-xs text-slate-600">Keine Tipps für diese Kategorie.</p>
            ) : (
              filteredTips.map((tip) => <TipCard key={tip.id} tip={tip} />)
            )}
          </div>
        </div>
      )}

    </div>
  );
}
