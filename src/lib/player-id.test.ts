import { describe, it, expect } from 'vitest';
import { avatarUrl, extractRawId, buildGoalsverseId, PLAYER_CDN_BASE } from './player-id';

const SAMPLE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PREFIXED_ID = `goalsverse-${SAMPLE_UUID}`;

describe('extractRawId', () => {
  it('strips the goalsverse- prefix', () => {
    expect(extractRawId(PREFIXED_ID)).toBe(SAMPLE_UUID);
  });

  it('returns the input unchanged when no prefix is present', () => {
    expect(extractRawId(SAMPLE_UUID)).toBe(SAMPLE_UUID);
  });

  it('handles an empty string gracefully', () => {
    expect(extractRawId('')).toBe('');
  });

  it('does not strip a partial prefix match', () => {
    // "goalsverse" without the dash is not the prefix
    expect(extractRawId('goalsversefoo')).toBe('goalsversefoo');
  });
});

describe('buildGoalsverseId', () => {
  it('prepends the goalsverse- prefix to a raw UUID', () => {
    expect(buildGoalsverseId(SAMPLE_UUID)).toBe(PREFIXED_ID);
  });

  it('round-trips with extractRawId', () => {
    const built = buildGoalsverseId(SAMPLE_UUID);
    expect(extractRawId(built)).toBe(SAMPLE_UUID);
  });

  it('works on an empty string', () => {
    expect(buildGoalsverseId('')).toBe('goalsverse-');
  });
});

describe('avatarUrl', () => {
  it('builds the CDN URL from a prefixed ID', () => {
    expect(avatarUrl(PREFIXED_ID)).toBe(`${PLAYER_CDN_BASE}/${SAMPLE_UUID}.png`);
  });

  it('builds the CDN URL from a raw UUID', () => {
    expect(avatarUrl(SAMPLE_UUID)).toBe(`${PLAYER_CDN_BASE}/${SAMPLE_UUID}.png`);
  });

  it('returns an empty string when the character ID is empty', () => {
    expect(avatarUrl('')).toBe('');
  });

  it('uses the correct CDN base URL', () => {
    expect(PLAYER_CDN_BASE).toBe('https://cdn.playgoals.com/character/prod');
  });
});
