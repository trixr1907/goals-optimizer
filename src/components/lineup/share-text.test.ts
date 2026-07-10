import { describe, expect, it } from 'vitest';
import { formatLineupShareText } from './share-text';
import { Position } from '@/lib/scraper/types';

const fitScores = (position: Position, score: number) => ({ [position]: score } as Record<Position, number>);

describe('formatLineupShareText', () => {
  it('formats the current starting XI for clipboard sharing', () => {
    const text = formatLineupShareText([
      {
        slot: { position: 'ST' },
        player: { name: 'Ivo Striker', overall: 85, fit_scores: fitScores('ST', 90) },
      },
      {
        slot: { position: 'CM' },
        player: { name: 'Yves Mid', overall: 82, fit_scores: fitScores('CM', 87.6) },
      },
    ], 'goals.ivo-tech.com');

    expect(text).toContain('🏆 Mein optimierter GOALS Squad');
    expect(text).toContain('ST: Ivo Striker (OVR: 85, Fit: 90)');
    expect(text).toContain('CM: Yves Mid (OVR: 82, Fit: 88)');
    expect(text).toContain('Generiert mit goals.ivo-tech.com');
  });

  it('falls back to goals.ivo-tech.com when hostname is empty', () => {
    const text = formatLineupShareText([], '  ');

    expect(text).toBe('🏆 Mein optimierter GOALS Squad\nGeneriert mit goals.ivo-tech.com');
  });
});
