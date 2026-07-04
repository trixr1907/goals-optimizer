/**
 * Position Penalty Consistency Tests
 *
 * Verifies the verifiziert GOALS rules:
 *   - Secondary position: -2 on ALL stats, OVR unchanged
 *   - Out-of-position:    -5 on ALL stats, OVR unchanged
 *   - calculateStartingElevenOvr uses player.overall — unchanged by position assignment
 *   - tactics-engine stat() uses effectiveStats: out-of-position player is rated lower
 */

import { describe, expect, it } from 'vitest';
import type { Player } from './types';
import { getEffectiveStats, getPositionType } from './types';
import { calculateStartingElevenOvr } from '../tournaments/tournament-eligibility';
import { inferFullStats } from './infer-stats';
import { enrichPlayerWithScores } from '../scoring/position-fit';
import { analyzeTactics } from '../tactics/tactics-engine';
import type { LineupSlot } from '../store/lineup-store';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayer(
  position: Player['position'],
  overall: number,
  secondaryPositions: Player['position'][] = [],
  statsOverride?: Partial<Player['stats']>,
): Player {
  const baseStats = inferFullStats(75, 70, 72, 70, 65, 74);
  return {
    id: `p-${position}-${overall}`,
    name: `${position} ${overall}`,
    position,
    overall,
    rarity: 'Rare',
    stats: { ...baseStats, ...statsOverride },
    roleRatings: [{ position, overall }],
    secondaryPositions,
  };
}

// ── getPositionType ────────────────────────────────────────────────────────────

describe('getPositionType', () => {
  it('returns primary for player.position', () => {
    const p = makePlayer('CB', 80);
    expect(getPositionType(p, 'CB')).toBe('primary');
  });

  it('returns secondary for listed secondaryPositions', () => {
    const p = makePlayer('CB', 80, ['FB']);
    expect(getPositionType(p, 'FB')).toBe('secondary');
  });

  it('returns out for any other position', () => {
    const p = makePlayer('CB', 80, ['FB']);
    expect(getPositionType(p, 'ST')).toBe('out');
    expect(getPositionType(p, 'GK')).toBe('out');
    expect(getPositionType(p, 'AM')).toBe('out');
  });
});

// ── getEffectiveStats — penalty on stats ──────────────────────────────────────

describe('getEffectiveStats — GOALS penalty rules', () => {
  const STAT_KEYS: Array<keyof Player['stats']> = [
    'sprint_speed', 'acceleration', 'finishing', 'through_pass', 'ground_pass',
    'defensive_iq', 'stand_tackle', 'stamina', 'heading', 'strength',
  ];

  it('primary position: no stat change', () => {
    const p = makePlayer('CM', 80);
    const eff = getEffectiveStats(p, 'CM');
    for (const key of STAT_KEYS) {
      expect(eff[key]).toBe(p.stats[key]);
    }
  });

  it('secondary position: exactly -2 on all numeric stats', () => {
    const p = makePlayer('CB', 80, ['FB']);
    const eff = getEffectiveStats(p, 'FB');
    for (const key of STAT_KEYS) {
      const raw = p.stats[key] as number;
      expect(eff[key]).toBe(Math.max(1, raw - 2));
    }
  });

  it('out-of-position: exactly -5 on all numeric stats', () => {
    const p = makePlayer('GK', 80);
    const eff = getEffectiveStats(p, 'ST');
    for (const key of STAT_KEYS) {
      const raw = p.stats[key] as number;
      expect(eff[key]).toBe(Math.max(1, raw - 5));
    }
  });

  it('stat floor is 1: stats already at 1 do not go below 1', () => {
    const p = makePlayer('GK', 80, [], { sprint_speed: 3 });
    const eff = getEffectiveStats(p, 'ST'); // -5 out-of-position
    expect(eff.sprint_speed).toBe(1); // 3 - 5 = -2, clamped to 1
  });

  it('player.overall is NEVER modified by getEffectiveStats', () => {
    const p = makePlayer('ST', 85, ['CF']);
    const ovrBefore = p.overall;

    getEffectiveStats(p, 'CF');  // secondary
    getEffectiveStats(p, 'GK');  // out-of-position

    expect(p.overall).toBe(ovrBefore);
  });

  it('returns a copy — original player.stats are not mutated', () => {
    const p = makePlayer('CB', 80);
    const rawBefore = { ...p.stats };
    getEffectiveStats(p, 'ST'); // out-of-position
    for (const key of STAT_KEYS) {
      expect(p.stats[key]).toBe(rawBefore[key]);
    }
  });
});

// ── calculateStartingElevenOvr — OVR unchanged by position ───────────────────

describe('calculateStartingElevenOvr — unaffected by position assignment', () => {
  it('uses player.overall only — result is the same regardless of position', () => {
    // 11 CMs, all OVR 80 — squad OVR = 80
    const homogeneous = Array.from({ length: 11 }, () => makePlayer('CM', 80));
    expect(calculateStartingElevenOvr(homogeneous)).toBe(80);

    // Same players "playing out-of-position" — overall must stay 80
    // In the real app, their stats would be penalised but overall stays fixed.
    // calculateStartingElevenOvr reads player.overall directly, so the result
    // must be identical even if we imagine them all misplaced.
    const outOfPos = homogeneous.map((p) => ({ ...p, position: 'GK' as const }));
    // Overalls are still 80 — Squad OVR must be 80
    expect(calculateStartingElevenOvr(outOfPos)).toBe(80);
  });

  it('a squad of mixed overalls produces the correct average', () => {
    // overalls: 70 × 5 + 80 × 6 = 350 + 480 = 830 → 830/11 ≈ 75.45 → rounds to 75
    const squad = [
      ...Array.from({ length: 5 }, () => makePlayer('CB', 70)),
      ...Array.from({ length: 6 }, () => makePlayer('ST', 80)),
    ];
    expect(calculateStartingElevenOvr(squad)).toBe(75);
  });
});

// ── tactics-engine: effectiveStats used for slot evaluation ──────────────────

describe('analyzeTactics — effectiveStats applied at slot position', () => {
  /**
   * Builds an enriched PlayerWithScores from a raw Player so effectiveStats
   * is populated correctly (as it is in the real app via enrichPlayerWithScores).
   */
  function enriched(p: Player) {
    return enrichPlayerWithScores(p);
  }

  function makeSlot(position: Player['position'], x = 50, y = 50): LineupSlot {
    return { position, x, y };
  }

  it('out-of-position stamina penalty causes a low-stamina warning', () => {
    // A CM with stamina 68 on his primary position should NOT trigger the
    // "wird nachlassen" (stamina < 65) warning.
    // But when placed at ST (out-of-position), effective stamina = 68 - 5 = 63
    // which IS below 65, so the warning must fire.
    const cmPlayingAsSt = makePlayer('CM', 78, [], { stamina: 68 });
    const enrichedPlayer = enriched(cmPlayingAsSt);

    // Place him in an ST slot — out-of-position for a CM
    const filled = [{ slot: makeSlot('ST', 50, 20), player: enrichedPlayer }];
    const analysis = analyzeTactics(filled, {});

    const warningText = [
      ...analysis.tips.map((t) => `${t.headline} ${t.detail}`),
      ...analysis.overallWarnings,
    ].join(' ');

    // The stamina warning for this player must appear
    expect(warningText).toMatch(/wird nachlassen|Stamina/i);
  });

  it('primary position: no spurious stamina penalty', () => {
    // A ST with stamina 68 on his primary position — should NOT warn (68 >= 65)
    const st = makePlayer('ST', 78, [], { stamina: 68 });
    const enrichedPlayer = enriched(st);

    const filled = [{ slot: makeSlot('ST', 50, 20), player: enrichedPlayer }];
    const analysis = analyzeTactics(filled, {});

    const playerWarnings = analysis.tips.filter(
      (t) => t.id.startsWith('stamina_') && t.id.includes(enrichedPlayer.id)
    );
    expect(playerWarnings).toHaveLength(0);
  });

  it('out-of-position CB has reduced sprint_speed — high-line warning fires', () => {
    // A GK (sprint_speed ~= inferFullStats raw, but out-of-position at CB → -5)
    // Use a player whose sprint_speed is 74 raw. Out-of-position: 74-5 = 69 < 70
    // → "Tiefe Linie statt hoher Linie" warning must appear.
    const gkAsCb = makePlayer('GK', 75, [], { sprint_speed: 74 });
    const gkAsCb2 = makePlayer('GK', 75, [], { sprint_speed: 74 });
    const enrichedCb1 = enriched(gkAsCb);
    const enrichedCb2 = enriched(gkAsCb2);

    const filled = [
      { slot: makeSlot('CB', 35, 80), player: enrichedCb1 },
      { slot: makeSlot('CB', 65, 80), player: enrichedCb2 },
    ];
    const analysis = analyzeTactics(filled, {});

    const warningText = analysis.tips.map((t) => t.headline).join(' ');
    expect(warningText).toMatch(/Tiefe Linie|hohe Linie/i);
  });

  it('primary CB at sprint_speed 74 does NOT trigger low-pace warning', () => {
    // A real CB with sprint_speed 74 — primary position, no penalty → 74 >= 70
    // → no "Tiefe Linie" warning.
    const cb1 = makePlayer('CB', 75, [], { sprint_speed: 74 });
    const cb2 = makePlayer('CB', 75, [], { sprint_speed: 74 });
    const enrichedCb1 = enriched(cb1);
    const enrichedCb2 = enriched(cb2);

    const filled = [
      { slot: makeSlot('CB', 35, 80), player: enrichedCb1 },
      { slot: makeSlot('CB', 65, 80), player: enrichedCb2 },
    ];
    const analysis = analyzeTactics(filled, {});

    const warnings = analysis.tips.filter((t) => t.id === 'tiefes_pressing_cbpace');
    expect(warnings).toHaveLength(0);
  });
});
