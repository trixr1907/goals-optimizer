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

function stat(player: PlayerWithScores, key: keyof typeof player.stats) {
  return player.stats[key] ?? 0;
}

export function analyzeTactics(
  filled: FilledSlot[],
  customSettings: Record<string, string>
): TacticsAnalysis {
  void customSettings;
  const tips: TacticsTip[] = [];

  const gks = byPos(filled, 'GK');
  const cbs = byPos(filled, 'CB', 'LWB', 'RWB');
  const lbs = byPos(filled, 'LB');
  const rbs = byPos(filled, 'RB');
  const cdms = byPos(filled, 'CDM');
  const cms = byPos(filled, 'CM', 'LM', 'RM');
  const cams = byPos(filled, 'CAM');
  const lws = byPos(filled, 'LW', 'LM');
  const rws = byPos(filled, 'RW', 'RM');
  const sts = byPos(filled, 'ST', 'CF');

  const gk = gks[0];
  const allMids = [...cdms, ...cms, ...cams];
  const allDef = [...cbs, ...lbs, ...rbs];

  // ── ANGRIFF ────────────────────────────────────────────────────────────────

  if (sts.length && avg(sts.map((p) => stat(p, 'pac'))) > 82 && avg(sts.map((p) => stat(p, 'pac'))) > 82) {
    const hasThroughPasser = allMids.some((p) => stat(p, 'pas') > 78);
    if (hasThroughPasser) {
      tips.push({
        id: 'konter_pace',
        category: 'angriff',
        icon: '⚡',
        headline: 'Konter-Taktik empfohlen',
        detail: `Dein${sts.length > 1 ? 'e Stürmer haben' : ' ST hat'} die Pace für Tiefenläufe — und ein Spielmacher im Mittelfeld kann die Steilpässe spielen. Setze auf schnelles Umschalten nach Ballgewinn.`,
        priority: 9,
      });
    }
  }

  const bestSt = sts.slice().sort((a, b) => stat(b, 'sho') - stat(a, 'sho'))[0];
  if (bestSt && stat(bestSt, 'heading') > 80 && stat(bestSt, 'jumping') > 75) {
    const flankers = [...lws, ...rws, ...lbs, ...rbs];
    const hasCrossers = flankers.some((p) => stat(p, 'crossing') > 78);
    if (hasCrossers) {
      tips.push({
        id: 'kopfball_flanken',
        category: 'angriff',
        icon: '🎯',
        headline: 'Flanken-Taktik empfohlen',
        detail: `${bestSt.name} gewinnt Kopfballduelle (Heading ${stat(bestSt, 'heading')}, Jumping ${stat(bestSt, 'jumping')}). Deine Flügel-/Außenbahn-Spieler können präzise flanken — nutze das konsequent.`,
        priority: 8,
      });
    }
  }

  if (bestSt && stat(bestSt, 'finishing') > 84 && stat(bestSt, 'close_dribbling') > 78 && stat(bestSt, 'skills') > 78) {
    tips.push({
      id: 'individuelle_durchbrueche',
      category: 'angriff',
      icon: '🪄',
      headline: 'Individuelle Durchbrüche',
      detail: `${bestSt.name} kann Gegner im 1v1 überspielen (Finishing ${stat(bestSt, 'finishing')}, Dribbling ${stat(bestSt, 'close_dribbling')}). Isoliere ihn gegen einzelne Verteidiger — wenig Besetzung im Sturmzentrum.`,
      priority: 7,
    });
  }

  // Inverted-Winger-Bonus
  if (lws.length && rws.length) {
    const lw = lws[0];
    const rw = rws[0];
    const lwIsRightFooted = !lw.preferred_foot || lw.preferred_foot === 'right';
    const rwIsLeftFooted = rw.preferred_foot === 'left';
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

  // ── VERTEIDIGUNG ───────────────────────────────────────────────────────────

  const avgCbPace = cbs.length ? avg(cbs.map((p) => stat(p, 'pac'))) : 0;
  const avgCbDiq = cbs.length ? avg(cbs.map((p) => stat(p, 'defensive_iq') ?? stat(p, 'def'))) : 0;

  if (avgCbPace < 68 && cbs.length) {
    tips.push({
      id: 'tiefes_pressing_cbpace',
      category: 'verteidigung',
      icon: '⚠️',
      headline: 'Tiefes Pressing empfohlen',
      detail: `Deine Innenverteidiger haben durchschnittlich nur ${avgCbPace.toFixed(0)} Pace. Eine hohe Abwehrlinie wäre gefährlich — Through-Balls hinter die Kette würden regelmäßig durchkommen.`,
      priority: 10,
    });
  } else if (avgCbPace > 80 && avgCbDiq > 78 && cbs.length) {
    tips.push({
      id: 'hohe_linie',
      category: 'verteidigung',
      icon: '🔝',
      headline: 'Hohes Pressing möglich',
      detail: `Deine CBs haben die Pace (Ø ${avgCbPace.toFixed(0)}) und das defensive Verständnis (Ø ${avgCbDiq.toFixed(0)}) für eine aggressive hohe Abwehrlinie. Reduziert Raum für den Gegner.`,
      priority: 7,
    });
  }

  // Mittelfeldpressing
  const avgMidDef = allMids.length ? avg(allMids.map((p) => stat(p, 'def'))) : 0;
  const avgMidInt = allMids.length ? avg(allMids.map((p) => stat(p, 'interceptions') ?? stat(p, 'def'))) : 0;
  if (avgMidDef > 75 && avgMidInt > 72 && allMids.length >= 2) {
    tips.push({
      id: 'mittelfeldpressing',
      category: 'mittelfeld',
      icon: '🛡️',
      headline: 'Mittelfeldpressing empfohlen',
      detail: `Deine zentralen Mittelfeldspieler (Ø Def ${avgMidDef.toFixed(0)}) können den Raum vor der Abwehr aktiv kontrollieren und Bälle früh abfangen.`,
      priority: 7,
    });
  }

  // Schwache Stamina
  const tiredMids = allMids.filter((p) => stat(p, 'stamina') < 65);
  tiredMids.forEach((p) => {
    tips.push({
      id: `stamina_${p.id}`,
      category: 'warnung',
      icon: '🔋',
      headline: `${p.name} wird nachlassen`,
      detail: `Stamina ${stat(p, 'stamina')} — dieser Spieler verliert in der 2. Halbzeit deutlich Intensität. Plane einen Wechsel oder setze ihn in einer defensiveren Rolle ein.`,
      priority: 8,
    });
  });

  // Vorgeschobener CM / falsche 9
  cams.forEach((p) => {
    if (stat(p, 'attacking_iq') > 82 && stat(p, 'sho') > 68) {
      tips.push({
        id: `false9_${p.id}`,
        category: 'mittelfeld',
        icon: '🎭',
        headline: `${p.name} als Spielmacher/falsche 9`,
        detail: `Hoher Attacking IQ (${stat(p, 'attacking_iq')}) und solides Shooting (${stat(p, 'sho')}) — kann sowohl als vorgeschobener Spielmacher als auch als Einrücker eingesetzt werden.`,
        priority: 6,
      });
    }
  });

  // ── TORWART ────────────────────────────────────────────────────────────────

  if (gk) {
    if (gk.height_cm && gk.height_cm > 192 && stat(gk, 'div') > 78) {
      tips.push({
        id: 'gk_reach',
        category: 'torwart',
        icon: '🧤',
        headline: 'Keeper mit enormem Reach',
        detail: `${gk.name} (${gk.height_cm} cm, Diving ${stat(gk, 'div')}) macht es für den Gegner schwerer, Schüsse präzise in die Ecken zu platzieren. Nutz das durch defensiveres Positionsspiel im Tor.`,
        priority: 5,
      });
    }
    if (stat(gk, 'sprint_speed') > 60 && stat(gk, 'kic') > 72) {
      tips.push({
        id: 'gk_sweeper',
        category: 'torwart',
        icon: '🏃',
        headline: 'Keeper kann als Sweeper agieren',
        detail: `${gk.name} hat genug Pace (${stat(gk, 'sprint_speed')}) und gutes Kicking (${stat(gk, 'kic')}) für eine Sweeper-Keeper-Rolle. Eine hohe Linie der Abwehr wird damit sicherer.`,
        priority: 5,
      });
    }
  }

  // ── GLOBALE EINSCHÄTZUNG ───────────────────────────────────────────────────

  const avgDefPace = avg([...allDef].map((p) => stat(p, 'pac')));
  const avgAttPace = avg([...sts, ...lws, ...rws].map((p) => stat(p, 'pac')));

  const pressingSuggestion: TacticsAnalysis['pressingSuggestion'] =
    avgCbPace < 68 ? 'tief' : avgCbPace > 80 && avgCbDiq > 78 ? 'hoch' : 'mittel';

  const widthSuggestion: TacticsAnalysis['widthSuggestion'] =
    (lws.length > 0 || rws.length > 0) ? 'breit' : lbs.length && rbs.length ? 'normal' : 'eng';

  const styleSuggestion: TacticsAnalysis['styleSuggestion'] =
    avgAttPace > 80 && allMids.some((p) => stat(p, 'pas') > 77)
      ? 'konter'
      : avgCbPace < 68
      ? 'defensiv'
      : sts.some((p) => stat(p, 'sho') > 80) && (lws.length > 0 || rws.length > 0)
      ? 'offensiv'
      : 'ausgewogen';

  const overallWarnings: string[] = [];
  if (avgDefPace < 66) overallWarnings.push('Abwehr-Pace insgesamt sehr niedrig — keine hohe Linie spielen.');
  if (allMids.length === 0) overallWarnings.push('Kein klarer Mittelfeldblock — Gegner kann Räume vor der Abwehr ausnutzen.');
  if (sts.length === 0) overallWarnings.push('Kein echter Stürmer in der Formation — offensive Druckentlastung fehlt.');

  return {
    tips: tips.sort((a, b) => b.priority - a.priority),
    pressingSuggestion,
    widthSuggestion,
    styleSuggestion,
    overallWarnings,
  };
}

// ── Taktik-Settings ────────────────────────────────────────────────────────

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
  { id: 'style', label: 'Spielstil', type: 'select', options: ['Offensiv', 'Ausgewogen', 'Defensiv', 'Konter'], default: 'Ausgewogen', group: 'Spielstil' },
  { id: 'tempo', label: 'Tempo', type: 'select', options: ['Schnell', 'Normal', 'Langsam'], default: 'Normal', group: 'Spielstil' },
  { id: 'width', label: 'Spielbreite', type: 'select', options: ['Breit', 'Normal', 'Eng'], default: 'Normal', group: 'Spielstil' },
  // Pressing
  { id: 'pressing_intensity', label: 'Pressing-Intensität', type: 'select', options: ['Hoch', 'Mittel', 'Niedrig'], default: 'Mittel', group: 'Pressing' },
  { id: 'pressing_trigger', label: 'Pressing auslösen bei', type: 'select', options: ['Ballverlust', 'Einwurf', 'Torabstoß', 'Immer'], default: 'Ballverlust', group: 'Pressing' },
  { id: 'defensive_line', label: 'Abwehrlinie', type: 'select', options: ['Hoch', 'Mittel', 'Tief'], default: 'Mittel', group: 'Pressing' },
  // Angriff
  { id: 'attack_runs', label: 'Tiefenläufe', type: 'select', options: ['Häufig', 'Manchmal', 'Selten'], default: 'Manchmal', group: 'Angriff' },
  { id: 'crossing', label: 'Flankenspiel', type: 'select', options: ['Viel', 'Normal', 'Wenig'], default: 'Normal', group: 'Angriff' },
  { id: 'forward_runs', label: 'Läufe von Außenvert.', type: 'select', options: ['Häufig', 'Manchmal', 'Selten'], default: 'Manchmal', group: 'Angriff' },
];
