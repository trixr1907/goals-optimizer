/**
 * upgrade-roi.ts v1 — Upgrade-ROI ohne training_value (Goalsverse-only)
 * ==========================================================================
 * Sprint-B-Ergebnis: training_value existiert NICHT im Goalsverse-Payload
 * (Tracker-exklusiv, kommt nur bei Tracker-200). Trotzdem ist Upgrade-ROI
 * jetzt sinnvoll, weil Goalsverse liefert:
 *   - overall / roleRatings
 *   - aging.potentialRange / aging.upgradesRemaining
 *   - current_xp (13/18 Full-Spieler)
 *
 * Nur die KOSTEN (xp_next_upgrade) sind Tracker-only — daher confidence-aware:
 * fehlen Kosten → partial + Hinweis, nicht NO_DATA.
 *
 * training_value verfeinert später nur den "erreichbarer Anteil"-Hebel (P1+).
 *
 * Rarity-Tier-Arbitrage: überschreitet das nächste Upgrade eine Tier-Grenze
 * → INVEST_NOW (Karte wertet deutlich auf, oft günstigster Moment).
 */

import type { Player } from '@/lib/scraper/types';

// ── Rarity-Tiers — identisch zu mapOvrToRarity() in goalsverse-client.ts ─────
// Basic < 60, Common 60-69, Uncommon 70-79, Rare 80-84,
// Epic 85-89, Legendary 90-94, Mythic 95+

const RARITY_TIERS: [number, number, string][] = [
  [0,  59, 'Basic'],
  [60, 69, 'Common'],
  [70, 79, 'Uncommon'],
  [80, 84, 'Rare'],
  [85, 89, 'Epic'],
  [90, 94, 'Legendary'],
  [95, 99, 'Mythic'],
];

export function rarityOf(rating: number): string {
  for (const [lo, hi, name] of RARITY_TIERS) {
    if (rating >= lo && rating <= hi) return name;
  }
  return 'Unknown';
}

// ── Output-Typ ────────────────────────────────────────────────────────────────

export interface UpgradeRoiV1 {
  available: boolean;
  action: 'INVEST' | 'INVEST_NOW' | 'HOLD' | 'SELL_OR_LEGEND' | 'MAXED' | 'NO_DATA';
  /** Expected OVR gain per remaining upgrade slot. */
  expected_gain_per_upgrade: number;
  /** Total OVR headroom: ceiling − current. */
  total_headroom: number;
  upgrades_remaining: number;
  /** True when the next upgrade is expected to cross a rarity tier boundary. */
  crosses_rarity_tier: boolean;
  next_rarity?: string;
  /** OVR-gain per 100k XP — only available when xp_next_upgrade is known (Tracker). */
  roi?: number;
  /** 0..1 — how reliable is this recommendation? */
  confidence: number;
  basis: 'full' | 'partial' | 'thin';
  /** Fields that are absent and reduce confidence. */
  missing: string[];
  note?: string;
}

// ── Haupt-Funktion ────────────────────────────────────────────────────────────

/**
 * Computes Upgrade-ROI v1 for a player.
 * Inputs: Player from types.ts (same shape used everywhere in the app).
 * Does NOT require training_value (Tracker-only; added later as a refining lever).
 */
export function upgradeRoiV1(
  player: Pick<Player, 'overall' | 'age' | 'roleRatings' | 'aging' | 'xp_next_upgrade' | 'upgrade_count'>,
): UpgradeRoiV1 {
  const missing: string[] = [];

  // Best available current rating (max of overall and all role ratings)
  const roleOvrs = player.roleRatings?.map((r) => r.overall) ?? [];
  const current = Math.max(player.overall, ...roleOvrs);

  // Ceiling from aging.potentialRange[1] or aging.targetRating as fallback
  const ceiling = player.aging?.potentialRange?.[1] ?? player.aging?.targetRating ?? null;
  if (ceiling == null) missing.push('aging.potentialRange');

  const remaining = player.aging?.upgradesRemaining ?? 0;
  const hasAge = typeof player.age === 'number';
  if (!hasAge) missing.push('age');

  const hasCost = typeof player.xp_next_upgrade === 'number';
  if (!hasCost) missing.push('xp_next_upgrade');

  // ── Early exits ───────────────────────────────────────────────────────────

  // No potential data at all → cannot compute
  if (ceiling == null) {
    return {
      available: false,
      action: 'NO_DATA',
      expected_gain_per_upgrade: 0,
      total_headroom: 0,
      upgrades_remaining: remaining,
      crosses_rarity_tier: false,
      confidence: 0,
      basis: 'thin',
      missing,
      note: 'Kein aging/Potenzial im Payload — Goalsverse-Full-Daten fehlen.',
    };
  }

  // Near retirement: sell rather than invest
  if (hasAge && player.age! >= 34) {
    return {
      available: true,
      action: 'SELL_OR_LEGEND',
      expected_gain_per_upgrade: 0,
      total_headroom: Math.max(0, ceiling - current),
      upgrades_remaining: remaining,
      crosses_rarity_tier: false,
      confidence: 1,
      basis: 'full',
      missing,
      note: 'Spieler in Rentenzone (≥34J) — Verkauf oder Legend.',
    };
  }

  // All upgrades used up
  if (remaining <= 0) {
    return {
      available: true,
      action: 'MAXED',
      expected_gain_per_upgrade: 0,
      total_headroom: Math.round(Math.max(0, ceiling - current) * 100) / 100,
      upgrades_remaining: 0,
      crosses_rarity_tier: false,
      confidence: 1,
      basis: 'full',
      missing,
      note: 'Alle Upgrade-Slots verbraucht.',
    };
  }

  // ── Core calculation ──────────────────────────────────────────────────────

  const total_headroom = Math.max(0, ceiling - current);
  const expected_gain  = remaining > 0 ? total_headroom / remaining : 0;
  const next_rating    = current + expected_gain;

  // Rarity tier cross-check
  const currentRarity = rarityOf(current);
  const nextRarity    = rarityOf(next_rating);
  const crosses       = currentRarity !== nextRarity;

  // ROI: OVR-gain per 100k XP (only if cost known)
  let roi: number | undefined;
  if (hasCost && player.xp_next_upgrade! > 0) {
    roi = Math.round((expected_gain / player.xp_next_upgrade!) * 100_000 * 100) / 100;
  }

  // ── Action ───────────────────────────────────────────────────────────────
  // Priority: tier-cross > headroom > age > hold

  let action: UpgradeRoiV1['action'];
  if (crosses) {
    action = 'INVEST_NOW';
  } else if (total_headroom >= 8) {
    action = 'INVEST';
  } else {
    action = 'HOLD';
  }

  // ── Confidence ────────────────────────────────────────────────────────────
  // Pillars: ceiling known, age known, cost known
  const pillars = [
    ceiling != null,
    hasAge,
    hasCost,
  ];
  const confidence = Math.round((pillars.filter(Boolean).length / pillars.length) * 100) / 100;
  const basis: UpgradeRoiV1['basis'] =
    confidence >= 0.9 ? 'full' : confidence >= 0.5 ? 'partial' : 'thin';

  const note = !hasCost
    ? 'Kosten (xp_next_upgrade) Tracker-only — ROI erscheint sobald Tracker 200 liefert.'
    : undefined;

  return {
    available: true,
    action,
    expected_gain_per_upgrade: Math.round(expected_gain * 100) / 100,
    total_headroom:             Math.round(total_headroom * 100) / 100,
    upgrades_remaining:         remaining,
    crosses_rarity_tier:        crosses,
    next_rarity:                crosses ? nextRarity : undefined,
    roi,
    confidence,
    basis,
    missing,
    note,
  };
}

// ── Batch helper ──────────────────────────────────────────────────────────────

/** Rank players by upgrade priority. INVEST_NOW > INVEST > HOLD > rest. */
const ACTION_RANK: Record<UpgradeRoiV1['action'], number> = {
  INVEST_NOW:     0,
  INVEST:         1,
  HOLD:           2,
  SELL_OR_LEGEND: 3,
  MAXED:          4,
  NO_DATA:        5,
};

export function rankByUpgradePriority(
  players: Pick<Player, 'name' | 'overall' | 'age' | 'roleRatings' | 'aging' | 'xp_next_upgrade' | 'upgrade_count'>[],
): Array<{ name: string; overall: number; roi: UpgradeRoiV1 }> {
  return players
    .map((p) => ({ name: p.name, overall: p.overall, roi: upgradeRoiV1(p) }))
    .sort((a, b) => ACTION_RANK[a.roi.action] - ACTION_RANK[b.roi.action] || b.roi.expected_gain_per_upgrade - a.roi.expected_gain_per_upgrade);
}
