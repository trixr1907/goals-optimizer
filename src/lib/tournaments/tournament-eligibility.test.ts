import { describe, expect, it } from 'vitest';
import type { Player } from '../scraper/types';
import type { TournamentSummary } from './tournament-parser';
import {
  calculateStartingElevenOvr,
  evaluateTournamentRequirements,
} from './tournament-eligibility';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a minimal Player stub — only `overall` matters for these tests. */
function makePlayer(overall: number): Player {
  return {
    id: `player-${overall}-${Math.random().toString(36).slice(2)}`,
    name: 'Test Player',
    position: 'CM',
    overall,
    rarity: 'Common',
    stats: {} as Player['stats'], // not needed for eligibility calculations
    roleRatings: [],
    secondaryPositions: [],
  };
}

/** Creates 11 players whose overalls average to exactly the given average. */
function makeSquad(overallAvg: number, count = 11): Player[] {
  // Spread values symmetrically so the mean is exact
  return Array.from({ length: count }, (_, i) =>
    makePlayer(overallAvg - 5 + i),
  );
}

function makeTournament(
  requirements: Array<{ key: string; value: string }>,
  name = 'Test Cup',
): TournamentSummary {
  return {
    name,
    timeLeft: null,
    mode: null,
    requirements,
    completionReward: [],
    rewardsPerRound: [],
  };
}

// ── calculateStartingElevenOvr ─────────────────────────────────────────────────

describe('calculateStartingElevenOvr', () => {
  it('returns null for fewer than 11 players', () => {
    expect(calculateStartingElevenOvr([])).toBeNull();
    expect(calculateStartingElevenOvr(makeSquad(70, 10))).toBeNull();
  });

  it('rounds 69.4 (avg) down to 69', () => {
    // 11 players: overalls 64..74 → sum = 11 * 69 = 759, avg = 69.0
    // To get avg = 69.4 exactly: use overalls that sum to 763.4 — not integer.
    // Instead: build a squad where sum = 763, avg = 69.36… → rounds to 69.
    const overalls = [65, 66, 67, 68, 69, 69, 70, 71, 72, 73, 73]; // sum = 763
    const players = overalls.map(makePlayer);
    const result = calculateStartingElevenOvr(players);

    // Verify the raw average is below .5
    const avg = overalls.reduce((a, b) => a + b, 0) / 11;
    expect(avg).toBeLessThan(69.5);
    expect(result).toBe(69);
  });

  it('rounds 69.5 (avg) up to 70', () => {
    // sum = 764.5 is not integer; use 765 → avg = 69.545… → rounds to 70
    const overalls = [65, 66, 67, 68, 69, 70, 70, 71, 72, 73, 74]; // sum = 765
    const players = overalls.map(makePlayer);
    const result = calculateStartingElevenOvr(players);

    const avg = overalls.reduce((a, b) => a + b, 0) / 11;
    expect(avg).toBeGreaterThanOrEqual(69.5);
    expect(result).toBe(70);
  });

  it('uses only the first 11 players and ignores the rest (bank/bench)', () => {
    // First 11 avg to 70, 12th player has overall 1 — should not affect result
    const players = [
      ...Array.from({ length: 11 }, () => makePlayer(70)),
      makePlayer(1), // bench player
    ];
    expect(calculateStartingElevenOvr(players)).toBe(70);
  });

  it('returns the exact value for a uniform squad', () => {
    const players = Array.from({ length: 11 }, () => makePlayer(75));
    expect(calculateStartingElevenOvr(players)).toBe(75);
  });
});

// ── evaluateTournamentRequirements ─────────────────────────────────────────────

describe('evaluateTournamentRequirements', () => {
  it('returns null eligible and notEvaluated requirements when fewer than 11 starters', () => {
    const players = makeSquad(69, 10); // only 10 players
    const tournament = makeTournament([{ key: 'OVR Max', value: '69' }]);
    const result = evaluateTournamentRequirements(players, tournament);

    expect(result.squadOvr).toBeNull();
    expect(result.eligible).toBeNull();
    expect(result.requirements[0].status).toBe('notEvaluated');
    expect(result.requirements[0].reason).toMatch(/fewer than 11/i);
  });

  describe('OVR Max', () => {
    it('is eligible when squadOvr equals the limit (squadOvr=69, OVR Max=69)', () => {
      const players = Array.from({ length: 11 }, () => makePlayer(69));
      const tournament = makeTournament([{ key: 'OVR Max', value: '69' }], 'Beginners Cup');
      const result = evaluateTournamentRequirements(players, tournament);

      expect(result.squadOvr).toBe(69);
      expect(result.requirements[0].status).toBe('eligible');
      expect(result.eligible).toBe(true);
    });

    it('is notEligible when squadOvr exceeds the limit (squadOvr=70, OVR Max=69)', () => {
      const players = Array.from({ length: 11 }, () => makePlayer(70));
      const tournament = makeTournament([{ key: 'OVR Max', value: '69' }], 'Beginners Cup');
      const result = evaluateTournamentRequirements(players, tournament);

      expect(result.squadOvr).toBe(70);
      expect(result.requirements[0].status).toBe('notEligible');
      expect(result.eligible).toBe(false);
    });
  });

  describe('OVR Min', () => {
    it('is eligible when squadOvr meets the minimum (squadOvr=70, OVR Min=70)', () => {
      const players = Array.from({ length: 11 }, () => makePlayer(70));
      const tournament = makeTournament([{ key: 'OVR Min', value: '70' }], 'Pro Cup');
      const result = evaluateTournamentRequirements(players, tournament);

      expect(result.squadOvr).toBe(70);
      expect(result.requirements[0].status).toBe('eligible');
      expect(result.eligible).toBe(true);
    });

    it('is notEligible when squadOvr is below the minimum (squadOvr=69, OVR Min=70)', () => {
      const players = Array.from({ length: 11 }, () => makePlayer(69));
      const tournament = makeTournament([{ key: 'OVR Min', value: '70' }], 'Pro Cup');
      const result = evaluateTournamentRequirements(players, tournament);

      expect(result.squadOvr).toBe(69);
      expect(result.requirements[0].status).toBe('notEligible');
      expect(result.eligible).toBe(false);
    });
  });

  describe('notEvaluated requirements', () => {
    it('marks Retired as notEvaluated', () => {
      const players = Array.from({ length: 11 }, () => makePlayer(69));
      const tournament = makeTournament([
        { key: 'Retired', value: '0' },
        { key: 'OVR Max', value: '69' },
      ]);
      const result = evaluateTournamentRequirements(players, tournament);

      const retired = result.requirements.find((r) => r.key === 'Retired');
      const ovrMax = result.requirements.find((r) => r.key === 'OVR Max');

      expect(retired?.status).toBe('notEvaluated');
      expect(ovrMax?.status).toBe('eligible');
      // Overall eligibility is true — notEvaluated requirements are skipped
      expect(result.eligible).toBe(true);
    });

    it('marks Duplicated Originals as notEvaluated', () => {
      const players = Array.from({ length: 11 }, () => makePlayer(69));
      const tournament = makeTournament([{ key: 'Duplicated Originals', value: '0' }]);
      const result = evaluateTournamentRequirements(players, tournament);

      expect(result.requirements[0].status).toBe('notEvaluated');
    });

    it('marks unknown future keys as notEvaluated', () => {
      const players = Array.from({ length: 11 }, () => makePlayer(70));
      const tournament = makeTournament([{ key: 'SomeNewRule', value: '5' }]);
      const result = evaluateTournamentRequirements(players, tournament);

      expect(result.requirements[0].status).toBe('notEvaluated');
      expect(result.requirements[0].reason).toMatch(/unknown requirement key/i);
    });
  });

  it('returns eligible=null when only notEvaluated requirements exist and squad is valid', () => {
    const players = Array.from({ length: 11 }, () => makePlayer(70));
    const tournament = makeTournament([{ key: 'Retired', value: '0' }]);
    const result = evaluateTournamentRequirements(players, tournament);

    // Squad OVR is known, but no OVR requirement to evaluate
    expect(result.squadOvr).toBe(70);
    expect(result.eligible).toBeNull();
  });

  it('handles combined OVR Max + OVR Min correctly', () => {
    const players = Array.from({ length: 11 }, () => makePlayer(72));
    const tournament = makeTournament([
      { key: 'OVR Min', value: '70' },
      { key: 'OVR Max', value: '74' },
    ]);
    const result = evaluateTournamentRequirements(players, tournament);

    expect(result.squadOvr).toBe(72);
    expect(result.requirements.find((r) => r.key === 'OVR Min')?.status).toBe('eligible');
    expect(result.requirements.find((r) => r.key === 'OVR Max')?.status).toBe('eligible');
    expect(result.eligible).toBe(true);
  });
});
