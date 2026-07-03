import { describe, expect, it } from 'vitest';
import { classifyImportError, mapActivityPlayerToBasic, mapPlayerFromGoalsverse } from './goalsverse-client';
import { hasFullStats, PlayerStats } from './types';

function emptyStats(): PlayerStats {
  return {
    pac: 0, sho: 0, pas: 0, dri: 0, def: 0, phy: 0,
    acceleration: 0, sprint_speed: 0,
    finishing: 0, shot_power: 0, long_shots: 0, penalties: 0, weak_foot: 0, attacking_iq: 0,
    ground_pass: 0, lofted_pass: 0, through_pass: 0, crossing: 0, curve: 0, free_kick_accuracy: 0,
    sprint_dribbling: 0, close_dribbling: 0, skills: 0, agility: 0, balance: 0, first_touch: 0,
    defensive_iq: 0, stand_tackle: 0, slide_tackle: 0, jockeying: 0, interceptions: 0, blocking: 0,
    strength: 0, aggression: 0, stamina: 0, heading: 0, jumping: 0,
    div: 0, kic: 0, reflexes: 0, positioning: 0, catching: 0, parrying: 0,
  };
}

// Helper: build the nested stats shape that goalsverse-client expects
function buildGoalsverseStats(overrides: {
  pac?: number; sho?: number; pas?: number; dri?: number; def?: number; phy?: number;
} = {}): Record<string, unknown> {
  return {
    pace:        { weighted_value: overrides.pac ?? 50 },
    shooting:    { weighted_value: overrides.sho ?? 50 },
    passing:     { weighted_value: overrides.pas ?? 50 },
    dribbling:   { weighted_value: overrides.dri ?? 50 },
    defending:   { weighted_value: overrides.def ?? 50 },
    physicality: { weighted_value: overrides.phy ?? 50 },
  };
}

// Helper: build a minimal full-squad raw player fixture
function buildFullRaw(opts: {
  id: string;
  first_name: string;
  last_name: string;
  ovrRole: number | string;      // ovr.role — the EQUIPPED role (often wrong for display)
  topRole?: number | string;     // raw.role — top-level, used as tiebreaker
  overall: number;
  ovrRoles?: Array<{ role: number | string; overall_rating: number }>;
  stats?: { pac?: number; sho?: number; pas?: number; dri?: number; def?: number; phy?: number };
}): Record<string, unknown> {
  return {
    id: opts.id,
    first_name: opts.first_name,
    last_name: opts.last_name,
    role: opts.topRole,
    ovr: { overall_rating: opts.overall, role: opts.ovrRole },
    ovr_roles: opts.ovrRoles ?? [],
    stats: buildGoalsverseStats(opts.stats ?? {}),
  };
}

describe('import mapping', () => {
  it('maps profile/activity players as basic data quality with empty stats', () => {
    const player = mapActivityPlayerToBasic({
      characterId: 'abc-123',
      firstName: 'Test',
      lastName: 'Striker',
      role: 16,
      ovr: { overall_rating: 82, role: 'ROLE_ST' },
      matchesPlayed: 12,
      goals: 7,
      assists: 3,
    });

    expect(player.id).toBe('goalsverse-abc-123');
    expect(player.name).toBe('Test Striker');
    expect(player.position).toBe('ST');
    expect(player.overall).toBe(82);
    expect(player.dataQuality).toBe('basic');
    expect(player.stats.finishing).toBe(0);
    expect(player.matches_played).toBe(12);
  });

  it('uses name fallback and string role mapping for basic players', () => {
    const player = mapActivityPlayerToBasic({
      id: 'fallback-id',
      name: 'Single Name',
      role: 8,
      ovr: 74,
    });

    expect(player.name).toBe('Single Name');
    expect(player.position).toBe('CM');
    expect(player.overall).toBe(74);
    expect(player.roleRatings).toEqual([{ position: 'CM', overall: 74 }]);
  });

  it('detects full stats via explicit dataQuality or legacy non-zero stats', () => {
    const stats = emptyStats();
    expect(hasFullStats({ dataQuality: 'basic', stats })).toBe(false);
    expect(hasFullStats({ dataQuality: 'full', stats })).toBe(true);

    const legacyStats = { ...stats, finishing: 71 };
    expect(hasFullStats({ stats: legacyStats })).toBe(true);
  });
});

describe('import error classification', () => {
  it.each([
    ['Club "demo" wurde auf goalsverse nicht gefunden.', 'club_not_found'],
    ['Fehler beim Abrufen: goalsverse: Anfrage-Timeout (12 s)', 'goalsverse_timeout'],
    ['Squad-Daten nicht im RSC-Payload gefunden.', 'rsc_payload_incomplete'],
    ['Squad gefunden, aber keine Spieler extrahiert.', 'no_players_found'],
    ['Fehler beim Abrufen: HTTP 502', 'network_error'],
  ] as const)('classifies %s', (reason, code) => {
    expect(classifyImportError(reason)).toBe(code);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Position regression tests — 7 known cases where goalsverse ovr.role differs
// from the official PlayGOALS / Goals-Tracker primary position.
// Each fixture mimics the real goalsverse raw payload shape.
// ─────────────────────────────────────────────────────────────────────────────
describe('position regression: goalsverse ovr.role vs. real display position', () => {

  // Wendelin Pietsch: goalsverse CB-equipped, PlayGOALS/Tracker → FB
  it('Wendelin Pietsch: CB-equipped but higher FB rating → position FB', () => {
    const raw = buildFullRaw({
      id: 'wendelin-pietsch',
      first_name: 'Wendelin',
      last_name: 'Pietsch',
      ovrRole: 1,    // CB (equipped)
      overall: 80,
      ovrRoles: [
        { role: 1, overall_rating: 76 }, // CB
        { role: 3, overall_rating: 80 }, // RB → FB (higher)
        { role: 4, overall_rating: 80 }, // LB → FB (higher)
      ],
      stats: { pac: 72, sho: 55, pas: 68, dri: 70, def: 78, phy: 74 },
    });
    const player = mapPlayerFromGoalsverse(raw);
    expect(player.position).toBe('FB');
  });

  // Alfred Mengue: same pattern — goalsverse CB, real position FB
  it('Alfred Mengue: CB-equipped but higher FB rating → position FB', () => {
    const raw = buildFullRaw({
      id: 'alfred-mengue',
      first_name: 'Alfred',
      last_name: 'Mengue',
      ovrRole: 2,    // CB (equipped)
      overall: 78,
      ovrRoles: [
        { role: 2, overall_rating: 74 }, // CB
        { role: 3, overall_rating: 78 }, // RB → FB
        { role: 4, overall_rating: 78 }, // LB → FB
      ],
      stats: { pac: 75, sho: 52, pas: 66, dri: 71, def: 76, phy: 72 },
    });
    const player = mapPlayerFromGoalsverse(raw);
    expect(player.position).toBe('FB');
  });

  // Elen de Mattos: DM-equipped (ovr.role=7), PlayGOALS/Tracker → AM
  // When multiple positions tie, stat profile (creative) should win.
  it('Elen de Mattos: DM-equipped but AM in ovr_roles with creative stats → position AM', () => {
    const raw = buildFullRaw({
      id: 'elen-de-mattos',
      first_name: 'Elen',
      last_name: 'de Mattos',
      ovrRole: 7,    // DM (equipped)
      topRole: 10,   // raw.role = AM (top-level — used as tiebreaker)
      overall: 81,
      ovrRoles: [
        { role: 7,  overall_rating: 81 }, // DM
        { role: 10, overall_rating: 81 }, // AM
      ],
      stats: { pac: 82, sho: 72, pas: 80, dri: 85, def: 70, phy: 40 },
    });
    const player = mapPlayerFromGoalsverse(raw);
    expect(player.position).toBe('AM');
  });

  // Jonathan Jones: DM-equipped (ovr.role=7), real position AM — the original regression case.
  it('Jonathan Jones: DM/WB/CM/AM all 81, creative stats (dri 90 pas 84) → position AM', () => {
    const raw = buildFullRaw({
      id: '6dbe494a-0568-58e9-bd59-30c331515659',
      first_name: 'Jonathan',
      last_name: 'Jones',
      ovrRole: 7,    // DM (equipped)
      // no topRole (no top-level raw.role in real payload)
      overall: 81,
      ovrRoles: [
        { role: 7,  overall_rating: 81 }, // DM
        { role: 5,  overall_rating: 81 }, // LWB → WB
        { role: 8,  overall_rating: 81 }, // CM
        { role: 9,  overall_rating: 81 }, // CM
        { role: 10, overall_rating: 81 }, // AM
      ],
      stats: { pac: 87, sho: 74, pas: 84, dri: 90, def: 76, phy: 38 },
    });
    const player = mapPlayerFromGoalsverse(raw);
    expect(player.position).toBe('AM');
  });

  // Antoinette Sidibe: WB-equipped, PlayGOALS/Tracker → CM
  it('Antoinette Sidibe: WB-equipped but higher CM rating → position CM', () => {
    const raw = buildFullRaw({
      id: 'antoinette-sidibe',
      first_name: 'Antoinette',
      last_name: 'Sidibe',
      ovrRole: 5,    // LWB → WB (equipped)
      overall: 79,
      ovrRoles: [
        { role: 5, overall_rating: 74 }, // WB
        { role: 8, overall_rating: 79 }, // CM (higher)
        { role: 9, overall_rating: 79 }, // CM
      ],
      stats: { pac: 78, sho: 60, pas: 76, dri: 80, def: 68, phy: 60 },
    });
    const player = mapPlayerFromGoalsverse(raw);
    expect(player.position).toBe('CM');
  });

  // Romário Vieira: CM-equipped, PlayGOALS/Tracker → WF
  it('Romário Vieira: CM-equipped but higher WF rating → position WF', () => {
    const raw = buildFullRaw({
      id: 'romario-vieira',
      first_name: 'Romário',
      last_name: 'Vieira',
      ovrRole: 8,    // CM (equipped)
      overall: 83,
      ovrRoles: [
        { role: 8,  overall_rating: 79 }, // CM
        { role: 13, overall_rating: 83 }, // LW → WF (higher)
        { role: 14, overall_rating: 83 }, // RW → WF
      ],
      stats: { pac: 88, sho: 76, pas: 72, dri: 87, def: 58, phy: 62 },
    });
    const player = mapPlayerFromGoalsverse(raw);
    expect(player.position).toBe('WF');
  });

  // Vitor do Monte: WM-equipped, PlayGOALS/Tracker → ST
  it('Vitor do Monte: WM-equipped but higher ST rating → position ST', () => {
    const raw = buildFullRaw({
      id: 'vitor-do-monte',
      first_name: 'Vitor',
      last_name: 'do Monte',
      ovrRole: 11,   // LM → WM (equipped)
      overall: 85,
      ovrRoles: [
        { role: 11, overall_rating: 80 }, // LM → WM
        { role: 16, overall_rating: 85 }, // ST (higher)
      ],
      stats: { pac: 84, sho: 85, pas: 68, dri: 83, def: 52, phy: 70 },
    });
    const player = mapPlayerFromGoalsverse(raw);
    expect(player.position).toBe('ST');
  });
});

