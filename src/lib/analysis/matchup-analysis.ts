import { Player, PlayerStats, PlayerWithScores, hasFullStats } from '@/lib/scraper/types';

// ── Stat helpers ──────────────────────────────────────────────────────────────

function stat(player: Player, key: keyof PlayerStats): number {
  return (player.stats[key] as number) ?? 0;
}

function avgStat(players: Player[], key: keyof PlayerStats): number {
  const vals = players
    .filter((p) => hasFullStats(p))
    .map((p) => stat(p, key))
    .filter((v) => v > 0);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function playersAtPosition(players: Player[], pos: string): Player[] {
  return players.filter(
    (p) => p.position === pos || p.secondaryPositions?.includes(pos as never),
  );
}

function avgStatAtPosition(
  players: Player[],
  pos: string,
  key: keyof PlayerStats,
): number {
  const pool = playersAtPosition(players, pos);
  return avgStat(pool.length ? pool : players, key);
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface MatchupInsight {
  /** Short headline shown in bold */
  label: string;
  /** One sentence explanation — no source mentions */
  detail: string;
  severity: 'high' | 'medium' | 'low';
}

export interface MatchupAnalysisResult {
  /** Things we can exploit */
  strengths: MatchupInsight[];
  /** Dangers the opponent poses */
  risks: MatchupInsight[];
  /** Concrete adjustments to consider */
  recommendations: MatchupInsight[];
  /** Suggested tactical tweaks for this matchup */
  suggestedTacticalAdjustments: string[];
  /** Overall read: 'favorable' | 'neutral' | 'difficult' */
  verdict: 'favorable' | 'neutral' | 'difficult';
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const T = {
  PACE_HIGH: 78,
  PACE_LOW: 68,
  AERIAL_HIGH: 76,
  AERIAL_LOW: 66,
  CROSS_HIGH: 75,
  PASSING_HIGH: 78,
  DRIBBLING_HIGH: 78,
  GK_WEAK: 70,
  STAMINA_LOW: 68,
} as const;

// ── Main analysis function ────────────────────────────────────────────────────

export function analyzeMatchup(
  myPlayers: (Player | PlayerWithScores)[],
  opponentPlayers: (Player | PlayerWithScores)[],
): MatchupAnalysisResult {
  const strengths: MatchupInsight[] = [];
  const risks: MatchupInsight[] = [];
  const recommendations: MatchupInsight[] = [];
  const adjustments: string[] = [];

  // ── Rule 1: schnelle Gegner-Angreifer vs. eigene langsame CBs ─────────────
  const oppAttackerPace = avgStatAtPosition(opponentPlayers, 'ST', 'pac');
  const oppWfPace = avgStatAtPosition(opponentPlayers, 'WF', 'pac');
  const oppMaxFwdPace = Math.max(oppAttackerPace, oppWfPace);
  const myCbPace = avgStatAtPosition(myPlayers, 'CB', 'pac');

  if (oppMaxFwdPace >= T.PACE_HIGH && myCbPace > 0 && myCbPace <= T.PACE_LOW) {
    risks.push({
      label: 'Tempo-Nachteil in der Abwehr',
      detail:
        'Der Gegner hat schnelle Angreifer – deine Innenverteidiger könnten im offenen Raum überspielt werden.',
      severity: 'high',
    });
    adjustments.push('Tiefe Abwehrlinie wählen — kein Pressing der Innenverteidiger in die eigene Hälfte');
  } else if (oppMaxFwdPace >= T.PACE_HIGH) {
    risks.push({
      label: 'Schnelle gegnerische Angreifer',
      detail: 'Der Gegner setzt auf Tempo im Sturm – Umschaltmomente sorgfältig absichern.',
      severity: 'medium',
    });
  }

  // ── Rule 2: eigene schnelle Angreifer vs. langsame gegnerische CBs ────────
  const myStPace = avgStatAtPosition(myPlayers, 'ST', 'pac');
  const myWfPace = avgStatAtPosition(myPlayers, 'WF', 'pac');
  const myMaxFwdPace = Math.max(myStPace, myWfPace);
  const oppCbPace = avgStatAtPosition(opponentPlayers, 'CB', 'pac');

  if (myMaxFwdPace >= T.PACE_HIGH && oppCbPace > 0 && oppCbPace <= T.PACE_LOW) {
    strengths.push({
      label: 'Konter-Vorteil durch schnelle Angreifer',
      detail:
        'Deine Stürmer sind schneller als die gegnerischen Innenverteidiger – Konter und tiefe Bälle sind effektiv.',
      severity: 'high',
    });
    adjustments.push('Langen Aufbau nutzen (Long Build Up) und schnelle Läufe in die Tiefe aktivieren');
  }

  // ── Rule 3: gegnerische Crosser + Target ST => Flanken verteidigen ─────────
  const oppWfCross = avgStatAtPosition(opponentPlayers, 'WF', 'crossing');
  const oppWbCross = avgStatAtPosition(opponentPlayers, 'WB', 'crossing');
  const oppFbCross = avgStatAtPosition(opponentPlayers, 'FB', 'crossing');
  const oppMaxCross = Math.max(oppWfCross, oppWbCross, oppFbCross);

  const oppHasTargetSt = opponentPlayers.some(
    (p) =>
      (p.position === 'ST' || p.secondaryPositions?.includes('ST')) &&
      hasFullStats(p) &&
      stat(p, 'heading') >= T.AERIAL_HIGH &&
      stat(p, 'jumping') >= T.AERIAL_HIGH,
  );

  if (oppMaxCross >= T.CROSS_HIGH && oppHasTargetSt) {
    risks.push({
      label: 'Flankenspiel mit Zielstürmer',
      detail:
        'Der Gegner kombiniert starke Flanken mit einem kopfballstarken Stürmer – hohes Gefahr bei Standards und Flanken.',
      severity: 'high',
    });
    adjustments.push('Außenverteidiger defensiv ausrichten und Flankenräume eng halten');
  } else if (oppMaxCross >= T.CROSS_HIGH) {
    risks.push({
      label: 'Starkes Flankenspiel beim Gegner',
      detail: 'Der Gegner flankt häufig und mit Qualität – Außenlinie defensiv absichern.',
      severity: 'medium',
    });
  }

  // ── Rule 4: eigene Crosser + Target ST vs. schwache gegnerische CB-Physis ─
  const myWfCross = avgStatAtPosition(myPlayers, 'WF', 'crossing');
  const myWbCross = avgStatAtPosition(myPlayers, 'WB', 'crossing');
  const myFbCross = avgStatAtPosition(myPlayers, 'FB', 'crossing');
  const myMaxCross = Math.max(myWfCross, myWbCross, myFbCross);

  const myHasTargetSt = myPlayers.some(
    (p) =>
      (p.position === 'ST' || p.secondaryPositions?.includes('ST')) &&
      hasFullStats(p) &&
      stat(p, 'heading') >= T.AERIAL_HIGH &&
      stat(p, 'jumping') >= T.AERIAL_HIGH,
  );

  const oppCbAerial = avgStatAtPosition(opponentPlayers, 'CB', 'heading');
  const oppCbPhy = avgStatAtPosition(opponentPlayers, 'CB', 'phy');

  if (
    myMaxCross >= T.CROSS_HIGH &&
    myHasTargetSt &&
    ((oppCbAerial > 0 && oppCbAerial <= T.AERIAL_LOW) ||
      (oppCbPhy > 0 && oppCbPhy <= T.AERIAL_LOW))
  ) {
    strengths.push({
      label: 'Flanken-Chance durch Kopfballschwäche',
      detail:
        'Die gegnerischen Innenverteidiger sind anfällig bei Flanken – dein Zielstürmer und deine Flügel können das ausnutzen.',
      severity: 'high',
    });
    adjustments.push('Flanken und Hereingaben priorisieren – Stürmer in den Strafraum bringen');
  }

  // ── Rule 5: gegnerische starke AM/CM-Achse => Zentrum schließen ───────────
  const oppAmPass = avgStatAtPosition(opponentPlayers, 'AM', 'pas');
  const oppAmDri = avgStatAtPosition(opponentPlayers, 'AM', 'dri');
  const oppCmPass = avgStatAtPosition(opponentPlayers, 'CM', 'pas');
  const oppCmDri = avgStatAtPosition(opponentPlayers, 'CM', 'dri');

  const oppCentralThreat =
    Math.max(oppAmPass, oppCmPass) >= T.PASSING_HIGH ||
    Math.max(oppAmDri, oppCmDri) >= T.DRIBBLING_HIGH;

  if (oppCentralThreat) {
    risks.push({
      label: 'Gefährliche zentrale Achse',
      detail:
        'Gegnerische Mittelfeldspieler sind stark im Dribbling und Passspiel – das Zentrum muss kompakt bleiben.',
      severity: 'medium',
    });
    adjustments.push('DM auf Defend-Fokus setzen – Zentrum schließen und Räume zwischen den Linien eng halten');
  }

  // ── Rule 6: gegnerische schwache FB/WB => Flügel angreifen ──────────────
  const oppFbOvr = opponentPlayers
    .filter((p) => p.position === 'FB' || p.position === 'WB')
    .map((p) => p.overall);
  const oppFbAvgOvr =
    oppFbOvr.length > 0
      ? Math.round(oppFbOvr.reduce((a, b) => a + b, 0) / oppFbOvr.length)
      : 0;

  if (oppFbAvgOvr > 0 && oppFbAvgOvr <= 74) {
    strengths.push({
      label: 'Schwache Außenverteidiger beim Gegner',
      detail:
        'Die Außenverteidiger des Gegners sind unterdurchschnittlich stark – Angriffe über die Flügel empfehlenswert.',
      severity: 'medium',
    });
    adjustments.push('Angriffe über die Außenbahn aufbauen – Flügelstürmer hoch positionieren');
  }

  // ── Rule 7: schwache gegnerische GK-Werte ─────────────────────────────────
  const oppGks = opponentPlayers.filter((p) => p.position === 'GK' && hasFullStats(p));
  const oppGkReflexes =
    oppGks.length > 0
      ? Math.round(oppGks.reduce((s, p) => s + stat(p, 'reflexes'), 0) / oppGks.length)
      : 0;
  const oppGkPositioning =
    oppGks.length > 0
      ? Math.round(oppGks.reduce((s, p) => s + stat(p, 'positioning'), 0) / oppGks.length)
      : 0;

  if (oppGks.length > 0 && (oppGkReflexes <= T.GK_WEAK || oppGkPositioning <= T.GK_WEAK)) {
    strengths.push({
      label: 'Verwundbare Torwartzone',
      detail:
        'Der gegnerische Torhüter hat Schwächen – Schüsse aus der Distanz und Pressing nach Fehlern lohnen sich.',
      severity: 'medium',
    });
    adjustments.push('Abschlüsse aus dem Mittelfeld provozieren – GK nach Ballverlust unter Druck setzen');
  }

  // ── Rule 8: eigene niedrige Stamina => kein Dauerdruck ────────────────────
  const myStamina = avgStat(myPlayers, 'stamina');
  if (myStamina > 0 && myStamina <= T.STAMINA_LOW) {
    risks.push({
      label: 'Konditionsproblem im eigenen Kader',
      detail:
        'Deine Spieler haben niedrige Ausdauerwerte – intensiver Dauerdruck ist nicht durchhaltbar.',
      severity: 'medium',
    });
    adjustments.push('Ballbesitz statt Pressing wählen – Energieverbrauch kontrollieren');
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  const myOvr =
    myPlayers.length > 0
      ? Math.round(myPlayers.reduce((s, p) => s + p.overall, 0) / myPlayers.length)
      : 0;
  const oppOvr =
    opponentPlayers.length > 0
      ? Math.round(opponentPlayers.reduce((s, p) => s + p.overall, 0) / opponentPlayers.length)
      : 0;
  const ovrDiff = myOvr - oppOvr;
  const highRiskCount = [...strengths, ...risks].filter((i) => i.severity === 'high').length;

  let verdict: MatchupAnalysisResult['verdict'];
  if (ovrDiff >= 3 && risks.filter((r) => r.severity === 'high').length === 0) {
    verdict = 'favorable';
  } else if (ovrDiff <= -3 || risks.filter((r) => r.severity === 'high').length >= 2) {
    verdict = 'difficult';
  } else {
    verdict = 'neutral';
  }

  // ── Recommendations from analysis ────────────────────────────────────────
  if (strengths.some((s) => s.label.includes('Konter'))) {
    recommendations.push({
      label: 'Konter-Strategie aktivieren',
      detail: 'Tiefes Stehen, schnelle Umschaltmomente über die Flügel oder mit Tempo in die Tiefe.',
      severity: 'high',
    });
  }
  if (risks.some((r) => r.label.includes('Tempo-Nachteil'))) {
    recommendations.push({
      label: 'Abwehrlinie tief halten',
      detail: 'Innenverteidiger nicht herausrücken lassen – defensive Tiefe priorisieren.',
      severity: 'high',
    });
  }
  if (risks.some((r) => r.label.includes('Flankenspiel'))) {
    recommendations.push({
      label: 'Außenbahn defensiv absichern',
      detail: 'Außenverteidiger auf Defend setzen und Flankenräume konsequent schließen.',
      severity: 'medium',
    });
  }
  if (risks.some((r) => r.label.includes('zentrale Achse'))) {
    recommendations.push({
      label: 'Zentrales Pressing organisieren',
      detail: 'DM als Abfänger positionieren – Passwege ins Zentrum unterbrechen.',
      severity: 'medium',
    });
  }
  if (strengths.some((s) => s.label.includes('Flanken-Chance'))) {
    recommendations.push({
      label: 'Flankenangriff priorisieren',
      detail: 'Zielstürmer auf Standards vorbereiten – Kopfballsituationen gezielt herbeiführen.',
      severity: 'medium',
    });
  }
  if (highRiskCount === 0 && strengths.length === 0) {
    recommendations.push({
      label: 'Ausgewogene Taktik wählen',
      detail: 'Kein klarer Vorteil erkennbar – solides Mittelfeld und sicheres Aufbauspiel bevorzugen.',
      severity: 'low',
    });
  }

  return {
    strengths: strengths.slice(0, 4),
    risks: risks.slice(0, 4),
    recommendations: recommendations.slice(0, 4),
    suggestedTacticalAdjustments: [...new Set(adjustments)].slice(0, 5),
    verdict,
  };
}
