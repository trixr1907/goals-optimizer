import { describe, expect, it } from 'vitest';
import { inferFullStats } from '@/lib/scraper/infer-stats';
import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import { analyzeTactics } from './tactics-engine';

const POSITIONS: Position[] = ['GK', 'CB', 'FB', 'WB', 'DM', 'CM', 'AM', 'WM', 'WF', 'CF', 'ST'];

function player(
  id: string,
  position: Position,
  stats: ReturnType<typeof inferFullStats>,
  overrides: Partial<PlayerWithScores> = {},
): PlayerWithScores {
  return {
    id,
    name: overrides.name ?? id,
    position,
    overall: overrides.overall ?? 80,
    rarity: 'Rare',
    stats,
    roleRatings: [{ position, overall: overrides.overall ?? 80 }],
    secondaryPositions: [],
    fit_scores: Object.fromEntries(POSITIONS.map((pos) => [pos, pos === position ? 90 : 50])) as Record<Position, number>,
    positionType: Object.fromEntries(POSITIONS.map((pos) => [pos, pos === position ? 'primary' : 'out'])) as Record<Position, 'primary' | 'secondary' | 'out'>,
    effectiveStats: Object.fromEntries(POSITIONS.map((pos) => [pos, stats])) as Record<Position, typeof stats>,
    dataQuality: 'full',
    ...overrides,
  };
}

function filled(players: PlayerWithScores[]) {
  return players.map((p, idx) => ({
    slot: { position: p.position, x: 50, y: 50 + idx } as LineupSlot,
    player: p,
  }));
}

function tipText(players: PlayerWithScores[]) {
  const analysis = analyzeTactics(filled(players), {});
  return [...analysis.tips.map((t) => `${t.headline} ${t.detail}`), ...analysis.overallWarnings].join(' ');
}

describe('analyzeTactics', () => {
  it('warnt bei langsamen CBs vor hoher Linie', () => {
    const text = tipText([
      player('CB langsam 1', 'CB', inferFullStats(58, 35, 55, 50, 84, 78)),
      player('CB langsam 2', 'CB', inferFullStats(60, 35, 55, 50, 82, 80)),
      player('CM', 'CM', inferFullStats(70, 65, 78, 72, 60, 70)),
    ]);

    expect(text).toMatch(/Tiefe Linie|keine hohe Linie|hohe Abwehrlinie/i);
  });

  it('empfiehlt Konter bei schnellem ST und gutem Passgeber', () => {
    const text = tipText([
      player('Sprinter ST', 'ST', inferFullStats(90, 82, 65, 78, 35, 72)),
      player('Passer CM', 'CM', inferFullStats(70, 68, 84, 78, 60, 72)),
      player('CB', 'CB', inferFullStats(74, 35, 55, 50, 82, 80)),
    ]);

    expect(text).toMatch(/Konter|Steilpässe|Tiefe/i);
  });

  it('empfiehlt Flanken bei Target ST und guten Crossern', () => {
    const text = tipText([
      player('Target ST', 'ST', inferFullStats(70, 84, 65, 74, 35, 86)),
      player('Crosser WB', 'WB', inferFullStats(86, 58, 84, 78, 68, 74)),
      player('CM', 'CM', inferFullStats(70, 65, 75, 72, 60, 70)),
    ]);

    expect(text).toMatch(/Flanken|Target ST|Zielspieler/i);
  });

  it('warnt bei niedriger Team-Stamina vor Dauerpressing', () => {
    const text = tipText([
      player('ST müde', 'ST', inferFullStats(75, 80, 65, 72, 35, 55)),
      player('CM müde', 'CM', inferFullStats(70, 65, 76, 72, 60, 58)),
      player('CB müde', 'CB', inferFullStats(72, 35, 55, 50, 80, 60)),
    ]);

    expect(text).toMatch(/Pressing dosieren|Dauerpressing|Stamina/i);
  });

  it('warnt ohne DM vor fehlender Absicherung', () => {
    const text = tipText([
      player('ST', 'ST', inferFullStats(80, 82, 65, 75, 35, 72)),
      player('CM 1', 'CM', inferFullStats(70, 65, 78, 72, 55, 70)),
      player('CM 2', 'CM', inferFullStats(72, 65, 80, 74, 58, 72)),
      player('CB', 'CB', inferFullStats(74, 35, 55, 50, 82, 80)),
    ]);

    expect(text).toMatch(/Ohne DM|Absicherung|Doppel-6|Abräumer/i);
  });
});
