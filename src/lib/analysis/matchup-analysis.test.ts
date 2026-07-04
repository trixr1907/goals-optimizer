import { describe, expect, it } from 'vitest';
import { analyzeMatchup } from './matchup-analysis';
import { Player, PlayerStats } from '@/lib/scraper/types';

// ── Fixture helpers ───────────────────────────────────────────────────────────

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

function makePlayer(
  overrides: Partial<Player> & { statsOverrides?: Partial<PlayerStats> },
): Player {
  const { statsOverrides = {}, ...rest } = overrides;
  return {
    id: rest.id ?? 'p1',
    name: rest.name ?? 'Test Player',
    position: rest.position ?? 'CM',
    overall: rest.overall ?? 80,
    rarity: rest.rarity ?? 'Rare',
    stats: { ...emptyStats(), ...statsOverrides },
    roleRatings: rest.roleRatings ?? [],
    secondaryPositions: rest.secondaryPositions ?? [],
    dataQuality: 'full',
    ...rest,
  };
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('analyzeMatchup', () => {
  it('warns about pace disadvantage when opponent has fast attackers and own CBs are slow', () => {
    const myCB = makePlayer({
      id: 'cb1', position: 'CB', overall: 80,
      statsOverrides: { pac: 60, acceleration: 60, sprint_speed: 60 },
    });
    const oppST = makePlayer({
      id: 'opp-st1', position: 'ST', overall: 85,
      statsOverrides: { pac: 82, acceleration: 82, sprint_speed: 82 },
    });

    const result = analyzeMatchup([myCB], [oppST]);

    const hasTempoRisk = result.risks.some((r) =>
      r.label.includes('Tempo') || r.label.includes('Abwehr'),
    );
    expect(hasTempoRisk).toBe(true);

    const highRisk = result.risks.find((r) =>
      r.label.includes('Tempo') || r.label.includes('Abwehr'),
    );
    expect(highRisk?.severity).toBe('high');

    const hasDepthAdjustment = result.suggestedTacticalAdjustments.some((a) =>
      a.toLowerCase().includes('tiefe') || a.toLowerCase().includes('linie'),
    );
    expect(hasDepthAdjustment).toBe(true);
  });

  it('recommends counter-attack when own attackers are fast and opponent CBs are slow', () => {
    const myST = makePlayer({
      id: 'my-st1', position: 'ST', overall: 83,
      statsOverrides: { pac: 85, acceleration: 85, sprint_speed: 85 },
    });
    const oppCB = makePlayer({
      id: 'opp-cb1', position: 'CB', overall: 78,
      statsOverrides: { pac: 62, acceleration: 62, sprint_speed: 62 },
    });

    const result = analyzeMatchup([myST], [oppCB]);

    const hasCounterStrength = result.strengths.some((s) =>
      s.label.toLowerCase().includes('konter'),
    );
    expect(hasCounterStrength).toBe(true);

    const highStrength = result.strengths.find((s) =>
      s.label.toLowerCase().includes('konter'),
    );
    expect(highStrength?.severity).toBe('high');

    const hasBuildUpAdjustment = result.suggestedTacticalAdjustments.some((a) =>
      a.toLowerCase().includes('long') || a.toLowerCase().includes('tiefe'),
    );
    expect(hasBuildUpAdjustment).toBe(true);
  });

  it('closes the center when opponent has a strong AM/CM passing and dribbling axis', () => {
    const oppAM = makePlayer({
      id: 'opp-am1', position: 'AM', overall: 88,
      statsOverrides: {
        pas: 85, ground_pass: 85, through_pass: 85,
        dri: 82, close_dribbling: 82, sprint_dribbling: 78,
      },
    });
    const myCM = makePlayer({
      id: 'my-cm1', position: 'CM', overall: 80,
      statsOverrides: { pas: 72, dri: 70, stamina: 75 },
    });

    const result = analyzeMatchup([myCM], [oppAM]);

    const hasCentralRisk = result.risks.some((r) =>
      r.label.toLowerCase().includes('zentral') || r.label.toLowerCase().includes('achse'),
    );
    expect(hasCentralRisk).toBe(true);

    const hasDmAdjustment = result.suggestedTacticalAdjustments.some((a) =>
      a.toLowerCase().includes('dm') || a.toLowerCase().includes('zentrum'),
    );
    expect(hasDmAdjustment).toBe(true);
  });

  it('flags flank risk when opponent has Target ST and strong crossers', () => {
    const oppST = makePlayer({
      id: 'opp-st1', position: 'ST', overall: 87,
      statsOverrides: { heading: 82, jumping: 82, strength: 80, finishing: 78 },
    });
    const oppWF = makePlayer({
      id: 'opp-wf1', position: 'WF', overall: 84,
      statsOverrides: { crossing: 80, acceleration: 82, sprint_speed: 80 },
    });
    const myCB = makePlayer({
      id: 'my-cb1', position: 'CB', overall: 80,
      statsOverrides: { heading: 74, jumping: 74, strength: 72 },
    });

    const result = analyzeMatchup([myCB], [oppST, oppWF]);

    const hasFlankRisk = result.risks.some((r) =>
      r.label.toLowerCase().includes('flanken') || r.label.toLowerCase().includes('zielstürmer'),
    );
    expect(hasFlankRisk).toBe(true);

    const hasFlankAdjustment = result.suggestedTacticalAdjustments.some((a) =>
      a.toLowerCase().includes('flanke') || a.toLowerCase().includes('außen'),
    );
    expect(hasFlankAdjustment).toBe(true);
  });

  it('identifies flank opportunity when own Target ST and crossers face weak opponent CBs', () => {
    const myST = makePlayer({
      id: 'my-st1', position: 'ST', overall: 85,
      statsOverrides: { heading: 82, jumping: 80, strength: 78, finishing: 76 },
    });
    const myWF = makePlayer({
      id: 'my-wf1', position: 'WF', overall: 82,
      statsOverrides: { crossing: 78, acceleration: 80, sprint_speed: 80 },
    });
    const oppCB = makePlayer({
      id: 'opp-cb1', position: 'CB', overall: 75,
      statsOverrides: { heading: 60, jumping: 58, phy: 60 },
    });

    const result = analyzeMatchup([myST, myWF], [oppCB]);

    const hasFlankStrength = result.strengths.some((s) =>
      s.label.toLowerCase().includes('flanken') || s.label.toLowerCase().includes('kopfball'),
    );
    expect(hasFlankStrength).toBe(true);
  });

  it('warns about stamina when own squad has low stamina', () => {
    const myPlayer = makePlayer({
      id: 'my1', position: 'CM', overall: 78,
      statsOverrides: { stamina: 62, pas: 72 },
    });
    const oppPlayer = makePlayer({
      id: 'opp1', position: 'CM', overall: 78,
      statsOverrides: { stamina: 80 },
    });

    const result = analyzeMatchup([myPlayer], [oppPlayer]);

    const hasStaminaRisk = result.risks.some((r) =>
      r.label.toLowerCase().includes('kondition') || r.label.toLowerCase().includes('ausdauer'),
    );
    expect(hasStaminaRisk).toBe(true);
  });

  it('returns verdict=favorable when own OVR is higher and no high risks', () => {
    const mySquad = Array.from({ length: 5 }, (_, i) =>
      makePlayer({ id: `my${i}`, position: 'CM', overall: 90 }),
    );
    const oppSquad = Array.from({ length: 5 }, (_, i) =>
      makePlayer({ id: `opp${i}`, position: 'CM', overall: 82 }),
    );

    const result = analyzeMatchup(mySquad, oppSquad);
    expect(result.verdict).toBe('favorable');
  });

  it('returns verdict=difficult when own OVR is much lower', () => {
    const mySquad = Array.from({ length: 5 }, (_, i) =>
      makePlayer({ id: `my${i}`, position: 'CM', overall: 74 }),
    );
    const oppSquad = Array.from({ length: 5 }, (_, i) =>
      makePlayer({ id: `opp${i}`, position: 'CM', overall: 84 }),
    );

    const result = analyzeMatchup(mySquad, oppSquad);
    expect(result.verdict).toBe('difficult');
  });
});
