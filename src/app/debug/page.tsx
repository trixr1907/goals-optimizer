'use client';

/**
 * Data Canvas — Datenfluss-Übersicht für den GOALS Squad Optimizer
 *
 * Zeigt interaktiv woher jedes Datenfeld kommt, welche Logik greift,
 * und welche Entscheidungen du selbst ändern kannst.
 *
 * Aufbau: 4 Spalten (Pipeline-Stufen) + konfigurierbarer Entscheidungs-Editor.
 */

import { useEffect, useMemo, useState } from 'react';
import type { PlayerWithScores, PositionSource, RoleRatingsSource } from '@/lib/scraper/types';

// ──────────────────────────────────────────────────────────────────────────
// Datenmodell für den Canvas
// ──────────────────────────────────────────────────────────────────────────

interface DataLayer {
  id: string;
  label: string;
  icon: string;
  color: string; // tailwind bg class for header
  borderColor: string; // tailwind border class
  dotColor: string;
}

interface DataField {
  field: string;
  description: string;
  source: string; // welche Layer-ID liefert dieses Feld
  fallback?: string; // was passiert wenn die source leer ist
  editable?: boolean; // ist das eine Entscheidung die du tunen kannst?
  editKey?: string; // key für den Decision-Editor
  warn?: string; // bekannte Stolperfalle
}

interface DecisionParam {
  key: string;
  label: string;
  description: string;
  currentValue: string | number;
  type: 'number' | 'text' | 'select';
  options?: string[];
  location: string; // Datei-Pfad
  impact: string; // Was ändert sich wenn du das änderst?
}

interface DiagnosticRule {
  symptom: string;
  check: string;
  likelyCause: string;
  userAdvantage: string;
  nextRefactor: string;
  severity: 'hoch' | 'mittel' | 'niedrig';
}

interface SquadDebugSnapshot {
  clubName: string;
  clubId?: string;
  lastImportedAt: string | null;
  total: number;
  full: number;
  basic: number;
  warnings: number;
  positionSources: Partial<Record<PositionSource | 'unknown', number>>;
  roleRatingSources: Partial<Record<RoleRatingsSource | 'unknown', number>>;
}

function emptySnapshot(): SquadDebugSnapshot {
  return {
    clubName: '',
    lastImportedAt: null,
    total: 0,
    full: 0,
    basic: 0,
    warnings: 0,
    positionSources: {},
    roleRatingSources: {},
  };
}

function readSquadSnapshot(): SquadDebugSnapshot {
  if (typeof window === 'undefined') return emptySnapshot();

  try {
    const raw = window.localStorage.getItem('goals-squad-store');
    if (!raw) return emptySnapshot();

    const parsed = JSON.parse(raw) as { state?: { clubName?: string; clubId?: string; lastImportedAt?: string | null; players?: PlayerWithScores[] } };
    const state = parsed.state;
    const players = Array.isArray(state?.players) ? state.players.filter(Boolean) : [];
    const snapshot = emptySnapshot();

    snapshot.clubName = state?.clubName ?? '';
    snapshot.clubId = state?.clubId;
    snapshot.lastImportedAt = state?.lastImportedAt ?? null;
    snapshot.total = players.length;

    for (const player of players) {
      if (player.dataQuality === 'full') snapshot.full += 1;
      else snapshot.basic += 1;

      const posSource = player.positionSource ?? 'unknown';
      snapshot.positionSources[posSource] = (snapshot.positionSources[posSource] ?? 0) + 1;

      const roleSource = player.roleRatingsSource ?? 'unknown';
      snapshot.roleRatingSources[roleSource] = (snapshot.roleRatingSources[roleSource] ?? 0) + 1;

      snapshot.warnings += player.sourceWarnings?.length ?? 0;
    }

    return snapshot;
  } catch {
    return emptySnapshot();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Statische Konfiguration
// ──────────────────────────────────────────────────────────────────────────

const LAYERS: DataLayer[] = [
  {
    id: 'goalsverse',
    label: '1. Goalsverse API',
    icon: '🌐',
    color: 'bg-blue-900/60',
    borderColor: 'border-blue-700',
    dotColor: 'bg-blue-400',
  },
  {
    id: 'tracker',
    label: '2. Goals-Tracker',
    icon: '🎯',
    color: 'bg-purple-900/60',
    borderColor: 'border-purple-700',
    dotColor: 'bg-purple-400',
  },
  {
    id: 'playgoals',
    label: '3. PlayGOALS Fallback',
    icon: '🔄',
    color: 'bg-amber-900/60',
    borderColor: 'border-amber-700',
    dotColor: 'bg-amber-400',
  },
  {
    id: 'engine',
    label: '4. Scoring Engine',
    icon: '⚙️',
    color: 'bg-emerald-900/60',
    borderColor: 'border-emerald-700',
    dotColor: 'bg-emerald-400',
  },
];

const LAYER_MAP: Record<string, DataLayer> = Object.fromEntries(
  LAYERS.map((l) => [l.id, l])
);

const DATA_FIELDS: DataField[] = [
  // ── Spieler-Identität ──────────────────────────────────────────────────
  {
    field: 'player.id',
    description: 'Eindeutige ID, immer "goalsverse-{uuid}" Format',
    source: 'goalsverse',
    warn: 'characterId ohne "goalsverse-" Prefix = raw UUID für Tracker-URLs',
  },
  {
    field: 'player.name',
    description: 'Basic/Profil: "name" bevorzugt, sonst firstName/lastName. Full/Squad: first_name + last_name.',
    source: 'goalsverse',
    fallback: 'Ersten 8 Zeichen der raw UUID als Platzhalter, danach "Unknown" bei Full-Spielern',
  },
  {
    field: 'player.image_url',
    description: 'CDN-Avatar: cdn.playgoals.com/character/prod/{rawId}.png?w=128',
    source: 'goalsverse',
  },
  {
    field: 'player.overall',
    description: 'OVR aus "ovr" Feld (number) oder "ovr.overall_rating" (Objekt)',
    source: 'goalsverse',
    fallback: 'Wert 50 wenn kein OVR gefunden',
  },
  {
    field: 'player.rarity',
    description: 'Berechnet aus OVR: ≥95 Mythic, ≥90 Legendary, ≥85 Epic, ≥80 Rare, ≥70 Uncommon, ≥60 Common',
    source: 'goalsverse',
    editable: true,
    editKey: 'rarity_thresholds',
  },
  {
    field: 'player.age',
    description: 'Alter in Jahren aus raw.current_age. Nur Full/Squad-Spieler; Basic/Profil-Spieler haben aktuell kein age.',
    source: 'goalsverse',
  },
  {
    field: 'player.dataQuality',
    description: '"full" = 18 Squad-Spieler mit Einzel-Stats | "basic" = Profil-Spieler (variabel, typisch 40-60+) mit nur OVR',
    source: 'goalsverse',
    warn: 'Basic-Spieler haben emptyStats (alle 0) — Fit-Scores unzuverlässig',
  },

  // ── Position-Bestimmung ────────────────────────────────────────────────
  {
    field: 'player.position (Primary)',
    description: 'Die Display-/Haupt-Position. Bestimmt durch bestPositionFromRatings() via Priority-Chain.',
    source: 'tracker',
    fallback: 'PlayGOALS Fallback → danach bleibt die initiale Goalsverse-Position aus bestPositionFromRatings()',
    editable: true,
    editKey: 'position_priority',
    warn: 'ovr.role (equipped) ≠ Primary! Niemals blind ovr.role als position nutzen.',
  },
  {
    field: 'player.positionSource',
    description: 'Woher die Primary Position kommt: "goals-tracker" | "playgoals" | "goalsverse" | "heuristic"',
    source: 'tracker',
    fallback: 'Wenn trackerPos null ist (egal ob timeout, 403, parse-miss oder partial result), wird PlayGOALS für die Primary Position versucht. Wenn auch das fehlschlägt, bleibt Goalsverse.',
  },
  {
    field: 'player.roleRatings[]',
    description: 'Alle Positionen + OVR aus dem Positions-Pitch auf goals-tracker.com. ANDERE OVR-Formel als Goalsverse!',
    source: 'tracker',
    fallback: 'Goalsverse ovr_roles wenn Tracker-Pitch nicht parsebar (roleRatingsSource="goalsverse")',
    editable: true,
    editKey: 'secondary_threshold',
    warn: 'LB+RB → beide als "FB" aggregiert (max). Goalsverse ovr_roles ≠ Tracker Pitch.',
  },
  {
    field: 'player.secondaryPositions[]',
    description: 'Positionen mit OVR ≥ primary − 10. Spielbar mit −2 Stat-Penalty.',
    source: 'goalsverse',
    editable: true,
    editKey: 'secondary_threshold',
    warn: 'Threshold war früher −3 (zu eng). Aktuell −10 wegen GOALS-Spielrealität. Kommentar in types.ts war veraltet (OVR within 2) — bereits korrigiert.',
  },
  {
    field: 'player.roleRatingsSource',
    description: 'Woher roleRatings kommen. Type erlaubt "goals-tracker" | "goalsverse" | "mixed" | "none"; aktuelle Pipeline setzt praktisch "goals-tracker" oder "goalsverse".',
    source: 'tracker',
  },
  {
    field: 'player.sourceWarnings[]',
    description: 'Nicht-fatale Warnungen: Jede Art von Tracker-Fehler (timeout, http_status, network_error, parse-miss) + PlayGOALS-Fallback-Info',
    source: 'tracker',
  },

  // ── Statistiken ────────────────────────────────────────────────────────
  {
    field: 'player.stats (pac/sho/pas/dri/def/phy)',
    description: 'Kategorie-Durchschnitte aus dem Goalsverse Squad-Payload. Nur Full-Spieler.',
    source: 'goalsverse',
    warn: 'Basic-Spieler: emptyStats (alle 0). hasFullStats() prüfen vor Stat-Nutzung.',
  },
  {
    field: 'player.stats (Einzel-Stats)',
    description: '30+ Einzel-Attribute: acceleration, finishing, ground_pass, close_dribbling, stand_tackle, strength etc.',
    source: 'goalsverse',
    fallback: '0 für alle Stats bei Basic-Spielern',
  },
  {
    field: 'player.stats (GK-Stats)',
    description: 'div, kic, reflexes, positioning, catching, parrying (required) + rushing, command_of_area, penalty_saving, throwing, kicking_power (optional) — nur bei GK relevant',
    source: 'goalsverse',
  },

  // ── Fit-Scores ─────────────────────────────────────────────────────────
  {
    field: 'fit_scores {GK..ST}',
    description: 'Gewichteter Score 1-99 pro Position. Full-Spieler: Σ(stat × weight) / Σ(99 × weight) × 100, clamped [1,99]. Basic-Spieler: OVR/99×100 (kein Stat-Zugriff möglich).',
    source: 'engine',
    editable: true,
    editKey: 'position_weights',
    warn: 'Context-Modifier: Körpergröße (±heading/agility), starker Fuß bei WF/FB (slotX nötig)',
  },
  {
    field: 'positionType {primary/secondary/out}',
    description: 'Klassifikation pro Slot: primary = kein Penalty | secondary = −2 | out = −5',
    source: 'engine',
    editable: true,
    editKey: 'position_penalties',
  },
  {
    field: 'effectiveStats (pro Position)',
    description: 'Stats nach Position-Penalty. Basis für alle taktischen Berechnungen.',
    source: 'engine',
    warn: 'player.overall wird NIE durch Penalties verändert — nur Einzel-Stats.',
  },

  // ── Match-Daten ────────────────────────────────────────────────────────
  {
    field: 'player.matches_played / goals / assists',
    description: 'Primär aus dem Profil-RSC "club"-Array. Bei Squad-Spielern (18 full) werden Match-Daten vom Profil per Merge nachträglich kopiert. undefined wenn Spieler noch nie gespielt hat.',
    source: 'goalsverse',
  },
];

const DECISIONS: DecisionParam[] = [
  {
    key: 'secondary_threshold',
    label: 'Nebenposition-Schwelle (OVR-Abstand)',
    description:
      'Ein Spieler gilt als "spielbar" auf einer Nebenposition wenn sein OVR dort mindestens (Primary − X) ist. Kleiner Wert = engere Auswahl.',
    currentValue: 10,
    type: 'number',
    location: 'src/lib/scraper/goalsverse-client.ts → mapActivityPlayerToBasic() + mapPlayerFromGoalsverse() + enrichWithTracker()',
    impact:
      'Höher (z.B. 15): Mehr Nebenpositionen, Optimizer hat mehr Flexibilität. Niedriger (z.B. 5): Nur sehr gut passende Nebenpositionen gelten.',
  },
  {
    key: 'rarity_thresholds',
    label: 'Rarity-Schwellen (OVR)',
    description: 'OVR-Grenzen für Mythic/Legendary/Epic/Rare/Uncommon/Common/Basic.',
    currentValue: '95/90/85/80/70/60',
    type: 'text',
    location: 'src/lib/scraper/goalsverse-client.ts → mapOvrToRarity()',
    impact: 'Rein visuell — beeinflusst Kartenfärbung im Squad, keine Spiellogik.',
  },
  {
    key: 'position_weights',
    label: 'Positions-Gewichte',
    description:
      'JSON-Config die bestimmt wie stark jeder Einzel-Stat (z.B. finishing, ground_pass) für jede Position gewichtet wird.',
    currentValue: 'Datei: src/config/position-weights-detailed.json',
    type: 'text',
    location: 'src/config/position-weights-detailed.json + src/lib/scoring/position-fit.ts',
    impact:
      'Direkt auf Fit-Scores und Optimizer-Entscheidungen. Wer die beste Elf ist ändert sich wenn Gewichte verschoben werden.',
  },
  {
    key: 'position_penalties',
    label: 'Position-Penalties (Stat-Abzug)',
    description: 'Wie viele Punkte von allen Stats abgezogen werden wenn ein Spieler nicht auf seiner Hauptposition spielt.',
    currentValue: 'primary: 0 | secondary: -2 | out: -5',
    type: 'text',
    location: 'src/lib/scraper/types.ts → getEffectiveStats()',
    impact: 'Beeinflusst Taktik-Panel, Matchup-Analyse und alle Stat-basierten Empfehlungen.',
  },
  {
    key: 'position_priority',
    label: 'Positions-Bestimmungs-Reihenfolge',
    description:
      'Bei Gleich-OVR auf mehreren Positionen: 1) Nur ein Top-OVR → direkt nehmen. 2) raw.role zeigt auf Top-Pos → bevorzugen. 3) Stat-Tie-Break (kreativ vs. haltend). 4) ovr.role als letzter Ausweg.',
    currentValue: 'bestPositionFromRatings()',
    type: 'text',
    location: 'src/lib/scraper/goalsverse-client.ts → bestPositionFromRatings()',
    impact:
      'Welche Position als Primary gilt. Falsch = falscher Fit-Score = falscher Optimizer-Vorschlag.',
  },
  {
    key: 'tracker_timeout',
    label: 'Goals-Tracker Timeout (ms)',
    description: 'Wie lange auf goals-tracker.com gewartet wird bevor auf PlayGOALS-Fallback umgeschaltet wird.',
    currentValue: 15000,
    type: 'number',
    location: 'src/lib/scraper/goals-tracker-client.ts → TRACKER_TIMEOUT_MS = 15_000',
    impact:
      'Zu kurz: Mehr Fallbacks auf Goalsverse-Positionen (ungenauer). Zu lang: Import dauert länger. Goalsverse selbst hat separaten Timeout: FETCH_TIMEOUT_MS = 12_000 (goalsverse-client.ts).',
  },
  {
    key: 'tracker_concurrency',
    label: 'Tracker Concurrent Requests',
    description: 'Wie viele Spieler gleichzeitig bei goals-tracker.com abgerufen werden.',
    currentValue: 3,
    type: 'number',
    location: 'src/lib/scraper/goals-tracker-client.ts → TRACKER_CONCURRENCY',
    impact: 'Höher = schnellerer Import, aber mehr Risiko für Rate-Limiting auf Vercel.',
  },
  {
    key: 'dev_label_thresholds',
    label: 'Development Label Schwellen',
    description: 'Wann ein Spieler "Starter" / "Trainieren" / "Turnier-Spezialist" / "Rotation" / "Ersetzen" bekommt.',
    currentValue: 'Starter: bestFit≥75 & primaryFit≥68 & OVR≥65; Training: age≤23 & OVR≥55 OR bestFit≥65 & OVR<70 & score≥55; Rotation: bestFit≥58 OR OVR≥58',
    type: 'text',
    location: 'src/lib/analysis/development-advisor.ts → adviseDevelopment()',
    impact: 'Direkt auf Development-Seite Label-Vergabe. Anpassen wenn zu viele/wenige "Ersetzen" erscheinen.',
  },
];

// ──────────────────────────────────────────────────────────────────────────
// Import-Pipeline Phasen (für den Flow-Diagram-Block)
// ──────────────────────────────────────────────────────────────────────────

const DIAGNOSTIC_RULES: DiagnosticRule[] = [
  {
    symptom: 'Viele Spieler zeigen positionSource=goalsverse oder playgoals statt goals-tracker.',
    check: 'Nach Live-Import in /squad einzelne Karten öffnen und sourceWarnings prüfen. Häufen sich timeout/http_status/parse_roleRatings_missing?',
    likelyCause: 'Tracker-Enrichment ist langsam, geblockt oder Pitch-HTML wurde nicht erkannt. Primary kann dann stimmen, aber Nebenpositions-OVR bleibt oft Goalsverse-näher.',
    userAdvantage: 'Wenn Tracker grün ist, erkennt das Tool versteckte bessere Rollen wie WF/ST/AM genauer. Das bringt direktere Vorteile bei Beste-Elf, Turnieren und Matchup.',
    nextRefactor: 'Import-Diagnose in API-Response aggregieren: counts pro positionSource, roleRatingsSource und failReason sichtbar machen.',
    severity: 'hoch',
  },
  {
    symptom: 'Viele Basic-Spieler landen überraschend in der besten Elf oder wirken auf falschen Positionen stark.',
    check: 'dataQuality prüfen: basic hat emptyStats. Fit kommt dann nur aus roleRatings/OVR, nicht aus Einzelwerten wie Pace, Passing oder Stamina.',
    likelyCause: 'Profil-Spieler haben keine Detailstats. Der Optimizer kann bei Basic-Spielern nur grob schätzen.',
    userAdvantage: 'Für echte Vorteile sollten Full-Spieler bevorzugt werden, wenn Pace/Stamina/Weak-Foot wichtig sind. Basic-Spieler sind eher Kandidatenliste, nicht endgültige Wahrheit.',
    nextRefactor: 'Im Optimizer einen Data-Quality-Malus oder Confidence-Badge einbauen, damit Basic-Spieler nicht unbemerkt Full-Spieler verdrängen.',
    severity: 'hoch',
  },
  {
    symptom: 'Turnier-Empfehlung erfüllt OVR-Limit, fühlt sich aber spielerisch schwach an.',
    check: 'Nicht nur Squad OVR anschauen: averageFit, PositionType-Badges und schwache Linien im Matchup vergleichen.',
    likelyCause: 'OVR-Max-Turniere belohnen niedrige Mannschaftsstärke, aber das Tool darf dabei nicht zu viele Spieler out-of-position stellen.',
    userAdvantage: 'Der Vorteil entsteht durch Spieler knapp unter dem OVR-Limit mit hohem Fit, nicht durch zufällig niedrige OVR-Spieler.',
    nextRefactor: 'Tournament-Recommender stärker auf Fit-pro-OVR-Effizienz und Mindest-Fit je Linie optimieren.',
    severity: 'mittel',
  },
  {
    symptom: 'Ein Spieler wirkt auf einer Nebenposition im Spiel gut, wird vom Tool aber abgestraft.',
    check: 'roleRatings und secondaryPositions vergleichen: liegt die Position außerhalb Primary − 10 oder fehlt sie komplett im Tracker-Pitch?',
    likelyCause: 'Threshold zu eng für diesen Spezialfall oder Tracker/Goalsverse kennt die Rolle nicht vollständig.',
    userAdvantage: 'Spezialisten mit ungewöhnlichen Nebenrollen sind Meta-Vorteile. Das Tool sollte sie sichtbar machen statt verstecken.',
    nextRefactor: 'Manuelle Player-Overrides pro Position erlauben, mit Kommentar und Ablaufdatum, statt globale Thresholds blind zu erhöhen.',
    severity: 'mittel',
  },
  {
    symptom: 'Matchup sagt Risiko, aber Lineup-Empfehlung reagiert nicht darauf.',
    check: 'Vergleiche Matchup-Risiken (Tempo, Flanken, zentrale Achse) mit Formation/Tactics-Empfehlung auf /lineup.',
    likelyCause: 'Matchup-Analyse und Formation-Optimizer sind noch getrennte Engines.',
    userAdvantage: 'Gegen bestimmte Gegner bringt eine leicht schlechtere Overall-Elf mit passender Taktik mehr als die reine Best-Fit-Elf.',
    nextRefactor: 'Gegner-spezifischen Optimizer-Modus bauen: Risiken als Gewichtung in Formation- und Spielerwahl einspeisen.',
    severity: 'niedrig',
  },
];

const PIPELINE_STEPS = [
  {
    step: 'A',
    title: 'Club-Suche',
    detail: 'UUID-Input → direkt weiter (kein API-Call). Name-Input → /api/v1/search?query={name} → userId',
    layer: 'goalsverse',
    file: 'goalsverse-client.ts → resolveClubId()',
  },
  {
    step: 'B',
    title: 'Squad (18 Spieler)',
    detail: '/v1/club/{userId} + RSC:1 → startingEleven + bench',
    layer: 'goalsverse',
    file: 'goalsverse-client.ts → fetchRsc("/v1/club/{id}")',
  },
  {
    step: 'C',
    title: 'Username-Auflösung',
    detail: '/api/v1/users/{userId} → username (für Profil-URL)',
    layer: 'goalsverse',
    file: 'goalsverse-client.ts → resolveUsernameForClub()',
  },
  {
    step: 'D',
    title: 'Profil (60+ Spieler)',
    detail: '/p/{username} + RSC:1 + Next-Router-State-Tree + Next-Url → "club"-Array',
    layer: 'goalsverse',
    file: 'goalsverse-client.ts → fetchRsc("/p/{slug}", slug)',
    warn: '3 Header nötig! Nur RSC:1 = leere Shell ohne Spieler.',
  },
  {
    step: 'E',
    title: 'Merge & Dedup',
    detail: 'Squad-Spieler haben Priorität (volle Stats). Profil-Spieler werden hinzugefügt wenn noch nicht in Squad (keine harte Grenze). Match-Daten vom Profil werden auf Squad-Spieler kopiert.',
    layer: 'goalsverse',
    file: 'goalsverse-client.ts → getClubRoster()',
  },
  {
    step: 'F',
    title: 'Tracker Enrichment',
    detail: 'goals-tracker.com/player/{uuid} → Primary Position + Pitch roleRatings',
    layer: 'tracker',
    file: 'goals-tracker-client.ts → fetchTrackerPlayerData()',
    warn: 'Concurrency=3, Timeout=15s, 1 Retry. Pitch-Buttons parsen (cursor:pointer), nicht ovr_roles!',
  },
  {
    step: 'G',
    title: 'PlayGOALS Fallback',
    detail: 'Wenn Tracker keine Primary Position liefert (bei JEDER Fehlerart). playgoals.com/en/player/{uuid} → ROLE_XX aus __next_f.push',
    layer: 'playgoals',
    file: 'playgoals-client.ts → fetchPlayGoalsPlayerData()',
    warn: 'Nur Primary Position übernehmen — ovr_roles von PlayGOALS = Goalsverse-äquivalent.',
  },
  {
    step: 'H',
    title: 'Fit-Score Enrichment',
    detail: 'enrichPlayerWithScores() → fit_scores, positionType, effectiveStats für alle 11 Positionen',
    layer: 'engine',
    file: 'scoring/position-fit.ts → enrichPlayerWithScores()',
  },
  {
    step: 'I',
    title: 'API Response',
    detail: '{ players[], count, source, clubId, clubUrl, clubName } → localStorage via squad-store. Bei Fehler zusätzlich error/errorCode/message.',
    layer: 'engine',
    file: 'app/api/import/route.ts',
  },
];

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

export default function DataCanvasPage() {
  const [activeField, setActiveField] = useState<DataField | null>(null);
  const [activeDecision, setActiveDecision] = useState<DecisionParam | null>(null);
  const [filterLayer, setFilterLayer] = useState<string>('all');
  const [tab, setTab] = useState<'fields' | 'pipeline' | 'decisions' | 'diagnostics'>('pipeline');
  const [snapshot, setSnapshot] = useState<SquadDebugSnapshot>(() => emptySnapshot());

  useEffect(() => {
    setSnapshot(readSquadSnapshot());
  }, []);

  const filteredFields =
    filterLayer === 'all' ? DATA_FIELDS : DATA_FIELDS.filter((f) => f.source === filterLayer);

  const trackerPrimaryCount = snapshot.positionSources['goals-tracker'] ?? 0;
  const trackerRoleCount = snapshot.roleRatingSources['goals-tracker'] ?? 0;
  const trackerPrimaryShare = snapshot.total > 0 ? Math.round((trackerPrimaryCount / snapshot.total) * 100) : 0;
  const trackerRoleShare = snapshot.total > 0 ? Math.round((trackerRoleCount / snapshot.total) * 100) : 0;
  const snapshotVerdict = useMemo(() => {
    if (snapshot.total === 0) return 'Noch kein Kader importiert — erst Live- oder Demo-Import ausführen.';
    if (trackerPrimaryShare >= 85 && trackerRoleShare >= 70 && snapshot.warnings === 0) return 'Sehr vertrauenswürdig: Tracker liefert die meisten Positionsdaten ohne Warnungen.';
    if (trackerPrimaryShare >= 60) return 'Brauchbar, aber prüfen: Einige Spieler nutzen Fallbacks oder Basic-Daten.';
    return 'Vorsicht: Viele Positionsdaten kommen aus Fallbacks. Optimizer-Ergebnisse manuell gegenprüfen.';
  }, [snapshot.total, snapshot.warnings, trackerPrimaryShare, trackerRoleShare]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">🗺️ Data Canvas</h1>
        <p className="text-slate-400 text-sm mt-1">
          Woher kommen die Daten? Was kann angepasst werden? Wo greift welche Logik?
        </p>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-6">
        {(
          [
            { key: 'pipeline', label: '🔀 Import-Pipeline' },
            { key: 'fields', label: '📋 Datenfelder' },
            { key: 'decisions', label: '🎛️ Entscheidungen' },
            { key: 'diagnostics', label: '🧭 Diagnose' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB: PIPELINE
         ════════════════════════════════════════════════════════════════════ */}
      {tab === 'pipeline' && (
        <div className="space-y-4">
          {/* Legende */}
          <div className="flex flex-wrap gap-3 mb-4">
            {LAYERS.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${l.dotColor}`} />
                <span className="text-xs text-slate-400">{l.label}</span>
              </div>
            ))}
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {PIPELINE_STEPS.map((step, idx) => {
              const layer = LAYER_MAP[step.layer];
              return (
                <div
                  key={step.step}
                  className={`relative flex gap-4 p-4 rounded-xl border ${layer.borderColor} bg-slate-900/80`}
                >
                  {/* Connector line */}
                  {idx < PIPELINE_STEPS.length - 1 && (
                    <div className="absolute left-7 top-full w-0.5 h-3 bg-slate-700 z-10" />
                  )}

                  {/* Step circle */}
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${layer.dotColor}`}
                  >
                    {step.step}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{step.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full text-white ${layer.color}`}>
                        {layer.icon} {layer.label.split('. ')[1]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">{step.detail}</p>
                    <p className="text-[10px] text-slate-500 mt-1 font-mono">{step.file}</p>
                    {step.warn && (
                      <p className="text-[11px] text-amber-400 mt-1.5">
                        ⚠️ {step.warn}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Demo vs Live Unterschied */}
          <div className="mt-6 p-4 rounded-xl border border-slate-700 bg-slate-900/50">
            <h3 className="text-sm font-semibold text-white mb-2">Demo vs. Live Import</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400">
              <div>
                <p className="text-emerald-400 font-medium mb-1">Demo (clubName = &quot;demo&quot;)</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>MOCK_PLAYERS aus mock-data.ts</li>
                  <li>Alle als dataQuality: &quot;full&quot; markiert</li>
                  <li>positionSource: &quot;heuristic&quot;</li>
                  <li>Kein Netzwerk-Call</li>
                  <li>Kein Tracker/PlayGOALS Enrichment</li>
                </ul>
              </div>
              <div>
                <p className="text-blue-400 font-medium mb-1">Live (echter Club-Name)</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Steps A → I (alle 9 Phasen)</li>
                  <li>18 Full-Spieler + variable Anzahl Basic-Spieler aus dem Profil-Array</li>
                  <li>Tracker Enrichment für ALLE Spieler</li>
                  <li>positionSource zeigt woher Pos kommt</li>
                  <li>sourceWarnings wenn Tracker fehlschlug</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: DATENFELDER
         ════════════════════════════════════════════════════════════════════ */}
      {tab === 'fields' && (
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Linke Spalte: Filter + Liste */}
          <div className="flex-1 min-w-0">
            {/* Layer-Filter */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setFilterLayer('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterLayer === 'all'
                    ? 'bg-slate-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Alle
              </button>
              {LAYERS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setFilterLayer(l.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filterLayer === l.id
                      ? `text-white ${l.color}`
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {l.icon} {l.label.split('. ')[1]}
                </button>
              ))}
            </div>

            {/* Feld-Liste */}
            <div className="space-y-2">
              {filteredFields.map((field) => {
                const layer = LAYER_MAP[field.source];
                const isActive = activeField?.field === field.field;
                return (
                  <button
                    key={field.field}
                    onClick={() => setActiveField(isActive ? null : field)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isActive
                        ? `${layer.borderColor} bg-slate-800`
                        : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${layer.dotColor}`} />
                      <span className="font-mono text-xs text-white">{field.field}</span>
                      {field.editable && (
                        <span className="text-[10px] bg-emerald-800 text-emerald-300 px-1.5 py-0.5 rounded ml-auto">
                          anpassbar
                        </span>
                      )}
                      {field.warn && (
                        <span className="text-[10px] text-amber-400">⚠️</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 ml-4">{field.description}</p>

                    {/* Expanded details */}
                    {isActive && (
                      <div className="mt-3 ml-4 space-y-2 border-t border-slate-700 pt-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full text-white ${layer.color}`}>
                            Quelle: {layer.icon} {layer.label}
                          </span>
                        </div>
                        {field.fallback && (
                          <p className="text-xs text-slate-500">
                            <span className="text-slate-400">Fallback:</span> {field.fallback}
                          </p>
                        )}
                        {field.warn && (
                          <p className="text-xs text-amber-400">⚠️ {field.warn}</p>
                        )}
                        {field.editable && field.editKey && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const dec = DECISIONS.find((d) => d.key === field.editKey);
                              if (dec) { setActiveDecision(dec); setTab('decisions'); }
                            }}
                            className="text-[11px] text-emerald-400 hover:underline"
                          >
                            → Entscheidung anzeigen
                          </button>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rechte Spalte: Layer-Legende */}
          <div className="w-full lg:w-64 space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Datenquellen</h3>
            {LAYERS.map((l) => {
              const count = DATA_FIELDS.filter((f) => f.source === l.id).length;
              return (
                <div
                  key={l.id}
                  className={`p-3 rounded-xl border ${l.borderColor} ${l.color}`}
                >
                  <div className="flex items-center gap-2">
                    <span>{l.icon}</span>
                    <span className="text-sm font-medium text-white">{l.label}</span>
                    <span className="ml-auto text-xs text-slate-400">{count} Felder</span>
                  </div>
                </div>
              );
            })}
            <div className="mt-4 p-3 rounded-xl border border-slate-700 bg-slate-900/50 text-xs text-slate-400 space-y-2">
              <p className="font-medium text-slate-300">Farb-Bedeutung</p>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-400" /><span>Goalsverse (primäre Quelle)</span></div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-400" /><span>Goals-Tracker (Position-Autorität)</span></div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-400" /><span>PlayGOALS (Fallback wenn Tracker keine Primary liefert)</span></div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400" /><span>Scoring Engine (berechnet)</span></div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: ENTSCHEIDUNGEN
         ════════════════════════════════════════════════════════════════════ */}
      {tab === 'decisions' && (
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Liste */}
          <div className="flex-1 min-w-0 space-y-3">
            {DECISIONS.map((dec) => {
              const isActive = activeDecision?.key === dec.key;
              return (
                <button
                  key={dec.key}
                  onClick={() => setActiveDecision(isActive ? null : dec)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    isActive
                      ? 'border-emerald-600 bg-slate-800'
                      : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl">🎛️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{dec.label}</p>
                      <p className="text-xs text-slate-400 mt-1">{dec.description}</p>

                      {/* Current value pill */}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] bg-slate-700 px-2 py-1 rounded font-mono text-slate-300">
                          Aktuell: {String(dec.currentValue)}
                        </span>
                      </div>

                      {/* Expanded */}
                      {isActive && (
                        <div className="mt-4 space-y-3 border-t border-slate-700 pt-4">
                          <div>
                            <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Datei</p>
                            <p className="text-xs font-mono text-slate-300 break-all">{dec.location}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Auswirkung</p>
                            <p className="text-xs text-slate-300">{dec.impact}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-slate-950 border border-slate-700">
                            <p className="text-[11px] text-emerald-400 font-medium mb-1">
                              💡 So änderst du es
                            </p>
                            <p className="text-xs text-slate-400">
                              Öffne <span className="font-mono text-slate-300">{dec.location.split(' ')[0]}</span> und
                              passe den markierten Wert an. Danach{' '}
                              <span className="font-mono text-slate-300">npm run test && npm run build</span> ausführen.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Seitenleiste: Refactor-Hinweise */}
          <div className="w-full lg:w-72 space-y-4">
            <div className="p-4 rounded-xl border border-slate-700 bg-slate-900/50">
              <h3 className="text-sm font-semibold text-white mb-3">🔧 Für den nächsten Refactor</h3>
              <div className="space-y-3 text-xs text-slate-400">
                <div className="p-2 rounded-lg bg-slate-800">
                  <p className="text-amber-300 font-medium">Nebenposition-Schwelle</p>
                  <p className="mt-1">Aktuell hardcoded an 4 relevanten Stellen in goalsverse-client.ts plus Kommentar in types.ts. Besser: eine gemeinsame Konstante extrahieren.</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-800">
                  <p className="text-amber-300 font-medium">Position-Penalties</p>
                  <p className="mt-1">−2/−5 hardcoded in getEffectiveStats(). Für Test-Varianten aus Config ziehbar machen.</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-800">
                  <p className="text-amber-300 font-medium">Tracker Enrichment</p>
                  <p className="mt-1">Concurrency + Timeout als env-Variablen wäre besser als Konstanten im Code.</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-800">
                  <p className="text-slate-300 font-medium">Gut so ✅</p>
                  <p className="mt-1">Rarity, Rollen-Mapping, Mock-Data Demo-Pfad — stable, kein Refactor-Bedarf.</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-emerald-800 bg-emerald-950/40">
              <h3 className="text-sm font-semibold text-emerald-300 mb-2">✅ Verifikations-Commands</h3>
              <div className="space-y-1 font-mono text-xs text-slate-400">
                <p>npm run test</p>
                <p>npm run lint</p>
                <p>npm run build</p>
                <p className="text-slate-500 text-[10px] mt-2">Nach jeder Änderung alle 3 ausführen.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: DIAGNOSE
         ════════════════════════════════════════════════════════════════════ */}
      {tab === 'diagnostics' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-cyan-800 bg-cyan-950/30">
            <h2 className="text-lg font-semibold text-cyan-200">🧭 Diagnose-Entscheider</h2>
            <p className="text-sm text-slate-300 mt-1">
              Lies das wie ein Entscheidungsprogramm: Symptom finden, Check durchführen, Ursache verstehen,
              dann gezielt verbessern. Ziel ist nicht schöne Doku, sondern bessere Vorteile im Spiel.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Kader</p>
              <p className="mt-1 text-xl font-bold text-white">{snapshot.total}</p>
              <p className="text-xs text-slate-400">{snapshot.clubName || 'kein Import'}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Full / Basic</p>
              <p className="mt-1 text-xl font-bold text-white">{snapshot.full} / {snapshot.basic}</p>
              <p className="text-xs text-slate-400">Detailstats vs. OVR-only</p>
            </div>
            <div className="rounded-xl border border-purple-800 bg-purple-950/30 p-3">
              <p className="text-[10px] uppercase tracking-wide text-purple-300">Tracker Primary</p>
              <p className="mt-1 text-xl font-bold text-white">{trackerPrimaryShare}%</p>
              <p className="text-xs text-slate-400">{trackerPrimaryCount} von {snapshot.total}</p>
            </div>
            <div className="rounded-xl border border-amber-800 bg-amber-950/30 p-3">
              <p className="text-[10px] uppercase tracking-wide text-amber-300">Warnungen</p>
              <p className="mt-1 text-xl font-bold text-white">{snapshot.warnings}</p>
              <p className="text-xs text-slate-400">Fallback-/Source-Hinweise</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-white">Aktueller Import-Status:</span>
              <span className="text-sm text-slate-300">{snapshotVerdict}</span>
            </div>
            <button
              type="button"
              onClick={() => setSnapshot(readSquadSnapshot())}
              className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              Snapshot neu laden
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {DIAGNOSTIC_RULES.map((rule) => {
              const severityClass =
                rule.severity === 'hoch'
                  ? 'border-red-700 bg-red-950/20 text-red-300'
                  : rule.severity === 'mittel'
                  ? 'border-amber-700 bg-amber-950/20 text-amber-300'
                  : 'border-slate-700 bg-slate-900/50 text-slate-300';

              return (
                <div key={rule.symptom} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                  <div className="flex items-start gap-3">
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${severityClass}`}>
                      {rule.severity}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white">Wenn: {rule.symptom}</h3>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 text-xs">
                    <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-3">
                      <p className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Dann prüfen</p>
                      <p className="text-slate-300">{rule.check}</p>
                    </div>
                    <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-3">
                      <p className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Wahrscheinliche Ursache</p>
                      <p className="text-slate-300">{rule.likelyCause}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-950/30 border border-emerald-900 p-3">
                      <p className="text-emerald-400 uppercase tracking-wide text-[10px] mb-1">Spielvorteil</p>
                      <p className="text-emerald-100/90">{rule.userAdvantage}</p>
                    </div>
                    <div className="rounded-lg bg-violet-950/30 border border-violet-900 p-3">
                      <p className="text-violet-300 uppercase tracking-wide text-[10px] mb-1">Nächster Refactor</p>
                      <p className="text-slate-300">{rule.nextRefactor}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
