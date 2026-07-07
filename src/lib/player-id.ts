/**
 * Utility functions for working with GOALS player IDs.
 *
 * GOALSverse player IDs have the format "goalsverse-{uuid}".
 * External APIs (goals-tracker, playgoals) use the raw UUID, while
 * internal representation prefixes it to disambiguate from other sources.
 */

const GOALSVERSE_PREFIX = 'goalsverse-';

/** Base CDN URL for player avatar images. */
export const PLAYER_CDN_BASE = 'https://cdn.playgoals.com/character/prod';

/** Extracts the raw UUID from a goalsverse-prefixed player ID. */
export function extractRawId(characterId: string): string {
  return characterId.startsWith(GOALSVERSE_PREFIX)
    ? characterId.slice(GOALSVERSE_PREFIX.length)
    : characterId;
}

/** Builds a goalsverse player avatar URL from a character ID. */
export function avatarUrl(characterId: string): string {
  const rawId = extractRawId(characterId);
  return rawId ? `${PLAYER_CDN_BASE}/${rawId}.png` : '';
}

/** Builds a goalsverse-prefixed ID from a raw UUID. */
export function buildGoalsverseId(rawId: string): string {
  return `${GOALSVERSE_PREFIX}${rawId}`;
}
