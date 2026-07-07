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

// Returns FilledSlots matching the given positions, preserving slot context
// so stat() can use the correct effectiveStats for each player's slot position.
function byPos(filled: FilledSlot[], ...positions: Position[]): FilledSlot[] {
  const set = new Set<Position>(positions);
  return filled.filter((f) => set.has(f.slot.position));
}

// Convenience: extract just the players from a FilledSlot array
function players(slots: FilledSlot[]): PlayerWithScores[] {
  return slots.map((f) => f.player);
}

function hasArchetype(player: PlayerWithScores, type: PlayerArchetype) {
  return detectPlayerArchetypes(player).some((match) => match.type === type);
}

function names(players: PlayerWithScores[], fallback = 'diese Spieler') {
  if (players.length === 0) return fallback;
  return players.slice(0, 2).map((p) => p.name).join(' und ');
}

// All callers use individual stats only — no more pac/sho/pas/dri/def/phy.
// stat() reads effectiveStats for the player's actual slot position so that
// secondary / out-of-position penalties (-2 / -5 on all stats) apply correctly.
// GOALS rule: position changes penalise stats only — player.overall is never modified.
function stat(player: PlayerWithScores, slotPosition: Position, key: keyof typeof player.stats): number {
  return ((player.effectiveStats[slotPosition]?.[key] ?? player.stats[key]) as number) ?? 0;
}

export function analyzeTactics(
  filled: FilledSlot[],
  customSettings: Record<string, string>
): TacticsAnalysis {
  // ── Aggregate user-chosen tactical focus ────────────────────────────────
  // customSettings maps slotKey → TacticalFocus ('Attack'|'Balanced'|'Defend').
  // When the user has explicitly chosen a dominant focus, offensive/defensive
  // tips get adjusted priority so the analysis respects the intended game plan.
  const focusCounts = { Attack: 0, Balanced: 0, Defend: 0 };
  for (const val of Object.values(customSettings)) {
    if (val === 'Attack' || val === 'Balanced' || val === 'Defend') {
      focusCounts[val]++;
    }
  }
  const dominantFocus =
    focusCounts.Attack >= focusCounts.Defend && focusCounts.Attack > focusCounts.Balanced ? 'Attack'
    : focusCounts.Defend > focusCounts.Balanced ? 'Defend'
    : null;

  const tips: TacticsTip[] = [];

  const gkSlots  = byPos(filled, 'GK');
  const cbSlots  = byPos(filled, 'CB');
  const fbSlots  = byPos(filled, 'FB');
  const wbSlots  = byPos(filled, 'WB');
  const dmSlots  = byPos(filled, 'DM');
  const cmSlots  = byPos(filled, 'CM');
  const amSlots  = byPos(filled, 'AM');
  const wmSlots  = byPos(filled, 'WM');
  const wfSlots  = byPos(filled, 'WF');
  const stSlots  = byPos(filled, 'ST', 'CF');

  const gks  = players(gkSlots);
  const cbs  = players(cbSlots);
  const dms  = players(dmSlots);
  const cms  = players(cmSlots);
  const ams  = players(amSlots);
  const wfs  = players(wfSlots);
  const sts  = players(stSlots);

  const allMidSlots  = [...dmSlots, ...cmSlots, ...amSlots, ...wmSlots];
  const allDefSlots  = [...cbSlots, ...fbSlots, ...wbSlots];
  const wideSlots    = [...wfSlots, ...wmSlots, ...wbSlots, ...fbSlots];

  const allMids = players(allMidSlots);
  const widePlayers = players(wideSlots);

  const gk = gks[0];

  // Best ST by finishing (primary scoring threat) — keep as FilledSlot to preserve slot context
  const bestStSlot = stSlots.slice().sort((a, b) =>
    stat(b.player, b.slot.position, 'finishing') - stat(a.player, a.slot.position, 'finishing')
  )[0] ?? null;
  const bestSt = bestStSlot?.player ?? null;

  const targetSts = stSlots.filter((f) =>
    hasArchetype(f.player, 'Target ST') ||
    (stat(f.player, f.slot.position, 'heading') > 80 &&
     stat(f.player, f.slot.position, 'jumping') > 75 &&
     stat(f.player, f.slot.position, 'strength') > 72)
  ).map((f) => f.player);

  const crossers = wideSlots.filter((f) =>
    hasArchetype(f.player, 'Attacking FB/WB') || stat(f.player, f.slot.position, 'crossing') > 80
  ).map((f) => f.player);

  const paceWidePlayers = wideSlots.filter((f) =>
    hasArchetype(f.player, 'Pace Winger') ||
    (stat(f.player, f.slot.position, 'sprint_speed') > 84 &&
     stat(f.player, f.slot.position, 'acceleration') > 84)
  ).map((f) => f.player);

  const throughPassers = allMidSlots.filter((f) =>
    hasArchetype(f.player, 'Creative AM') || stat(f.player, f.slot.position, 'through_pass') > 80
  ).map((f) => f.player);

  const ballWinners = dmSlots.filter((f) =>
    hasArchetype(f.player, 'Ball-Winning DM') ||
    (stat(f.player, f.slot.position, 'defensive_iq') > 76 &&
     stat(f.player, f.slot.position, 'stand_tackle') > 76 &&
     stat(f.player, f.slot.position, 'interceptions') > 74)
  ).map((f) => f.player);

  // ── ANGRIFF ──────────────────────────────────────────────────────────────────

  // Rule: Flanken-Taktik
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
  if (
    bestSt && bestStSlot &&
    stat(bestSt, bestStSlot.slot.position, 'sprint_speed') > 85 &&
    stat(bestSt, bestStSlot.slot.position, 'acceleration') > 85
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
    const centralCreators = [...cmSlots, ...amSlots]
      .filter((f) => stat(f.player, f.slot.position, 'ground_pass') > 76 ||
                     stat(f.player, f.slot.position, 'through_pass') > 76 ||
                     hasArchetype(f.player, 'Creative AM'))
      .map((f) => f.player);
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
  if (
    bestSt && bestStSlot &&
    stat(bestSt, bestStSlot.slot.position, 'finishing') > 85 &&
    stat(bestSt, bestStSlot.slot.position, 'close_dribbling') > 80 &&
    stat(bestSt, bestStSlot.slot.position, 'skills') > 80
  ) {
    tips.push({
      id: 'individuelle_durchbrueche',
      category: 'angriff',
      icon: '🪄',
      headline: 'Individuelle Durchbrüche',
      detail:
        `${bestSt.name} kann Gegner im 1v1 überspielen ` +
        `(Finishing ${stat(bestSt, bestStSlot.slot.position, 'finishing')}, Close Dribbling ${stat(bestSt, bestStSlot.slot.position, 'close_dribbling')}, ` +
        `Skills ${stat(bestSt, bestStSlot.slot.position, 'skills')}). Isoliere ihn gegen einzelne Verteidiger.`,
      priority: 7,
    });
  }

  // Rule: Inverted Winger — foot-based, no category stat needed
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

  // Averages used for multiple rules below — use effectiveStats at CB slot
  const avgCbSprintSpeed = cbSlots.length
    ? avg(cbSlots.map((f) => stat(f.player, f.slot.position, 'sprint_speed')))
    : 0;
  const avgCbDefIq = cbSlots.length
    ? avg(cbSlots.map((f) => stat(f.player, f.slot.position, 'defensive_iq')))
    : 0;

  // Rule: Tiefes Pressing
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
  const avgMidDefIq = allMidSlots.length
    ? avg(allMidSlots.map((f) => stat(f.player, f.slot.position, 'defensive_iq')))
    : 0;
  const avgMidInt = allMidSlots.length
    ? avg(allMidSlots.map((f) => stat(f.player, f.slot.position, 'interceptions')))
    : 0;
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

  // Rule: Vorgeschobener CM / falsche 9 — use effectiveStats at each CM/AM slot
  [...cmSlots, ...amSlots].forEach((f) => {
    if (stat(f.player, f.slot.position, 'attacking_iq') > 85 &&
        stat(f.player, f.slot.position, 'finishing') > 70) {
      tips.push({
        id: `false9_${f.player.id}`,
        category: 'mittelfeld',
        icon: '🎭',
        headline: `${f.player.name} als Spielmacher / falsche 9`,
        detail:
          `Hoher Attacking IQ (${stat(f.player, f.slot.position, 'attacking_iq')}) und solides Finishing ` +
          `(${stat(f.player, f.slot.position, 'finishing')}) — kann sowohl als vorgeschobener Spielmacher ` +
          `als auch als Einrücker hinter dem ST eingesetzt werden.`,
        priority: 6,
      });
    }
  });

  // Team stamina — each player evaluated at their actual slot position
  const avgTeamStamina = filled.length
    ? avg(filled.map((f) => stat(f.player, f.slot.position, 'stamina')))
    : 0;
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

  // Rule: Schwache Stamina im Mittelfeld
  allMidSlots.filter((f) => stat(f.player, f.slot.position, 'stamina') < 65).forEach((f) => {
    tips.push({
      id: `stamina_${f.player.id}`,
      category: 'warnung',
      icon: '🔋',
      headline: `${f.player.name} wird nachlassen`,
      detail:
        `Stamina ${stat(f.player, f.slot.position, 'stamina')} — dieser Spieler verliert in der 2. Halbzeit ` +
        `deutlich an Intensität. Plane einen Wechsel oder setze ihn in einer defensiveren Rolle ein.`,
      priority: 8,
    });
  });

  // ── TORWART ──────────────────────────────────────────────────────────────────

  if (gk) {
    // Rule: Enormer Reach
    if (gk.height_cm && gk.height_cm > 192 && stat(gk, 'GK', 'div') > 80) {
      tips.push({
        id: 'gk_reach',
        category: 'torwart',
        icon: '🧤',
        headline: 'Keeper mit enormem Reach',
        detail:
          `${gk.name} (${gk.height_cm} cm, Diving ${stat(gk, 'GK', 'div')}) macht es für den Gegner ` +
          `schwerer, Schüsse präzise in die Ecken zu platzieren. ` +
          `Nutz das durch defensiveres Positionsspiel — Gegner müssen perfekt schießen.`,
        priority: 5,
      });
    }

    // Rule: Sweeper-Keeper
    if (stat(gk, 'GK', 'rushing') > 80 && stat(gk, 'GK', 'sprint_speed') > 65) {
      tips.push({
        id: 'gk_sweeper',
        category: 'torwart',
        icon: '🏃',
        headline: 'Keeper kann als Sweeper agieren',
        detail:
          `${gk.name} hat starkes Rushing (${stat(gk, 'GK', 'rushing')}) und genug Sprint-Speed ` +
          `(${stat(gk, 'GK', 'sprint_speed')}) um Bälle hinter der Abwehrlinie abzufangen. ` +
          `Kombiniere das mit einer hohen Abwehrlinie für noch aggressiveres Pressing.`,
        priority: 5,
      });
    }
  }

  // ── GLOBALE EINSCHÄTZUNG ─────────────────────────────────────────────────────

  // Use effectiveStats at each player's actual slot position for global averages
  const avgDefSprintSpeed = allDefSlots.length
    ? avg(allDefSlots.map((f) => stat(f.player, f.slot.position, 'sprint_speed')))
    : 0;

  const overallWarnings: string[] = [];
  if (avgDefSprintSpeed < 66)
    overallWarnings.push('Abwehr-Pace insgesamt sehr niedrig — keine hohe Linie spielen.');
  if (allMids.length === 0)
    overallWarnings.push('Kein klarer Mittelfeldblock — Gegner kann Räume vor der Abwehr ausnutzen.');
  if (sts.length === 0)
    overallWarnings.push('Kein echter Stürmer in der Formation — offensive Druckentlastung fehlt.');

  // ── Apply user tactical focus to tip priorities ──────────────────────────
  // Boost offensive tips when user focuses on Attack, defensive tips for Defend.
  const attackCategories: TipCategory[] = ['angriff'];
  const defendCategories: TipCategory[] = ['verteidigung'];
  if (dominantFocus === 'Attack') {
    for (const t of tips) {
      if (attackCategories.includes(t.category)) t.priority += 1;
      if (defendCategories.includes(t.category)) t.priority = Math.max(0, t.priority - 1);
    }
  } else if (dominantFocus === 'Defend') {
    for (const t of tips) {
      if (defendCategories.includes(t.category)) t.priority += 1;
      if (attackCategories.includes(t.category)) t.priority = Math.max(0, t.priority - 1);
    }
  }

  return {
    tips: tips.sort((a, b) => b.priority - a.priority),
    overallWarnings,
  };
}
