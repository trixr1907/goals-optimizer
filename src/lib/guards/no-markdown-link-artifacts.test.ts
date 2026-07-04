/**
 * Code-quality guard: ensures no Markdown-link artifacts end up in JSX/TSX source.
 *
 * Pattern that must NOT appear in any href/src attribute (or anywhere in TS/TSX files):
 *   href="[http..."   src="[http..."   ](http...
 *
 * These are created when a URL gets pasted from a Markdown-rendered context
 * and accidentally left inside a quoted attribute or template literal.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all .ts / .tsx files under a directory. */
function collectSourceFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      // Skip test-only dirs and build artefacts
      if (['node_modules', '.next', '__snapshots__'].includes(entry)) continue;
      result.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      result.push(fullPath);
    }
  }
  return result;
}

/**
 * Patterns that indicate a Markdown link was accidentally pasted into source.
 *
 * Covered cases:
 *  1. href="[http   or  src="[http   — attribute value starts with MD link
 *  2. ](http                          — closing of MD inline link (any context)
 *  3. `[http                          — MD link inside template literal
 */
const ARTIFACT_PATTERNS: RegExp[] = [
  /href=["']\[https?:/i,
  /src=["']\[https?:/i,
  /\]\(https?:/,
  /`\[https?:/,
];

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

const SRC_DIR = path.resolve(__dirname, '../../../src');

describe('no-markdown-link-artifacts guard', () => {
  const files = collectSourceFiles(SRC_DIR);

  it('found source files to scan (sanity check)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('src/**/*.{ts,tsx} contains no Markdown-link artifacts in JSX attributes or strings', () => {
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        // Skip pure comment lines — they might intentionally document the pattern
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

        for (const pattern of ARTIFACT_PATTERNS) {
          if (pattern.test(line)) {
            const relPath = path.relative(SRC_DIR, file);
            violations.push(`${relPath}:${idx + 1}  →  ${trimmed}`);
          }
        }
      });
    }

    if (violations.length > 0) {
      throw new Error(
        `Markdown-link artifacts detected in source files:\n\n` +
          violations.map(v => `  • ${v}`).join('\n') +
          `\n\nReplace the MD link with a plain URL, e.g.:\n` +
          `  WRONG:  href="[https://example.com](https://example.com)"\n` +
          `  RIGHT:  href="https://example.com"\n`
      );
    }

    expect(violations).toHaveLength(0);
  });
});
