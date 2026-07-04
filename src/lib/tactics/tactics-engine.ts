import { detectPlayerArchetypes, PlayerArchetype } from '@/lib/analysis/player-archetypes';
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

function hasArchetype(player: PlayerWithScores, type: PlayerArchetype) {
  return detectPlayerArchetypes(player).some((match) => match.type === type);
}

function names(players: PlayerWithScores[], fallback = 'diese Spieler') {
  if (players.length === 0) return fallback;
  return players.slice(0, 2).map((p) => p.name).join(' und ');
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
  const cbs  = byPos(filled, 'CB');
  const fbs  = byPos(filled, 'FB');
  const wbs  = byPos(filled, 'WB');
  const dms  = byPos(filled, 'DM');
  const cms  = byPos(filled, 'CM');
  const ams  = byPos(filled, 'AM');
  const wms  = byPos(filled, 'WM');
  const wfs  = byPos(filled, 'WF');
  const sts  = byPos(filled, 'ST', 'CF');

  const gk      = gks[0];
  const allMids = [...dms, ...cms, ...ams, ...wms];
  const allDef  = [...cbs, ...fbs, ...wbs];
  const widePlayers = [...wfs, ...wms, ...wbs, ...fbs];

  // Best ST by finishing (primary scoring threat)
  const bestSt = sts.slice().sort((a, b) => stat(b, 'finishing') - stat(a, 'finishing'))[0];
  const targetSts = sts.filter((p) =>
    hasArchetype(p, 'Target ST') ||
    (stat(p, 'heading') > 80 && stat(p, 'jumping') > 75 && stat(p, 'strength') > 72)
  );
  const crossers = widePlayers.filter((p) =>
    hasArchetype(p, 'Attacking FB/WB') || stat(p, 'crossing') > 80
  );
  const paceWidePlayers = widePlayers.filter((p) =>
    hasArchetype(p, 'Pace Winger') ||
    (stat(p, 'sprint_speed') > 84 && stat(p, 'acceleration') > 84)
  );
  const throughPassers = allMids.filter((p) =>
    hasArchetype(p, 'Creative AM') || stat(p, 'through_pass') > 80
  );
  const ballWinners = dms.filter((p) =>
    hasArchetype(p, 'Ball-Winning DM') ||
    (stat(p, 'defensive_iq') > 76 && stat(p, 'stand_tackle') > 76 && stat(p, 'interceptions') > 74)
  );

  // ── ANGRIFF ──────────────────────────────────────────────────────────────────

  // Rule: Flanken-Taktik
  // IF ST.heading > 80 AND ST.jumping > 75
  //    AND (LW.crossing > 80 OR RW.crossing > 80)
  if (targetSts.length > 0 && crossers.length > 0) {
    const target = targetSts[0];
    tips.push({
      id: 'kopfball_flanken',
      category: 'angriff',
      icon: '🎯',
      headline: 'Flanken auf Target ST',
      detail:
        `${target.name} gibt dir Zielspieler-Präsenz im Strafraum. ` +
        `${names(crossers, 'deine Außen')} bringen genug Flankenqualität mit — ` +
        `spiele bewusst über außen und besetze den zweiten Pfosten.`,
      priority: 9,
    });
  }

  // Rule: Konter-Taktik
  // IF ST.sprint_speed > 85 AND ST.acceleration > 85 AND CM.through_pass > 80
  if (
    bestSt &&
    stat(bestSt, 'sprint_speed') > 85 &&
    stat(bestSt, 'acceleration') > 85
  ) {
    if (throughPassers.length > 0) {
      tips.push({
        id: 'konter_pace',
        category: 'angriff',
        icon: '⚡',
        headline: 'Konter über Tiefe',
        detail:
          `${bestSt.name} hat genug Tempo für Läufe hinter die Kette. ` +
          `${names(throughPassers, 'dein Passgeber')} kann ihn mit Steilpässen einsetzen. ` +
          `Nach Ballgewinn schnell vertikal spielen statt lange aufzubauen.`,
        priority: 9,
      });
    }
  }

  if (paceWidePlayers.length >= 1) {
    tips.push({
      id: 'fluegel_tempo',
      category: 'angriff',
      icon: '🪽',
      headline: 'Flügelspiel mit Tempo',
      detail:
        `${names(paceWidePlayers, 'deine Außen')} können auf außen Meter machen. ` +
        `Zieh das Spiel breit, suche frühe Verlagerungen und attackiere isolierte Außenverteidiger.`,
      priority: 8,
    });
  }

  if ([...cms, ...ams].length >= 2 && throughPassers.length >= 1) {
    const centralCreators = [...cms, ...ams]
      .filter((p) => stat(p, 'ground_pass') > 76 || stat(p, 'through_pass') > 76 || hasArchetype(p, 'Creative AM'));
    if (centralCreators.length >= 2) {
      tips.push({
        id: 'zentrumsspiel',
        category: 'mittelfeld',
        icon: '🎛️',
        headline: 'Zentrum als Spielachse',
        detail:
          `${names(centralCreators, 'deine zentralen Spieler')} geben dir genug Passqualität im Zentrum. ` +
          `Überlade AM/CM-Räume und spiele kurze Kombinationen statt jeden Angriff breit zu ziehen.`,
        priority: 8,
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
  if (wfs.length >= 2) {
    const lw = wfs[0];
    const rw = wfs[wfs.length > 1 ? 1 : 0];
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
      category: 'warnung',
      icon: '⚠️',
      headline: 'Tiefe Linie statt hoher Linie',
      detail:
        `Deine Innenverteidiger haben durchschnittlich nur ${avgCbSprintSpeed.toFixed(0)} Sprint-Speed. ` +
        `Eine hohe Abwehrlinie öffnet zu viel Raum hinter der Kette. ` +
        `Block tiefer halten, Abstände eng machen und Gegner vor dir spielen lassen.`,
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

  if (dms.length === 0) {
    tips.push({
      id: 'kein_dm_absicherung',
      category: 'warnung',
      icon: '🧱',
      headline: 'Absicherung vor der Abwehr fehlt',
      detail:
        `Ohne DM fehlt ein klarer Abräumer vor den Innenverteidigern. ` +
        `Spiel kompakter, nutze eine Doppel-6 oder lass einen CM tiefer bleiben.`,
      priority: 9,
    });
  } else if (ballWinners.length === 0) {
    tips.push({
      id: 'kein_ball_winner',
      category: 'warnung',
      icon: '🧱',
      headline: 'DM ist kein echter Abräumer',
      detail:
        `Du hast zwar einen DM, aber keinen klaren Ball-Winner. ` +
        `Nicht zu wild pressen: Zentrum enger halten und zweite Bälle absichern.`,
      priority: 8,
    });
  }

  if (widePlayers.length < 2) {
    tips.push({
      id: 'wenig_breite',
      category: 'warnung',
      icon: '↔️',
      headline: 'Zu wenig Breite',
      detail:
        `Deine Formation hat wenige echte Außenoptionen. ` +
        `Gegner können das Zentrum leichter zustellen — nutze breitere Rollen oder besetze die Außen vorsichtiger.`,
      priority: 7,
    });
  }

  // ── MITTELFELD ───────────────────────────────────────────────────────────────

  // Rule: Vorgeschobener CM / falsche 9
  // IF CM.attacking_iq > 85 AND CM.finishing > 70
  // Applied to CAMs and CMs (the most creative central players)
  [...cms, ...ams].forEach((p) => {
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

  const avgTeamStamina = filled.length ? avg(filled.map((f) => stat(f.player, 'stamina'))) : 0;
  if (avgTeamStamina > 0 && avgTeamStamina < 65) {
    tips.push({
      id: 'team_stamina_pressing',
      category: 'warnung',
      icon: '🔋',
      headline: 'Pressing dosieren',
      detail:
        `Die Team-Stamina liegt nur bei Ø ${avgTeamStamina.toFixed(0)}. ` +
        `Dauerpressing kostet dich spät im Spiel Stabilität — lieber situativ pressen und nach Führung kompakter werden.`,
      priority: 9,
    });
  }

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

  const overallWarnings: string[] = [];
  if (avgDefSprintSpeed < 66)
    overallWarnings.push('Abwehr-Pace insgesamt sehr niedrig — keine hohe Linie spielen.');
  if (allMids.length === 0)
    overallWarnings.push('Kein klarer Mittelfeldblock — Gegner kann Räume vor der Abwehr ausnutzen.');
  if (sts.length === 0)
    overallWarnings.push('Kein echter Stürmer in der Formation — offensive Druckentlastung fehlt.');

  return {
    tips: tips.sort((a, b) => b.priority - a.priority),
    overallWarnings,
  };
}
