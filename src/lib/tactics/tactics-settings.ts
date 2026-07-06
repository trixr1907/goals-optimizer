import formationsData from '@/config/formations.json';
import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';

// ---------------------------------------------------------------------------
// Core GOALS tactical types — position-bound, not player/formation-bound.
// ---------------------------------------------------------------------------

export type TacticalFocus = 'Attack' | 'Balanced' | 'Defend';

/**
 * All player roles that exist in GOALS.
 * CF is intentionally excluded — it is not a formation slot (CF players use ST or AM).
 */
export type TacticalRole =
  | 'Striker'
  | 'Deep Lying Forward'
  | 'Wide Forward'
  | 'Attacking Midfielder'
  | 'Central Midfielder'
  | 'Defensive Midfielder'
  | 'Wide Midfielder'
  | 'Wing Back'
  | 'Full Back'
  | 'Centre Back'
  | 'Ball Playing Defender'
  | 'Advanced Centre Back'
  | 'Goalkeeper'
  | 'Sweeper Keeper';

export interface PositionTacticalConfig {
  roles: readonly TacticalRole[];
  /** Focus options available for the whole position. Some roles further restrict this. */
  focusOptions: readonly TacticalFocus[];
  /** Override focus options keyed by role (only when a role differs from positional default). */
  roleFocusOverride?: Partial<Record<TacticalRole, readonly TacticalFocus[]>>;
}

/**
 * Verified GOALS rules:
 *   ST    — Striker / Deep Lying Forward     → Attack only
 *   WF    — Wide Forward                     → Balanced only
 *   AM    — Attacking Midfielder             → Balanced only
 *   CM    — Central Midfielder               → Balanced, Defend
 *   DM    — Defensive Midfielder             → Balanced, Defend
 *   WM    — Wide Midfielder                  → Balanced only
 *   WB    — Wing Back                        → Balanced only
 *   FB    — Full Back                        → Balanced, Defend
 *   CB    — Centre Back / BPD               → Defend only
 *          Advanced Centre Back              → Balanced, Defend
 *   GK    — Goalkeeper / Sweeper Keeper      → Defend only
 */
export const POSITION_TACTICAL_CONFIG: Record<Position, PositionTacticalConfig> = {
  ST: {
    roles: ['Striker', 'Deep Lying Forward'],
    focusOptions: ['Attack'],
  },
  WF: {
    roles: ['Wide Forward'],
    focusOptions: ['Balanced'],
  },
  AM: {
    roles: ['Attacking Midfielder'],
    focusOptions: ['Balanced'],
  },
  CM: {
    roles: ['Central Midfielder'],
    focusOptions: ['Balanced', 'Defend'],
  },
  DM: {
    roles: ['Defensive Midfielder'],
    focusOptions: ['Balanced', 'Defend'],
  },
  WM: {
    roles: ['Wide Midfielder'],
    focusOptions: ['Balanced'],
  },
  WB: {
    roles: ['Wing Back'],
    focusOptions: ['Balanced'],
  },
  FB: {
    roles: ['Full Back'],
    focusOptions: ['Balanced', 'Defend'],
  },
  CB: {
    roles: ['Centre Back', 'Ball Playing Defender', 'Advanced Centre Back'],
    // Default: only Defend. Advanced Centre Back also allows Balanced.
    focusOptions: ['Defend'],
    roleFocusOverride: {
      'Advanced Centre Back': ['Balanced', 'Defend'],
    },
  },
  GK: {
    roles: ['Goalkeeper', 'Sweeper Keeper'],
    focusOptions: ['Defend'],
  },
  // CF: not a formation slot — no config. CF players play as ST or AM.
  CF: {
    roles: [],
    focusOptions: [],
  },
};

/** Flat role list per position (convenience accessor). */
export const POSITION_TACTICAL_ROLES: Record<Position, readonly TacticalRole[]> = Object.fromEntries(
  Object.entries(POSITION_TACTICAL_CONFIG).map(([pos, cfg]) => [pos, cfg.roles]),
) as Record<Position, readonly TacticalRole[]>;

/** Allowed focus options per position (using the positional default, not per-role override). */
export const POSITION_ALLOWED_FOCUS: Record<Position, readonly TacticalFocus[]> = Object.fromEntries(
  Object.entries(POSITION_TACTICAL_CONFIG).map(([pos, cfg]) => [pos, cfg.focusOptions]),
) as Record<Position, readonly TacticalFocus[]>;

/**
 * Returns the allowed focus options for a specific role at a position.
 * Respects role-level overrides (e.g. Advanced Centre Back → Balanced allowed).
 */
export function getAllowedFocusForRole(position: Position, role: TacticalRole): readonly TacticalFocus[] {
  const cfg = POSITION_TACTICAL_CONFIG[position];
  if (!cfg) return [];
  const override = cfg.roleFocusOverride?.[role];
  return override ?? cfg.focusOptions;
}

/**
 * Returns the default (most defensive / safest) focus for a position.
 * Used when the engine recommends focus without knowing the chosen role.
 */
export function defaultFocusForPosition(position: Position): TacticalFocus {
  const opts = POSITION_ALLOWED_FOCUS[position];
  if (!opts || opts.length === 0) return 'Balanced';
  // Priority: Attack only at ST, Defend preferred at defensive positions
  if (opts.includes('Attack') && opts.length === 1) return 'Attack';
  if (opts.includes('Defend')) return 'Defend';
  return 'Balanced';
}

// ---------------------------------------------------------------------------
// Legacy PlayerRule — kept for backward compatibility with existing UI/engine.
// The new canonical type is TacticalFocus. Remove PlayerRule after full migration.
// ---------------------------------------------------------------------------

/** @deprecated Use TacticalFocus instead. */
export type PlayerRule = TacticalFocus;

/**
 * Allowed player rules per position (legacy view — maps to TacticalFocus).
 * @deprecated Use POSITION_ALLOWED_FOCUS instead.
 */
export const PLAYER_RULES_BY_POSITION: Record<Position, readonly PlayerRule[]> = POSITION_ALLOWED_FOCUS;

// ---------------------------------------------------------------------------
// Team-level recommendations
// ---------------------------------------------------------------------------

export type BuildUpPlay = 'Balanced' | 'Short' | 'Long';

export interface PlayerTacticalRecommendation {
  role: TacticalRole;
  focus: TacticalFocus;
}

export interface TeamTacticsSettings {
  defensiveDepth: number;
  buildUpPlay: BuildUpPlay;
  /** Focus recommendation per slotKey (legacy shape). */
  playerRules: Record<string, PlayerRule>;
  /** Role + Focus recommendation per slotKey (new canonical shape). */
  playerTactical: Record<string, PlayerTacticalRecommendation>;
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

export const FORMATION_TACTICAL_PROFILES: Record<string, FormationTacticalProfile> = {
  '4-4-2': { formationKey: '4-4-2', strengths: ['Stabile Grundordnung', 'Zwei klare Stürmer', 'Breite Mittelfeldlinie'], weaknesses: ['Weniger zentrale Überzahl', 'CMs müssen Wege schließen'], styleTags: ['balanced', 'wide', 'two-striker'], recommendedBuildUp: 'Balanced', depthRangeHint: [40, 45] },
  '4-2-3-1': { formationKey: '4-2-3-1', strengths: ['Doppelsechs schützt die Kette', 'AM als Kreativzentrum', 'Gute Restverteidigung'], weaknesses: ['ST kann isoliert sein', 'Außen müssen mitarbeiten'], styleTags: ['compact', 'creator', 'double-pivot'], recommendedBuildUp: 'Short', depthRangeHint: [40, 48] },
  '4-3-3': { formationKey: '4-3-3', strengths: ['Breite Flügelangriffe', 'Klare Pressingstruktur', 'Drei zentrale Mittelfeldrollen'], weaknesses: ['FB-Absicherung wichtig', 'CMs decken viel Raum'], styleTags: ['wide', 'pressing', 'balanced'], recommendedBuildUp: 'Balanced', depthRangeHint: [40, 48] },
  '4-3-3 Attack': { formationKey: '4-3-3 Attack', strengths: ['Hohe letzte Linie', 'AM unterstützt drei Angreifer', 'Stark gegen tiefe Gegner'], weaknesses: ['Konteranfällig im Zentrum', 'FB brauchen Absicherung'], styleTags: ['attacking', 'wide', 'high-risk'], recommendedBuildUp: 'Short', depthRangeHint: [42, 55] },
  '4-3-3 Defense': { formationKey: '4-3-3 Defense', strengths: ['DM schützt CBs', 'Konter über Flügel möglich', 'Kompakte Mitte'], weaknesses: ['Weniger Präsenz zwischen den Linien', 'ST kann isoliert sein'], styleTags: ['compact', 'counter', 'dm-cover'], recommendedBuildUp: 'Balanced', depthRangeHint: [36, 44] },
  '4-1-2-1-2': { formationKey: '4-1-2-1-2', strengths: ['Stark durchs Zentrum', 'DM sichert ab', 'Zwei ST plus AM'], weaknesses: ['Kaum natürliche Breite', 'FB werden stark belastet'], styleTags: ['narrow', 'central', 'two-striker'], recommendedBuildUp: 'Short', depthRangeHint: [38, 46] },
  '4-3-1-2': { formationKey: '4-3-1-2', strengths: ['Zentrale Überzahl', 'AM verbindet Linien', 'Zwei Stürmer'], weaknesses: ['Außenbahnen dünn', 'FB müssen diszipliniert bleiben'], styleTags: ['narrow', 'central', 'balanced'], recommendedBuildUp: 'Short', depthRangeHint: [38, 45] },
  '4-2-2-2': { formationKey: '4-2-2-2', strengths: ['Doppelsechs', 'Schnelle Vertikalwege', 'Zwei ST'], weaknesses: ['Wenig klassische Breite', 'Zwischenräume neben den AMs'], styleTags: ['counter', 'double-pivot', 'two-striker'], recommendedBuildUp: 'Long', depthRangeHint: [38, 46] },
  '4-4-1-1': { formationKey: '4-4-1-1', strengths: ['Kompakter Block', 'AM für zweite Bälle', 'Gute Breite'], weaknesses: ['ST alleine vorne', 'Offensiv weniger Druck'], styleTags: ['compact', 'balanced', 'second-ball'], recommendedBuildUp: 'Balanced', depthRangeHint: [38, 44] },
  '3-5-2': { formationKey: '3-5-2', strengths: ['Zentrale Überzahl', 'Wingbacks geben Breite', 'Zwei ST'], weaknesses: ['Außen offen bei Ballverlust', 'WB-Ausdauer kritisch'], styleTags: ['wingbacks', 'central', 'two-striker'], recommendedBuildUp: 'Balanced', depthRangeHint: [38, 48] },
  '3-4-3': { formationKey: '3-4-3', strengths: ['Maximale Breite', 'Viele Angriffsoptionen', 'Hohes Pressing möglich'], weaknesses: ['Defensiv riskant', 'Nur zwei zentrale Mittelfeldspieler'], styleTags: ['attacking', 'wide', 'high-risk'], recommendedBuildUp: 'Long', depthRangeHint: [40, 52] },
  '3-4-2-1': { formationKey: '3-4-2-1', strengths: ['Drei-Kette gibt Stabilität', 'Zwei AM besetzen die Halbräume', 'Ein klarer ST als Zielspieler'], weaknesses: ['Außen offen bei Ballverlust', 'ST kann isoliert sein'], styleTags: ['wingbacks', 'central', 'creator'], recommendedBuildUp: 'Short', depthRangeHint: [38, 46] },
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

function allows(position: Position, focus: TacticalFocus): boolean {
  return (POSITION_ALLOWED_FOCUS[position] as readonly TacticalFocus[]).includes(focus);
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

/**
 * Picks the default role for a position (first in list = most common/conservative).
 * Used by the recommendation engine when no role has been explicitly chosen.
 */
function defaultRoleForPosition(position: Position): TacticalRole {
  const roles = POSITION_TACTICAL_ROLES[position];
  if (!roles || roles.length === 0) return 'Central Midfielder'; // fallback
  return roles[0];
}

export function recommendTacticalSettings(filledLineup: FilledLineupSlot[], formationKey?: string): TeamTacticsSettings {
  const reasons: string[] = [];
  const cbs = filledLineup.filter((item) => item.slot.position === 'CB');
  const dms = filledLineup.filter((item) => item.slot.position === 'DM');
  const cms = filledLineup.filter((item) => item.slot.position === 'CM');
  const ams = filledLineup.filter((item) => item.slot.position === 'AM');
  const fbs = filledLineup.filter((item) => item.slot.position === 'FB' || item.slot.position === 'WB');
  const runners = filledLineup.filter((item) => ['ST', 'WF'].includes(item.slot.position));
  const passers = filledLineup.filter((item) => ['DM', 'CM', 'AM', 'WM'].includes(item.slot.position));

  let depth = 42;
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

  // --- Build player tactical recommendations ---
  // Start: every player gets their positional default role + default focus.
  const playerTactical: Record<string, PlayerTacticalRecommendation> = {};
  filledLineup.forEach((item, index) => {
    const pos = item.slot.position;
    const role = defaultRoleForPosition(pos);
    const focus = defaultFocusForPosition(pos);
    playerTactical[slotKeyFor(item, index)] = { role, focus };
  });

  // Apply defensive assignment: best DM (or most defensive CM) → Defend focus.
  const holdingCandidates = (dms.length ? dms : cms).filter((item) => allows(item.slot.position, 'Defend'));
  const holder = holdingCandidates.slice().sort((a, b) => defensiveScore(b.player, b.slot.position) - defensiveScore(a.player, a.slot.position))[0];
  if (holder) {
    const index = filledLineup.indexOf(holder);
    const key = slotKeyFor(holder, index);
    playerTactical[key] = { ...playerTactical[key], focus: 'Defend' };
    reasons.push(dms.length ? 'Mindestens ein DM bleibt auf Defend.' : 'Kein DM: defensivster CM bleibt auf Defend.');
  }

  // Apply counter-risk: FBs/WBs → Defend when counter risk is present.
  const counterRisk = !dms.length || avgCbPace < 74 || ['3-4-3', '4-3-3 Attack'].includes(formationKey ?? '');
  if (counterRisk) {
    fbs.forEach((item) => {
      if (!allows(item.slot.position, 'Defend')) return;
      const index = filledLineup.indexOf(item);
      const key = slotKeyFor(item, index);
      playerTactical[key] = { ...playerTactical[key], focus: 'Defend' };
    });
    if (fbs.length) reasons.push('Konterrisiko: FB/WB vorsichtiger auf Defend.');
  }

  // Validate: ensure no invalid role+focus combos slipped through.
  Object.entries(playerTactical).forEach(([key, rec]) => {
    const item = filledLineup.find((candidate, index) => slotKeyFor(candidate, index) === key);
    if (!item) return;
    const pos = item.slot.position;
    const allowedFocus = getAllowedFocusForRole(pos, rec.role);
    if (!allowedFocus.includes(rec.focus)) {
      // Fall back to the first allowed focus for this role.
      playerTactical[key] = { ...rec, focus: allowedFocus[0] ?? defaultFocusForPosition(pos) };
    }
    if (!POSITION_TACTICAL_ROLES[pos].includes(rec.role)) {
      playerTactical[key] = { ...playerTactical[key], role: defaultRoleForPosition(pos) };
    }
  });

  if (formationKey && !FORMATIONS[formationKey]) reasons.push(`Formation ${formationKey} ist nicht in formations.json vorhanden.`);

  // Build legacy playerRules from playerTactical for backward compatibility.
  const playerRules: Record<string, PlayerRule> = {};
  Object.entries(playerTactical).forEach(([key, rec]) => {
    playerRules[key] = rec.focus;
  });

  return {
    defensiveDepth: clampDepth(depth),
    buildUpPlay,
    playerRules,
    playerTactical,
    reasons,
  };
}
