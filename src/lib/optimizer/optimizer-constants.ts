/**
 * Centralised position-type constants used across scorers, optimisers, and type logic.
 * Keeping them in one place ensures all modules always agree on rules.
 *
 * ── Solver bonuses ──────────────────────────────────────────────────────
 * Values are added to the raw fit score before cost-matrix / greedy-sort comparisons.
 * They are large enough to guarantee a primary-position player beats an out-of-position
 * player with identical raw stats, while still allowing a clearly superior stat-fit to
 * win between two secondary/out players.
 */
export const PRIMARY_BONUS = 25;
export const SECONDARY_BONUS = 10;

/**
 * ── GOALS position-penalty rules ────────────────────────────────────────
 * Verified against in-game behaviour:
 *
 *   primary position   → no penalty
 *   secondary position → OVR within SECONDARY_OVR_THRESHOLD of primary
 *   out of position    → anything else
 *
 * Stat penalties are applied to individual stats only (player.overall is NEVER
 * modified by position assignment).
 */
export const SECONDARY_STAT_PENALTY = 2;
export const OUT_OF_POSITION_STAT_PENALTY = 5;

/** OVR threshold: positions with OVR ≥ primary.overall – this value are secondary. */
export const SECONDARY_OVR_THRESHOLD = 10;

/**
 * Fit-score multipliers applied after the raw weighted-stat score.
 * These are mutliplied rather than subtracted so that high-quality players
 * retain differentiation even when played out of position.
 */
export const SECONDARY_FIT_MULTIPLIER = 0.88;
export const OUT_OF_POSITION_FIT_MULTIPLIER = 0.72;
