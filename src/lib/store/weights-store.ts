/**
 * weights-store.ts — Opinion-Gewichtung (F)
 * ============================================
 * Nur Opinion-Gewichte sind editierbar (Leitprinzip aus StepEF-Brief):
 *
 *  🔓 Opinion (editierbar):
 *    - True-Value-Pillars: [current, ceiling, headroom, lifecycle]
 *    - Rating-Blend: overallWeight / fitWeight
 *    - ROI-Toggles: tierCrossOnly, ignoreLateAge
 *
 *  🔒 Game-Truth (NICHT editierbar, hier nicht gespeichert):
 *    - _meta Per-Stat-Fit, Positions-Penalty (0/-2/-5), Rarity-Tiers
 *
 * Persistierung: localStorage (key = 'goals-opinion-weights').
 * Default = SOTA-Baseline; Neuloads landen immer dort.
 * User-Edits = lokales Overlay, nie global.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── True-Value Pillar-Gewichte ────────────────────────────────────────────

/** Entspricht w = [current, ceiling, headroom, lifecycle] in trueValue(). */
export interface TrueValueWeights {
  current: number;   // default 0.40
  ceiling: number;   // default 0.20
  headroom: number;  // default 0.25
  lifecycle: number; // default 0.15
}

/** Rating-Blend: score = overall/99 * overallW + fit/100 * fitW */
export interface RatingBlendWeights {
  overallW: number;  // default 0.70
  fitW: number;      // default 0.30
}

/** Upgrade-ROI Toggles */
export interface RoiToggles {
  /** Nur INVEST_NOW empfehlen wenn tier-cross sicher ist. */
  tierCrossOnly: boolean;       // default false
  /** Spieler >= 34 immer als SELL_OR_LEGEND zeigen (aus). */
  ignoreLateAge: boolean;       // default false
}

export interface OpinionWeights {
  trueValue: TrueValueWeights;
  ratingBlend: RatingBlendWeights;
  roiToggles: RoiToggles;
}

// ── SOTA-Baseline (Default) ────────────────────────────────────────────────

export const DEFAULT_WEIGHTS: OpinionWeights = {
  trueValue: {
    current:   0.40,
    ceiling:   0.20,
    headroom:  0.25,
    lifecycle: 0.15,
  },
  ratingBlend: {
    overallW: 0.70,
    fitW:     0.30,
  },
  roiToggles: {
    tierCrossOnly: false,
    ignoreLateAge: false,
  },
};

// ── Helper: sind aktive Weights identisch zu Default? ─────────────────────

function isDefault(w: OpinionWeights): boolean {
  const d = DEFAULT_WEIGHTS;
  return (
    w.trueValue.current   === d.trueValue.current   &&
    w.trueValue.ceiling   === d.trueValue.ceiling   &&
    w.trueValue.headroom  === d.trueValue.headroom  &&
    w.trueValue.lifecycle === d.trueValue.lifecycle &&
    w.ratingBlend.overallW === d.ratingBlend.overallW &&
    w.ratingBlend.fitW     === d.ratingBlend.fitW    &&
    w.roiToggles.tierCrossOnly === d.roiToggles.tierCrossOnly &&
    w.roiToggles.ignoreLateAge === d.roiToggles.ignoreLateAge
  );
}

/** Auto-normalisiert TrueValue-Pillars auf Summe = 1.0. */
function normalizeTrueValue(w: TrueValueWeights): TrueValueWeights {
  const sum = w.current + w.ceiling + w.headroom + w.lifecycle;
  if (sum === 0) return DEFAULT_WEIGHTS.trueValue;
  return {
    current:   Math.round((w.current   / sum) * 1000) / 1000,
    ceiling:   Math.round((w.ceiling   / sum) * 1000) / 1000,
    headroom:  Math.round((w.headroom  / sum) * 1000) / 1000,
    lifecycle: Math.round((w.lifecycle / sum) * 1000) / 1000,
  };
}

/** Auto-normalisiert Rating-Blend auf Summe = 1.0. */
function normalizeRatingBlend(w: RatingBlendWeights): RatingBlendWeights {
  const sum = w.overallW + w.fitW;
  if (sum === 0) return DEFAULT_WEIGHTS.ratingBlend;
  return {
    overallW: Math.round((w.overallW / sum) * 1000) / 1000,
    fitW:     Math.round((w.fitW     / sum) * 1000) / 1000,
  };
}

// ── Store ──────────────────────────────────────────────────────────────────

interface WeightsState {
  weights: OpinionWeights;
  isCustomized: boolean;
  setTrueValueWeight: (key: keyof TrueValueWeights, value: number) => void;
  setRatingBlendWeight: (key: keyof RatingBlendWeights, value: number) => void;
  setRoiToggle: (key: keyof RoiToggles, value: boolean) => void;
  resetToDefault: () => void;
}

export const useWeightsStore = create<WeightsState>()(
  persist(
    (set) => ({
      weights: DEFAULT_WEIGHTS,
      isCustomized: false,

      setTrueValueWeight: (key, value) =>
        set((state) => {
          const updated = { ...state.weights.trueValue, [key]: value };
          const normalized = normalizeTrueValue(updated);
          const newWeights = { ...state.weights, trueValue: normalized };
          return { weights: newWeights, isCustomized: !isDefault(newWeights) };
        }),

      setRatingBlendWeight: (key, value) =>
        set((state) => {
          const updated = { ...state.weights.ratingBlend, [key]: value };
          const normalized = normalizeRatingBlend(updated);
          const newWeights = { ...state.weights, ratingBlend: normalized };
          return { weights: newWeights, isCustomized: !isDefault(newWeights) };
        }),

      setRoiToggle: (key, value) =>
        set((state) => {
          const newWeights = {
            ...state.weights,
            roiToggles: { ...state.weights.roiToggles, [key]: value },
          };
          return { weights: newWeights, isCustomized: !isDefault(newWeights) };
        }),

      resetToDefault: () =>
        set({ weights: DEFAULT_WEIGHTS, isCustomized: false }),
    }),
    { name: 'goals-opinion-weights' },
  ),
);

// ── Utility: TrueValueWeights als Tuple für trueValue() ───────────────────

export function toTrueValueTuple(
  w: TrueValueWeights,
): [number, number, number, number] {
  return [w.current, w.ceiling, w.headroom, w.lifecycle];
}
