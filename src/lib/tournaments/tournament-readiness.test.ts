/**
 * Tests for the tournament readiness config and its integration with the
 * evaluateTournamentRequirements() helper.
 *
 * No network calls — all assertions run against the static config.
 */

import { describe, expect, it } from 'vitest';
import { CURRENT_TOURNAMENTS } from '@/config/tournaments';
import {
  calculateStartingElevenOvr,
  evaluateTournamentRequirements,
} from '@/lib/tournaments/tournament-eligibility';
import type { Player } from '@/lib/scraper/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayer(overall: number): Player {
  return {
    id: `p-${overall}-${Math.random().toString(36).slice(2)}`,
    name: 'Test',
    position: 'CM',
    overall,
    rarity: 'Common',
    stats: {} as Player['stats'],
    roleRatings: [],
    secondaryPositions: [],
  };
}

function makeSquad(overall: number): Player[] {
  return Array.from({ length: 11 }, () => makePlayer(overall));
}

// ── Config shape ──────────────────────────────────────────────────────────────

describe('CURRENT_TOURNAMENTS config', () => {
  it('contains exactly 4 tournaments', () => {
    expect(CURRENT_TOURNAMENTS).toHaveLength(4);
  });

  it('contains Beginners Cup #5 with OVR Max 69', () => {
    const t = CURRENT_TOURNAMENTS.find((t) => t.name === 'Beginners Cup #5');
    expect(t).toBeDefined();
    expect(t!.requirements).toContainEqual({ key: 'OVR Max', value: '69' });
  });

  it('contains Challengers Cup #5 with OVR Max 79', () => {
    const t = CURRENT_TOURNAMENTS.find((t) => t.name === 'Challengers Cup #5');
    expect(t).toBeDefined();
    expect(t!.requirements).toContainEqual({ key: 'OVR Max', value: '79' });
  });

  it('contains Masters Cup #5 with OVR Max 84', () => {
    const t = CURRENT_TOURNAMENTS.find((t) => t.name === 'Masters Cup #5');
    expect(t).toBeDefined();
    expect(t!.requirements).toContainEqual({ key: 'OVR Max', value: '84' });
  });

  it('contains Champions Cup #5 with OVR Min 70', () => {
    const t = CURRENT_TOURNAMENTS.find((t) => t.name === 'Champions Cup #5');
    expect(t).toBeDefined();
    expect(t!.requirements).toContainEqual({ key: 'OVR Min', value: '70' });
  });
});

// ── Squad OVR uses Math.round of starting eleven average ──────────────────────

describe('calculateStartingElevenOvr', () => {
  it('uses Squad OVR, not individual player OVR cap', () => {
    // All players OVR 75 (well above any per-player OVR Max cap, if it existed)
    // Squad OVR = Math.round(75 * 11 / 11) = 75
    const squad = makeSquad(75);
    expect(calculateStartingElevenOvr(squad)).toBe(75);
  });

  it('bank player (12th) does not affect Squad OVR', () => {
    const starters = makeSquad(72);
    const bench = makePlayer(99); // very high — would matter if bank counted
    expect(calculateStartingElevenOvr([...starters, bench])).toBe(72);
  });
});

// ── Eligibility against real config tournaments ───────────────────────────────

describe('evaluateTournamentRequirements against config', () => {
  const beginners = CURRENT_TOURNAMENTS.find((t) => t.name === 'Beginners Cup #5')!;
  const challengers = CURRENT_TOURNAMENTS.find((t) => t.name === 'Challengers Cup #5')!;
  const masters = CURRENT_TOURNAMENTS.find((t) => t.name === 'Masters Cup #5')!;
  const champions = CURRENT_TOURNAMENTS.find((t) => t.name === 'Champions Cup #5')!;

  it('Beginners Cup #5: eligible at Squad OVR 69', () => {
    const result = evaluateTournamentRequirements(makeSquad(69), beginners);
    expect(result.squadOvr).toBe(69);
    expect(result.eligible).toBe(true);
  });

  it('Beginners Cup #5: NOT eligible at Squad OVR 70 (exceeds OVR Max 69)', () => {
    const result = evaluateTournamentRequirements(makeSquad(70), beginners);
    expect(result.squadOvr).toBe(70);
    expect(result.eligible).toBe(false);
  });

  it('Challengers Cup #5: eligible at Squad OVR 79', () => {
    const result = evaluateTournamentRequirements(makeSquad(79), challengers);
    expect(result.eligible).toBe(true);
  });

  it('Challengers Cup #5: NOT eligible at Squad OVR 80', () => {
    const result = evaluateTournamentRequirements(makeSquad(80), challengers);
    expect(result.eligible).toBe(false);
  });

  it('Masters Cup #5: eligible at Squad OVR 84', () => {
    const result = evaluateTournamentRequirements(makeSquad(84), masters);
    expect(result.eligible).toBe(true);
  });

  it('Masters Cup #5: NOT eligible at Squad OVR 85', () => {
    const result = evaluateTournamentRequirements(makeSquad(85), masters);
    expect(result.eligible).toBe(false);
  });

  it('Champions Cup #5: eligible at Squad OVR 70 (meets OVR Min 70)', () => {
    const result = evaluateTournamentRequirements(makeSquad(70), champions);
    expect(result.squadOvr).toBe(70);
    expect(result.eligible).toBe(true);
  });

  it('Champions Cup #5: NOT eligible at Squad OVR 69 (below OVR Min 70)', () => {
    const result = evaluateTournamentRequirements(makeSquad(69), champions);
    expect(result.eligible).toBe(false);
  });

  it('returns null eligible when fewer than 11 starters', () => {
    const tenPlayers = Array.from({ length: 10 }, () => makePlayer(75));
    const result = evaluateTournamentRequirements(tenPlayers, beginners);
    expect(result.squadOvr).toBeNull();
    expect(result.eligible).toBeNull();
  });
});

// ── OVR Max/Min is Squad OVR, not individual player OVR ──────────────────────

describe('OVR requirement semantics — Squad OVR only', () => {
  it('a squad of high-OVR players is still eligible for Beginners Cup if Squad OVR <= 69', () => {
    // 11 players with individual OVR 90 each — Squad OVR = 90
    // This FAILS the Beginners Cup OVR Max 69 cap, as it should.
    const squad = makeSquad(90);
    const result = evaluateTournamentRequirements(squad, CURRENT_TOURNAMENTS[0]);
    expect(result.squadOvr).toBe(90);
    expect(result.eligible).toBe(false);
  });

  it('mixed squad with avg 69 passes Beginners Cup regardless of individual outliers', () => {
    // Build a squad where the average rounds to exactly 69
    // Overalls: 11 players, sum = 759, avg = 69.0
    const overalls = [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74]; // sum = 759
    const squad = overalls.map(makePlayer);
    const result = evaluateTournamentRequirements(squad, CURRENT_TOURNAMENTS[0]);
    expect(result.squadOvr).toBe(69);
    expect(result.eligible).toBe(true);
  });
});
