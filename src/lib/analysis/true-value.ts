/**
 * true-value.ts — True-Value-Score v2 (confidence-aware)
 * ==========================================================
 * Berechnet den "True Value" eines GOALS-Spielers:
 *   aktuelle Stärke + Entwicklungspotenzial + verbleibende Lebenszeit.
 *
 * v2 vs. v1: Graceful degradation statt stiller 0-Multiplikation.
 * Bei fehlenden Feldern (live: training_value 0/53) gibt die Funktion
 * KEINE scheinbar belastbare Zahl zurück — sondern eine explizite
 * Confidence + basis + missing[]. Die UI kann damit sauber unterscheiden.
 *
 * Konsumiert direkt Player / PlayerWithScores aus types.ts —
 * kein eigener PlayerDev-Type nötig.
 *
 * Felder-Mapping (alle bereits in goalsverse-client.ts gemappt):
 *   age                <- raw.current_age
 *   training_value     <- raw.potential.training_value  (1..8)
 *   aging.targetRating <- raw.max_potential_rating
 *   aging.upgradesRemaining <- raw.upgrades_remaining
 *   aging.potentialRange    <- [min, max] (bereits berechnet)
 *   xp_current         <- raw.current_xp
 *   rarity             <- mapOvrToRarity()
 *   overall / roleRatings / secondaryPositions (vorhanden)
 *
 * NICHT in v2 vorausgesetzt (P1): xp_next_upgrade, upgrade_count
 * -> upgradeRoi() ist geblockt bis Sprint B diese Felder belegt.
 */

import type { Player, PlayerWithScores } from '@/lib/scraper/types';

// ── Konstanten ────────────────────────────────────────────────────────────────

/** Erwartetes GOALS-Rentenalter (zufällig 34–40, Neutralwert). */
const EXPECTED_RETIREMENT_AGE = 37;

/** Untergrenze für Normalisierung von headroom. */
const HEADROOM_NORM = 60;

// ── Confidence-Typen ──────────────────────────────────────────────────────────

/** Wie verlässlich ist der berechnete Score? */
export type TrueValueBasis = 'full' | 'partial' | 'thin';

export interface TrueValueOptions {
  /** User-provided replacement for missing API training_value (1..8). */
  trainingValueOverride?: number | null;
}

/** Ausgabe von trueValue() — IMMER mit Confidence, nie stille Degradation. */
export interface TrueValueResult {
  /** 0..100 — je höher desto wertvoller für Besitz & Entwicklung. */
  score: number;
  /**
   * 0..1 — Verlässlichkeit des Scores.
   *  1.0  = alle Felder vorhanden (full)
   *  0.5  = partielle Daten (aging vorhanden, training_value fehlt)
   *  0.25 = nur OVR + Position (thin — Basic-Spieler ohne Aging)
   */
  confidence: number;
  /** Datenbasis hinter dem Score. */
  basis: TrueValueBasis;
  /** Felder die fehlen und den Score degradieren. */
  missing: string[];
  /** Kurztext für die UI (deutsch, quellenfrei). */
  hint: string;
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/**
 * Lebenszyklus-Faktor 0..1: wie viel nutzbare Zeit bleibt.
 * Spieler >= 34 Jahren erhalten 0 (Rentner-Zone).
 */
export function lifecycleFactor(age: number): number {
  return Math.max(0, Math.min(1, (EXPECTED_RETIREMENT_AGE - age) / 16));
}

/**
 * Beste verfügbare Position-Bewertung.
 * Für Full-Spieler: max(overall, ...roleRatings).
 * Für Basic-Spieler: overall.
 */
export function currentRating(player: Pick<Player, 'overall' | 'roleRatings'>): number {
  const ratings = player.roleRatings?.map((r) => r.overall) ?? [];
  return Math.max(player.overall, ...ratings);
}

// ── Haupt-Funktion ────────────────────────────────────────────────────────────

/**
 * Berechnet den True-Value-Score mit expliziter Confidence.
 *
 * Gewichte w = [current, ceiling, headroom, lifecycle]:
 *   Default: [0.40, 0.20, 0.25, 0.15]
 *
 * Bei fehlenden Feldern:
 *   - training_value fehlt → tvLeverage = 0.5 (halber Hebel, nicht 0!)
 *   - aging fehlt          → ceiling = overall, headroom = 0, lifecycle aus age
 *   - age fehlt            → lifecycle = 0.5 (Mittelwert)
 */
export function trueValue(
  player: Pick<Player, 'overall' | 'age' | 'training_value' | 'aging' | 'roleRatings'>,
  w: [number, number, number, number] = [0.40, 0.20, 0.25, 0.15],
  options: TrueValueOptions = {},
): TrueValueResult {
  const missing: string[] = [];
  const override = options.trainingValueOverride;
  const hasTrainingValueOverride = typeof override === 'number' && override >= 1 && override <= 8;
  const normalizedTrainingValueOverride = hasTrainingValueOverride
    ? Math.max(1, Math.min(8, Math.round(override)))
    : null;

  // ── Feld-Verfügbarkeit prüfen ────────────────────────────────────────────
  const hasAge = typeof player.age === 'number';
  const hasTrainingValue =
    (typeof player.training_value === 'number' && player.training_value > 0) || hasTrainingValueOverride;
  const hasAging = player.aging != null;

  if (!hasAge)           missing.push('age');
  if (!hasTrainingValue) missing.push('training_value');
  if (!hasAging)         missing.push('aging');

  // ── Confidence bestimmen ─────────────────────────────────────────────────
  let confidence: number;
  let basis: TrueValueBasis;

  if (missing.length === 0) {
    confidence = 1.0;
    basis = 'full';
  } else if (hasAging || hasAge) {
    // Teilweise Daten: mindestens Lebenszeit-Signal vorhanden
    confidence = 0.5;
    basis = 'partial';
  } else {
    // Nur OVR — sehr dünne Datenbasis
    confidence = 0.25;
    basis = 'thin';
  }

  // ── Werte mit Fallbacks ───────────────────────────────────────────────────

  const current = currentRating(player);

  // Lebenszeit: falls kein Alter bekannt → neutral 0.5
  const lifecycle = hasAge ? lifecycleFactor(player.age!) : 0.5;

  // Ceiling: falls kein Aging → nur current OVR (kein Wachstum bekannt)
  const ceiling = hasAging ? player.aging!.potentialRange[1] : current;

  // Headroom: Differenz zwischen Potential und aktuellem Stand
  const headroom = Math.max(0, ceiling - current);

  // TV-Hebel: training_value fehlt → 0.5 (neutral, nicht 0!)
  // training_value = 0 im Payload heißt: Feld nicht gemappt, nicht "kein Training"
  const tvRaw = hasTrainingValueOverride ? normalizedTrainingValueOverride! : hasTrainingValue ? player.training_value! : 4; // 4/8 = 0.5
  const tvLeverage = tvRaw / 8; // 0.125..1.0

  // ── Score berechnen ───────────────────────────────────────────────────────

  const currentN  = current / 99;
  const ceilingN  = ceiling / 99;
  const headroomN = (headroom / HEADROOM_NORM) * tvLeverage * lifecycle;

  const rawScore = (w[0] * currentN + w[1] * ceilingN + w[2] * headroomN + w[3] * lifecycle) * 100;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)) * 10) / 10;

  // ── Hint-Text (deutsch, quellenfrei) ─────────────────────────────────────

  let hint: string;
  if (basis === 'full') {
    hint = 'Vollständige Entwicklungsdaten.';
  } else if (basis === 'partial') {
    const fehlend = missing.includes('training_value') ? 'Training-Wert' : 'Alter';
    hint = `Eingeschränkt — ${fehlend} nicht verfügbar. Score geschätzt.`;
  } else {
    hint = 'Nur Basis-OVR — Score sehr unsicher.';
  }

  return { score, confidence, basis, missing, hint };
}

// ── DevTag ────────────────────────────────────────────────────────────────────

export type DevTag = 'cornerstone' | 'develop' | 'sell_or_legend' | 'watch' | 'uncertain';

/**
 * Handlungsempfehlung für /development.
 * Bei confidence < 0.5 (thin) immer 'uncertain' — keine Empfehlung auf dünnen Daten.
 */
export function devTag(
  player: Pick<Player, 'overall' | 'age' | 'training_value' | 'aging' | 'roleRatings'>,
): DevTag {
  // age unknown → cannot conclude "sell_or_legend"; fall through to confidence check
  if (typeof player.age === 'number' && player.age >= 34) return 'sell_or_legend';

  const result = trueValue(player);

  // Zu dünne Datenbasis für klare Empfehlung
  if (result.confidence < 0.5) return 'uncertain';

  const tv = result.score;
  const tv_raw = player.training_value ?? 0;
  const upgradesRemaining = player.aging?.upgradesRemaining ?? 0;

  if (typeof player.age === 'number' && player.age <= 23 && tv >= 68 && tv_raw >= 6) return 'cornerstone';
  if (tv_raw >= 5 && upgradesRemaining > 0)  return 'develop';
  return 'watch';
}

export const DEV_TAG_LABEL: Record<DevTag, string> = {
  cornerstone:    '🟢 Eckpfeiler (aufbauen)',
  develop:        '🔵 Entwickeln',
  sell_or_legend: '🟡 Verkaufen / Legend',
  watch:          '⚪ Beobachten',
  uncertain:      '❓ Datenlage unklar',
};

// ── DevRow ────────────────────────────────────────────────────────────────────

export interface DevRow {
  name: string;
  position: string;
  rarity: string;
  overall: number;
  age: number | null;
  training_value: number | null;
  potential_min: number | null;
  potential_max: number | null;
  upgrades_remaining: number | null;
  xp_current: number | null;
  true_value: number;
  confidence: number;
  basis: TrueValueBasis;
  missing: string[];
  hint: string;
  tag: DevTag;
}

export function toDevRow(player: Player | PlayerWithScores): DevRow {
  const result = trueValue(player);
  return {
    name:               player.name,
    position:           player.position,
    rarity:             player.rarity,
    overall:            player.overall,
    age:                player.age ?? null,
    training_value:     player.training_value ?? null,
    potential_min:      player.aging?.potentialRange[0] ?? null,
    potential_max:      player.aging?.potentialRange[1] ?? null,
    upgrades_remaining: player.aging?.upgradesRemaining ?? null,
    xp_current:         player.xp_current ?? null,
    true_value:         result.score,
    confidence:         result.confidence,
    basis:              result.basis,
    missing:            result.missing,
    hint:               result.hint,
    tag:                devTag(player),
  };
}

/** Sortiert nach True-Value absteigend, ties nach confidence. */
export function rankByTrueValue(players: (Player | PlayerWithScores)[]): DevRow[] {
  return players
    .map(toDevRow)
    .sort((a, b) => b.true_value - a.true_value || b.confidence - a.confidence);
}

// ── Upgrade-ROI (P1 — guard bis Sprint B) ────────────────────────────────────

export interface UpgradeRoi {
  available: boolean;
  action: 'UPGRADE_NOW' | 'UPGRADE' | 'SELL_OR_LEGEND' | 'MAXED' | 'NO_DATA';
  expected_gain: number;
  cost_xp?: number;
  roi?: number;
  note: string;
}

/**
 * Gibt Upgrade-ROI zurück — aber erst wenn xp_next_upgrade im Payload vorhanden ist.
 * Solange 0/53 Training-Values ankommen, muss Sprint B klären ob Feldname-Mismatch vorliegt.
 */
export function upgradeRoi(player: Pick<Player, 'age' | 'aging' | 'xp_next_upgrade' | 'upgrade_count'>): UpgradeRoi {
  const age = player.age ?? 0;
  const upgradesRemaining = player.aging?.upgradesRemaining ?? 0;

  if (age >= 34 || upgradesRemaining <= 0) {
    return { available: true, action: 'MAXED', expected_gain: 0, note: 'Maximales Potential oder Rentner-Zone.' };
  }
  if (player.xp_next_upgrade == null) {
    return {
      available: false,
      action: 'NO_DATA',
      expected_gain: 0,
      note: 'xp_next_upgrade nicht im Payload — Sprint B (Payload-Audit) muss klären ob Feldname-Mismatch.',
    };
  }

  // Expected gain per upgrade: ceiling minus targetRating spread across remaining upgrades.
  // targetRating is the current OVR ceiling; potentialRange[1] is the absolute max.
  // headroom = how many more OVR points are possible above current targetRating.
  const headroom = Math.max(
    0,
    (player.aging?.potentialRange[1] ?? 0) - (player.aging?.targetRating ?? 0),
  );
  let expected_gain = upgradesRemaining > 0 ? headroom / upgradesRemaining : 0;
  if (player.upgrade_count != null && player.upgrade_count >= 3) expected_gain += 0.5; // Dynamic Potential bonus

  const cost = player.xp_next_upgrade;
  // roi = OVR-gain per 100k XP invested (scale that makes sense for GOALS XP ranges)
  const roi = cost > 0 ? (expected_gain / cost) * 100_000 : 0;
  const action = age >= 34 ? 'SELL_OR_LEGEND' : 'UPGRADE';

  return {
    available: true,
    action,
    expected_gain: Math.round(expected_gain * 100) / 100,
    cost_xp: cost,
    roi: Math.round(roi * 100) / 100,
    note: '',
  };
}
