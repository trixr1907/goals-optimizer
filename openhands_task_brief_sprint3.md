# OpenHands Task-Brief — Sprint 3: GOALS Squad Optimizer — Development Center + Taktik-Empfehlungen + goalsverse-Import

**Projekt:** /workspace/goals-optimizer (bereits vorhanden aus Sprint 1+2)
**Ziel:** Development Center, Taktik-Empfehlungen auf der Lineup-Seite, goalsverse.com Import verbessern
**Stack:** Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + Zustand (alles vorhanden)

**WICHTIG:** Führe KEIN create-next-app aus. Starte mit `npm install` falls node_modules fehlt, dann direkt Features bauen.

---

## Kontext aus Sprint 1+2

Was bereits existiert:
- `src/lib/scraper/types.ts` — Player-Schema: `{ id, name, position, overall, rarity, stats: { pac, sho, pas, dri, def, phy } }`
- `src/lib/scoring/position-fit.ts` — calcPositionFitScore(), enrichPlayerWithScores()
- `src/lib/store/squad-store.ts` — players[], clubName, importPlayers()
- `src/lib/store/lineup-store.ts` — lineup, autoFill(), toggleLock()
- `src/config/position-weights.json` — Gewichtungen für alle 15 Positionen
- `src/config/formations.json` — 8 Formationen mit x/y Koordinaten
- `src/app/lineup/page.tsx` — FERTIGE Lineup-Seite (NICHT anfassen)
- `src/app/squad/page.tsx` — FERTIGE Squad-Übersicht (NICHT anfassen)
- `src/app/page.tsx` — FERTIGE Onboarding-Seite (NICHT anfassen außer API-Route)
- `src/app/development/page.tsx` — Placeholder (ERSETZEN)
- `src/lib/scraper/goalsverse-client.ts` — HTML-Scraper (ERWEITERN)
- `src/lib/scraper/mock-data.ts` — 15 Mock-Spieler (NICHT anfassen)

---

## SCHRITT 1: npm install (falls nötig)

```bash
cd /workspace/goals-optimizer
[ -d node_modules ] || npm install
```

---

## SCHRITT 2: Development Center Seite

**Datei:** `src/app/development/page.tsx` (ERSETZEN)

Das Development Center zeigt für jeden Spieler:
- Aktueller Overall + Rarity Badge
- Fit-Score für seine Hauptposition
- Stats-Radar (pac, sho, pas, dri, def, phy) als horizontale Balken
- "Stärkste Position" — welche Position passt ihm am besten (höchster fit_score)
- "Schwächste Stats" — die 2 Stats mit niedrigstem Wert → Trainingsempfehlung

```typescript
'use client';

import { useMemo, useState } from 'react';
import { useSquadStore } from '@/lib/store/squad-store';
import { PlayerWithScores } from '@/lib/scraper/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const RARITY_COLOR: Record<string, string> = {
  Basic: 'bg-slate-600', Uncommon: 'bg-green-700', Rare: 'bg-blue-700',
  Epic: 'bg-purple-700', Legendary: 'bg-amber-600', Mythic: 'bg-red-700', Iconic: 'bg-cyan-700',
};

const STAT_LABELS: Record<string, string> = {
  pac: 'Pace', sho: 'Shooting', pas: 'Passing',
  dri: 'Dribbling', def: 'Defending', phy: 'Physicality',
};

function StatBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'bg-emerald-500' : value >= 65 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-slate-400 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 99)}%` }} />
      </div>
      <span className="w-6 text-right font-mono text-slate-300">{value}</span>
    </div>
  );
}

function PlayerDevCard({ player }: { player: PlayerWithScores }) {
  const stats = player.stats;
  const statEntries = Object.entries(stats) as [string, number][];

  // Beste Position
  const bestPos = Object.entries(player.fit_scores)
    .sort(([, a], [, b]) => b - a)[0];

  // Schwächste 2 Stats
  const weakest = [...statEntries].sort(([, a], [, b]) => a - b).slice(0, 2);

  // Fit-Score für Hauptposition
  const mainFit = player.fit_scores[player.position] ?? 0;
  const fitColor = mainFit >= 85 ? 'text-emerald-400' : mainFit >= 70 ? 'text-amber-400' : 'text-red-400';

  return (
    <Card className="border-slate-800 bg-slate-900/50">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-white text-sm">{player.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-xs px-1.5 py-0.5 rounded font-bold text-white ${RARITY_COLOR[player.rarity] ?? 'bg-slate-600'}`}>
                {player.overall}
              </span>
              <span className="text-xs text-slate-500">{player.position}</span>
              <span className={`text-xs font-mono font-bold ${fitColor}`}>Fit {mainFit.toFixed(0)}</span>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Beste Pos.</p>
            <p className="font-bold text-emerald-400">{bestPos?.[0]} ({bestPos?.[1].toFixed(0)})</p>
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-1.5">
          {statEntries.map(([key, val]) => (
            <StatBar key={key} label={STAT_LABELS[key] ?? key} value={val} />
          ))}
        </div>

        {/* Trainingsempfehlung */}
        <div className="rounded-lg bg-slate-800/60 p-2 text-xs">
          <p className="text-slate-400 mb-1">Training empfohlen:</p>
          <div className="flex gap-2 flex-wrap">
            {weakest.map(([key, val]) => (
              <span key={key} className="px-2 py-0.5 rounded bg-red-900/50 text-red-300">
                {STAT_LABELS[key] ?? key} ({val})
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DevelopmentPage() {
  const { players } = useSquadStore();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'overall' | 'fit' | 'potential'>('overall');
  const [filterPos, setFilterPos] = useState('all');

  const positions = useMemo(() => {
    const ps = new Set(players.map(p => p.position));
    return ['all', ...Array.from(ps).sort()];
  }, [players]);

  const sorted = useMemo(() => {
    return [...players]
      .filter(p =>
        (filterPos === 'all' || p.position === filterPos) &&
        p.name.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        if (sortBy === 'overall') return b.overall - a.overall;
        if (sortBy === 'fit') {
          const fa = a.fit_scores[a.position] ?? 0;
          const fb = b.fit_scores[b.position] ?? 0;
          return fb - fa;
        }
        // potential: best fit across ALL positions
        const pa = Math.max(...Object.values(a.fit_scores));
        const pb = Math.max(...Object.values(b.fit_scores));
        return pb - pa;
      });
  }, [players, search, sortBy, filterPos]);

  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <p className="text-slate-400">Noch keine Spieler importiert.</p>
        <a href="/" className="text-emerald-400 underline text-sm">Jetzt importieren</a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Development Center</h2>
        <span className="text-sm text-slate-500">{sorted.length} Spieler</span>
      </div>

      {/* Filter-Bar */}
      <div className="flex gap-3">
        <Input
          placeholder="Spieler suchen..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs border-slate-700 bg-slate-800 text-white"
        />
        <Select value={filterPos} onValueChange={setFilterPos}>
          <SelectTrigger className="w-32 border-slate-700 bg-slate-800 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {positions.map(p => (
              <SelectItem key={p} value={p} className="text-white focus:bg-slate-700">
                {p === 'all' ? 'Alle Pos.' : p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-40 border-slate-700 bg-slate-800 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="overall" className="text-white focus:bg-slate-700">Nach OVR</SelectItem>
            <SelectItem value="fit" className="text-white focus:bg-slate-700">Nach Fit-Score</SelectItem>
            <SelectItem value="potential" className="text-white focus:bg-slate-700">Nach Potenzial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map(p => <PlayerDevCard key={p.id} player={p} />)}
      </div>
    </div>
  );
}
```

---

## SCHRITT 3: Taktik-Empfehlungen auf der Lineup-Seite

**Datei:** `src/components/lineup/TacticsPanel.tsx` (NEU)

Zeigt unter der Pitch-View Taktik-Hinweise basierend auf der aktuellen Aufstellung:
- Durchschnittlicher Fit-Score pro Mannschaftsteil (Abwehr, Mittelfeld, Angriff)
- Schwächste besetzter Slot → "Du solltest X verbessern"
- Beste Alternative für den schwächsten Slot aus der Bank

```typescript
'use client';

import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';

const DEF_POSITIONS = new Set<Position>(['GK','CB','LB','RB','LWB','RWB']);
const MID_POSITIONS = new Set<Position>(['CDM','CM','CAM','LM','RM']);
const ATT_POSITIONS = new Set<Position>(['ST','LW','RW','CF']);

interface TacticsPanelProps {
  slots: LineupSlot[];
  lineup: Record<string, string | null>;
  players: PlayerWithScores[];
  benchPlayers: PlayerWithScores[];
  slotKeyFor: (pos: Position, idx: number) => string;
}

export function TacticsPanel({ slots, lineup, players, benchPlayers, slotKeyFor }: TacticsPanelProps) {
  // Besetzte Slots mit Spieler
  const filled = slots
    .map((slot, idx) => {
      const key = slotKeyFor(slot.position, idx);
      const pid = lineup[key];
      const player = pid ? players.find(p => p.id === pid) : null;
      return { slot, key, player };
    })
    .filter(({ player }) => player !== null) as { slot: LineupSlot; key: string; player: PlayerWithScores }[];

  if (filled.length < 3) return null;

  // Ø Fit pro Mannschaftsteil
  function avgFit(group: Set<Position>) {
    const grp = filled.filter(({ slot }) => group.has(slot.position));
    if (!grp.length) return null;
    return grp.reduce((s, { slot, player }) => s + (player.fit_scores[slot.position] ?? 0), 0) / grp.length;
  }

  const defAvg = avgFit(DEF_POSITIONS);
  const midAvg = avgFit(MID_POSITIONS);
  const attAvg = avgFit(ATT_POSITIONS);

  // Schwächster Slot
  const weakest = filled
    .map(({ slot, key, player }) => ({ slot, key, player, fit: player.fit_scores[slot.position] ?? 0 }))
    .sort((a, b) => a.fit - b.fit)[0];

  // Beste Alternative aus Bank für den schwächsten Slot
  const bestAlt = benchPlayers
    .map(p => ({ player: p, fit: p.fit_scores[weakest.slot.position] ?? 0 }))
    .sort((a, b) => b.fit - a.fit)[0];

  function Bar({ value, label }: { value: number | null; label: string }) {
    if (value === null) return null;
    const color = value >= 85 ? 'bg-emerald-500' : value >= 70 ? 'bg-amber-400' : 'bg-red-500';
    const textColor = value >= 85 ? 'text-emerald-400' : value >= 70 ? 'text-amber-400' : 'text-red-400';
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="w-20 text-slate-400 shrink-0">{label}</span>
        <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
        </div>
        <span className={`w-8 text-right font-mono font-bold ${textColor}`}>{value.toFixed(1)}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-4 text-sm">
      <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Taktik-Analyse</p>

      {/* Ø Fit pro Zone */}
      <div className="space-y-2">
        <Bar value={defAvg} label="Abwehr Ø" />
        <Bar value={midAvg} label="Mittelfeld Ø" />
        <Bar value={attAvg} label="Angriff Ø" />
      </div>

      {/* Schwächster Slot + Empfehlung */}
      {weakest && (
        <div className="rounded-lg bg-slate-800/60 p-3 space-y-2">
          <p className="text-slate-400">
            Schwächster Slot:{' '}
            <span className="text-red-400 font-bold">{weakest.slot.position}</span>
            {' '}— {weakest.player.name}{' '}
            <span className="font-mono text-red-400">({weakest.fit.toFixed(0)})</span>
          </p>
          {bestAlt && bestAlt.fit > weakest.fit && (
            <p className="text-slate-400">
              Empfehlung:{' '}
              <span className="text-emerald-400 font-bold">{bestAlt.player.name}</span>
              {' '}wäre besser{' '}
              <span className="font-mono text-emerald-400">(+{(bestAlt.fit - weakest.fit).toFixed(0)} Fit)</span>
            </p>
          )}
          {(!bestAlt || bestAlt.fit <= weakest.fit) && (
            <p className="text-slate-500 text-xs">Kein besserer Spieler auf der Bank verfügbar.</p>
          )}
        </div>
      )}
    </div>
  );
}
```

**Datei:** `src/app/lineup/page.tsx` — TacticsPanel einbinden

Importiere TacticsPanel am Anfang und füge ihn UNTERHALB des Formation-Info-Blocks ein:

```typescript
import { TacticsPanel } from '@/components/lineup/TacticsPanel';
```

Und ganz unten vor dem schließenden `</div>` (nach dem Formation-Info-Block):

```tsx
<TacticsPanel
  slots={currentFormation.slots as LineupSlot[]}
  lineup={lineup}
  players={players}
  benchPlayers={benchPlayers}
  slotKeyFor={slotKeyFor}
/>
```

---

## SCHRITT 4: goalsverse-Import verbessern

**Datei:** `src/app/api/import/route.ts` — Scraper aufrufen + Spieler mit Scores anreichern

Prüfe den aktuellen Inhalt mit `cat /workspace/goals-optimizer/src/app/api/import/route.ts`.

Die Route soll:
1. `clubName` aus dem Body lesen
2. `getClubRoster(clubName)` aus goalsverse-client aufrufen
3. Falls Scraper-Ergebnis leer → Mock-Daten zurückgeben (Fallback)
4. `enrichPlayerWithScores()` für jeden Spieler aufrufen
5. Angereicherte Spieler zurückgeben

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getClubRoster } from '@/lib/scraper/goalsverse-client';
import { enrichPlayerWithScores } from '@/lib/scoring/position-fit';
import { MOCK_PLAYERS } from '@/lib/scraper/mock-data';

export async function POST(req: NextRequest) {
  try {
    const { clubName } = await req.json();
    if (!clubName?.trim()) {
      return NextResponse.json({ error: 'clubName fehlt' }, { status: 400 });
    }

    let players = await getClubRoster(clubName.trim());

    // Fallback auf Mock wenn Scraper nichts liefert
    if (!players.length) {
      players = MOCK_PLAYERS;
    }

    const enriched = players.map(enrichPlayerWithScores);
    return NextResponse.json({ players: enriched, count: enriched.length, source: players === MOCK_PLAYERS ? 'mock' : 'goalsverse' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

---

## SCHRITT 5: Sidebar — development Link Badge

**Datei:** `src/components/layout/Sidebar.tsx`

Füge beim "Entwicklung"-Link ein kleines "Neu"-Badge hinzu damit User es sehen:

Ersetze den bestehenden Link für `/development`:
```tsx
<a ... href="/development">
  <span>📈</span>Entwicklung
  <span className="ml-auto text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">NEU</span>
</a>
```

(Passe den genauen Code an was in Sidebar.tsx steht.)

---

## SCHRITT 6: TypeScript-Check + Build

```bash
cd /workspace/goals-optimizer

# tsc
./node_modules/.bin/tsc --noEmit 2>&1 | head -30
echo "tsc EXIT: $?"

# Build
npm run build 2>&1 | tail -20

# Dev-Server für Curl-Test
pkill -f "next dev" 2>/dev/null; sleep 1
./node_modules/.bin/next dev --port 3001 &
sleep 10

# Seiten testen
curl -s http://localhost:3001/ | grep -o 'GOALS\|Demo-Modus'
curl -s http://localhost:3001/development | grep -o 'Development Center\|Training'
curl -s http://localhost:3001/lineup | grep -o 'Taktik\|Abwehr\|Mittelfeld'
```

---

## Erwartetes Ergebnis Sprint 3

- [ ] `src/app/development/page.tsx` — vollständiges Development Center mit Stats-Bars + Trainingsempfehlungen
- [ ] `src/components/lineup/TacticsPanel.tsx` — Taktik-Analyse mit Ø Fit pro Zone + Empfehlung
- [ ] `src/app/lineup/page.tsx` — TacticsPanel eingebunden
- [ ] `src/app/api/import/route.ts` — Scraper + Fallback + enrichPlayerWithScores
- [ ] Sidebar-Badge für Development-Link
- [ ] TypeScript 0 Fehler
- [ ] `npm run build` erfolgreich

Berichte was gebaut wurde, tsc-Ergebnis und Build-Output.
