import { Player, hasFullStats } from '@/lib/scraper/types';

export type PlayerArchetype =
  | 'Creative AM'
  | 'Pace Winger'
  | 'Target ST'
  | 'Pressing ST'
  | 'Box-to-box CM'
  | 'Ball-Winning DM'
  | 'Recovery CB'
  | 'Physical CB'
  | 'Attacking FB/WB'
  | 'Sweeper GK';

export interface PlayerArchetypeMatch {
  type: PlayerArchetype;
  confidence: 'high' | 'medium';
  score: number;
  reason: string;
}

type StatAccessor = (s: Record<string, number>) => number;

function a(key: string): StatAccessor {
  return (s) => (s[key] ?? 0);
}

function avg(...accessors: StatAccessor[]): StatAccessor {
  return (s) => {
    const vals = accessors.map((fn) => fn(s));
    return vals.reduce((sum, v) => sum + v, 0) / vals.length;
  };
}

interface ArchetypeRule {
  type: PlayerArchetype;
  positions: string[];
  statScore: StatAccessor;
  roleBonus?: (player: Player) => number;
  threshold: number;
  reasonTemplate: string;
}

function roleRatingFor(player: Player, positions: string[]): number {
  if (!player.roleRatings || player.roleRatings.length === 0) return 0;
  const matches = player.roleRatings.filter((r) => positions.includes(r.position));
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((r) => r.overall));
}

function archetypeRules(player: Player): ArchetypeRule[] {
  const roleAm   = roleRatingFor(player, ['AM', 'CF']);
  const roleWf   = roleRatingFor(player, ['WF', 'WM']);
  const roleSt   = roleRatingFor(player, ['ST', 'CF']);
  const roleCm   = roleRatingFor(player, ['CM']);
  const roleDm   = roleRatingFor(player, ['DM']);
  const roleCb   = roleRatingFor(player, ['CB']);
  const roleFbWb = roleRatingFor(player, ['FB', 'WB']);
  const roleGk   = roleRatingFor(player, ['GK']);

  return [
    {
      type: 'Creative AM',
      positions: ['AM', 'CF', 'CM', 'WF'],
      statScore: avg(a('through_pass'), a('attacking_iq'), a('close_dribbling'), a('first_touch'), a('ground_pass')),
      roleBonus: () => roleAm,
      threshold: 110,
      reasonTemplate: 'Kreativer Spielmacher mit starkem Passspiel und Technik',
    },
    {
      type: 'Pace Winger',
      positions: ['WF', 'WM', 'FB', 'WB'],
      statScore: avg(a('acceleration'), a('sprint_speed'), a('sprint_dribbling'), a('crossing')),
      roleBonus: () => roleWf,
      threshold: 110,
      reasonTemplate: 'Schneller Flügelspieler mit Tempo und starkem Dribbling',
    },
    {
      type: 'Target ST',
      positions: ['ST', 'CF'],
      statScore: avg(a('strength'), a('heading'), a('jumping'), a('finishing'), a('first_touch')),
      roleBonus: () => roleSt,
      threshold: 110,
      reasonTemplate: 'Robuster Zielstürmer mit Kopfballpräsenz und Abschlussstärke',
    },
    {
      type: 'Pressing ST',
      positions: ['ST', 'CF', 'WF'],
      statScore: avg(a('stamina'), a('aggression'), a('acceleration'), a('sprint_speed'), a('finishing')),
      roleBonus: () => roleSt,
      threshold: 105,
      reasonTemplate: 'Pressing-Stürmer mit Tempo, Ausdauer und hohem Einsatz',
    },
    {
      type: 'Box-to-box CM',
      positions: ['CM', 'DM'],
      statScore: avg(a('stamina'), a('ground_pass'), a('defensive_iq'), a('shot_power'), a('strength')),
      roleBonus: () => roleCm,
      threshold: 110,
      reasonTemplate: 'Ausdauernder Mittelfeldmotor mit Offensiv- und Defensivbeiträgen',
    },
    {
      type: 'Ball-Winning DM',
      positions: ['DM', 'CM'],
      statScore: avg(a('defensive_iq'), a('stand_tackle'), a('interceptions'), a('aggression'), a('strength')),
      roleBonus: () => roleDm,
      threshold: 110,
      reasonTemplate: 'Defensiver Abräumer mit starkem Tackling und Physis',
    },
    {
      type: 'Recovery CB',
      positions: ['CB', 'FB'],
      statScore: avg(a('acceleration'), a('sprint_speed'), a('defensive_iq'), a('interceptions'), a('stand_tackle')),
      roleBonus: () => roleCb,
      threshold: 105,
      reasonTemplate: 'Schneller Innenverteidiger – stark im Herausrücken und Abfangen',
    },
    {
      type: 'Physical CB',
      positions: ['CB'],
      statScore: avg(a('strength'), a('heading'), a('jumping'), a('aggression'), a('stand_tackle')),
      roleBonus: () => roleCb,
      threshold: 110,
      reasonTemplate: 'Physisch dominanter Verteidiger mit Kopfballstärke und Tacklingqualität',
    },
    {
      type: 'Attacking FB/WB',
      positions: ['FB', 'WB'],
      statScore: avg(a('acceleration'), a('sprint_speed'), a('crossing'), a('sprint_dribbling'), a('stamina')),
      roleBonus: () => roleFbWb,
      threshold: 110,
      reasonTemplate: 'Offensivstarker Außenverteidiger mit Tempo und Flankenqualität',
    },
    {
      type: 'Sweeper GK',
      positions: ['GK'],
      statScore: avg(a('reflexes'), a('positioning'), a('rushing'), a('throwing'), a('kicking_power')),
      roleBonus: () => roleGk,
      threshold: 95,
      reasonTemplate: 'Mitspielender Torhüter – stark im Herauslaufen und Spielaufbau',
    },
  ];
}

export function detectPlayerArchetypes(player: Player): PlayerArchetypeMatch[] {
  const fullStats = hasFullStats(player);
  const s = player.stats as unknown as Record<string, number>;

  const rules = archetypeRules(player);
  const results: PlayerArchetypeMatch[] = [];

  for (const rule of rules) {
    if (rule.positions.length > 0 && !rule.positions.includes(player.position)) continue;

    const statScore = rule.statScore(s);
    const roleBonus = rule.roleBonus ? rule.roleBonus(player) : 0;

    const combined = statScore + roleBonus * 0.5;

    if (combined >= rule.threshold) {
      const confidence: 'high' | 'medium' =
        fullStats && statScore >= 75 ? 'high' : 'medium';

      results.push({
        type: rule.type,
        confidence,
        score: Math.round(combined),
        reason: rule.reasonTemplate,
      });
    }
  }

  if (!fullStats) {
    return results
      .filter((r) => r.score >= (r.confidence === 'medium' ? 95 : 105))
      .map((r) => ({ ...r, confidence: 'medium' as const }));
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}
