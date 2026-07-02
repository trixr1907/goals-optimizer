# OpenHands Task-Brief — Sprint 1: GOALS Squad Optimizer — Projektaufbau & Phase 1-3

**Projekt:** /workspace/goals-optimizer
**Ziel:** Lauffähiges Next.js-Grundgerüst mit Datenerfassung (goalsverse.com), Stat-Datenbank und Scoring-Modell
**Stack:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui

**Kein Redesign, kein eigenes Design-Urteil** — nur genau das was in diesem Brief steht.
Schreibe sauberen, kommentierten Code auf Englisch, UI-Text auf Deutsch.

---

## Kontext: Das Spiel "GOALS"

GOALS ist ein Free-to-Play-Fußball-Videospiel (Release Juni 2026). Jeder Spieler ist fiktiv
und einzigartig (keine lizenzierten Real-Spieler). Spieler altern durch Spielzeit, nicht Echtzeit.
Ziel des Tools: Spielern helfen die optimale Aufstellung aus ihrem Inventar zu finden.

---

## SCHRITT 1: Next.js Projekt aufsetzen

```bash
cd /workspace
npx create-next-app@latest goals-optimizer \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-git
cd goals-optimizer
```

shadcn/ui initialisieren:
```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input label table tabs badge select separator progress
```

Weitere Dependencies:
```bash
npm install recharts axios cheerio playwright-core @playwright/browser-chromium zustand immer
npm install -D @types/cheerio
```

---

## SCHRITT 2: Verzeichnisstruktur anlegen

```
src/
  app/
    page.tsx              # Onboarding / Club-Import
    squad/page.tsx        # Squad Overview (Tabelle)
    lineup/page.tsx       # Optimal Lineup
    development/page.tsx  # Development Center
    layout.tsx
  components/
    onboarding/
      OnboardingCard.tsx
      RotationPlanGenerator.tsx
    squad/
      PlayerTable.tsx
    layout/
      Sidebar.tsx
      Header.tsx
  lib/
    scraper/
      goalsverse-client.ts  # API-Client für goalsverse.com
      types.ts              # Alle TypeScript-Typen
      schema.ts             # Spieler-Datenschema
    scoring/
      weights.ts            # Gewichtungslogik
      position-fit.ts       # Position Fit Score Berechnung
    store/
      squad-store.ts        # Zustand-Store für den Kader
  config/
    position-weights.json   # Externalisierte Gewichtungen
    formations.json         # Formations-Datenbank
    stats-reference.json    # Stat-Wissensdatenbank
```

---

## SCHRITT 3: TypeScript-Schema definieren

**Datei:** `src/lib/scraper/types.ts`

```typescript
// Player card data schema — matches goalsverse.com structure
export type Position =
  | 'ST' | 'CF' | 'LW' | 'RW' | 'LM' | 'RM'
  | 'CAM' | 'CM' | 'CDM'
  | 'LB' | 'RB' | 'LWB' | 'RWB' | 'CB' | 'GK';

export type Rarity =
  | 'Basic' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic' | 'Iconic';

export type PreferredFoot = 'Left' | 'Right';

export interface OutfieldStats {
  acceleration: number | null;
  sprint_speed: number | null;
  attacking_iq: number | null;
  finishing: number | null;
  shot_power: number | null;
  long_shots: number | null;
  penalties: number | null;
  weak_foot: number | null;
  ground_pass: number | null;
  lofted_pass: number | null;
  through_pass: number | null;
  crossing: number | null;
  curve: number | null;
  free_kick_accuracy: number | null;
  sprint_dribbling: number | null;
  close_dribbling: number | null;
  first_touch: number | null;
  skills: number | null;
  agility: number | null;
  balance: number | null;
  defensive_iq: number | null;
  stand_tackle: number | null;
  slide_tackle: number | null;
  jockeying: number | null;
  interceptions: number | null;
  blocking: number | null;
  strength: number | null;
  aggression: number | null;
  stamina: number | null;
  heading: number | null;
  jumping: number | null;
}

export interface GoalkeeperStats {
  diving: number | null;
  catching: number | null;
  parrying: number | null;
  reflexes: number | null;
  positioning: number | null;
  command_of_area: number | null;  // Possibly not yet active in game
  rushing: number | null;          // Possibly not yet active in game
  penalty_saving: number | null;
  kicking_power: number | null;
  acceleration: number | null;
  sprint_speed: number | null;
  strength: number | null;
  jumping: number | null;
  ground_pass: number | null;
  lofted_pass: number | null;
  through_pass: number | null;
  weak_foot: number | null;
}

export interface PlayerMeta {
  is_in_active_squad: boolean;
  is_favorite: boolean;
  imported_at: string;    // ISO-8601
  last_updated: string;   // ISO-8601
  data_source: 'goalsverse' | 'manual' | 'ocr';
  data_complete: boolean;
  missing_fields: string[];
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  age: number | null;
  overall: number;
  potential_overall: number | null;
  rarity: Rarity;
  training_value: number | null;     // 1-8
  preferred_foot: PreferredFoot | null;
  height_cm: number | null;
  weight_kg: number | null;
  xp_current: number | null;
  xp_next_upgrade: number | null;
  upgrade_count: number | null;
  stats_outfield: OutfieldStats | null;
  stats_goalkeeper: GoalkeeperStats | null;
  meta: PlayerMeta;
}

// Position fit scores — calculated per player
export interface PlayerWithScores extends Player {
  fit_scores: Record<Position, number>;
  best_position: Position;
  second_best_position: Position;
  dev_score: number | null;
}
```

---

## SCHRITT 4: Gewichtungs-Config anlegen

**Datei:** `src/config/position-weights.json`

Erstelle eine JSON-Datei mit den Gewichtungen für alle Positionen.
Die Gewichtungen stammen aus diesem Brief — EXAKT so übernehmen:

```json
{
  "ST": {
    "finishing": 2.0,
    "sprint_speed": 1.8,
    "acceleration": 1.8,
    "attacking_iq": 1.7,
    "shot_power": 1.5,
    "heading": 1.3,
    "jumping": 1.2,
    "weak_foot": 1.5,
    "curve": 1.0,
    "long_shots": 0.8,
    "agility": 1.0,
    "balance": 0.8,
    "strength": 0.8,
    "sprint_dribbling": 1.2,
    "close_dribbling": 0.7,
    "skills": 0.6,
    "ground_pass": 0.4,
    "through_pass": 0.3,
    "stamina": 0.6,
    "defensive_iq": 0.1,
    "stand_tackle": 0.0,
    "slide_tackle": 0.0,
    "interceptions": 0.0,
    "blocking": 0.0
  },
  "CF": {
    "finishing": 2.0,
    "sprint_speed": 1.7,
    "acceleration": 1.7,
    "attacking_iq": 1.9,
    "shot_power": 1.4,
    "heading": 1.1,
    "jumping": 1.1,
    "weak_foot": 1.4,
    "curve": 1.1,
    "long_shots": 1.0,
    "agility": 1.1,
    "balance": 0.9,
    "strength": 0.7,
    "sprint_dribbling": 1.2,
    "close_dribbling": 1.0,
    "skills": 0.8,
    "ground_pass": 0.6,
    "through_pass": 0.8,
    "stamina": 0.6,
    "defensive_iq": 0.2,
    "stand_tackle": 0.0,
    "slide_tackle": 0.0,
    "interceptions": 0.0,
    "blocking": 0.0
  },
  "LW": {
    "sprint_speed": 2.0,
    "acceleration": 2.0,
    "sprint_dribbling": 1.8,
    "crossing": 1.7,
    "agility": 1.5,
    "finishing": 1.3,
    "curve": 1.3,
    "skills": 1.2,
    "through_pass": 1.0,
    "close_dribbling": 1.0,
    "weak_foot": 1.2,
    "balance": 0.8,
    "stamina": 1.0,
    "shot_power": 0.7,
    "long_shots": 0.6,
    "ground_pass": 0.5,
    "attacking_iq": 1.0,
    "heading": 0.3,
    "defensive_iq": 0.3,
    "strength": 0.3
  },
  "RW": {
    "sprint_speed": 2.0,
    "acceleration": 2.0,
    "sprint_dribbling": 1.8,
    "crossing": 1.7,
    "agility": 1.5,
    "finishing": 1.3,
    "curve": 1.3,
    "skills": 1.2,
    "through_pass": 1.0,
    "close_dribbling": 1.0,
    "weak_foot": 1.2,
    "balance": 0.8,
    "stamina": 1.0,
    "shot_power": 0.7,
    "long_shots": 0.6,
    "ground_pass": 0.5,
    "attacking_iq": 1.0,
    "heading": 0.3,
    "defensive_iq": 0.3,
    "strength": 0.3
  },
  "LM": {
    "sprint_speed": 1.9,
    "acceleration": 1.9,
    "sprint_dribbling": 1.6,
    "crossing": 1.8,
    "agility": 1.4,
    "stamina": 1.4,
    "ground_pass": 1.2,
    "through_pass": 1.1,
    "finishing": 0.9,
    "curve": 1.0,
    "skills": 0.9,
    "close_dribbling": 0.9,
    "weak_foot": 1.1,
    "balance": 0.8,
    "defensive_iq": 0.6,
    "interceptions": 0.6,
    "attacking_iq": 1.0,
    "heading": 0.3,
    "strength": 0.4
  },
  "RM": {
    "sprint_speed": 1.9,
    "acceleration": 1.9,
    "sprint_dribbling": 1.6,
    "crossing": 1.8,
    "agility": 1.4,
    "stamina": 1.4,
    "ground_pass": 1.2,
    "through_pass": 1.1,
    "finishing": 0.9,
    "curve": 1.0,
    "skills": 0.9,
    "close_dribbling": 0.9,
    "weak_foot": 1.1,
    "balance": 0.8,
    "defensive_iq": 0.6,
    "interceptions": 0.6,
    "attacking_iq": 1.0,
    "heading": 0.3,
    "strength": 0.4
  },
  "CAM": {
    "ground_pass": 1.8,
    "through_pass": 1.9,
    "attacking_iq": 2.1,
    "finishing": 1.5,
    "long_shots": 1.4,
    "stamina": 1.6,
    "defensive_iq": 0.5,
    "interceptions": 0.7,
    "stand_tackle": 0.6,
    "lofted_pass": 1.3,
    "balance": 1.2,
    "strength": 0.8,
    "agility": 1.1,
    "sprint_speed": 0.9,
    "acceleration": 0.9,
    "jockeying": 0.7,
    "blocking": 0.5,
    "shot_power": 0.8,
    "heading": 0.5,
    "close_dribbling": 0.9,
    "skills": 0.7
  },
  "CM": {
    "ground_pass": 1.8,
    "through_pass": 1.7,
    "defensive_iq": 1.6,
    "stamina": 1.8,
    "attacking_iq": 1.5,
    "interceptions": 1.4,
    "stand_tackle": 1.3,
    "lofted_pass": 1.2,
    "balance": 1.2,
    "strength": 1.0,
    "agility": 1.0,
    "sprint_speed": 0.9,
    "acceleration": 0.9,
    "jockeying": 1.0,
    "blocking": 0.8,
    "long_shots": 0.7,
    "shot_power": 0.5,
    "heading": 0.5,
    "close_dribbling": 0.6,
    "skills": 0.4,
    "finishing": 0.3
  },
  "CDM": {
    "defensive_iq": 2.1,
    "stand_tackle": 1.7,
    "interceptions": 1.8,
    "stamina": 1.8,
    "ground_pass": 1.6,
    "through_pass": 1.1,
    "attacking_iq": 1.0,
    "blocking": 1.2,
    "jockeying": 1.3,
    "strength": 1.2,
    "balance": 1.1,
    "agility": 0.9,
    "sprint_speed": 1.0,
    "acceleration": 0.9,
    "slide_tackle": 1.2,
    "lofted_pass": 0.8,
    "long_shots": 0.4,
    "shot_power": 0.3,
    "heading": 0.7,
    "finishing": 0.1,
    "skills": 0.2
  },
  "LB": {
    "sprint_speed": 2.0,
    "acceleration": 1.8,
    "defensive_iq": 1.6,
    "stamina": 1.8,
    "crossing": 1.5,
    "stand_tackle": 1.3,
    "jockeying": 1.2,
    "ground_pass": 1.0,
    "through_pass": 0.9,
    "interceptions": 1.2,
    "slide_tackle": 1.0,
    "agility": 1.0,
    "balance": 0.8,
    "strength": 0.7,
    "sprint_dribbling": 0.6,
    "attacking_iq": 0.5,
    "heading": 0.4,
    "lofted_pass": 0.6,
    "finishing": 0.1
  },
  "RB": {
    "sprint_speed": 2.0,
    "acceleration": 1.8,
    "defensive_iq": 1.6,
    "stamina": 1.8,
    "crossing": 1.5,
    "stand_tackle": 1.3,
    "jockeying": 1.2,
    "ground_pass": 1.0,
    "through_pass": 0.9,
    "interceptions": 1.2,
    "slide_tackle": 1.0,
    "agility": 1.0,
    "balance": 0.8,
    "strength": 0.7,
    "sprint_dribbling": 0.6,
    "attacking_iq": 0.5,
    "heading": 0.4,
    "lofted_pass": 0.6,
    "finishing": 0.1
  },
  "LWB": {
    "sprint_speed": 2.0,
    "acceleration": 1.9,
    "stamina": 1.9,
    "crossing": 1.7,
    "defensive_iq": 1.4,
    "sprint_dribbling": 1.2,
    "stand_tackle": 1.2,
    "agility": 1.2,
    "jockeying": 1.0,
    "interceptions": 1.1,
    "ground_pass": 0.9,
    "balance": 0.8,
    "slide_tackle": 0.9,
    "attacking_iq": 0.7,
    "heading": 0.4,
    "finishing": 0.2
  },
  "RWB": {
    "sprint_speed": 2.0,
    "acceleration": 1.9,
    "stamina": 1.9,
    "crossing": 1.7,
    "defensive_iq": 1.4,
    "sprint_dribbling": 1.2,
    "stand_tackle": 1.2,
    "agility": 1.2,
    "jockeying": 1.0,
    "interceptions": 1.1,
    "ground_pass": 0.9,
    "balance": 0.8,
    "slide_tackle": 0.9,
    "attacking_iq": 0.7,
    "heading": 0.4,
    "finishing": 0.2
  },
  "CB": {
    "defensive_iq": 2.0,
    "stand_tackle": 1.8,
    "slide_tackle": 1.5,
    "interceptions": 1.7,
    "sprint_speed": 1.5,
    "strength": 1.5,
    "heading": 1.4,
    "jumping": 1.4,
    "blocking": 1.3,
    "acceleration": 1.2,
    "aggression": 1.0,
    "balance": 1.0,
    "jockeying": 1.2,
    "stamina": 0.8,
    "ground_pass": 0.6,
    "lofted_pass": 0.5,
    "through_pass": 0.3,
    "agility": 0.5,
    "attacking_iq": 0.1,
    "finishing": 0.0,
    "skills": 0.0,
    "crossing": 0.0
  },
  "GK": {
    "reflexes": 2.0,
    "diving": 1.8,
    "positioning": 1.8,
    "catching": 1.5,
    "jumping": 1.3,
    "parrying": 1.2,
    "penalty_saving": 0.8,
    "kicking_power": 0.6,
    "ground_pass": 0.4,
    "lofted_pass": 0.4,
    "sprint_speed": 0.3,
    "acceleration": 0.3,
    "strength": 0.3
  }
}
```

---

## SCHRITT 5: Stat-Referenz-Datenbank anlegen

**Datei:** `src/config/stats-reference.json`

Erstelle die vollständige Stat-Wissensdatenbank basierend auf playgoals.com.
Mindestens diese Stats (Outfield + GK) mit category, applies_to, description, mechanic:

Outfield Stats und ihre Kategorien:
- Pace: acceleration, sprint_speed
- Shooting: finishing, shot_power, long_shots, penalties, weak_foot
- Passing: ground_pass, lofted_pass, through_pass, crossing, curve, free_kick_accuracy
- Dribbling: sprint_dribbling, close_dribbling, first_touch, skills, agility, balance
- Defending: defensive_iq, stand_tackle, slide_tackle, jockeying, interceptions, blocking
- Physical: strength, aggression, stamina, heading, jumping

GK Stats: diving, catching, parrying, reflexes, positioning, command_of_area,
rushing, penalty_saving, kicking_power (+ shared: acceleration, sprint_speed, strength, jumping, ground_pass, lofted_pass, through_pass, weak_foot)

Wichtige Mechanik-Details zu diesen Stats (aus der Spiel-Dokumentation):
- weak_foot: Multiplikator (nicht additiv!) auf Schuss- und Pass-Stats beim schwachen Fuss
- defensive_iq: Gilt nur wenn Spieler NICHT vom User gesteuert wird (KI-Positionierung)
- ground_pass: Relevant NUR unter Gegnerdruck (ohne Druck: alle gleich schnell)
- jumping: Aerial Reach = Spieler-Groesse (cm) + jumping
- aggression: Steuert Second-Man-Press (Varianz 0.5 bis 2.0 Sekunden)
- GK diving: Groesserer Keeper = mehr Reach (height beeinflusst diving-Reichweite)

---

## SCHRITT 6: Formations-Datenbank anlegen

**Datei:** `src/config/formations.json`

Erstelle Formationen — mindestens diese 8 wichtigsten:
4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 3-4-3, 5-3-2, 4-1-4-1, 4-3-2-1

Format pro Formation:
```json
{
  "id": "4-3-3",
  "name": "4-3-3",
  "positions": ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CM", "LW", "ST", "RW"],
  "playstyle": "Ausgewogen",
  "strengths": ["Breite Aufstellung", "Solide Defensive", "Direktes Spiel"],
  "weaknesses": ["Verwundbar gegen Viererkette im Mittelfeld"],
  "winrate_meta": null,
  "usage_rate": null
}
```
Winrate und Usage werden spaeter von goalsverse.com befuellt.

---

## SCHRITT 7: Position Fit Score Berechnung implementieren

**Datei:** `src/lib/scoring/position-fit.ts`

```typescript
import positionWeights from '@/config/position-weights.json';
import { Player, Position, PlayerWithScores } from '@/lib/scraper/types';

// Max theoretical stat value for normalization
const MAX_STAT = 99;

/**
 * Calculate contextual weight modifiers based on player attributes.
 * For example: tall strikers get bonus heading/jumping weights.
 */
function getContextualModifiers(
  player: Player,
  position: Position,
  baseWeights: Record<string, number>
): Record<string, number> {
  const modifiers: Record<string, number> = { ...baseWeights };

  if (position === 'ST' || position === 'CF') {
    if (player.height_cm && player.height_cm >= 185) {
      if (modifiers.heading) modifiers.heading *= 1.3;
      if (modifiers.jumping) modifiers.jumping *= 1.3;
    }
    if (player.height_cm && player.height_cm < 178) {
      if (modifiers.sprint_speed) modifiers.sprint_speed *= 1.2;
      if (modifiers.agility) modifiers.agility *= 1.3;
      if (modifiers.close_dribbling) modifiers.close_dribbling *= 1.2;
    }
  }

  // Inverted winger vs Traditional winger
  if (position === 'RW' && player.preferred_foot === 'Left') {
    if (modifiers.finishing) modifiers.finishing *= 1.4;
    if (modifiers.curve) modifiers.curve *= 1.4;
  } else if (position === 'RW' && player.preferred_foot === 'Right') {
    if (modifiers.crossing) modifiers.crossing *= 1.5;
  }
  if (position === 'LW' && player.preferred_foot === 'Right') {
    if (modifiers.finishing) modifiers.finishing *= 1.4;
    if (modifiers.curve) modifiers.curve *= 1.4;
  } else if (position === 'LW' && player.preferred_foot === 'Left') {
    if (modifiers.crossing) modifiers.crossing *= 1.5;
  }

  return modifiers;
}

/**
 * Calculate GK-specific total reach bonus.
 * Total Reach Score = (height/200)*0.3 + (jumping/99)*0.3 + (diving/99)*0.4
 */
function calcGKReachBonus(player: Player): number {
  if (player.position !== 'GK' || !player.stats_goalkeeper) return 0;
  const gk = player.stats_goalkeeper;
  const heightFactor = player.height_cm ? (player.height_cm / 200) * 0.3 : 0;
  const jumpingFactor = gk.jumping ? (gk.jumping / MAX_STAT) * 0.3 : 0;
  const divingFactor = gk.diving ? (gk.diving / MAX_STAT) * 0.4 : 0;
  return (heightFactor + jumpingFactor + divingFactor) * 10; // scale to ~0-10 bonus points
}

/**
 * Calculate the Position Fit Score (0-100) for a player at a given position.
 * Formula: Σ(stat_value × weight) / Σ(MAX_STAT × weight) × 100
 */
export function calcPositionFitScore(player: Player, position: Position): number {
  const baseWeights = (positionWeights as Record<string, Record<string, number>>)[position];
  if (!baseWeights) return 0;

  // GK uses goalkeeper stats, others use outfield stats
  const isGK = position === 'GK';
  const stats = isGK ? player.stats_goalkeeper : player.stats_outfield;
  if (!stats) return 0;

  const weights = getContextualModifiers(player, position, baseWeights);

  let weightedSum = 0;
  let maxWeightedSum = 0;

  for (const [statName, weight] of Object.entries(weights)) {
    if (weight === 0) continue;
    const statValue = (stats as Record<string, number | null>)[statName];
    if (statValue !== null && statValue !== undefined) {
      weightedSum += statValue * weight;
    }
    maxWeightedSum += MAX_STAT * weight;
  }

  let score = maxWeightedSum > 0 ? (weightedSum / maxWeightedSum) * 100 : 0;

  // GK reach bonus
  if (isGK) {
    score = Math.min(100, score + calcGKReachBonus(player));
  }

  return Math.round(score * 10) / 10; // round to 1 decimal
}

/**
 * Calculate fit scores for ALL positions for a player.
 * Returns the player enriched with scores, best and second-best positions.
 */
export function enrichPlayerWithScores(player: Player): PlayerWithScores {
  const positions: Position[] = [
    'ST', 'CF', 'LW', 'RW', 'LM', 'RM',
    'CAM', 'CM', 'CDM',
    'LB', 'RB', 'LWB', 'RWB', 'CB', 'GK'
  ];

  const fit_scores = {} as Record<Position, number>;
  for (const pos of positions) {
    fit_scores[pos] = calcPositionFitScore(player, pos);
  }

  const sortedByScore = [...positions].sort((a, b) => fit_scores[b] - fit_scores[a]);
  const best_position = sortedByScore[0];
  const second_best_position = sortedByScore[1];

  return {
    ...player,
    fit_scores,
    best_position,
    second_best_position,
    dev_score: null, // calculated separately
  };
}
```

---

## SCHRITT 8: goalsverse.com API-Client

**Datei:** `src/lib/scraper/goalsverse-client.ts`

AUFGABE: Untersuche goalsverse.com — insbesondere die Club-Seite unter
https://goalsverse.com/clubs (oder ahnliche URL) und finde heraus welche
API-Endpunkte die Seite intern nutzt. Schaue in den HTML-Quellcode und
versuche API-Muster zu identifizieren.

Implementiere dann einen Client der:
1. Club-Suche: `searchClub(clubName: string)` — gibt Club-ID/Slug zurueck
2. Club-Roster: `getClubRoster(clubId: string)` — gibt alle Spieler zurueck
3. Player-Details: `getPlayerDetails(playerId: string)` — alle Stats eines Spielers

Falls direkte API-Calls nicht funktionieren, implementiere einen Playwright-basierten Scraper als Fallback.

Wichtig:
- Rate-Limiting: max 1 Request/Sekunde (sleep zwischen Calls)
- Error-Handling: timeout, club nicht gefunden, keine Spieler
- Mapping: goalsverse-Felder auf unser Schema mappen
- Nicht verfuegbare Felder auf `null` setzen
- `data_complete: false` wenn kritische Stats fehlen

```typescript
import axios from 'axios';
import { Player, Position, Rarity } from './types';

const BASE_URL = process.env.GOALSVERSE_BASE_URL || 'https://goalsverse.com';
const RATE_LIMIT_MS = 1000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// TODO: Document what you find when inspecting goalsverse.com:
// - What endpoints exist?
// - What are the request headers?
// - What does the response schema look like?
// Fill in the implementation based on what you find.

export async function searchClub(clubName: string): Promise<{ id: string; name: string } | null> {
  // Implement club search
  // Document: which endpoint, what response shape
  throw new Error('Not implemented — inspect goalsverse.com network tab first');
}

export async function getClubRoster(clubId: string): Promise<Player[]> {
  // Implement roster fetch
  // Document: which endpoint, what response shape
  throw new Error('Not implemented — inspect goalsverse.com network tab first');
}
```

DOKUMENTIERE alles was du auf goalsverse.com findest in einem Kommentarblock am Anfang der Datei.
Wenn die Endpunkte nicht automatisch erkennbar sind (z.B. wegen Auth), implementiere einen
Playwright-Scraper der die Club-Seite oeffnet und Daten aus dem DOM extrahiert.

---

## SCHRITT 9: Zustand-Store

**Datei:** `src/lib/store/squad-store.ts`

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { produce } from 'immer';
import { Player, PlayerWithScores } from '@/lib/scraper/types';
import { enrichPlayerWithScores } from '@/lib/scoring/position-fit';

interface SquadStore {
  // State
  clubName: string | null;
  players: PlayerWithScores[];
  lastImport: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setClubName: (name: string) => void;
  importPlayers: (players: Player[]) => void;
  clearSquad: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSquadStore = create<SquadStore>()(
  persist(
    (set) => ({
      clubName: null,
      players: [],
      lastImport: null,
      isLoading: false,
      error: null,

      setClubName: (name) => set({ clubName: name }),

      importPlayers: (rawPlayers) => set(
        produce((state: SquadStore) => {
          state.players = rawPlayers.map(enrichPlayerWithScores);
          state.lastImport = new Date().toISOString();
          state.error = null;
        })
      ),

      clearSquad: () => set({ players: [], lastImport: null, error: null }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'goals-squad-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

---

## SCHRITT 10: Onboarding-Seite bauen

**Datei:** `src/app/page.tsx`

Erstelle die Onboarding-Startseite mit:

1. Hero-Bereich: "GOALS Squad Optimizer" Titel + kurze Beschreibung
2. Club-Import-Karte:
   - Eingabefeld: "Dein Club-Name (wie in GOALS)"
   - "Spieler importieren" Button
   - Status-Anzeige: Ladebalken + "X Spieler importiert"
3. Erklaerungsbox:
   ```
   So funktioniert die Datenerfassung:
   1. Gib deinen Club-Namen ein
   2. Wir lesen deine Spieler automatisch von goalsverse.com
   3. Jeder Spieler muss min. 1x online gespielt haben
   
   Falls noch nicht alle Spieler online gespielt haben:
   - Erstelle Squads in der Companion App
   - Spiele pro Squad 1 Quickplay-Match (~4-5 Min)
   ⚠️ Bot-Matches zaehlen NICHT — nur Online-Modi!
   ```
4. Rotationsplan-Generator:
   - Input: "Wie viele Spieler hast du ca.?"
   - Output: "Du brauchst X Quickplay-Matches"
   - Zeige Squad-Einteilung (Gruppe 1: Spieler 1-11, Gruppe 2: 12-22, etc.)

**Datei:** `src/components/onboarding/RotationPlanGenerator.tsx`

Implementiere den Rechner als interaktive Komponente:
```
Input: 47 Spieler
→ "Du brauchst 5 Quickplay-Matches (ca. 25 Minuten)"
→ Anzeige: Match 1: Spieler 1-11 | Match 2: Spieler 12-22 | ...
→ "Bonus: Du verdienst Match Points & XP beim Spielen!"
```

---

## SCHRITT 11: Squad Overview Seite

**Datei:** `src/app/squad/page.tsx`

Tabelle aller importierten Spieler mit:
- Spalten: Name, Position, OVR, Rarity (als Badge), Training Value, Alter, Bester Fit, Fit-Score
- Sortierbar nach jeder Spalte (Client-Side)
- Filterbar: Position (Dropdown), Rarity (Dropdown)
- Suchfeld (Name-Suche)
- Wenn keine Spieler importiert: Redirect / Hinweis zur Onboarding-Seite

Fit-Score Farbindikator:
- Gruen: > 85
- Gelb: 70-85
- Rot: < 70

Hinweis-Box: "Spieler X wuerde auf Position Y 23% besser passen" (wenn best_position != position)

---

## SCHRITT 12: Navigation/Layout

**Datei:** `src/app/layout.tsx`

Sidebar-Navigation mit Links zu:
- Startseite (Import)
- Squad Uebersicht
- Optimale Aufstellung (Platzhalter-Seite fuer Sprint 2)
- Development Center (Platzhalter)

---

## SCHRITT 13: API Route fuer Import

**Datei:** `src/app/api/import/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { searchClub, getClubRoster } from '@/lib/scraper/goalsverse-client';

export async function POST(req: NextRequest) {
  const { clubName } = await req.json();

  if (!clubName || clubName.trim().length < 2) {
    return NextResponse.json({ error: 'Bitte gib einen gueltigen Club-Namen ein.' }, { status: 400 });
  }

  try {
    const club = await searchClub(clubName.trim());
    if (!club) {
      return NextResponse.json(
        { error: `Club "${clubName}" wurde auf goalsverse.com nicht gefunden.` },
        { status: 404 }
      );
    }

    const players = await getClubRoster(club.id);
    return NextResponse.json({ players, club, count: players.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

---

## VERIFIKATION nach jedem Schritt

Fuehre nach allen Schritten aus:
```bash
cd /workspace/goals-optimizer
npx tsc --noEmit        # 0 TypeScript-Fehler
npx next build          # Build erfolgreich (oder nur Dev-Warnungen OK)
npm run dev -- --port 3001 &   # Dev-Server starten zum manuellen Check
sleep 5
curl -s http://localhost:3001/ | grep -i "goals" | head -5
```

---

## Was NICHT geändert wird

- Kein eigenes Design-System (nur Tailwind + shadcn/ui defaults)
- Keine Deployment-Konfiguration (nur lokales Dev)
- Phase 4 (Formations-Optimizer), Phase 5 (Taktik), Phase 6 (Development Center)
  → kommen in Sprint 2 und 3
- Keine Supabase-Integration (nur localStorage in diesem Sprint)

---

## Erwartetes Ergebnis

Am Ende von Sprint 1:
- [ ] Next.js Projekt laeuft auf Port 3001 ohne Fehler
- [ ] TypeScript 0 Fehler
- [ ] `src/config/position-weights.json` mit allen 15 Positionen
- [ ] `src/config/formations.json` mit mind. 8 Formationen
- [ ] `src/config/stats-reference.json` mit allen Outfield + GK Stats
- [ ] `src/lib/scoring/position-fit.ts` — Position Fit Score Berechnung laeuft
- [ ] `src/lib/store/squad-store.ts` — Zustand-Store mit Persistenz
- [ ] Onboarding-Seite mit Club-Import-Formular
- [ ] Rotationsplan-Generator funktioniert
- [ ] Squad-Overview-Tabelle (mit Mock-Daten wenn Import noch nicht laeuft)
- [ ] goalsverse-Client dokumentiert welche API-Endpunkte existieren
- [ ] Sidebar-Navigation laeuft

Berichte was funktioniert, was noch fehlt, und was du auf goalsverse.com gefunden hast.
