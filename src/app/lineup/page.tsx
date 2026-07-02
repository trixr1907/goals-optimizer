'use client';

import { useMemo, useState, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useSquadStore } from '@/lib/store/squad-store';
import { useLineupStore, LineupSlot } from '@/lib/store/lineup-store';
import { Sidebar } from '@/components/layout/Sidebar';
import { appPath } from '@/lib/app-url';
import { TacticsPanel } from '@/components/lineup/TacticsPanel';
import { Position, PlayerWithScores } from '@/lib/scraper/types';
import formationsData from '@/config/formations.json';
import { recommendationToLineup, recommendFormations } from '@/lib/optimizer/formation-optimizer';
import { explainFootFit } from '@/lib/scoring/position-fit';

const FORMATIONS = formationsData as Record<string, { name: string; slots: LineupSlot[] }>;

const POSITION_COLORS: Record<string, string> = {
  GK: 'bg-yellow-600',
  CB: 'bg-blue-700', LB: 'bg-blue-600', RB: 'bg-blue-600', LWB: 'bg-blue-500', RWB: 'bg-blue-500',
  CDM: 'bg-green-700', CM: 'bg-green-600', CAM: 'bg-green-500', LM: 'bg-green-500', RM: 'bg-green-500',
  ST: 'bg-red-600', LW: 'bg-red-500', RW: 'bg-red-500', CF: 'bg-red-500',
};

function slotKeyFor(pos: Position, idx: number) {
  return `${pos}-${idx}`;
}

function fitColor(fit: number) {
  if (fit >= 80) return 'border-emerald-400 shadow-emerald-500/30';
  if (fit >= 65) return 'border-amber-400 shadow-amber-500/25';
  return 'border-red-500 shadow-red-500/25';
}

function fitText(fit: number) {
  if (fit >= 80) return 'text-emerald-300';
  if (fit >= 65) return 'text-amber-300';
  return 'text-red-300';
}

function DraggablePlayerChip({
  player,
  fit,
  compact = false,
  disabled = false,
}: {
  player: PlayerWithScores;
  fit?: number;
  compact?: boolean;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `player:${player.id}`,
    data: { playerId: player.id },
    disabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      type="button"
      className={`touch-none select-none rounded-lg border border-slate-700 bg-slate-900/70 text-slate-200 hover:bg-slate-800 transition-colors cursor-grab active:cursor-grabbing ${
        compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      title="Ziehen auf einen Pitch-Slot"
    >
      <span className="font-medium">{player.name}</span>{' '}
      <span className="text-slate-500">{player.overall}</span>
      {fit !== undefined && (
        <span className={`ml-1 font-mono ${fitText(fit)}`}>({fit.toFixed(0)})</span>
      )}
    </button>
  );
}

function PitchSlot({
  slotKey,
  slot,
  player,
  selected,
  locked,
  onClick,
}: {
  slotKey: string;
  slot: LineupSlot;
  player: PlayerWithScores | null;
  selected: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${slotKey}`,
    data: { slotKey },
    disabled: locked,
  });

  const fit = player ? player.fit_scores[slot.position] ?? 0 : 0;
  const footHint = player ? explainFootFit(player, slot.position) : null;

  return (
    <div
      ref={setNodeRef}
      className="absolute group"
      style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)' }}
    >
      <button
        type="button"
        onClick={onClick}
        className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 transition-all shadow-lg ${
          player
            ? `${POSITION_COLORS[slot.position] ?? 'bg-slate-600'} ${fitColor(fit)}`
            : 'bg-slate-800/75 border-dashed border-slate-500 text-slate-400'
        } ${selected ? 'scale-110 ring-2 ring-yellow-400' : ''} ${locked ? 'ring-2 ring-amber-400' : ''} ${isOver ? 'scale-110 ring-4 ring-emerald-400/60' : ''}`}
      >
        {player ? (
          <div className="text-center leading-tight pointer-events-none">
            <div className="text-[10px] sm:text-[11px] max-w-12 truncate">{player.name.split(' ')[0]}</div>
            <div className={`text-[9px] font-mono ${fitText(fit)}`}>Fit {fit.toFixed(0)}</div>
            <div className="text-[8px] opacity-75">OVR {player.overall}</div>
          </div>
        ) : (
          <span className="text-[10px]">{slot.position}</span>
        )}
        {locked && <span className="absolute -top-2 -right-2 text-[10px]">🔒</span>}
        {footHint && <span className="absolute -bottom-2 -right-2 text-[10px]" title={footHint}>🦶</span>}
      </button>
      <div className="mt-1 text-center text-[10px] font-mono text-slate-500">{slot.position}</div>
    </div>
  );
}

export default function LineupPage() {
  const { players, clubName, _hasHydrated } = useSquadStore();
  const { formation, slots, lineup, locked, setFormation, assignPlayer, toggleLock, autoFill, clearLineup } = useLineupStore();

  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  );

  const formationRecommendations = useMemo(() => recommendFormations(players), [players]);
  const formationNames = useMemo(() => Object.keys(FORMATIONS), []);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  if (!initialized) {
    if (slots.length === 0) {
      const def = FORMATIONS['4-3-3'] ?? FORMATIONS[formationNames[0]];
      if (def) setFormation(def.name, def.slots as LineupSlot[]);
    }
    setInitialized(true);
  }

  const benchPlayers = useMemo(() => {
    const inLineup = new Set(Object.values(lineup).filter(Boolean) as string[]);
    return players.filter((p) => !inLineup.has(p.id));
  }, [players, lineup]);

  const handleFormationChange = useCallback((name: string) => {
    const f = FORMATIONS[name];
    if (!f) return;
    const newLineup: Record<string, string | null> = {};
    const used = new Set<string>();
    const fSlots = f.slots as LineupSlot[];
    fSlots.forEach((s, i) => {
      const key = slotKeyFor(s.position, i);
      const best = players
        .filter((p) => !used.has(p.id))
        .sort((a, b) => (b.fit_scores[s.position] ?? 0) - (a.fit_scores[s.position] ?? 0))[0];
      if (best) {
        newLineup[key] = best.id;
        used.add(best.id);
      } else newLineup[key] = null;
    });
    setFormation(name, fSlots);
    setTimeout(() => autoFill(newLineup), 0);
  }, [players, setFormation, autoFill]);

  const handleAutoFill = useCallback(() => {
    const assignments: Record<string, string> = {};
    const used = new Set<string>();
    slots.forEach((s, i) => {
      const key = slotKeyFor(s.position, i);
      if (locked.has(key)) {
        const pid = lineup[key];
        if (pid) used.add(pid);
      }
    });
    slots.forEach((s, i) => {
      const key = slotKeyFor(s.position, i);
      if (locked.has(key)) return;
      const best = players
        .filter((p) => !used.has(p.id))
        .sort((a, b) => (b.fit_scores[s.position] ?? 0) - (a.fit_scores[s.position] ?? 0))[0];
      if (best) {
        assignments[key] = best.id;
        used.add(best.id);
      }
    });
    autoFill(assignments);
  }, [slots, locked, lineup, players, autoFill]);

  const handleApplyRecommendation = useCallback((index: number) => {
    const rec = formationRecommendations[index];
    if (!rec) return;
    setFormation(rec.formation.name, rec.formation.slots as LineupSlot[]);
    setTimeout(() => autoFill(recommendationToLineup(rec)), 0);
  }, [formationRecommendations, setFormation, autoFill]);

  const handlePlayerAssign = useCallback((playerId: string) => {
    if (selectedSlotKey) {
      assignPlayer(selectedSlotKey, playerId);
      setSelectedSlotKey(null);
    }
  }, [selectedSlotKey, assignPlayer]);

  function handleDragStart(event: DragStartEvent) {
    const playerId = event.active.data.current?.playerId as string | undefined;
    if (playerId) setActivePlayerId(playerId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const playerId = event.active.data.current?.playerId as string | undefined;
    const slotKey = event.over?.data.current?.slotKey as string | undefined;
    if (playerId && slotKey) assignPlayer(slotKey, playerId);
    setActivePlayerId(null);
  }

  if (!_hasHydrated || players.length === 0) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-slate-400">Kein Kader geladen.</p>
            <a href={appPath('/')} className="text-emerald-400 underline text-sm">Zum Import</a>
          </div>
        </main>
      </div>
    );
  }

  const formationDisplayName = FORMATIONS[formation]?.name ?? formation;
  const activePlayer = activePlayerId ? playerById.get(activePlayerId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActivePlayerId(null)}>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white">Aufstellung</h2>
                <p className="text-sm text-slate-500">{clubName || 'Kader'} &middot; {formationDisplayName}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={formation}
                  onChange={(e) => handleFormationChange(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white text-sm"
                >
                  {formationNames.map((name) => (
                    <option key={name} value={name}>{FORMATIONS[name].name}</option>
                  ))}
                </select>
                <button onClick={handleAutoFill} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors">
                  Auto-Fill
                </button>
                <button onClick={clearLineup} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm font-medium hover:bg-slate-800 transition-colors">
                  Leeren
                </button>
              </div>
            </div>

            {formationRecommendations.length > 0 && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Formation Optimizer</p>
                    <h3 className="text-lg font-bold text-white">Top-Empfehlungen für deinen Kader</h3>
                  </div>
                  <a href={appPath('/meta')} className="text-xs text-emerald-400 underline">Meta Center öffnen</a>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {formationRecommendations.slice(0, 3).map((rec, index) => (
                    <button key={rec.formationKey} onClick={() => handleApplyRecommendation(index)} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-left transition-colors hover:border-emerald-600 hover:bg-slate-900">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{rec.formation.name}</span>
                        <span className={`font-mono text-sm ${rec.squadMatch >= 78 ? 'text-emerald-400' : rec.squadMatch >= 68 ? 'text-amber-400' : 'text-red-400'}`}>
                          {rec.squadMatch.toFixed(0)}%
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{rec.formation.playstyle} · Ø Fit {rec.averageFit.toFixed(1)}</p>
                      <p className="mt-2 line-clamp-2 text-xs text-slate-400">{rec.reasons[0]}</p>
                      {rec.warnings[0] && <p className="mt-2 line-clamp-1 text-xs text-amber-300">⚠️ {rec.warnings[0]}</p>}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
              <p className="text-xs text-slate-500 mb-3">Ziehe Spieler aus Bank oder Startelf auf einen Slot. Auf Mobile: kurz halten und ziehen.</p>
              <div className="relative w-full aspect-[7/10] max-h-[560px] mx-auto rounded-xl border border-slate-800 bg-green-900/30 overflow-hidden touch-none">
                <div className="absolute inset-[5%] border border-white/20 rounded-lg" />
                <div className="absolute left-[5%] right-[5%] top-[50%] border-t border-white/20" />
                <div className="absolute left-[20%] right-[20%] top-[5%] bottom-[5%] border border-white/20 rounded-lg" />
                <div className="absolute left-[35%] right-[35%] top-[5%] bottom-[50%] border border-white/20 rounded-full" />
                <div className="absolute left-[35%] right-[35%] top-[50%] bottom-[5%] border border-white/20 rounded-full" />
                <div className="absolute left-[50%] top-[50%] w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" />

                {slots.map((slot, idx) => {
                  const key = slotKeyFor(slot.position, idx);
                  const pid = lineup[key];
                  const player = pid ? playerById.get(pid) ?? null : null;
                  return (
                    <PitchSlot
                      key={key}
                      slotKey={key}
                      slot={slot}
                      player={player}
                      selected={selectedSlotKey === key}
                      locked={locked.has(key)}
                      onClick={() => setSelectedSlotKey((prev) => (prev === key ? null : key))}
                    />
                  );
                })}
              </div>
            </div>

            {selectedSlotKey && (() => {
              const [pos] = selectedSlotKey.split('-');
              const currentPlayerId = lineup[selectedSlotKey];
              const currentPlayer = currentPlayerId ? playerById.get(currentPlayerId) : null;
              const isLocked = locked.has(selectedSlotKey);
              return (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm font-bold text-white">{pos} Slot</p>
                    <div className="flex items-center gap-2">
                      {currentPlayer && <span className="text-xs text-slate-400">{currentPlayer.name} — Fit {currentPlayer.fit_scores[pos as Position]?.toFixed(0) ?? '-'}</span>}
                      <button onClick={() => toggleLock(selectedSlotKey)} className={`text-xs px-2 py-1 rounded ${isLocked ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                        {isLocked ? '🔒 Fixiert' : 'Fixieren'}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {players
                      .sort((a, b) => (b.fit_scores[pos as Position] ?? 0) - (a.fit_scores[pos as Position] ?? 0))
                      .slice(0, 12)
                      .map((p) => (
                        <div key={p.id} onClick={() => handlePlayerAssign(p.id)}>
                          <DraggablePlayerChip player={p} fit={p.fit_scores[pos as Position]} disabled={isLocked} />
                        </div>
                      ))}
                  </div>
                </div>
              );
            })()}

            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-3">Bank ({benchPlayers.length})</p>
              <div className="flex gap-2 flex-wrap">
                {benchPlayers.map((p) => (
                  <div key={p.id} onClick={() => selectedSlotKey && handlePlayerAssign(p.id)}>
                    <DraggablePlayerChip player={p} compact />
                  </div>
                ))}
                {benchPlayers.length === 0 && <p className="text-xs text-slate-600">Alle Spieler in der Startelf.</p>}
              </div>
            </div>

            <TacticsPanel slots={slots as LineupSlot[]} lineup={lineup} players={players} benchPlayers={benchPlayers} slotKeyFor={slotKeyFor} />
          </div>
        </main>
      </div>

      <DragOverlay>
        {activePlayer ? (
          <div className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold shadow-2xl border border-emerald-300">
            {activePlayer.name} · OVR {activePlayer.overall}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
