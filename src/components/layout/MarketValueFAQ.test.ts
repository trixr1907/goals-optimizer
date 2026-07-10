import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = readFileSync(resolve(__dirname, 'MarketValueFAQ.tsx'), 'utf8');

describe('MarketValueFAQ source content', () => {
  it('contains the exact market-value FAQ copy', () => {
    expect(SRC).toContain(
      'Warum sehe ich keine Marktwerte? Aktuell gibt es leider keine öffentliche Preis-API (weder von GOALS noch von Drittanbietern wie goalsvalue). Sobald sich das ändert, binden wir die Live-Preise sofort für euch ein!',
    );
  });

  it('uses a compact disclosure component instead of a sticky banner', () => {
    expect(SRC).toContain('<details');
    expect(SRC).toContain('<summary');
  });
});
