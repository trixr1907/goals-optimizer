import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Source-level checks for DisclaimerBanner.tsx.
 *
 * These tests verify that the rendered JSX text contains the required
 * disclaimer copy without needing a DOM environment. They guard against
 * accidental removal of the disclaimer text during refactors.
 */
const SRC = readFileSync(
  resolve(__dirname, 'DisclaimerBanner.tsx'),
  'utf8',
);

describe('DisclaimerBanner source content', () => {
  it('contains the ivo-tech attribution', () => {
    expect(SRC).toContain('ivo-tech');
  });

  it('contains the word "unofficial" (case-insensitive)', () => {
    expect(SRC.toLowerCase()).toContain('unofficial');
  });

  it('does not reference EA FC, EA Sports, FIFA, or Ultimate Team', () => {
    const forbidden = ['EA FC', 'EA Sports', 'FIFA', 'Ultimate Team'];
    for (const term of forbidden) {
      expect(SRC).not.toContain(term);
    }
  });

  it('renders as a function export named DisclaimerBanner', () => {
    expect(SRC).toMatch(/export\s+function\s+DisclaimerBanner/);
  });

  it('states it is not affiliated with or endorsed by the Goals developers', () => {
    expect(SRC.toLowerCase()).toContain('not affiliated');
  });
});
