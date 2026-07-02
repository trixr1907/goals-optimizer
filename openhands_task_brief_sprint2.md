# OpenHands Task-Brief — Sprint 2: GOALS Squad Optimizer — Formations-Optimizer + Pitch-Visualisierung

**Projekt:** /workspace/goals-optimizer (bereits vorhanden aus Sprint 1)
**Ziel:** Formations-Optimizer mit Pitch-Visualisierung, Spieler-Drag-and-Drop und optimalem Lineup-Algorithmus
**Stack:** Bestehend (Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + Zustand)

**WICHTIG:** Das Projekt existiert bereits unter /workspace/goals-optimizer. Führe KEIN create-next-app aus.
Starte direkt mit den neuen Features. npm install am Ende für neue Dependencies.

---

## Kontext aus Sprint 1

Was bereits existiert (nicht anfassen, nur erweitern):
- `src/lib/scraper/types.ts` — vollständiges Player-Schema mit Position, Stats, Rarity etc.
- `src/lib/scoring/position-fit.ts` — calcPositionFitScore(), enrichPlayerWithScores()
- `src/lib/store/squad-store.ts` — Zustand-Store (players[], clubName, lastImport)
- `src/config/position-weights.json` — Gewichtungen für alle 15 Positionen
- `src/config/formations.json` — 8 Formationen
- `src/app/lineup/page.tsx` — ERSETZEN (aktuell nur Placeholder)
- `src/app/squad/page.tsx` — NICHT anfassen (fertig)
- `src/app/page.tsx` — NICHT anfassen (fertig)

---

## SCHRITT 1: Neue Dependencies installieren

```bash
cd /workspace/goals-optimizer
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

## SCHRITT 2: Lineup-Store erweitern

**Datei:** `src/lib/store/lineup-store.ts` (NEU anlegen)

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { produce } from 'immer';
import { PlayerWithScores, Position } from '@/lib/scraper/types';

export interface LineupSlot {
  position: Position;
  // x/y in Prozent des Pitch (0-100), Ursprung oben-links
  x: number;
  y: number;
  playerId: string | null;
}

export interface Formation {
  id: string;
  name: string;
  slots: LineupSlot[];
}

interface LineupStore {
  selectedFormationId: string;
  lineup: Record<string, string | null>; // position_key -> playerId (position_key = "ST_0", "CB_1" etc.)
  lockedPlayerIds: Set<string>;          // Spieler die manuell fixiert wurden

  setFormation: (formationId: string) => void;
  assignPlayer: (slotKey: string, playerId: string | null) => void;
  toggleLock: (playerId: string) => void;
  clearLineup: () => void;
  autoFill: (players: PlayerWithScores[], formation: Formation) => void;
}

export const useLineupStore = create<LineupStore>()(
  persist(
    (set, get) => ({
      selectedFormationId: '4-3-3',
      lineup: {},
      lockedPlayerIds: new Set(),

      setFormation: (formationId) => set(
        produce((s: LineupStore) => {
          s.selectedFormationId = formationId;
          // Clear non-locked assignments when switching formation
          const locked = s.lockedPlayerIds;
          Object.keys(s.lineup).forEach(key => {
            const pid = s.lineup[key];
            if (pid && !locked.has(pid)) s.lineup[key] = null;
          });
        })
      ),

      assignPlayer: (slotKey, playerId) => set(
        produce((s: LineupStore) => {
          // Remove player from any other slot first
          if (playerId) {
            Object.keys(s.lineup).forEach(k => {
              if (s.lineup[k] === playerId) s.lineup[k] = null;
            });
          }
          s.lineup[slotKey] = playerId;
        })
      ),

      toggleLock: (playerId) => set(
        produce((s: LineupStore) => {
          if (s.lockedPlayerIds.has(playerId)) {
            s.lockedPlayerIds.delete(playerId);
          } else {
            s.lockedPlayerIds.add(playerId);
          }
        })
      ),

      clearLineup: () => set({ lineup: {}, lockedPlayerIds: new Set() }),

      autoFill: (players, formation) => set(
        produce((s: LineupStore) => {
          const locked = s.lockedPlayerIds;
          const usedIds = new Set<string>(
            Object.values(s.lineup).filter((id): id is string => id !== null && locked.has(id))
          );

          // For each slot, find best available player (not locked/used elsewhere)
          formation.slots.forEach((slot, idx) => {
            const key = `${slot.position}_${idx}`;
            if (s.lineup[key] && locked.has(s.lineup[key]!)) return; // Skip locked

            // Score all available players for this slot
            const candidates = players
              .filter(p => !usedIds.has(p.id))
              .map(p => ({
                id: p.id,
                score: p.fit_scores[slot.position] ?? 0,
              }))
              .sort((a, b) => b.score - a.score);

            if (candidates[0]) {
              s.lineup[key] = candidates[0].id;
              usedIds.add(candidates[0].id);
            }
          });
        })
      ),
    }),
    {
      name: 'goals-lineup-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        selectedFormationId: s.selectedFormationId,
        lineup: s.lineup,
        lockedPlayerIds: Array.from(s.lockedPlayerIds), // Set -> Array for serialization
      }),
      merge: (persisted: any, current) => ({
        ...current,
        ...persisted,
        lockedPlayerIds: new Set(persisted.lockedPlayerIds ?? []),
      }),
    }
  )
);
```

---

## SCHRITT 3: Formations-Config erweitern

**Datei:** `src/config/formations.json` (ERSETZEN mit erweiterten Pitch-Koordinaten)

Füge jedem Slot x/y Koordinaten (Prozent, Ursprung oben-links, Tor oben) hinzu.
Format: Position des Spielers auf dem Pitch in %.

```json
[
  {
    "id": "4-3-3",
    "name": "4-3-3",
    "slots": [
      {"position": "GK",  "x": 50, "y": 90},
      {"position": "LB",  "x": 15, "y": 72},
      {"position": "CB",  "x": 35, "y": 75},
      {"position": "CB",  "x": 65, "y": 75},
      {"position": "RB",  "x": 85, "y": 72},
      {"position": "CM",  "x": 25, "y": 52},
      {"position": "CM",  "x": 50, "y": 50},
      {"position": "CM",  "x": 75, "y": 52},
      {"position": "LW",  "x": 15, "y": 28},
      {"position": "ST",  "x": 50, "y": 18},
      {"position": "RW",  "x": 85, "y": 28}
    ],
    "playstyle": "Ausgewogen",
    "strengths": ["Breite Aufstellung", "Solide Defensive"],
    "weaknesses": ["Verwundbar gegen Doppel-6"]
  },
  {
    "id": "4-4-2",
    "name": "4-4-2",
    "slots": [
      {"position": "GK",  "x": 50, "y": 90},
      {"position": "LB",  "x": 15, "y": 72},
      {"position": "CB",  "x": 35, "y": 75},
      {"position": "CB",  "x": 65, "y": 75},
      {"position": "RB",  "x": 85, "y": 72},
      {"position": "LM",  "x": 15, "y": 52},
      {"position": "CM",  "x": 35, "y": 50},
      {"position": "CM",  "x": 65, "y": 50},
      {"position": "RM",  "x": 85, "y": 52},
      {"position": "ST",  "x": 35, "y": 20},
      {"position": "ST",  "x": 65, "y": 20}
    ],
    "playstyle": "Klassisch",
    "strengths": ["Breite Mittelfeldlinie", "Zwei Stürmer"],
    "weaknesses": ["Wenig Kreativität zentral"]
  },
  {
    "id": "4-2-3-1",
    "name": "4-2-3-1",
    "slots": [
      {"position": "GK",  "x": 50, "y": 90},
      {"position": "LB",  "x": 15, "y": 72},
      {"position": "CB",  "x": 35, "y": 75},
      {"position": "CB",  "x": 65, "y": 75},
      {"position": "RB",  "x": 85, "y": 72},
      {"position": "CDM", "x": 35, "y": 58},
      {"position": "CDM", "x": 65, "y": 58},
      {"position": "LW",  "x": 18, "y": 38},
      {"position": "CAM", "x": 50, "y": 38},
      {"position": "RW",  "x": 82, "y": 38},
      {"position": "ST",  "x": 50, "y": 18}
    ],
    "playstyle": "Kontrollierend",
    "strengths": ["Defensiv stabil", "Flexibles Mittelfeld"],
    "weaknesses": ["Abhängig von Sturmspitze"]
  },
  {
    "id": "3-5-2",
    "name": "3-5-2",
    "slots": [
      {"position": "GK",  "x": 50, "y": 90},
      {"position": "CB",  "x": 25, "y": 76},
      {"position": "CB",  "x": 50, "y": 78},
      {"position": "CB",  "x": 75, "y": 76},
      {"position": "LWB", "x": 10, "y": 56},
      {"position": "CM",  "x": 30, "y": 50},
      {"position": "CM",  "x": 50, "y": 48},
      {"position": "CM",  "x": 70, "y": 50},
      {"position": "RWB", "x": 90, "y": 56},
      {"position": "ST",  "x": 35, "y": 20},
      {"position": "ST",  "x": 65, "y": 20}
    ],
    "playstyle": "Offensiv mit Breite",
    "strengths": ["Flügel-Überladung", "Drei Innenverteidiger"],
    "weaknesses": ["Flügel exponiert bei Ballverlust"]
  },
  {
    "id": "3-4-3",
    "name": "3-4-3",
    "slots": [
      {"position": "GK",  "x": 50, "y": 90},
      {"position": "CB",  "x": 25, "y": 76},
      {"position": "CB",  "x": 50, "y": 78},
      {"position": "CB",  "x": 75, "y": 76},
      {"position": "LM",  "x": 15, "y": 54},
      {"position": "CM",  "x": 38, "y": 52},
      {"position": "CM",  "x": 62, "y": 52},
      {"position": "RM",  "x": 85, "y": 54},
      {"position": "LW",  "x": 18, "y": 25},
      {"position": "ST",  "x": 50, "y": 18},
      {"position": "RW",  "x": 82, "y": 25}
    ],
    "playstyle": "Offensiv",
    "strengths": ["Viel Breite", "Hohes Pressing"],
    "weaknesses": ["Defensiv anfällig bei Konter"]
  },
  {
    "id": "5-3-2",
    "name": "5-3-2",
    "slots": [
      {"position": "GK",  "x": 50, "y": 90},
      {"position": "LWB", "x": 8,  "y": 68},
      {"position": "CB",  "x": 27, "y": 76},
      {"position": "CB",  "x": 50, "y": 78},
      {"position": "CB",  "x": 73, "y": 76},
      {"position": "RWB", "x": 92, "y": 68},
      {"position": "CM",  "x": 28, "y": 50},
      {"position": "CM",  "x": 50, "y": 48},
      {"position": "CM",  "x": 72, "y": 50},
      {"position": "ST",  "x": 35, "y": 22},
      {"position": "ST",  "x": 65, "y": 22}
    ],
    "playstyle": "Defensiv",
    "strengths": ["5er-Kette", "Konterspiel"],
    "weaknesses": ["Wenig Breite im Angriff"]
  },
  {
    "id": "4-1-4-1",
    "name": "4-1-4-1",
    "slots": [
      {"position": "GK",  "x": 50, "y": 90},
      {"position": "LB",  "x": 15, "y": 72},
      {"position": "CB",  "x": 35, "y": 75},
      {"position": "CB",  "x": 65, "y": 75},
      {"position": "RB",  "x": 85, "y": 72},
      {"position": "CDM", "x": 50, "y": 60},
      {"position": "LM",  "x": 12, "y": 44},
      {"position": "CM",  "x": 35, "y": 42},
      {"position": "CM",  "x": 65, "y": 42},
      {"position": "RM",  "x": 88, "y": 44},
      {"position": "ST",  "x": 50, "y": 18}
    ],
    "playstyle": "Ausgewogen-Defensiv",
    "strengths": ["Starke 6er-Position", "Breites Mittelfeld"],
    "weaknesses": ["Isolierte Sturmspitze"]
  },
  {
    "id": "4-3-2-1",
    "name": "4-3-2-1 (Weihnachtsbaum)",
    "slots": [
      {"position": "GK",  "x": 50, "y": 90},
      {"position": "LB",  "x": 15, "y": 72},
      {"position": "CB",  "x": 35, "y": 75},
      {"position": "CB",  "x": 65, "y": 75},
      {"position": "RB",  "x": 85, "y": 72},
      {"position": "CM",  "x": 25, "y": 56},
      {"position": "CM",  "x": 50, "y": 54},
      {"position": "CM",  "x": 75, "y": 56},
      {"position": "CAM", "x": 35, "y": 36},
      {"position": "CAM", "x": 65, "y": 36},
      {"position": "ST",  "x": 50, "y": 18}
    ],
    "playstyle": "Kreativ-Offensiv",
    "strengths": ["Zwei Zehner", "Dichte Mitte"],
    "weaknesses": ["Anfällig auf den Flügeln"]
  }
]
```

---

## SCHRITT 4: Pitch-Komponente bauen

**Datei:** `src/components/lineup/PitchView.tsx` (NEU)

Erstelle eine SVG-basierte Pitch-Visualisierung:

```typescript
'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';

// Farben nach Rarity
const RARITY_COLORS: Record<string, string> = {
  Basic: '#64748b',
  Uncommon: '#16a34a',
  Rare: '#2563eb',
  Epic: '#7c3aed',
  Legendary: '#d97706',
  Mythic: '#dc2626',
  Iconic: '#0891b2',
};

// Fit-Score Farbe
function fitColor(score: number): string {
  if (score >= 85) return '#34d399'; // grün
  if (score >= 70) return '#fbbf24'; // gelb
  return '#f87171'; // rot
}

interface PlayerTokenProps {
  player: PlayerWithScores;
  slotKey: string;
  position: Position;
  isLocked: boolean;
  onLockToggle: (id: string) => void;
}

function PlayerToken({ player, slotKey, position, isLocked, onLockToggle }: PlayerTokenProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `token-${slotKey}`,
    data: { playerId: player.id, fromSlot: slotKey },
  });

  const fitScore = player.fit_scores[position] ?? 0;
  const rarityColor = RARITY_COLORS[player.rarity] ?? '#64748b';

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : {};

  return (
    <g
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      opacity={isDragging ? 0.4 : 1}
      cursor="grab"
    >
      {/* Outer ring — rarity color */}
      <circle cx={0} cy={0} r={18} fill={rarityColor} opacity={0.85} />
      {/* Inner circle — dark */}
      <circle cx={0} cy={0} r={15} fill="#1e293b" />
      {/* OVR */}
      <text x={0} y={-3} textAnchor="middle" fontSize={9} fill="white" fontWeight="bold">
        {player.overall}
      </text>
      {/* Abgekürzter Name */}
      <text x={0} y={7} textAnchor="middle" fontSize={6} fill="#94a3b8">
        {player.name.split(' ').pop()?.slice(0, 8) ?? ''}
      </text>
      {/* Fit-Score Badge */}
      <rect x={-14} y={17} width={28} height={10} rx={4} fill={fitColor(fitScore)} opacity={0.9} />
      <text x={0} y={25} textAnchor="middle" fontSize={7} fill="#0f172a" fontWeight="bold">
        {fitScore.toFixed(0)}
      </text>
      {/* Lock-Icon wenn fixiert */}
      {isLocked && (
        <text x={12} y={-10} fontSize={8} fill="#fbbf24">🔒</text>
      )}
    </g>
  );
}

interface EmptySlotProps {
  slotKey: string;
  position: Position;
}

function EmptySlot({ slotKey, position }: EmptySlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id: `slot-${slotKey}` });

  return (
    <g ref={setNodeRef}>
      <circle
        cx={0} cy={0} r={18}
        fill={isOver ? '#1e40af' : '#1e293b'}
        stroke={isOver ? '#3b82f6' : '#475569'}
        strokeWidth={1.5}
        strokeDasharray="4 2"
      />
      <text x={0} y={4} textAnchor="middle" fontSize={8} fill="#64748b" fontWeight="bold">
        {position}
      </text>
    </g>
  );
}

interface PitchViewProps {
  slots: LineupSlot[];
  lineup: Record<string, string | null>;
  players: PlayerWithScores[];
  lockedPlayerIds: Set<string>;
  onLockToggle: (playerId: string) => void;
  slotKeyFor: (position: Position, idx: number) => string;
}

export function PitchView({
  slots,
  lineup,
  players,
  lockedPlayerIds,
  onLockToggle,
  slotKeyFor,
}: PitchViewProps) {
  // Pitch-Dimensionen (viewBox 0 0 100 150 — Hochformat)
  const W = 100;
  const H = 150;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-md mx-auto"
      style={{ background: '#166534', borderRadius: 8 }}
    >
      {/* Pitch-Markierungen */}
      {/* Außenlinien */}
      <rect x={3} y={3} width={94} height={144} rx={2} fill="none" stroke="#15803d" strokeWidth={0.8} />
      {/* Mittellinie */}
      <line x1={3} y1={75} x2={97} y2={75} stroke="#15803d" strokeWidth={0.6} />
      {/* Mittelkreis */}
      <circle cx={50} cy={75} r={12} fill="none" stroke="#15803d" strokeWidth={0.6} />
      {/* Strafraum oben */}
      <rect x={22} y={3} width={56} height={22} fill="none" stroke="#15803d" strokeWidth={0.6} />
      {/* Strafraum unten */}
      <rect x={22} y={125} width={56} height={22} fill="none" stroke="#15803d" strokeWidth={0.6} />
      {/* Tor oben */}
      <rect x={38} y={1} width={24} height={5} fill="none" stroke="#15803d" strokeWidth={0.5} />
      {/* Tor unten */}
      <rect x={38} y={144} width={24} height={5} fill="none" stroke="#15803d" strokeWidth={0.5} />
      {/* Elfmeterpunkt oben */}
      <circle cx={50} cy={16} r={0.8} fill="#15803d" />
      {/* Elfmeterpunkt unten */}
      <circle cx={50} cy={134} r={0.8} fill="#15803d" />

      {/* Spieler-Tokens */}
      {slots.map((slot, idx) => {
        const key = slotKeyFor(slot.position, idx);
        const playerId = lineup[key] ?? null;
        const player = playerId ? players.find(p => p.id === playerId) : null;
        // x/y aus config sind Prozent des Pitch (oben-links Ursprung)
        // Wir mappen: x% * W/100, y% * H/100
        const cx = (slot.x / 100) * W;
        const cy = (slot.y / 100) * H;

        return (
          <g key={key} transform={`translate(${cx}, ${cy})`}>
            {player ? (
              <PlayerToken
                player={player}
                slotKey={key}
                position={slot.position}
                isLocked={lockedPlayerIds.has(player.id)}
                onLockToggle={onLockToggle}
              />
            ) : (
              <EmptySlot slotKey={key} position={slot.position} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
```

---

## SCHRITT 5: Spieler-Bank Komponente

**Datei:** `src/components/lineup/PlayerBench.tsx` (NEU)

Listet alle Spieler die NICHT in der Aufstellung sind.
Drag-Quelle für die Pitch-View.

```typescript
'use client';

import { useDraggable } from '@dnd-kit/core';
import { PlayerWithScores, Position } from '@/lib/scraper/types';

const RARITY_BADGE: Record<string, string> = {
  Basic: 'bg-slate-600',
  Uncommon: 'bg-green-700',
  Rare: 'bg-blue-700',
  Epic: 'bg-purple-700',
  Legendary: 'bg-amber-600',
  Mythic: 'bg-red-700',
  Iconic: 'bg-cyan-700',
};

function BenchPlayer({ player, targetPosition }: { player: PlayerWithScores; targetPosition?: Position }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `bench-${player.id}`,
    data: { playerId: player.id, fromBench: true },
  });

  const fitScore = targetPosition ? (player.fit_scores[targetPosition] ?? 0) : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 rounded-lg p-2 cursor-grab select-none transition-opacity
        ${isDragging ? 'opacity-30' : 'hover:bg-slate-800/60'}`}
    >
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${RARITY_BADGE[player.rarity] ?? 'bg-slate-600'} text-white`}>
        {player.overall}
      </span>
      <span className="text-sm text-white flex-1 truncate">{player.name}</span>
      <span className="text-xs text-slate-500">{player.position}</span>
      {fitScore !== null && (
        <span className={`text-xs font-mono font-bold ${
          fitScore >= 85 ? 'text-emerald-400' : fitScore >= 70 ? 'text-amber-400' : 'text-red-400'
        }`}>
          {fitScore.toFixed(0)}
        </span>
      )}
    </div>
  );
}

interface PlayerBenchProps {
  benchPlayers: PlayerWithScores[];
  hoveredPosition?: Position;
}

export function PlayerBench({ benchPlayers, hoveredPosition }: PlayerBenchProps) {
  const sorted = [...benchPlayers].sort((a, b) => {
    if (hoveredPosition) {
      return (b.fit_scores[hoveredPosition] ?? 0) - (a.fit_scores[hoveredPosition] ?? 0);
    }
    return b.overall - a.overall;
  });

  return (
    <div className="flex flex-col gap-0.5 max-h-[600px] overflow-y-auto pr-1">
      {sorted.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-4">Alle Spieler in Aufstellung</p>
      )}
      {sorted.map(p => (
        <BenchPlayer key={p.id} player={p} targetPosition={hoveredPosition} />
      ))}
    </div>
  );
}
```

---

## SCHRITT 6: Lineup-Score Komponente

**Datei:** `src/components/lineup/LineupScore.tsx` (NEU)

Zeigt den Gesamt-Score der aktuellen Aufstellung:

```typescript
'use client';

import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';

interface LineupScoreProps {
  slots: LineupSlot[];
  lineup: Record<string, string | null>;
  players: PlayerWithScores[];
  slotKeyFor: (pos: Position, idx: number) => string;
}

export function LineupScore({ slots, lineup, players, slotKeyFor }: LineupScoreProps) {
  const filled = slots
    .map((slot, idx) => {
      const key = slotKeyFor(slot.position, idx);
      const pid = lineup[key];
      const player = pid ? players.find(p => p.id === pid) : null;
      return { slot, player };
    })
    .filter(({ player }) => player !== null);

  if (filled.length === 0) return null;

  const totalFit = filled.reduce((sum, { slot, player }) =>
    sum + (player!.fit_scores[slot.position] ?? 0), 0
  );
  const avgFit = totalFit / filled.length;
  const avgOvr = filled.reduce((s, { player }) => s + player!.overall, 0) / filled.length;

  const color = avgFit >= 85 ? 'text-emerald-400' : avgFit >= 70 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="flex gap-6 items-center justify-center py-3 border-b border-slate-800">
      <div className="text-center">
        <p className="text-xs text-slate-500 uppercase tracking-wide">Ø OVR</p>
        <p className="text-2xl font-bold text-white">{avgOvr.toFixed(1)}</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-slate-500 uppercase tracking-wide">Ø Fit</p>
        <p className={`text-2xl font-bold ${color}`}>{avgFit.toFixed(1)}</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-slate-500 uppercase tracking-wide">Besetzt</p>
        <p className="text-2xl font-bold text-white">{filled.length}/11</p>
      </div>
    </div>
  );
}
```

---

## SCHRITT 7: Lineup-Seite komplett ersetzen

**Datei:** `src/app/lineup/page.tsx` (ERSETZEN)

```typescript
'use client';

import { useState, useCallback, useMemo } from 'react';
import { DndContext, DragEndEvent, DragOverEvent, closestCenter } from '@dnd-kit/core';
import { useSquadStore } from '@/lib/store/squad-store';
import { useLineupStore } from '@/lib/store/lineup-store';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PitchView } from '@/components/lineup/PitchView';
import { PlayerBench } from '@/components/lineup/PlayerBench';
import { LineupScore } from '@/components/lineup/LineupScore';
import formations from '@/config/formations.json';
import type { LineupSlot } from '@/lib/store/lineup-store';
import type { Position } from '@/lib/scraper/types';

// Slot-Key Helper: position_index
const slotKeyFor = (position: Position, idx: number) => `${position}_${idx}`;

export default function LineupPage() {
  const { players } = useSquadStore();
  const {
    selectedFormationId,
    lineup,
    lockedPlayerIds,
    setFormation,
    assignPlayer,
    toggleLock,
    clearLineup,
    autoFill,
  } = useLineupStore();

  const [hoveredPosition, setHoveredPosition] = useState<Position | undefined>();

  const currentFormation = useMemo(
    () => formations.find(f => f.id === selectedFormationId) ?? formations[0],
    [selectedFormationId]
  );

  // IDs aller in der Aufstellung stehenden Spieler
  const lineupPlayerIds = useMemo(
    () => new Set(Object.values(lineup).filter((id): id is string => id !== null)),
    [lineup]
  );

  const benchPlayers = useMemo(
    () => players.filter(p => !lineupPlayerIds.has(p.id)),
    [players, lineupPlayerIds]
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const playerId: string = active.data.current?.playerId;
    const targetSlotKey = (over.id as string).replace('slot-', '');

    if (playerId && targetSlotKey) {
      assignPlayer(targetSlotKey, playerId);
    }
  }, [assignPlayer]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    if (event.over) {
      const slotKey = (event.over.id as string).replace('slot-', '');
      const pos = slotKey.split('_')[0] as Position;
      setHoveredPosition(pos);
    } else {
      setHoveredPosition(undefined);
    }
  }, []);

  const handleAutoFill = useCallback(() => {
    autoFill(players, {
      id: currentFormation.id,
      name: currentFormation.name,
      slots: currentFormation.slots as LineupSlot[],
    });
  }, [players, currentFormation, autoFill]);

  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <p className="text-slate-400">Noch keine Spieler importiert.</p>
        <Button variant="outline" asChild>
          <a href="/">Jetzt importieren</a>
        </Button>
      </div>
    );
  }

  return (
    <DndContext
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      collisionDetection={closestCenter}
    >
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Optimale Aufstellung</h2>
          <div className="flex gap-2">
            <Select value={selectedFormationId} onValueChange={setFormation}>
              <SelectTrigger className="w-44 border-slate-700 bg-slate-800 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {formations.map(f => (
                  <SelectItem key={f.id} value={f.id} className="text-white focus:bg-slate-700">
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAutoFill} className="bg-emerald-600 hover:bg-emerald-700">
              Auto-Fill
            </Button>
            <Button variant="outline" onClick={clearLineup} className="border-slate-700 text-slate-300">
              Leeren
            </Button>
          </div>
        </div>

        {/* Score-Bar */}
        <LineupScore
          slots={currentFormation.slots as LineupSlot[]}
          lineup={lineup}
          players={players}
          slotKeyFor={slotKeyFor}
        />

        {/* Haupt-Layout: Pitch + Bank */}
        <div className="grid grid-cols-[1fr_280px] gap-6">
          {/* Pitch */}
          <div className="rounded-xl overflow-hidden border border-slate-800">
            <PitchView
              slots={currentFormation.slots as LineupSlot[]}
              lineup={lineup}
              players={players}
              lockedPlayerIds={lockedPlayerIds}
              onLockToggle={toggleLock}
              slotKeyFor={slotKeyFor}
            />
          </div>

          {/* Bank */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 flex flex-col gap-2">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
              Bank ({benchPlayers.length})
              {hoveredPosition && <span className="ml-2 text-emerald-400">↓ Fit für {hoveredPosition}</span>}
            </p>
            <PlayerBench benchPlayers={benchPlayers} hoveredPosition={hoveredPosition} />
          </div>
        </div>

        {/* Formation-Info */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500 mb-1">Stärken</p>
            <ul className="space-y-1">
              {currentFormation.strengths?.map((s, i) => (
                <li key={i} className="text-emerald-400">✓ {s}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Schwächen</p>
            <ul className="space-y-1">
              {currentFormation.weaknesses?.map((w, i) => (
                <li key={i} className="text-red-400">✗ {w}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </DndContext>
  );
}
```

---

## SCHRITT 8: Mock-Daten für Lineup-Test

Die `src/lib/scraper/mock-data.ts` sollte bereits aus Sprint 1 existieren.
Falls sie leer ist, füge 15 Spieler mit vollständigen Stats hinzu damit Lineup-Test funktioniert.
Prüfe mit `cat /workspace/goals-optimizer/src/lib/scraper/mock-data.ts` und erweitere wenn nötig.

Spieler sollen echte Stats haben (zufällige Werte 50-90), alle 15 Positionen abdecken,
und verschiedene Rarities (Basic, Uncommon, Rare, Epic, Legendary).

Falls mock-data bereits 11+ Spieler hat: lass sie so.

---

## SCHRITT 9: Onboarding-Seite — Mock-Import Button

**Datei:** `src/app/page.tsx` — Erweitere um einen "Demo-Modus" Button

Suche in page.tsx den Import-Bereich und füge UNTERHALB des "Spieler importieren" Buttons einen zweiten Button ein:

```tsx
<Button
  variant="outline"
  className="border-slate-600 text-slate-400 hover:text-white w-full mt-2"
  onClick={() => {
    // Import mock data for demo
    fetch('/api/import/demo', { method: 'POST' })
      .then(r => r.json())
      .then(d => { importPlayers(d.players); router.push('/squad'); })
      .catch(() => setError('Demo-Import fehlgeschlagen'));
  }}
>
  Demo-Modus (15 Beispiel-Spieler)
</Button>
```

**Datei:** `src/app/api/import/demo/route.ts` (NEU)

```typescript
import { NextResponse } from 'next/server';
import { MOCK_PLAYERS } from '@/lib/scraper/mock-data';

export async function POST() {
  return NextResponse.json({ players: MOCK_PLAYERS, count: MOCK_PLAYERS.length });
}
```

---

## SCHRITT 10: TypeScript-Verifikation + Build

```bash
cd /workspace/goals-optimizer

# TypeScript-Check
npx tsc --noEmit 2>&1 | head -30

# Dev-Server testen (falls noch nicht läuft)
pkill -f "next dev" 2>/dev/null || true
sleep 2
npm run dev -- --port 3001 &
sleep 8

# Alle Seiten prüfen
curl -s http://localhost:3001/ | grep -o 'GOALS Squad Optimizer'
curl -s http://localhost:3001/lineup | grep -o 'Optimale Aufstellung\|Auto-Fill'
curl -s http://localhost:3001/squad | grep -o 'Squad\|Keine Spieler'

# Build-Check (optional, kann Warnungen haben)
npm run build 2>&1 | tail -10
```

---

## Erwartetes Ergebnis Sprint 2

- [ ] `src/lib/store/lineup-store.ts` mit autoFill-Algorithmus
- [ ] `src/config/formations.json` mit x/y Koordinaten für alle 8 Formationen
- [ ] `src/components/lineup/PitchView.tsx` — SVG Pitch mit Spieler-Tokens
- [ ] `src/components/lineup/PlayerBench.tsx` — Drag-Quelle
- [ ] `src/components/lineup/LineupScore.tsx` — Ø OVR + Ø Fit Anzeige
- [ ] `src/app/lineup/page.tsx` — vollständige Lineup-Seite mit DnD
- [ ] `src/app/api/import/demo/route.ts` — Demo-Route
- [ ] Demo-Button auf Onboarding-Seite
- [ ] TypeScript 0 Fehler
- [ ] Dev-Server auf Port 3001 läuft, /lineup zeigt Pitch und Bank

Berichte: Was wurde gebaut, was hat funktioniert, was nicht, und welche tsc-Fehler blieben (falls welche).
