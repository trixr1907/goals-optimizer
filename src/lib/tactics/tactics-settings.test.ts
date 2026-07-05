import { describe, expect, it } from 'vitest';
import formationsData from '@/config/formations.json';
import { inferFullStats } from '@/lib/scraper/infer-stats';
import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import {
  FORMATION_TACTICAL_PROFILES,
  GOALS_TACTIC_FORMATION_KEYS,
  POSITION_ALLOWED_FOCUS,
  POSITION_TACTICAL_ROLES,
  PLAYER_RULES_BY_POSITION,
  getAllowedFocusForRole,
  recommendTacticalSettings,
} from './tactics-settings';

const POSITIONS: Position[] = ['GK', 'CB', 'FB', 'WB', 'DM', 'CM', 'AM', 'WM', 'WF', 'CF', 'ST'];

function player(id: string, position: Position, stats: ReturnType<typeof inferFullStats>): PlayerWithScores {
  return {
    id,
    name: id,
    position,
    overall: 80,
    rarity: 'Rare',
    stats,
    roleRatings: [{ position, overall: 80 }],
    secondaryPositions: [],
    fit_scores: Object.fromEntries(POSITIONS.map((pos) => [pos, pos === position ? 90 : 50])) as Record<Position, number>,
    positionType: Object.fromEntries(POSITIONS.map((pos) => [pos, pos === position ? 'primary' : 'out'])) as Record<Position, 'primary' | 'secondary' | 'out'>,
    effectiveStats: Object.fromEntries(POSITIONS.map((pos) => [pos, stats])) as Record<Position, typeof stats>,
    dataQuality: 'full',
  };
}

function filled(items: Array<[string, Position, PlayerWithScores]>) {
  return items.map(([slotKey, position, p], index) => ({
    slotKey,
    slot: { position, x: 50, y: 50 + index } as LineupSlot,
    player: p,
  }));
}

function baseLineup(overrides: Array<[string, Position, PlayerWithScores]> = []) {
  const byKey = new Map(overrides.map((item) => [item[0], item]));
  const defaults: Array<[string, Position, PlayerWithScores]> = [
    ['GK-0', 'GK', player('GK', 'GK', inferFullStats(60, 35, 60, 50, 40, 70))],
    ['CB-1', 'CB', player('CB 1', 'CB', inferFullStats(76, 35, 58, 55, 82, 78))],
    ['CB-2', 'CB', player('CB 2', 'CB', inferFullStats(76, 35, 58, 55, 82, 78))],
    ['FB-3', 'FB', player('FB 1', 'FB', inferFullStats(80, 45, 70, 70, 72, 74))],
    ['FB-4', 'FB', player('FB 2', 'FB', inferFullStats(80, 45, 70, 70, 72, 74))],
    ['DM-5', 'DM', player('DM', 'DM', inferFullStats(72, 45, 76, 70, 80, 78))],
    ['CM-6', 'CM', player('CM 1', 'CM', inferFullStats(72, 55, 78, 76, 64, 72))],
    ['AM-7', 'AM', player('AM', 'AM', inferFullStats(78, 70, 82, 82, 45, 66))],
    ['WF-8', 'WF', player('WF', 'WF', inferFullStats(84, 75, 72, 82, 35, 68))],
    ['ST-9', 'ST', player('ST', 'ST', inferFullStats(82, 82, 66, 78, 35, 74))],
    ['WF-10', 'WF', player('WF 2', 'WF', inferFullStats(84, 75, 72, 82, 35, 68))],
  ];
  return filled(defaults.map((item) => byKey.get(item[0]) ?? item));
}

// ---------------------------------------------------------------------------
// Formations
// ---------------------------------------------------------------------------

describe('formations.json', () => {
  it('contains all 14 GOALS formation keys', () => {
    expect(Object.keys(formationsData).sort()).toEqual([...GOALS_TACTIC_FORMATION_KEYS].sort());
  });

  it('contains no CF slots (CF is not a valid formation slot)', () => {
    type SlotEntry = { position: string; x: number; y: number };
    type FormationEntry = { name: string; slots: SlotEntry[] };
    const data = formationsData as Record<string, FormationEntry>;
    const cfSlots: string[] = [];
    for (const [formKey, formation] of Object.entries(data)) {
      for (const slot of formation.slots) {
        if (slot.position === 'CF') cfSlots.push(`${formKey}: CF`);
      }
    }
    expect(cfSlots).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Position Tactical Config — role/focus rules
// ---------------------------------------------------------------------------

describe('POSITION_TACTICAL_CONFIG', () => {
  it('ST only has Attack focus', () => {
    expect(POSITION_ALLOWED_FOCUS['ST']).toEqual(['Attack']);
  });

  it('ST roles are Striker and Deep Lying Forward', () => {
    expect(POSITION_TACTICAL_ROLES['ST']).toContain('Striker');
    expect(POSITION_TACTICAL_ROLES['ST']).toContain('Deep Lying Forward');
  });

  it('WF only has Balanced focus', () => {
    expect(POSITION_ALLOWED_FOCUS['WF']).toEqual(['Balanced']);
  });

  it('AM only has Balanced focus', () => {
    expect(POSITION_ALLOWED_FOCUS['AM']).toEqual(['Balanced']);
  });

  it('WM only has Balanced focus', () => {
    expect(POSITION_ALLOWED_FOCUS['WM']).toEqual(['Balanced']);
  });

  it('WB only has Balanced focus', () => {
    expect(POSITION_ALLOWED_FOCUS['WB']).toEqual(['Balanced']);
  });

  it('CM has Balanced and Defend', () => {
    expect(POSITION_ALLOWED_FOCUS['CM']).toContain('Balanced');
    expect(POSITION_ALLOWED_FOCUS['CM']).toContain('Defend');
    expect(POSITION_ALLOWED_FOCUS['CM']).not.toContain('Attack');
  });

  it('DM has Balanced and Defend', () => {
    expect(POSITION_ALLOWED_FOCUS['DM']).toContain('Balanced');
    expect(POSITION_ALLOWED_FOCUS['DM']).toContain('Defend');
    expect(POSITION_ALLOWED_FOCUS['DM']).not.toContain('Attack');
  });

  it('FB has Balanced and Defend', () => {
    expect(POSITION_ALLOWED_FOCUS['FB']).toContain('Balanced');
    expect(POSITION_ALLOWED_FOCUS['FB']).toContain('Defend');
    expect(POSITION_ALLOWED_FOCUS['FB']).not.toContain('Attack');
  });

  it('CB default focus is only Defend', () => {
    expect(POSITION_ALLOWED_FOCUS['CB']).toEqual(['Defend']);
    expect(POSITION_ALLOWED_FOCUS['CB']).not.toContain('Attack');
    expect(POSITION_ALLOWED_FOCUS['CB']).not.toContain('Balanced');
  });

  it('CB Advanced Centre Back allows Balanced', () => {
    const allowed = getAllowedFocusForRole('CB', 'Advanced Centre Back');
    expect(allowed).toContain('Balanced');
    expect(allowed).toContain('Defend');
  });

  it('CB Centre Back does not allow Balanced', () => {
    const allowed = getAllowedFocusForRole('CB', 'Centre Back');
    expect(allowed).not.toContain('Balanced');
    expect(allowed).toContain('Defend');
  });

  it('GK only has Defend focus', () => {
    expect(POSITION_ALLOWED_FOCUS['GK']).toEqual(['Defend']);
  });

  it('GK roles are Goalkeeper and Sweeper Keeper', () => {
    expect(POSITION_TACTICAL_ROLES['GK']).toContain('Goalkeeper');
    expect(POSITION_TACTICAL_ROLES['GK']).toContain('Sweeper Keeper');
  });

  it('CF has no roles and no focus (not a formation slot)', () => {
    expect(POSITION_TACTICAL_ROLES['CF']).toEqual([]);
    expect(POSITION_ALLOWED_FOCUS['CF']).toEqual([]);
  });

  it('every position has at least one valid focus (except CF)', () => {
    const nonCfPositions = POSITIONS.filter((p) => p !== 'CF');
    for (const pos of nonCfPositions) {
      expect(POSITION_ALLOWED_FOCUS[pos].length).toBeGreaterThan(0);
    }
  });

  it('PLAYER_RULES_BY_POSITION equals POSITION_ALLOWED_FOCUS (legacy alias)', () => {
    for (const pos of POSITIONS) {
      expect(PLAYER_RULES_BY_POSITION[pos]).toEqual(POSITION_ALLOWED_FOCUS[pos]);
    }
  });
});

// ---------------------------------------------------------------------------
// Formation profiles
// ---------------------------------------------------------------------------

describe('FORMATION_TACTICAL_PROFILES', () => {
  it('contains all 14 GOALS formation keys', () => {
    expect(Object.keys(FORMATION_TACTICAL_PROFILES).sort()).toEqual([...GOALS_TACTIC_FORMATION_KEYS].sort());
  });
});

// ---------------------------------------------------------------------------
// recommendTacticalSettings — depth / buildUpPlay
// ---------------------------------------------------------------------------

describe('recommendTacticalSettings — depth', () => {
  it('clamps defensive depth to 1-100', () => {
    const settings = recommendTacticalSettings([], '4-3-3 Attack');
    expect(settings.defensiveDepth).toBeGreaterThanOrEqual(1);
    expect(settings.defensiveDepth).toBeLessThanOrEqual(100);
  });

  it('recommends depth <= 42 for slow CBs', () => {
    const lineup = baseLineup([
      ['CB-1', 'CB', player('Slow CB 1', 'CB', inferFullStats(58, 35, 55, 50, 82, 78))],
      ['CB-2', 'CB', player('Slow CB 2', 'CB', inferFullStats(60, 35, 55, 50, 82, 78))],
    ]);
    expect(recommendTacticalSettings(lineup, '4-3-3').defensiveDepth).toBeLessThanOrEqual(42);
  });

  it('recommends depth >= 48 for fast CBs and a good DM', () => {
    const lineup = baseLineup([
      ['CB-1', 'CB', player('Fast CB 1', 'CB', inferFullStats(86, 35, 62, 62, 84, 80))],
      ['CB-2', 'CB', player('Fast CB 2', 'CB', inferFullStats(84, 35, 62, 62, 84, 80))],
      ['DM-5', 'DM', player('Elite DM', 'DM', inferFullStats(78, 45, 80, 72, 86, 82))],
    ]);
    expect(recommendTacticalSettings(lineup, '4-3-3').defensiveDepth).toBeGreaterThanOrEqual(48);
  });
});

describe('recommendTacticalSettings — buildUpPlay', () => {
  it('recommends Short for a strong CM/AM axis', () => {
    const lineup = baseLineup([
      ['CM-6', 'CM', player('Creator CM', 'CM', inferFullStats(74, 62, 86, 84, 60, 70))],
      ['AM-7', 'AM', player('Creator AM', 'AM', inferFullStats(78, 74, 88, 88, 42, 66))],
    ]);
    expect(recommendTacticalSettings(lineup, '4-2-3-1').buildUpPlay).toBe('Short');
  });

  it('recommends Long for fast ST/WF plus passer', () => {
    const lineup = baseLineup([
      ['ST-9', 'ST', player('Runner ST', 'ST', inferFullStats(92, 82, 68, 80, 35, 74))],
      ['CM-6', 'CM', player('Deep Passer', 'CM', inferFullStats(72, 55, 86, 74, 64, 72))],
      ['AM-7', 'AM', player('Average AM', 'AM', inferFullStats(72, 65, 72, 72, 45, 66))],
    ]);
    expect(recommendTacticalSettings(lineup, '4-4-2').buildUpPlay).toBe('Long');
  });
});

// ---------------------------------------------------------------------------
// recommendTacticalSettings — playerTactical (role + focus)
// ---------------------------------------------------------------------------

describe('recommendTacticalSettings — playerTactical', () => {
  it('every player gets a valid role for their position', () => {
    const lineup = baseLineup();
    const settings = recommendTacticalSettings(lineup, '4-3-3');
    for (const item of lineup) {
      const rec = settings.playerTactical[item.slotKey];
      expect(rec).toBeDefined();
      const validRoles = POSITION_TACTICAL_ROLES[item.slot.position];
      if (validRoles.length > 0) {
        expect(validRoles).toContain(rec.role);
      }
    }
  });

  it('every player gets a valid focus for their role/position', () => {
    const lineup = baseLineup();
    const settings = recommendTacticalSettings(lineup, '3-4-3');
    for (const item of lineup) {
      const rec = settings.playerTactical[item.slotKey];
      expect(rec).toBeDefined();
      const allowedFocus = getAllowedFocusForRole(item.slot.position, rec.role);
      expect(allowedFocus).toContain(rec.focus);
    }
  });

  it('ST player gets Attack focus', () => {
    const lineup = baseLineup();
    const settings = recommendTacticalSettings(lineup, '4-4-2');
    const stItem = lineup.find((item) => item.slot.position === 'ST');
    expect(stItem).toBeDefined();
    const rec = settings.playerTactical[stItem!.slotKey];
    expect(rec.focus).toBe('Attack');
  });

  it('GK player gets Defend focus', () => {
    const lineup = baseLineup();
    const settings = recommendTacticalSettings(lineup, '4-4-2');
    const gkItem = lineup.find((item) => item.slot.position === 'GK');
    expect(gkItem).toBeDefined();
    const rec = settings.playerTactical[gkItem!.slotKey];
    expect(rec.focus).toBe('Defend');
  });

  it('WF player gets Balanced focus', () => {
    const lineup = baseLineup();
    const settings = recommendTacticalSettings(lineup, '4-4-2');
    const wfItem = lineup.find((item) => item.slot.position === 'WF');
    expect(wfItem).toBeDefined();
    const rec = settings.playerTactical[wfItem!.slotKey];
    expect(rec.focus).toBe('Balanced');
  });

  it('AM player gets Balanced focus', () => {
    const lineup = baseLineup();
    const settings = recommendTacticalSettings(lineup, '4-2-3-1');
    const amItem = lineup.find((item) => item.slot.position === 'AM');
    expect(amItem).toBeDefined();
    const rec = settings.playerTactical[amItem!.slotKey];
    expect(rec.focus).toBe('Balanced');
  });

  it('CB player gets Defend focus (not Balanced — unless Advanced Centre Back)', () => {
    const lineup = baseLineup();
    const settings = recommendTacticalSettings(lineup, '4-4-2');
    const cbItems = lineup.filter((item) => item.slot.position === 'CB');
    expect(cbItems.length).toBeGreaterThan(0);
    for (const cbItem of cbItems) {
      const rec = settings.playerTactical[cbItem.slotKey];
      // Default role for CB is 'Centre Back' — focus must be Defend
      if (rec.role !== 'Advanced Centre Back') {
        expect(rec.focus).toBe('Defend');
      }
    }
  });

  it('sets the most defensive CM to Defend when no DM exists', () => {
    const lineup = baseLineup([
      ['DM-5', 'CM', player('Defensive CM', 'CM', inferFullStats(74, 45, 76, 72, 84, 80))],
      ['CM-6', 'CM', player('Creative CM', 'CM', inferFullStats(74, 60, 84, 84, 55, 70))],
    ]);
    const settings = recommendTacticalSettings(lineup, '4-4-2');
    expect(settings.playerTactical['DM-5'].focus).toBe('Defend');
  });

  it('never outputs an invalid role+focus combination', () => {
    const lineup = baseLineup();
    const settings = recommendTacticalSettings(lineup, '3-4-3');
    for (const item of lineup) {
      const rec = settings.playerTactical[item.slotKey];
      if (!rec) continue;
      const allowedFocus = getAllowedFocusForRole(item.slot.position, rec.role);
      expect(allowedFocus).toContain(rec.focus);
    }
  });

  it('playerRules matches playerTactical.focus (legacy compatibility)', () => {
    const lineup = baseLineup();
    const settings = recommendTacticalSettings(lineup, '4-3-3');
    for (const item of lineup) {
      const rec = settings.playerTactical[item.slotKey];
      expect(settings.playerRules[item.slotKey]).toBe(rec.focus);
    }
  });
});
