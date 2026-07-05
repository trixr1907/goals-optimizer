/**
 * Position-type bonuses used in both the Hungarian solver and the greedy fallback.
 * Keeping them in one place ensures both solvers always agree on priorities.
 *
 * Values are added to the raw fit score before cost-matrix / greedy-sort comparisons.
 * They are large enough to guarantee a primary-position player beats an out-of-position
 * player with identical raw stats, while still allowing a clearly superior stat-fit to
 * win between two secondary/out players.
 */
export const PRIMARY_BONUS = 25;
export const SECONDARY_BONUS = 10;
