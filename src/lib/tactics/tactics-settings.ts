import formationsData from '@/config/formations.json';
import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';

export type BuildUpPlay = 'Balanced' | 'Short' | 'Long';
export type PlayerRule = 'Balanced' | 'Defend';

export interface TeamTacticsSettings {
  defensiveDepth: number;
  buildUpPlay: BuildUpPlay;
  playerRules: Record<string, PlayerRule>;
  reasons: string[];
}

export interface FormationTacticalProfile {
  formationKey: string;
  strengths: string[];
  weaknesses: string[];
  styleTags: string[];
  recommendedBuildUp: BuildUpPlay;
  depthRangeHint: [number, number];
}

export type FilledLineupSlot = { slot: LineupSlot; player: PlayerWithScores; slotKey?: string };

export const GOALS_TACTIC_FORMATION_KEYS = [
  '4-4-2',
  '4-2-3-1',
  '4-3-3',
  '4-3-3 Attack',
  '4-3-3 Defense',
  '4-1-2-1-2',
  '4-3-1-2',
  '4-2-2-2',
  '4-4-1-1',
  '3-5-2',
  '3-4-3',
  '3-4-2-1',
  '5-2-1-2',
  '5-2-3',
] as const;

// Conservative model: the user confirmed at least Balanced and Defend exist.
// TODO: Expand per-position once GOALS exposes/validates additional player rules in-game.
export const PLAYER_RULES_BY_POSITION: Record<Position, readonly PlayerRule[]> = {
  GK: ['Balanced'],
  CB: ['Balanced', 'Defend'],
  FB: ['Balanced', 'Defend'],
  WB: ['Balanced', 'Defend'],
  DM: ['Balanced', 'Defend'],
  CM: ['Balanced', 'Defend'],
  AM: ['Balanced'],
  WM: ['Balanced', 'Defend'],
  WF: ['Balanced'],
  CF: ['Balanced'],
  ST: ['Balanced'],
};

export const FORMATION_TACTICAL_PROFILES: Record<string, FormationTacticalProfile> = {
  '4-4-2': { formationKey: '4-4-2', strengths: ['Stabile Grundordnung', 'Zwei klare Stürmer', 'Breite Mittelfeldlinie'], weaknesses: ['Weniger zentrale Überzahl', 'CMs müssen Wege schließen'], styleTags: ['balanced', 'wide', 'two-striker'], recommendedBuildUp: 'Balanced', depthRangeHint: [40, 45] },
  '4-2-3-1': { formationKey: '4-2-3-1', strengths: ['Doppelsechs schützt die Kette', 'AM als Kreativzentrum', 'Gute Restverteidigung'], weaknesses: ['ST kann isoliert sein', 'Außen müssen mitarbeiten'], styleTags: ['compact', 'creator', 'double-pivot'], recommendedBuildUp: 'Short', depthRangeHint: [40, 48] },
  '4-3-3': { formationKey: '4-3-3', strengths: ['Breite Flügelangriffe', 'Klare Pressingstruktur', 'Drei zentrale Mittelfeldrollen'], weaknesses: ['FB-Absicherung wichtig', 'CMs decken viel Raum'], styleTags: ['wide', 'pressing', 'balanced'], recommendedBuildUp: 'Balanced', depthRangeHint: [40, 48] },
  '4-3-3 Attack': { formationKey: '4-3-3 Attack', strengths: ['Hohe letzte Linie', 'AM unterstützt drei Angreifer', 'Stark gegen tiefe Gegner'], weaknesses: ['Konteranfällig im Zentrum', 'FB brauchen Absicherung'], styleTags: ['attacking', 'wide', 'high-risk'], recommendedBuildUp: 'Short', depthRangeHint: [42, 55] },
  '4-3-3 Defense': { formationKey: '4-3-3 Defense', strengths: ['DM schützt CBs', 'Konter über Flügel möglich', 'Kompakte Mitte'], weaknesses: ['Weniger Präsenz zwischen den Linien', 'ST kann isoliert sein'], styleTags: ['compact', 'counter', 'dm-cover'], recommendedBuildUp: 'Balanced', depthRangeHint: [36, 44] },
  '4-1-2-1-2': { formationKey: '4-1-2-1-2', strengths: ['Stark durchs Zentrum', 'DM sichert ab', 'Zwei ST plus AM'], weaknesses: ['Kaum natürliche Breite', 'FB werden stark belastet'], styleTags: ['narrow', 'central', 'two-striker'], recommendedBuildUp: 'Short', depthRangeHint: [38, 46] },
  '4-3-1-2': { formationKey: '4-3-1-2', strengths: ['Zentrale Überzahl', 'AM verbindet Linien', 'Zwei Stürmer'], weaknesses: ['Außenbahnen dünn', 'FB müssen diszipliniert bleiben'], styleTags: ['narrow', 'central', 'balanced'], recommendedBuildUp: 'Short', depthRangeHint: [38, 45] },
  '4-2-2-2': { formationKey: '4-2-2-2', strengths: ['Doppelsechs', 'Schnelle Vertikalwege', 'Zwei ST'], weaknesses: ['Wenig klassische Breite', 'Zwischenräume neben den AMs'], styleTags: ['counter', 'double-pivot', 'two-striker'], recommendedBuildUp: 'Long', depthRangeHint: [38, 46] },
  '4-4-1-1': { formationKey: '4-4-1-1', strengths: ['Kompakter Block', 'CF/AM für zweite Bälle', 'Gute Breite'], weaknesses: ['ST alleine vorne', 'Offensiv weniger Druck'], styleTags: ['compact', 'balanced', 'second-ball'], recommendedBuildUp: 'Balanced', depthRangeHint: [38, 44] },
  '3-5-2': { formationKey: '3-5-2', strengths: ['Zentrale Überzahl', 'Wingbacks geben Breite', 'Zwei ST'], weaknesses: ['Außen offen bei Ballverlust', 'WB-Ausdauer kritisch'], styleTags: ['wingbacks', 'central', 'two-striker'], recommendedBuildUp: 'Balanced', depthRangeHint: [38, 48] },
  '3-4-3': { formationKey: '3-4-3', strengths: ['Maximale Breite', 'Viele Angriffsoptionen', 'Hohes Pressing möglich'], weaknesses: ['Defensiv riskant', 'Nur zwei zentrale Mittelfeldspieler'], styleTags: ['attacking', 'wide', 'high-risk'], recommendedBuildUp: 'Long', depthRangeHint: [40, 52] },
  '3-4-2-1': { formationKey: '3-4-2-1', strengths: ['Halbräume stark besetzt', 'Wingback-Breite', 'Kombinationsdreiecke'], weaknesses: ['WB defensiv kritisch', 'Nur ein echter ST'], styleTags: ['half-spaces', 'wingbacks', 'technical'], recommendedBuildUp: 'Short', depthRangeHint: [40, 50] },
  '5-2-1-2': { formationKey: '5-2-1-2', strengths: ['Sehr stabile letzte Linie', 'AM verbindet Konter', 'Zwei ST'], weaknesses: ['Mittelfeld kann unterzählig sein', 'WB tragen die Breite'], styleTags: ['defensive', 'counter', 'two-striker'], recommendedBuildUp: 'Long', depthRangeHint: [34, 42] },
  '5-2-3': { formationKey: '5-2-3', strengths: ['Fünferkette plus drei Konterspieler', 'Breite Ausgänge', 'Gut gegen hohe Linien'], weaknesses: ['Nur zwei zentrale Mittelfeldspieler', 'Ballbesitz kann dünn werden'], styleTags: ['defensive', 'wide-counter', 'front-three'], recommendedBuildUp: 'Long', depthRangeHint: [34, 42] },
};

const FORMATIONS = formationsData as Record<string, { name: string }>;

function stat(player: PlayerWithScores, slotPosition: Position, key: keyof typeof player.stats): number {
  return ((player.effectiveStats[slotPosition]?.[key] ?? player.stats[key]) as number) ?? 0;
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clampDepth(value: number) {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function allows(position: Position, rule: PlayerRule) {
  return PLAYER_RULES_BY_POSITION[position].includes(rule);
}

function slotKeyFor(item: FilledLineupSlot, index: number) {
  return item.slotKey ?? `${item.slot.position}-${index}`;
}

function defensiveScore(player: PlayerWithScores, slotPosition: Position) {
  return stat(player, slotPosition, 'defensive_iq') * 0.35 +
         stat(player, slotPosition, 'interceptions') * 0.25 +
         stat(player, slotPosition, 'stand_tackle') * 0.25 +
         stat(player, slotPosition, 'stamina') * 0.15;
}

export function recommendTacticalSettings(filledLineup: FilledLineupSlot[], formationKey?: string): TeamTacticsSettings {
  const reasons: string[] = [];
  const cbs = filledLineup.filter((item) => item.slot.position === 'CB');
  const dms = filledLineup.filter((item) => item.slot.position === 'DM');
  const cms = filledLineup.filter((item) => item.slot.position === 'CM');
  const ams = filledLineup.filter((item) => item.slot.position === 'AM');
  const fbs = filledLineup.filter((item) => item.slot.position === 'FB' || item.slot.position === 'WB');
  const runners = filledLineup.filter((item) => ['ST', 'WF', 'CF'].includes(item.slot.position));
  const passers = filledLineup.filter((item) => ['DM', 'CM', 'AM', 'WM'].includes(item.slot.position));

  let depth = 42;
  // Use effectiveStats at each player's actual slot position for all slot-specific calculations.
  // GOALS rule: position changes (-2 secondary / -5 out) affect stats only, never OVR.
  const avgCbPace = avg(cbs.map((item) => stat(item.player, item.slot.position, 'sprint_speed')));
  const bestDm = dms.slice().sort((a, b) => defensiveScore(b.player, b.slot.position) - defensiveScore(a.player, a.slot.position))[0];
  const bestDmScore = bestDm ? defensiveScore(bestDm.player, bestDm.slot.position) : 0;

  if (cbs.length && avgCbPace < 70) {
    depth -= 6;
    reasons.push('Langsame CBs: Abwehrtiefe reduziert.');
  }
  if (!dms.length) {
    depth -= 3;
    reasons.push('Kein DM: kompaktere Grundhöhe.');
  }
  if (cbs.length && avgCbPace >= 82 && bestDmScore >= 76) {
    depth += 8;
    reasons.push('Schnelle CBs plus guter DM erlauben höhere Linie.');
  }

  const profile = formationKey ? FORMATION_TACTICAL_PROFILES[formationKey] : undefined;
  if (profile) {
    depth = Math.max(profile.depthRangeHint[0], Math.min(profile.depthRangeHint[1], depth));
  }

  const centralCreators = [...cms, ...ams].filter((item) =>
    stat(item.player, item.slot.position, 'ground_pass') >= 78 &&
    stat(item.player, item.slot.position, 'through_pass') >= 76 &&
    (stat(item.player, item.slot.position, 'close_dribbling') >= 76 || stat(item.player, item.slot.position, 'first_touch') >= 76)
  );
  const fastRunner = runners.some((item) => stat(item.player, item.slot.position, 'sprint_speed') >= 86 && stat(item.player, item.slot.position, 'acceleration') >= 84);
  const goodPasser = passers.some((item) => stat(item.player, item.slot.position, 'through_pass') >= 80 || stat(item.player, item.slot.position, 'lofted_pass') >= 82);

  let buildUpPlay: BuildUpPlay = profile?.recommendedBuildUp ?? 'Balanced';
  if (centralCreators.length >= 2) {
    buildUpPlay = 'Short';
    reasons.push('Starke CM/AM-Pass- und Dribbling-Achse: Short Build Up.');
  } else if (fastRunner && goodPasser) {
    buildUpPlay = 'Long';
    reasons.push('Schneller ST/WF plus Passgeber: Long Build Up.');
  } else if (!profile) {
    buildUpPlay = 'Balanced';
  }

  const playerRules: Record<string, PlayerRule> = {};
  filledLineup.forEach((item, index) => {
    playerRules[slotKeyFor(item, index)] = 'Balanced';
  });

  const holdingCandidates = (dms.length ? dms : cms).filter((item) => allows(item.slot.position, 'Defend'));
  const holder = holdingCandidates.slice().sort((a, b) => defensiveScore(b.player, b.slot.position) - defensiveScore(a.player, a.slot.position))[0];
  if (holder) {
    const index = filledLineup.indexOf(holder);
    playerRules[slotKeyFor(holder, index)] = 'Defend';
    reasons.push(dms.length ? 'Mindestens ein DM bleibt auf Defend.' : 'Kein DM: defensivster CM bleibt auf Defend.');
  }

  const counterRisk = !dms.length || avgCbPace < 74 || ['3-4-3', '4-3-3 Attack'].includes(formationKey ?? '');
  if (counterRisk) {
    fbs.forEach((item) => {
      if (!allows(item.slot.position, 'Defend')) return;
      const index = filledLineup.indexOf(item);
      playerRules[slotKeyFor(item, index)] = 'Defend';
    });
    if (fbs.length) reasons.push('Konterrisiko: FB/WB vorsichtiger auf Defend.');
  }

  Object.entries(playerRules).forEach(([key, rule]) => {
    const item = filledLineup.find((candidate, index) => slotKeyFor(candidate, index) === key);
    if (item && !allows(item.slot.position, rule)) playerRules[key] = 'Balanced';
  });

  if (formationKey && !FORMATIONS[formationKey]) reasons.push(`Formation ${formationKey} ist nicht in formations.json vorhanden.`);

  return {
    defensiveDepth: clampDepth(depth),
    buildUpPlay,
    playerRules,
    reasons,
  };
}
