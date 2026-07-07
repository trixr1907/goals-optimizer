'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  CollisionDetection,
  closestCenter,
  pointerWithin,
  rectIntersection,
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
import { ShareCard } from '@/components/lineup/ShareCard';
import { Position, PlayerWithScores } from '@/lib/scraper/types';
import formationsData from '@/config/formations.json';
import { recommendationToLineup, recommendFormations, FormationAssignment } from '@/lib/optimizer/formation-optimizer';
import { OptimizationMode } from '@/lib/optimizer/hungarian-solver';
import { explainFootFit, calcPositionFitScore } from '@/lib/scoring/position-fit';
import { shortPlayerName } from '@/lib/player-name';
import { avatarUrl } from '@/lib/player-id';
import { TournamentReadinessCard } from '@/components/lineup/TournamentReadinessCard';
import type { TournamentLineupResult } from '@/lib/tournaments/tournament-lineup-recommender';
import { POSITION_COLORS } from '@/config/display-constants';

const FORMATIONS = formationsData as Record<string, { name: string; slots: LineupSlot[] }>;

// ── Variant config ────────────────────────────────────────────────────────────

const VARIANT_TABS: {
  mode: OptimizationMode;
  label: string;
  emoji: string;
  hint: string;
  color: string;
  activeClass: string;
}[] = [
  {
    mode: 'balanced',
    label: 'Ausgewogen',
    emoji: '⚖️',
    hint: 'Bestes Gesamtpaket — optimaler Kompromiss aus Angriff und Abwehr.',
    color: 'text-slate-300',
    activeClass: 'bg-slate-700 border-slate-500 text-white',
  },
  {
    mode: 'offensiv',
    label: 'Offensiv',
    emoji: '⚡',
    hint: 'Maximiert Pace, Finishing & Dribbling in Angriff und Mittelfeld.',
    color: 'text-rose-300',
    activeClass: 'bg-rose-900/60 border-rose-600 text-rose-200',
  },
  {
    mode: 'defensiv',
    label: 'Defensiv',
    emoji: '🛡️',
    hint: 'Priorisiert Defending, Physicality & Pace der Abwehrreihe.',
    color: 'text-sky-300',
    activeClass: 'bg-sky-900/60 border-sky-600 text-sky-200',
  },
  {
    mode: 'gegenMeta',
    label: 'Gegen-Meta',
    emoji: '🎯',
    hint: 'Konter-Taktik: hohe Pace + Defensive Recovery gegen Through-Ball-Spieler.',
    color: 'text-amber-300',
    activeClass: 'bg-amber-900/60 border-amber-600 text-amber-200',
  },
];

/** Convert FormationAssignment[] → Record<slotKey, playerId> (same shape as recommendationToLineup) */
function assignmentsToLineup(assignments: FormationAssignment[]): Record<string, string> {
  return Object.fromEntries(assignments.map((a) => [a.slotKey, a.player.id]));
}

// ── Avatar helpers ────────────────────────────────────────────────────────────

function playerImageUrl(player: PlayerWithScores): string | undefined {
  if (player.image_url) return player.image_url;
  return avatarUrl(player.id) || undefined;
}

function MiniAvatar({ player }: { player: PlayerWithScores }) {
  const [error, setError] = useState(false);
  const url = playerImageUrl(player);
  if (error || !url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-hidden="true"
      width={20}
      height={20}
      onError={() => setError(true)}
      className="w-5 h-5 rounded-full object-cover shrink-0"
    />
  );
}

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
  sourceSlotKey,
}: {
  player: PlayerWithScores;
  fit?: number;
  compact?: boolean;
  disabled?: boolean;
  sourceSlotKey?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: sourceSlotKey ? `slot-player:${sourceSlotKey}` : `player-chip:${compact ? 'bench' : 'picker'}:${player.id}`,
    data: { playerId: player.id, sourceSlotKey },
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
      className={`touch-none select-none rounded-lg border border-slate-700 bg-slate-900/70 text-slate-200 hover:bg-slate-800 transition-colors cursor-grab active:cursor-grabbing flex items-center gap-1.5 ${
        compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={player.name}
    >
      <MiniAvatar player={player} />
      <span className="font-medium">{compact ? shortPlayerName(player.name) : player.name}</span>{' '}
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
  const { attributes, listeners, setNodeRef: setDraggableNodeRef, transform, isDragging } = useDraggable({
    id: `slot-player:${slotKey}`,
    data: { playerId: player?.id, sourceSlotKey: slotKey },
    disabled: locked || !player,
  });
  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
    id: `slot:${slotKey}`,
    data: { slotKey },
    disabled: locked,
  });
  const setSlotNodeRef = useCallback((node: HTMLDivElement | null) => {
    setDroppableNodeRef(node);
    setDraggableNodeRef(node);
  }, [setDroppableNodeRef, setDraggableNodeRef]);

  const [imgError, setImgError] = useState(false);
  // Slot-aware fit: recompute with slot.x so side-aware modifiers match the optimizer.
  // Falls back to cached fit_scores for basic/activity players without full stats.
  const fit = player
    ? (player.stats.pac > 0 || player.stats.dri > 0 || player.stats.def > 0
        ? calcPositionFitScore(player, slot.position, slot.x)
        : (player.fit_scores[slot.position] ?? 0))
    : 0;
  const footHint = player ? explainFootFit(player, slot.position, slot.x) : null;
  const avatarUrl = player && !imgError ? playerImageUrl(player) : undefined;
  const dragTransform = transform
    ? `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px))`
    : 'translate(-50%, -50%)';

  return (
    <div
      ref={setSlotNodeRef}
      className="absolute group"
      style={{
        left: `${slot.x}%`,
        top: `${slot.y}%`,
        transform: dragTransform,
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        {...(player && !locked ? listeners : {})}
        {...(player && !locked ? attributes : {})}
        className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 transition-all shadow-lg overflow-hidden touch-none ${player && !locked ? 'cursor-grab active:cursor-grabbing' : ''} ${
          player
            ? `${avatarUrl ? 'bg-slate-900' : (POSITION_COLORS[slot.position] ?? 'bg-slate-600')} ${fitColor(fit)}`
            : 'bg-slate-800/75 border-dashed border-slate-500 text-slate-400'
        } ${selected ? 'scale-110 ring-2 ring-yellow-400' : ''} ${locked ? 'ring-2 ring-amber-400' : ''} ${isOver ? 'scale-110 ring-4 ring-emerald-400/60' : ''}`}
      >
        {/* Player avatar as full background */}
        {avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            aria-hidden="true"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover object-top opacity-80"
          />
        )}
        {player ? (
          <div className="relative text-center leading-tight pointer-events-none z-10 bg-black/30 rounded-full px-0.5">
            <div className="text-[10px] sm:text-[11px] max-w-12 truncate drop-shadow" title={player.name}>{shortPlayerName(player.name)}</div>
            <div className={`text-[9px] font-mono ${fitText(fit)} drop-shadow`}>Meta {fit.toFixed(0)}</div>
            <div className="text-[8px] opacity-75 drop-shadow">OVR {player.overall}</div>
          </div>
        ) : (
          <span className="text-[10px]">{slot.position}</span>
        )}
        {locked && <span className="absolute -top-2 -right-2 text-[10px] z-20">🔒</span>}
        {footHint && <span className="absolute -bottom-2 -right-2 text-[10px] z-20" title={footHint}>🦶</span>}
      </button>
      <div className="mt-1 text-center text-[10px] font-mono text-slate-500">{slot.position}</div>
    </div>
  );
}

export default function LineupPage() {
  const { players, clubName, _hasHydrated } = useSquadStore();
  const { formation, slots, lineup, locked, setFormation, setFormationWithLineup, assignPlayer, toggleLock, autoFill, clearLineup } = useLineupStore();

  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [activeVariant, setActiveVariant] = useState<OptimizationMode>('balanced');
  const [showShareCard, setShowShareCard] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  );
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;

    const intersections = rectIntersection(args);
    if (intersections.length > 0) return intersections;

    return closestCenter(args);
  }, []);

  const formationRecommendations = useMemo(() => recommendFormations(players), [players]);
  const formationNames = useMemo(() => Object.keys(FORMATIONS), []);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  // Scroll to #tactics section when navigated here from meta page with the anchor
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#tactics') {
      // Small delay to let the page render fully before scrolling
      const timer = setTimeout(() => {
        document.getElementById('tactics')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, []);

  // Fix: initialize default formation inside useEffect, not during render.
  // Calling setFormation in the render body caused a race condition where
  // the store update was skipped or triggered an extra re-render loop.
  useEffect(() => {
    if (slots.length === 0) {
      const def = FORMATIONS['4-3-3'] ?? FORMATIONS[formationNames[0]];
      if (def) setFormation(def.name, def.slots as LineupSlot[]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount — formationNames and setFormation are stable refs

  const benchPlayers = useMemo(() => {
    const inLineup = new Set(Object.values(lineup).filter(Boolean) as string[]);
    return players.filter((p) => !inLineup.has(p.id));
  }, [players, lineup]);

  const handleFormationChange = useCallback((name: string) => {
    const f = FORMATIONS[name];
    if (!f) return;
    const fSlots = f.slots as LineupSlot[];
    const assignments: Record<string, string | null> = {};
    const used = new Set<string>();
    fSlots.forEach((s, i) => {
      const key = slotKeyFor(s.position, i);
      const best = players
        .filter((p) => !used.has(p.id))
        .sort((a, b) => (b.fit_scores[s.position] ?? 0) - (a.fit_scores[s.position] ?? 0))[0];
      assignments[key] = best ? best.id : null;
      if (best) used.add(best.id);
    });
    // Atomic: formation + slots + initial lineup in one store update — no setTimeout needed
    setFormationWithLineup(name, fSlots, assignments);
  }, [players, setFormationWithLineup]);

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
    // Use pre-computed variant assignments if available, fall back to balanced
    const assignments = activeVariant === 'balanced'
      ? recommendationToLineup(rec)
      : assignmentsToLineup(rec.variants[activeVariant as 'offensiv' | 'defensiv' | 'gegenMeta']);
    // Atomic: formation + slots + assignments in one store update — no setTimeout needed
    setFormationWithLineup(rec.formation.name, rec.formation.slots as LineupSlot[], assignments);
  }, [formationRecommendations, activeVariant, setFormationWithLineup]);

  /**
   * Applies a tournament lineup recommendation:
   * 1. Asks for confirmation (native browser confirm — keep it simple)
   * 2. Builds a slotKey→playerId map from the recommendation's assignments
   * 3. Sets formation + lineup atomically via setFormationWithLineup
   * 4. Scrolls to the pitch so the user sees the result
   */
  const handleApplyTournamentRecommendation = useCallback(
    (rec: TournamentLineupResult) => {
      if (!window.confirm(`Aktuelle Aufstellung ersetzen durch die Empfehlung für "${rec.tournamentName}"?`)) return;

      // Build slotKey→playerId map — slots in the recommendation use the standard
      // "POSITION-index" key pattern already set by buildAssignments in the recommender.
      const assignments: Record<string, string> = {};
      for (const a of rec.assignments) {
        assignments[a.slotKey] = a.player.id;
      }

      // Atomic: formation + slots + assignments, locks are reset by setFormationWithLineup
      const formation = FORMATIONS[rec.formationKey];
      if (!formation) return;
      setFormationWithLineup(formation.name, formation.slots as LineupSlot[], assignments);

      // Scroll to pitch so the user sees the applied lineup
      setTimeout(() => {
        document.getElementById('pitch')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    },
    [setFormationWithLineup],
  );

  /** Switch variant tab and immediately re-apply to the currently active formation recommendation */
  const handleVariantChange = useCallback((mode: OptimizationMode) => {
    setActiveVariant(mode);
    // Find the recommendation that matches the currently loaded formation
    const rec = formationRecommendations.find((r) => r.formation.name === formation)
      ?? formationRecommendations[0];
    if (!rec) return;
    const assignments = mode === 'balanced'
      ? recommendationToLineup(rec)
      : assignmentsToLineup(rec.variants[mode as 'offensiv' | 'defensiv' | 'gegenMeta']);
    setFormationWithLineup(rec.formation.name, rec.formation.slots as LineupSlot[], assignments);
  }, [formationRecommendations, formation, setFormationWithLineup]);

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
      <div className="page-shell">
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
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActivePlayerId(null)}
    >
      <div className="page-shell">
        <Sidebar />
        <main className="page-main p-4 md:p-6">
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
                <button
                  onClick={() => setShowShareCard(true)}
                  disabled={Object.values(lineup).filter(Boolean).length === 0}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Aufstellung als Bild exportieren"
                >
                  📤 Teilen
                </button>
              </div>
            </div>

            {/* ── Mobile Quick-Nav (nur auf kleinen Screens) ── */}
            <div className="lg:hidden flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
              <a
                href="#meta-center"
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-700 bg-slate-900 text-slate-300 text-xs font-medium hover:border-emerald-600 hover:text-emerald-300 transition-colors"
              >
                🎯 Meta
              </a>
              <a
                href="#tournament"
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-700 bg-slate-900 text-slate-300 text-xs font-medium hover:border-emerald-600 hover:text-emerald-300 transition-colors"
              >
                🏆 Turnier
              </a>
              {Object.values(lineup).filter(Boolean).length >= 3 && (
                <a
                  href="#tactics"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-700 bg-slate-900 text-slate-300 text-xs font-medium hover:border-emerald-600 hover:text-emerald-300 transition-colors"
                >
                  ⚙️ Taktik
                </a>
              )}
            </div>

            {formationRecommendations.length > 0 && (
              <section id="meta-center" className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Formation Optimizer</p>
                    <h3 className="text-lg font-bold text-white">Top-Empfehlungen für deinen Kader</h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* ── Variant toggle (inline, war ein separater Block) ── */}
                    {VARIANT_TABS.map((tab) => {
                      const isActive = activeVariant === tab.mode;
                      return (
                        <button
                          key={tab.mode}
                          onClick={() => handleVariantChange(tab.mode)}
                          title={tab.hint}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                            isActive
                              ? tab.activeClass
                              : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                          }`}
                        >
                          {tab.emoji} {tab.label}
                        </button>
                      );
                    })}
                    <a href={appPath('/meta')} className="text-xs text-emerald-400 underline ml-1">Meta →</a>
                  </div>
                </div>
                {/* Active variant hint */}
                {VARIANT_TABS.find((t) => t.mode === activeVariant) && (
                  <p className={`text-xs ${VARIANT_TABS.find((t) => t.mode === activeVariant)!.color}`}>
                    {VARIANT_TABS.find((t) => t.mode === activeVariant)!.hint}
                  </p>
                )}
                <div className="grid gap-3 md:grid-cols-3">
                  {formationRecommendations.slice(0, 3).map((rec, index) => {
                    const variantAssignments = activeVariant === 'balanced'
                      ? rec.assignments
                      : rec.variants[activeVariant as 'offensiv' | 'defensiv' | 'gegenMeta'];
                    const variantAvgFit = variantAssignments.length
                      ? variantAssignments.reduce((s, a) => s + a.fit, 0) / variantAssignments.length
                      : rec.averageFit;
                    return (
                      <button key={rec.formationKey} onClick={() => handleApplyRecommendation(index)} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-left transition-colors hover:border-emerald-600 hover:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">{rec.formation.name}</span>
                          <span className={`font-mono text-sm ${rec.squadMatch >= 78 ? 'text-emerald-400' : rec.squadMatch >= 68 ? 'text-amber-400' : 'text-red-400'}`}>
                            {rec.squadMatch.toFixed(0)}%
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {rec.formation.playstyle} · Ø Meta{' '}
                          <span className={activeVariant !== 'balanced' ? 'text-white font-semibold' : ''}>
                            {variantAvgFit.toFixed(1)}
                          </span>
                        </p>
                        <p className="mt-2 line-clamp-2 text-xs text-slate-400">{rec.reasons[0]}</p>
                        {rec.warnings[0] && <p className="mt-2 line-clamp-1 text-xs text-amber-300">⚠️ {rec.warnings[0]}</p>}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <div
              id="pitch"
              className="rounded-xl border border-slate-800 bg-slate-900/30 p-3"
            >
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
              const position = pos as Position;
              const currentPlayerId = lineup[selectedSlotKey];
              const currentPlayer = currentPlayerId ? playerById.get(currentPlayerId) : null;
              const isLocked = locked.has(selectedSlotKey);

              // Build sorted alternative list with diff vs current player
              const alternatives = players
                .sort((a, b) => (b.fit_scores[position] ?? 0) - (a.fit_scores[position] ?? 0))
                .slice(0, 12)
                .map((p) => {
                  const fit = p.fit_scores[position] ?? 0;
                  const fitDiff = currentPlayer ? fit - (currentPlayer.fit_scores[position] ?? 0) : 0;
                  const ovrDiff = currentPlayer ? p.overall - currentPlayer.overall : 0;
                  return { player: p, fit, fitDiff, ovrDiff };
                });

              return (
                <div className="rounded-xl border border-yellow-800/60 bg-slate-900/60 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Slot-Alternativen</p>
                      <p className="text-sm font-bold text-white">
                        {position}
                        {currentPlayer && (
                          <span className="ml-2 text-slate-400 font-normal text-xs">
                            aktuell: {currentPlayer.name} · OVR {currentPlayer.overall} · Meta {currentPlayer.fit_scores[position]?.toFixed(0) ?? '-'}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleLock(selectedSlotKey)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${isLocked ? 'bg-amber-600 border-amber-500 text-white' : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-white'}`}
                      >
                        {isLocked ? '🔒 Fixiert' : 'Fixieren'}
                      </button>
                      <button
                        onClick={() => setSelectedSlotKey(null)}
                        className="text-xs text-slate-500 hover:text-white px-2 py-1 rounded border border-slate-700"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {alternatives.map(({ player: p, fit, fitDiff, ovrDiff }) => {
                      const isCurrent = p.id === currentPlayerId;
                      return (
                        <button
                          key={p.id}
                          disabled={isLocked}
                          onClick={() => { handlePlayerAssign(p.id); }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                            isCurrent
                              ? 'border-yellow-600 bg-yellow-950/40 text-white cursor-default'
                              : 'border-slate-700 bg-slate-900/50 hover:border-emerald-600 hover:bg-slate-800 text-slate-300'
                          } ${isLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <MiniAvatar player={p} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{p.name}</p>
                            <p className="text-[10px] text-slate-500">{p.rarity} · OVR {p.overall}</p>
                          </div>
                          <div className="shrink-0 text-right space-y-0.5">
                            <p className={`text-[11px] font-mono font-bold ${fit >= 80 ? 'text-emerald-400' : fit >= 65 ? 'text-amber-400' : 'text-red-400'}`}>
                              {fit.toFixed(0)}
                            </p>
                            {currentPlayer && !isCurrent && (
                              <p className={`text-[10px] font-mono ${fitDiff > 0 ? 'text-emerald-400' : fitDiff < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                                {fitDiff > 0 ? '+' : ''}{fitDiff.toFixed(0)} · OVR{ovrDiff > 0 ? '+' : ''}{ovrDiff}
                              </p>
                            )}
                            {isCurrent && <p className="text-[10px] text-yellow-500">aktiv</p>}
                          </div>
                        </button>
                      );
                    })}
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

            <div id="tournament">
              <TournamentReadinessCard
                slots={slots as LineupSlot[]}
                lineup={lineup}
                players={players}
                slotKeyFor={slotKeyFor}
                onApplyRecommendation={handleApplyTournamentRecommendation}
              />
            </div>

            <div id="tactics" className="pb-6">
              <TacticsPanel slots={slots as LineupSlot[]} lineup={lineup} players={players} benchPlayers={benchPlayers} formationKey={formation} slotKeyFor={slotKeyFor} />
            </div>
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

      {showShareCard && (
        <ShareCard
          clubName={clubName || 'GOALS Squad'}
          formationName={FORMATIONS[formation]?.name ?? formation}
          slots={slots}
          lineup={lineup}
          players={players}
          onClose={() => setShowShareCard(false)}
        />
      )}
    </DndContext>
  );
}
