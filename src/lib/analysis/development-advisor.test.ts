/**
 * Tests for development-advisor.ts
 *
 * All tests are fixture-only — no network calls, no real store.
 */

import { describe, expect, it } from 'vitest';
import { adviseDevelopment } from './development-advisor';
import type { PlayerWithScores, Position } from '@/lib/scraper/types';
import type { TournamentSummary } from '@/lib/tournaments/tournament-parser';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_POSITIONS: Position[] = ['GK', 'CB', 'FB', 'WB', 'DM', 'CM', 'AM', 'WM', 'WF', 'CF', 'ST'];

const MOCK_TOURNAMENTS: TournamentSummary[] = [
  {
    name: 'Beginners Cup #5',
    timeLeft: null,
    mode: null,
    requirements: [{ key: 'OVR Max', value: '69' }],
    completionReward: [],
    rewardsPerRound: [],
  },
  {
    name: 'Challengers Cup #5',
    timeLeft: null,
    mode: null,
    requirements: [{ key: 'OVR Max', value: '79' }],
    completionReward: [],
    rewardsPerRound: [],
  },
  {
    name: 'Masters Cup #5',
    timeLeft: null,
    mode: null,
    requirements: [{ key: 'OVR Max', value: '84' }],
    completionReward: [],
    rewardsPerRound: [],
  },
  {
    name: 'Champions Cup #5',
    timeLeft: null,
    mode: null,
    requirements: [{ key: 'OVR Min', value: '70' }],
    completionReward: [],
    rewardsPerRound: [],
  },
];

function mockPlayer(overrides: {
  overall?: number;
  position?: Position;
  age?: number;
  dataQuality?: 'full' | 'basic';
  fit_scores?: Partial<Record<Position, number>>;
}): PlayerWithScores {
  const position = overrides.position ?? 'ST';
  const overall = overrides.overall ?? 60;

  const fit_scores: Record<Position, number> = {} as Record<Position, number>;
  for (const pos of ALL_POSITIONS) {
    fit_scores[pos] = overrides.fit_scores?.[pos] ?? 40;
  }

  return {
    id: `player-${overall}-${position}`,
    name: `Player ${overall}`,
    position,
    overall,
    rarity: 'Common',
    stats: {} as PlayerWithScores['stats'],
    roleRatings: [{ position, overall }],
    secondaryPositions: [],
    age: overrides.age,
    dataQuality: overrides.dataQuality,
    fit_scores,
    positionType: {} as Record<Position, 'primary' | 'secondary' | 'out'>,
    effectiveStats: {} as Record<Position, PlayerWithScores['stats']>,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('adviseDevelopment', () => {
  it('1. High OVR Starter: OVR 82, bestFit 80, primaryFit 75 → Starter', () => {
    const player = mockPlayer({
      overall: 82,
      position: 'ST',
      age: 25,
      fit_scores: { ST: 75, CF: 80, WF: 50, CM: 40 },
    });
    const advice = adviseDevelopment(player, [player], MOCK_TOURNAMENTS);
    expect(advice.label).toBe('Starter');
    expect(advice.reasons.some((r) => r.includes('Starterqualität'))).toBe(true);
  });

  it('2. Tournament specialist low OVR: OVR 67, bestFit 62 → Turnier-Spezialist', () => {
    const player = mockPlayer({
      overall: 67,
      position: 'CM',
      fit_scores: { CM: 55, DM: 62, AM: 50 },
    });
    const advice = adviseDevelopment(player, [player], MOCK_TOURNAMENTS);
    expect(advice.label).toBe('Turnier-Spezialist');
    expect(advice.reasons.some((r) => r.includes('Wertvoll'))).toBe(true);
    expect(advice.tournamentValue?.hasValue).toBe(true);
  });

  it('3. Young player: OVR 60, bestFit 65, age 21 → Trainieren', () => {
    const player = mockPlayer({
      overall: 60,
      position: 'FB',
      age: 21,
      fit_scores: { FB: 65, WB: 55, CB: 50 },
    });
    const advice = adviseDevelopment(player, [player], MOCK_TOURNAMENTS);
    expect(advice.label).toBe('Trainieren');
    expect(advice.reasons.some((r) => r.includes('Jung'))).toBe(true);
  });

  it('4. Rotation player: OVR 59, bestFit 59 → Rotation (has tourney value but below thresholds)', () => {
    const player = mockPlayer({
      overall: 59,
      position: 'WM',
      fit_scores: { WM: 59, AM: 50, WF: 55 },
    });
    const advice = adviseDevelopment(player, [player], MOCK_TOURNAMENTS);
    // OVR 59 has tournament value (<=69 for Beginners), but bestFit 59 < 60 AND overall 59 < 60
    // so does NOT qualify as Turnier-Spezialist. Falls to Rotation because bestFit 59 >= 58.
    expect(advice.label).toBe('Rotation');
  });

  it('5. Ersetzen case: OVR 52, bestFit 45 → Ersetzen, kein Turnierwert', () => {
    const player = mockPlayer({
      overall: 52,
      position: 'GK',
      fit_scores: { GK: 45, CB: 30, FB: 25 },
    });
    const advice = adviseDevelopment(player, [player], MOCK_TOURNAMENTS);
    expect(advice.label).toBe('Ersetzen');
    // OVR 52 < 60 AND bestFit 45 < 60 → usableForTournament false → no tournament value
    expect(advice.tournamentValue?.hasValue).toBe(false);
    // "Wertvoll für" must NOT appear (would contradict label)
    expect(advice.reasons.some((r) => r.includes('Wertvoll'))).toBe(false);
  });

  it('6. OVR 69 player must NOT be labeled Ersetzen (tournament value guard)', () => {
    const player = mockPlayer({
      overall: 69,
      position: 'CB',
      fit_scores: { CB: 50, FB: 45, DM: 40 },
    });
    const advice = adviseDevelopment(player, [player], MOCK_TOURNAMENTS);
    expect(advice.label).not.toBe('Ersetzen');
    // OVR 69 <= 69 means they qualify for Beginners Cup
    expect(advice.tournamentValue?.hasValue).toBe(true);
    // They should be Turnier-Spezialist since bestFit >= 60 is not met but overall >= 60
    expect(advice.label).toBe('Turnier-Spezialist');
  });

  it('7. Basic data quality warning present', () => {
    const player = mockPlayer({
      overall: 55,
      position: 'AM',
      dataQuality: 'basic',
      fit_scores: { AM: 45, CM: 40 },
    });
    const advice = adviseDevelopment(player, [player], MOCK_TOURNAMENTS);
    expect(advice.warnings.some((w) => w.includes('Basis-Daten'))).toBe(true);
  });

  it('8. No advice can simultaneously have "Wertvoll für" and "kein Turnierwert" in reasons', () => {
    // Regression: widersprüchliche Reasons sind immer ein Bug
    const players = [
      mockPlayer({ overall: 52, fit_scores: { ST: 45 } }),
      mockPlayer({ overall: 67, fit_scores: { CM: 62 } }),
      mockPlayer({ overall: 82, fit_scores: { ST: 80 } }),
      mockPlayer({ overall: 59, fit_scores: { WM: 59 } }),
    ];
    for (const player of players) {
      const advice = adviseDevelopment(player, players, MOCK_TOURNAMENTS);
      const hasWertvoll = advice.reasons.some((r) => r.includes('Wertvoll für'));
      const hasKeinTurnierwert = advice.reasons.some((r) => r.includes('kein Turnierwert'));
      expect(
        hasWertvoll && hasKeinTurnierwert,
        `Player OVR ${player.overall}: "Wertvoll für" and "kein Turnierwert" must not coexist`,
      ).toBe(false);
    }
  });

  it('9. OVR 69 + bestFit 50 → NOT Ersetzen (overall >= 60 makes them usable for Beginners)', () => {
    const player = mockPlayer({
      overall: 69,
      position: 'CB',
      fit_scores: { CB: 50, FB: 45, DM: 40 },
    });
    const advice = adviseDevelopment(player, [player], MOCK_TOURNAMENTS);
    // overall 69 >= 60 → usableForTournament true → hasValue true → Turnier-Spezialist
    expect(advice.label).not.toBe('Ersetzen');
    expect(advice.tournamentValue?.hasValue).toBe(true);
    expect(advice.label).toBe('Turnier-Spezialist');
  });

  it('10. OVR 67 + bestFit 62 stays Turnier-Spezialist', () => {
    const player = mockPlayer({
      overall: 67,
      position: 'CM',
      fit_scores: { CM: 55, DM: 62, AM: 50 },
    });
    const advice = adviseDevelopment(player, [player], MOCK_TOURNAMENTS);
    expect(advice.label).toBe('Turnier-Spezialist');
    expect(advice.tournamentValue?.hasValue).toBe(true);
    expect(advice.reasons.some((r) => r.includes('Wertvoll'))).toBe(true);
  });
});
