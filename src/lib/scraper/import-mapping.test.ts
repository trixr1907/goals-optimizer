import { describe, expect, it } from 'vitest';
import { classifyImportError, mapActivityPlayerToBasic } from './goalsverse-client';
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
