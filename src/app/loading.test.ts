import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Source-level checks for app/loading.tsx.
 *
 * Verifies the loading UI contains a spinner element and loading text
 * without requiring a DOM environment.
 */
const SRC = readFileSync(resolve(__dirname, 'loading.tsx'), 'utf8');

describe('loading.tsx source content', () => {
  it('exports a default Loading function', () => {
    expect(SRC).toMatch(/export\s+default\s+function\s+Loading/);
  });

  it('contains a spinner element (animate-spin class)', () => {
    expect(SRC).toContain('animate-spin');
  });

  it('contains a loading text referencing GOALS Squad Optimizer', () => {
    expect(SRC).toContain('GOALS Squad Optimizer');
  });

  it('contains the word "Lade" (German for loading)', () => {
    expect(SRC).toContain('Lade');
  });

  it('does not reference EA FC, EA Sports, FIFA, or Ultimate Team', () => {
    const forbidden = ['EA FC', 'EA Sports', 'FIFA', 'Ultimate Team'];
    for (const term of forbidden) {
      expect(SRC).not.toContain(term);
    }
  });

  it('renders a full-screen centered container (min-h-screen)', () => {
    expect(SRC).toContain('min-h-screen');
  });
});
