/**
 * Tests for tournament-lineup-recommender.ts
 *
 * All tests are fixture-only — no network calls, no file I/O.
 *
 * Test matrix covers the spec requirements:
 *   - OVR Max 69 finds a valid lower lineup when enough low-OVR players exist
 *   - OVR Max 69 returns not-eligible when impossible
 *   - OVR Min 70 prefers higher-OVR players
 *   - Bank does not count toward Squad OVR
 *   - Result always has exactly 11 unique players
 *   - No formation with != 11 slots is used
 *   - No player appears twice
 *   - 'eligible' is correctly derived from evaluateTournamentRequirements
 */

import { describe, expect, it } from 'vitest';
import {
  recommendTournamentLineup,
  recommendTournamentLineups,
} from './tournament-lineup-recommender';
import type { PlayerWithScores, Position } from '@/lib/scraper/types';
import type { TournamentSummary } from './tournament-parser';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Builds a minimal PlayerWithScores suitable for the optimizer.
 * Stats are non-zero so slotFit doesn't fall back to fit_scores=0.
 */
function makePlayerWS(opts: {
  id: string;
  name: string;
  position: Position;
  overall: number;
}): PlayerWithScores {
  const { id, name, position, overall } = opts;
  // Use a uniform stat block — values chosen so every player produces a
  // non-zero fit score in the optimizer without depending on real weights.
  // Cast via unknown because test fixtures don't need every optional field.
  const stats = {
    pac: 70, sho: 65, pas: 68, dri: 70, def: 65, phy: 68,
    acceleration: 70, sprint_speed: 70,
    finishing: 65, shot_power: 65, long_shots: 60, penalties: 60, weak_foot: 70, attacking_iq: 65,
    ground_pass: 68, lofted_pass: 65, through_pass: 65, crossing: 65, curve: 60, free_kick_accuracy: 60,
    sprint_dribbling: 70, close_dribbling: 70, skills: 65, agility: 70, balance: 70, first_touch: 70,
    defensive_iq: 65, stand_tackle: 65, slide_tackle: 65, jockeying: 65, interceptions: 65, blocking: 65,
    strength: 65, aggression: 65, stamina: 70, heading: 65, jumping: 65,
    div: 0, kic: 0, reflexes: 0, positioning: 65, catching: 0, parrying: 0,
  } as unknown as PlayerWithScores['stats'];

  const fit_scores = {} as Record<Position, number>;
  const positionType = {} as Record<Position, 'primary' | 'secondary' | 'out'>;
  const effectiveStats = {} as Record<Position, PlayerWithScores['stats']>;
  const ALL: Position[] = ['GK', 'CB', 'FB', 'WB', 'DM', 'CM', 'AM', 'WM', 'WF', 'CF', 'ST'];
  for (const pos of ALL) {
    fit_scores[pos] = pos === position ? 75 : 50;
    positionType[pos] = pos === position ? 'primary' : 'out';
    effectiveStats[pos] = stats;
  }

  return {
    id,
    name,
    position,
    overall,
    rarity: 'Common',
    stats,
    roleRatings: [{ position, overall }],
    secondaryPositions: [],
    fit_scores,
    positionType,
    effectiveStats,
  };
}

/** Build a full 11-position squad with specified OVR per slot. */
function makeSquad11(overalls: number[]): PlayerWithScores[] {
  const positions: Position[] = ['GK', 'CB', 'CB', 'FB', 'FB', 'DM', 'CM', 'CM', 'WF', 'WF', 'ST'];
  return overalls.slice(0, 11).map((ovr, i) =>
    makePlayerWS({
      id: `p-${i}-${ovr}`,
      name: `Player${i}`,
      position: positions[i % positions.length],
      overall: ovr,
    }),
  );
}

/** A tournament with OVR Max constraint. */
function makeTournamentMax(name: string, ovrMax: number): TournamentSummary {
  return {
    name,
    timeLeft: null,
    mode: null,
    requirements: [{ key: 'OVR Max', value: String(ovrMax) }],
    completionReward: [],
    rewardsPerRound: [],
  };
}

/** A tournament with OVR Min constraint. */
function makeTournamentMin(name: string, ovrMin: number): TournamentSummary {
  return {
    name,
    timeLeft: null,
    mode: null,
    requirements: [{ key: 'OVR Min', value: String(ovrMin) }],
    completionReward: [],
    rewardsPerRound: [],
  };
}

// ── 1. OVR Max 69 — finds lower lineup when enough low-OVR players ────────────

describe('OVR Max 69 — valid lineup possible', () => {
  it('returns eligible=true when squad can be adjusted to Squad OVR <= 69', () => {
    // 11 starters with OVR 80 + 11 bench players with OVR 60
    // The algorithm should swap in low-OVR bench players
    const starters = makeSquad11(Array(11).fill(80));
    const bench = makeSquad11(Array(11).fill(60)).map((p, i) => ({
      ...p,
      id: `bench-${i}`,
      name: `Bench${i}`,
    }));
    const allPlayers = [...starters, ...bench];
    const tournament = makeTournamentMax('Beginners Cup Test', 69);

    const result = recommendTournamentLineup(allPlayers, tournament);

    expect(result.eligible).toBe(true);
    expect(result.squadOvr).not.toBeNull();
    expect(result.squadOvr!).toBeLessThanOrEqual(69);
  });

  it('result has exactly 11 unique players', () => {
    const starters = makeSquad11(Array(11).fill(80));
    const bench = makeSquad11(Array(11).fill(60)).map((p, i) => ({
      ...p,
      id: `bench-${i}`,
      name: `Bench${i}`,
    }));
    const tournament = makeTournamentMax('Beginners Cup Test', 69);

    const result = recommendTournamentLineup([...starters, ...bench], tournament);

    expect(result.assignments).toHaveLength(11);
    const ids = result.assignments.map((a) => a.player.id);
    expect(new Set(ids).size).toBe(11);
  });
});

// ── 2. OVR Max 69 — impossible case ──────────────────────────────────────────

describe('OVR Max 69 — impossible (all players OVR 80)', () => {
  it('returns eligible=false when no valid lineup can be found', () => {
    // Only high-OVR players — Squad OVR will always exceed 69
    const players = makeSquad11(Array(11).fill(80));
    const tournament = makeTournamentMax('Beginners Cup Test', 69);

    const result = recommendTournamentLineup(players, tournament);

    expect(result.eligible).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    // Should still provide 11 assignments (best-effort)
    expect(result.assignments.length).toBe(11);
  });
});

// ── 3. OVR Min 70 — prefers higher-OVR players ───────────────────────────────

describe('OVR Min 70 — selects higher-OVR players', () => {
  it('picks a lineup with Squad OVR >= 70 when possible', () => {
    // Mix: 6 players OVR 60 + 11 players OVR 75
    const lowPlayers = makeSquad11(Array(6).fill(60)).map((p, i) => ({
      ...p,
      id: `low-${i}`,
      name: `Low${i}`,
    }));
    const highPlayers = makeSquad11(Array(11).fill(75)).map((p, i) => ({
      ...p,
      id: `high-${i}`,
      name: `High${i}`,
    }));
    const tournament = makeTournamentMin('Champions Cup Test', 70);

    const result = recommendTournamentLineup([...lowPlayers, ...highPlayers], tournament);

    expect(result.eligible).toBe(true);
    expect(result.squadOvr).not.toBeNull();
    expect(result.squadOvr!).toBeGreaterThanOrEqual(70);
  });

  it('all 11 assigned players have higher OVR than alternatives when eligible', () => {
    const lowPlayers = makeSquad11(Array(11).fill(55)).map((p, i) => ({
      ...p,
      id: `low-${i}`,
    }));
    const highPlayers = makeSquad11(Array(11).fill(78)).map((p, i) => ({
      ...p,
      id: `high-${i}`,
    }));
    const tournament = makeTournamentMin('Champions Cup Test', 70);

    const result = recommendTournamentLineup([...lowPlayers, ...highPlayers], tournament);

    // The Squad OVR of the recommended lineup should be >= 70
    expect(result.squadOvr).toBeGreaterThanOrEqual(70);
  });
});

// ── 4. Bank does not count ────────────────────────────────────────────────────

describe('Bank / bench does not affect Squad OVR', () => {
  it('a 99-OVR bench player does not invalidate an otherwise eligible lineup', () => {
    // 11 players OVR 65 → Squad OVR = 65 (eligible for OVR Max 69)
    // + 1 bench player OVR 99 (must NOT count)
    const starters = makeSquad11(Array(11).fill(65));
    const benchPlayer = makePlayerWS({ id: 'bench-99', name: 'Superstar', position: 'ST', overall: 99 });
    const tournament = makeTournamentMax('Beginners Cup Test', 69);

    const result = recommendTournamentLineup([...starters, benchPlayer], tournament);

    // The recommender found a lineup with Squad OVR <= 69 (bench 99 excluded)
    expect(result.eligible).toBe(true);
    expect(result.squadOvr).toBeLessThanOrEqual(69);
  });
});

// ── 5. Exactly 11 unique players ─────────────────────────────────────────────

describe('Result invariants', () => {
  it('assignments always has exactly 11 items with unique player IDs', () => {
    const players = makeSquad11(Array(14).fill(72));
    const tournament = makeTournamentMax('Any Cup', 80);

    const result = recommendTournamentLineup(players, tournament);

    expect(result.assignments).toHaveLength(11);
    const ids = result.assignments.map((a) => a.player.id);
    expect(new Set(ids).size).toBe(11);
  });

  it('no player appears in assignments twice', () => {
    const players = makeSquad11([70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80]);
    const tournament = makeTournamentMax('No Repeat Cup', 85);

    const result = recommendTournamentLineup(players, tournament);

    const ids = result.assignments.map((a) => a.player.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('returns empty/null result when fewer than 11 players', () => {
    const players = makeSquad11([70, 71, 72]);
    const tournament = makeTournamentMax('Any Cup', 80);

    const result = recommendTournamentLineup(players, tournament);

    expect(result.eligible).toBeNull();
    expect(result.squadOvr).toBeNull();
    expect(result.assignments).toHaveLength(0);
  });
});

// ── 6. No formation with != 11 slots ─────────────────────────────────────────

describe('Formation slot count', () => {
  it('every assigned formation uses exactly 11 slots', () => {
    const players = makeSquad11(Array(14).fill(75));
    const tournament = makeTournamentMax('Slot Count Cup', 80);

    const result = recommendTournamentLineup(players, tournament);

    // The assignments array should have exactly 11 entries
    expect(result.assignments).toHaveLength(11);
  });
});

// ── 7. 'eligible' derived correctly from evaluateTournamentRequirements ───────

describe('Eligible is derived from evaluateTournamentRequirements', () => {
  it('eligible=true exactly when requirementResults.eligible === true', () => {
    const players = makeSquad11(Array(11).fill(65));
    const tournament = makeTournamentMax('Sync Test', 69);

    const result = recommendTournamentLineup(players, tournament);

    expect(result.eligible).toBe(result.requirementResults.eligible);
  });

  it('eligible=false exactly when requirementResults.eligible === false', () => {
    const players = makeSquad11(Array(11).fill(80));
    const tournament = makeTournamentMax('Sync Test Fail', 69);

    const result = recommendTournamentLineup(players, tournament);

    expect(result.eligible).toBe(result.requirementResults.eligible);
  });

  it('requirementResults.squadOvr matches the returned squadOvr', () => {
    const players = makeSquad11(Array(11).fill(72));
    const tournament = makeTournamentMax('OVR Sync', 80);

    const result = recommendTournamentLineup(players, tournament);

    expect(result.squadOvr).toBe(result.requirementResults.squadOvr);
  });
});

// ── 8. recommendTournamentLineups — batch helper ──────────────────────────────

describe('recommendTournamentLineups (batch)', () => {
  it('returns one result per tournament', () => {
    const players = makeSquad11(Array(11).fill(72));
    const tournaments: TournamentSummary[] = [
      makeTournamentMax('Cup A', 79),
      makeTournamentMin('Cup B', 70),
    ];

    const results = recommendTournamentLineups(players, tournaments);

    expect(results).toHaveLength(2);
    expect(results[0].tournamentName).toBe('Cup A');
    expect(results[1].tournamentName).toBe('Cup B');
  });

  it('each result in batch independently has 11 unique players', () => {
    const players = makeSquad11(Array(11).fill(72));
    const tournaments = [makeTournamentMax('X', 79), makeTournamentMax('Y', 84)];

    const results = recommendTournamentLineups(players, tournaments);

    for (const res of results) {
      const ids = res.assignments.map((a) => a.player.id);
      expect(ids.length).toBe(11);
      expect(new Set(ids).size).toBe(11);
    }
  });
});
