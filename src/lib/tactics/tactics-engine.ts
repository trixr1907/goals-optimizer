import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';

export type TipCategory = 'angriff' | 'verteidigung' | 'mittelfeld' | 'torwart' | 'warnung';

export interface TacticsTip {
  id: string;
  category: TipCategory;
  icon: string;
  headline: string;
  detail: string;
  priority: number; // higher = more important
}

export interface TacticsAnalysis {
  tips: TacticsTip[];
  pressingSuggestion: 'hoch' | 'mittel' | 'tief';
  widthSuggestion: 'breit' | 'normal' | 'eng';
  styleSuggestion: 'offensiv' | 'ausgewogen' | 'defensiv' | 'konter';
  overallWarnings: string[];
}

type FilledSlot = { slot: LineupSlot; player: PlayerWithScores };

function avg(items: number[]) {
  if (!items.length) return 0;
  return items.reduce((s, v) => s + v, 0) / items.length;
}

function byPos(filled: FilledSlot[], ...positions: Position[]) {
  const set = new Set<Position>(positions);
  return filled.filter((f) => set.has(f.slot.position)).map((f) => f.player);
}

// All callers use individual stats only — no more pac/sho/pas/dri/def/phy.
function stat(player: PlayerWithScores, key: keyof typeof player.stats): number {
  return (player.stats[key] as number) ?? 0;
}

export function analyzeTactics(
  filled: FilledSlot[],
  customSettings: Record<string, string>
): TacticsAnalysis {
  void customSettings;
  const tips: TacticsTip[] = [];

  const gks  = byPos(filled, 'GK');
  const cbs  = byPos(filled, 'CB', 'LWB', 'RWB');
  const lbs  = byPos(filled, 'LB');
  const rbs  = byPos(filled, 'RB');
  const cdms = byPos(filled, 'CDM');
  const cms  = byPos(filled, 'CM', 'LM', 'RM');
  const cams = byPos(filled, 'CAM');
  const lws  = byPos(filled, 'LW', 'LM');
  const rws  = byPos(filled, 'RW', 'RM');
  const sts  = byPos(filled, 'ST', 'CF');

  const gk      = gks[0];
  const allMids = [...cdms, ...cms, ...cams];
  const allDef  = [...cbs, ...lbs, ...rbs];

  // Best ST by finishing (primary scoring threat)
  const bestSt = sts.slice().sort((a, b) => stat(b, 'finishing') - stat(a, 'finishing'))[0];

  // ── ANGRIFF ──────────────────────────────────────────────────────────────────

  // Rule: Flanken-Taktik
  // IF ST.heading > 80 AND ST.jumping > 75
  //    AND (LW.crossing > 80 OR RW.crossing > 80)
  if (bestSt && stat(bestSt, 'heading') > 80 && stat(bestSt, 'jumping') > 75) {
    const hasCrosser =
      lws.some((p) => stat(p, 'crossing') > 80) ||
      rws.some((p) => stat(p, 'crossing') > 80) ||
      lbs.some((p) => stat(p, 'crossing') > 80) ||
      rbs.some((p) => stat(p, 'crossing') > 80);
    if (hasCrosser) {
      tips.push({
        id: 'kopfball_flanken',
        category: 'angriff',
        icon: '🎯',
        headline: 'Flanken-Taktik empfohlen',
        detail:
          `${bestSt.name} gewinnt Kopfballduelle (Heading ${stat(bestSt, 'heading')}, ` +
          `Jumping ${stat(bestSt, 'jumping')}). Deine Flügelspieler können präzise flanken — ` +
          `nutze Hereingaben konsequent und lass Außenverteidiger nachrücken.`,
        priority: 9,
      });
    }
  }

  // Rule: Konter-Taktik
  // IF ST.sprint_speed > 85 AND ST.acceleration > 85 AND CM.through_pass > 80
  if (
    bestSt &&
    stat(bestSt, 'sprint_speed') > 85 &&
    stat(bestSt, 'acceleration') > 85
  ) {
    const hasThreader = allMids.some((p) => stat(p, 'through_pass') > 80);
    if (hasThreader) {
      tips.push({
        id: 'konter_pace',
        category: 'angriff',
        icon: '⚡',
        headline: 'Konter-Taktik empfohlen',
        detail:
          `${bestSt.name} hat die Pace (Sprint ${stat(bestSt, 'sprint_speed')}, ` +
          `Acceleration ${stat(bestSt, 'acceleration')}), um Abwehrketten zu überlaufen. ` +
          `Ein Mittelfeldspieler mit starkem Through-Pass kann ihn mit Steilpässen in die Tiefe schicken. ` +
          `Setze auf schnelles Umschalten nach Ballgewinn.`,
        priority: 9,
      });
    }
  }

  // Rule: Individuelle Durchbrüche
  // IF ST.finishing > 85 AND ST.close_dribbling > 80 AND ST.skills > 80
  if (
    bestSt &&
    stat(bestSt, 'finishing') > 85 &&
    stat(bestSt, 'close_dribbling') > 80 &&
    stat(bestSt, 'skills') > 80
  ) {
    tips.push({
      id: 'individuelle_durchbrueche',
      category: 'angriff',
      icon: '🪄',
      headline: 'Individuelle Durchbrüche',
      detail:
        `${bestSt.name} kann Gegner im 1v1 überspielen ` +
        `(Finishing ${stat(bestSt, 'finishing')}, Close Dribbling ${stat(bestSt, 'close_dribbling')}, ` +
        `Skills ${stat(bestSt, 'skills')}). Isoliere ihn gegen einzelne Verteidiger.`,
      priority: 7,
    });
  }

  // Rule: Inverted Winger — keep existing logic (foot-based, no category stat needed)
  if (lws.length && rws.length) {
    const lw = lws[0];
    const rw = rws[0];
    const lwIsRightFooted = !lw.preferred_foot || lw.preferred_foot === 'right';
    const rwIsLeftFooted  = rw.preferred_foot === 'left';
    if (lwIsRightFooted || rwIsLeftFooted) {
      const detail = lwIsRightFooted
        ? `${lw.name} (LW, Rechtsfuß) kann nach innen schneiden für starke Finesse-Schüsse.`
        : `${rw.name} (RW, Linksfuß) kann nach innen schneiden für starke Finesse-Schüsse.`;
      tips.push({
        id: 'inverted_winger',
        category: 'angriff',
        icon: '🔄',
        headline: 'Inverted Winger nutzen',
        detail: `${detail} Kombiniere mit Late-Runs des gegenüberliegenden Außenverteidigers.`,
        priority: 6,
      });
    }
  }

  // ── VERTEIDIGUNG ─────────────────────────────────────────────────────────────

  // Averages used for multiple rules below
  const avgCbSprintSpeed = cbs.length ? avg(cbs.map((p) => stat(p, 'sprint_speed'))) : 0;
  const avgCbDefIq       = cbs.length ? avg(cbs.map((p) => stat(p, 'defensive_iq')))  : 0;

  // Rule: Tiefes Pressing
  // IF AVG(CB.sprint_speed) < 70
  if (avgCbSprintSpeed < 70 && cbs.length) {
    tips.push({
      id: 'tiefes_pressing_cbpace',
      category: 'verteidigung',
      icon: '⚠️',
      headline: 'Tiefes Pressing empfohlen',
      detail:
        `Deine Innenverteidiger haben durchschnittlich nur ${avgCbSprintSpeed.toFixed(0)} Sprint-Speed. ` +
        `Eine hohe Abwehrlinie wäre gefährlich — Through-Balls hinter die Kette würden regelmäßig durchkommen. ` +
        `Spiele tief und kompakt.`,
      priority: 10,
    });
  }

  // Rule: Hohes Pressing möglich
  // IF AVG(CB.sprint_speed) > 82 AND AVG(CB.defensive_iq) > 80
  if (avgCbSprintSpeed > 82 && avgCbDefIq > 80 && cbs.length) {
    tips.push({
      id: 'hohe_linie',
      category: 'verteidigung',
      icon: '🔝',
      headline: 'Hohes Pressing möglich',
      detail:
        `Deine CBs haben die Sprint-Speed (Ø ${avgCbSprintSpeed.toFixed(0)}) und das ` +
        `Defensive IQ (Ø ${avgCbDefIq.toFixed(0)}) für eine aggressive hohe Abwehrlinie. ` +
        `Reduziert Raum für den Gegner und verkürzt Wege beim Pressing.`,
      priority: 7,
    });
  }

  // Rule: Mittelfeldpressing
  // IF AVG(CM.defensive_iq) > 78 AND AVG(CM.interceptions) > 75
  const avgMidDefIq = allMids.length ? avg(allMids.map((p) => stat(p, 'defensive_iq'))) : 0;
  const avgMidInt   = allMids.length ? avg(allMids.map((p) => stat(p, 'interceptions'))) : 0;
  if (avgMidDefIq > 78 && avgMidInt > 75 && allMids.length >= 2) {
    tips.push({
      id: 'mittelfeldpressing',
      category: 'mittelfeld',
      icon: '🛡️',
      headline: 'Mittelfeldpressing empfohlen',
      detail:
        `Deine Mittelfeldspieler (Ø Def-IQ ${avgMidDefIq.toFixed(0)}, Ø Interceptions ${avgMidInt.toFixed(0)}) ` +
        `können den Raum vor der Abwehr aktiv kontrollieren und Bälle früh abfangen. ` +
        `Enge Staffelung im Mittelfeld nutzen.`,
      priority: 7,
    });
  }

  // ── MITTELFELD ───────────────────────────────────────────────────────────────

  // Rule: Vorgeschobener CM / falsche 9
  // IF CM.attacking_iq > 85 AND CM.finishing > 70
  // Applied to CAMs and CMs (the most creative central players)
  [...cms, ...cams].forEach((p) => {
    if (stat(p, 'attacking_iq') > 85 && stat(p, 'finishing') > 70) {
      tips.push({
        id: `false9_${p.id}`,
        category: 'mittelfeld',
        icon: '🎭',
        headline: `${p.name} als Spielmacher / falsche 9`,
        detail:
          `Hoher Attacking IQ (${stat(p, 'attacking_iq')}) und solides Finishing ` +
          `(${stat(p, 'finishing')}) — kann sowohl als vorgeschobener Spielmacher ` +
          `als auch als Einrücker hinter dem ST eingesetzt werden.`,
        priority: 6,
      });
    }
  });

  // Rule: Schwache Stamina
  // IF CM.stamina < 65 → Warnung
  allMids.filter((p) => stat(p, 'stamina') < 65).forEach((p) => {
    tips.push({
      id: `stamina_${p.id}`,
      category: 'warnung',
      icon: '🔋',
      headline: `${p.name} wird nachlassen`,
      detail:
        `Stamina ${stat(p, 'stamina')} — dieser Spieler verliert in der 2. Halbzeit ` +
        `deutlich an Intensität. Plane einen Wechsel oder setze ihn in einer defensiveren Rolle ein.`,
      priority: 8,
    });
  });

  // ── TORWART ──────────────────────────────────────────────────────────────────

  if (gk) {
    // Rule: Enormer Reach
    // IF GK.height_cm > 192 AND GK.div > 80
    if (gk.height_cm && gk.height_cm > 192 && stat(gk, 'div') > 80) {
      tips.push({
        id: 'gk_reach',
        category: 'torwart',
        icon: '🧤',
        headline: 'Keeper mit enormem Reach',
        detail:
          `${gk.name} (${gk.height_cm} cm, Diving ${stat(gk, 'div')}) macht es für den Gegner ` +
          `schwerer, Schüsse präzise in die Ecken zu platzieren. ` +
          `Nutz das durch defensiveres Positionsspiel — Gegner müssen perfekt schießen.`,
        priority: 5,
      });
    }

    // Rule: Sweeper-Keeper
    // IF GK.rushing > 80 AND GK.sprint_speed > 65
    if (stat(gk, 'rushing') > 80 && stat(gk, 'sprint_speed') > 65) {
      tips.push({
        id: 'gk_sweeper',
        category: 'torwart',
        icon: '🏃',
        headline: 'Keeper kann als Sweeper agieren',
        detail:
          `${gk.name} hat starkes Rushing (${stat(gk, 'rushing')}) und genug Sprint-Speed ` +
          `(${stat(gk, 'sprint_speed')}) um Bälle hinter der Abwehrlinie abzufangen. ` +
          `Kombiniere das mit einer hohen Abwehrlinie für noch aggressiveres Pressing.`,
        priority: 5,
      });
    }
  }

  // ── GLOBALE EINSCHÄTZUNG ─────────────────────────────────────────────────────

  // Use individual stats for all global assessments (no category stats)
  const avgDefSprintSpeed = avg([...allDef].map((p) => stat(p, 'sprint_speed')));
  const avgAttSprintSpeed = avg([...sts, ...lws, ...rws].map((p) => stat(p, 'sprint_speed')));

  const pressingSuggestion: TacticsAnalysis['pressingSuggestion'] =
    avgCbSprintSpeed < 70 ? 'tief'
    : avgCbSprintSpeed > 82 && avgCbDefIq > 80 ? 'hoch'
    : 'mittel';

  const widthSuggestion: TacticsAnalysis['widthSuggestion'] =
    (lws.length > 0 || rws.length > 0) ? 'breit'
    : lbs.length && rbs.length ? 'normal'
    : 'eng';

  // Style: konter = fast attack + good through_pass; offensiv = good finishing + wings;
  // defensiv = slow CBs; else ausgewogen
  const hasThreader = allMids.some((p) => stat(p, 'through_pass') > 77);
  const hasFinisher = sts.some((p) => stat(p, 'finishing') > 80);
  const hasWings    = lws.length > 0 || rws.length > 0;

  const styleSuggestion: TacticsAnalysis['styleSuggestion'] =
    avgAttSprintSpeed > 82 && hasThreader ? 'konter'
    : avgCbSprintSpeed < 68              ? 'defensiv'
    : hasFinisher && hasWings            ? 'offensiv'
    : 'ausgewogen';

  const overallWarnings: string[] = [];
  if (avgDefSprintSpeed < 66)
    overallWarnings.push('Abwehr-Pace insgesamt sehr niedrig — keine hohe Linie spielen.');
  if (allMids.length === 0)
    overallWarnings.push('Kein klarer Mittelfeldblock — Gegner kann Räume vor der Abwehr ausnutzen.');
  if (sts.length === 0)
    overallWarnings.push('Kein echter Stürmer in der Formation — offensive Druckentlastung fehlt.');

  return {
    tips: tips.sort((a, b) => b.priority - a.priority),
    pressingSuggestion,
    widthSuggestion,
    styleSuggestion,
    overallWarnings,
  };
}

// ── Taktik-Settings ──────────────────────────────────────────────────────────

export type TacticsSettingType = 'select' | 'range';

export interface TacticsSetting {
  id: string;
  label: string;
  type: TacticsSettingType;
  options?: string[];
  min?: number;
  max?: number;
  default: string;
  group: string;
}

export const TACTICS_SETTINGS: TacticsSetting[] = [
  // Spielstil
  { id: 'style',              label: 'Spielstil',            type: 'select', options: ['Offensiv','Ausgewogen','Defensiv','Konter'],          default: 'Ausgewogen', group: 'Spielstil' },
  { id: 'tempo',              label: 'Tempo',                type: 'select', options: ['Schnell','Normal','Langsam'],                         default: 'Normal',     group: 'Spielstil' },
  { id: 'width',              label: 'Spielbreite',          type: 'select', options: ['Breit','Normal','Eng'],                               default: 'Normal',     group: 'Spielstil' },
  // Pressing
  { id: 'pressing_intensity', label: 'Pressing-Intensität',  type: 'select', options: ['Hoch','Mittel','Niedrig'],                           default: 'Mittel',     group: 'Pressing'  },
  { id: 'pressing_trigger',   label: 'Pressing auslösen bei',type: 'select', options: ['Ballverlust','Einwurf','Torabstoß','Immer'],          default: 'Ballverlust',group: 'Pressing'  },
  { id: 'defensive_line',     label: 'Abwehrlinie',          type: 'select', options: ['Hoch','Mittel','Tief'],                               default: 'Mittel',     group: 'Pressing'  },
  // Angriff
  { id: 'attack_runs',        label: 'Tiefenläufe',          type: 'select', options: ['Häufig','Manchmal','Selten'],                        default: 'Manchmal',   group: 'Angriff'   },
  { id: 'crossing',           label: 'Flankenspiel',         type: 'select', options: ['Viel','Normal','Wenig'],                             default: 'Normal',     group: 'Angriff'   },
  { id: 'forward_runs',       label: 'Läufe von Außenvert.', type: 'select', options: ['Häufig','Manchmal','Selten'],                        default: 'Manchmal',   group: 'Angriff'   },
];
