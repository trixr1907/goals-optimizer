import { Player, hasFullStats, isValidPlayer } from '@/lib/scraper/types';
import { detectPlayerArchetypes, PlayerArchetype, PlayerArchetypeMatch } from './player-archetypes';

export interface SquadAnalysisReport {
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  keyPlayers: Array<{
    playerId: string;
    name: string;
    archetypes: PlayerArchetypeMatch[];
    summary: string;
  }>;
}

function playerHasArchetype(player: Player, archetype: PlayerArchetype): boolean {
  const matches = detectPlayerArchetypes(player);
  return matches.some((m) => m.type === archetype);
}

export function analyzeSquad(players: Player[]): SquadAnalysisReport {
  // Drop any null/undefined/corrupt entries that could arrive from a stale store.
  const valid = players.filter(isValidPlayer);
  if (valid.length === 0) {
    return { strengths: [], weaknesses: [], recommendations: [], keyPlayers: [] };
  }

  const fullStatsPlayers = valid.filter((p) => hasFullStats(p));
  const basicPlayers = valid.filter((p) => !hasFullStats(p));
  const basicRatio = basicPlayers.length / valid.length;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  const gkCount = valid.filter((p) => p.position === 'GK').length;
  const cbCount = valid.filter((p) => p.position === 'CB').length;
  const fbCount = valid.filter((p) => p.position === 'FB').length;
  const wbCount = valid.filter((p) => p.position === 'WB').length;
  const fbWbCount = fbCount + wbCount;
  const dmCount = valid.filter((p) => p.position === 'DM').length;
  const cmCount = valid.filter((p) => p.position === 'CM').length;
  const wmCount = valid.filter((p) => p.position === 'WM').length;
  const wfCount = valid.filter((p) => p.position === 'WF').length;
  const archetypes: PlayerArchetype[] = [
    'Creative AM', 'Pace Winger', 'Target ST', 'Pressing ST',
    'Box-to-box CM', 'Ball-Winning DM', 'Recovery CB', 'Physical CB',
    'Attacking FB/WB', 'Sweeper GK',
  ];

  const counts: Record<string, number> = {};
  for (const arch of archetypes) {
    counts[arch] = valid.filter((p) => playerHasArchetype(p, arch)).length;
  }

  if (counts['Creative AM'] >= 2) {
    strengths.push('Starke kreative Achse mit ' + counts['Creative AM'] + ' Spielmachern');
  }
  if (counts['Pace Winger'] >= 2) {
    strengths.push('Temporeiche Flügel mit ' + counts['Pace Winger'] + ' schnellen Wingern');
  }
  if (counts['Box-to-box CM'] >= 2) {
    strengths.push('Ausdauerndes Mittelfeld mit ' + counts['Box-to-box CM'] + ' Box-to-box-Spielern');
  }
  if (counts['Ball-Winning DM'] >= 1) {
    strengths.push('Defensiver Rückhalt durch einen Ball-Winning DM vorhanden');
  }
  if (counts['Recovery CB'] + counts['Physical CB'] >= 2) {
    strengths.push('Solide Innenverteidigung mit ' + (counts['Recovery CB'] + counts['Physical CB']) + ' Profil-Spielern');
  }
  if (counts['Target ST'] >= 1 && counts['Pace Winger'] >= 2) {
    strengths.push('Gute Balance zwischen Zielstürmer und schnellen Außenspielern');
  }
  if (counts['Attacking FB/WB'] >= 2) {
    strengths.push('Offensivstarke Außenverteidiger bringen Breite ins Spiel');
  }
  if (fullStatsPlayers.length >= valid.length * 0.8) {
    strengths.push('Gute Datengrundlage – Analyse basiert auf detaillierten Spielerwerten');
  }
  if (strengths.length === 0) {
    const avgOvr = Math.round(valid.reduce((s, p) => s + p.overall, 0) / valid.length);
    if (avgOvr >= 85) {
      strengths.push('Hohes durchschnittliches Gesamtrating');
    } else if (valid.length >= 18) {
      strengths.push('Ausreichende Kadertiefe mit ' + valid.length + ' Spielern');
    } else {
      strengths.push('Kompakter Kader mit ' + valid.length + ' Spielern');
    }
  }

  if (gkCount < 2) {
    weaknesses.push('Nur ' + gkCount + ' Torhüter – kein Backup bei Ausfall oder Sperre');
  }
  if (cbCount < 3) {
    weaknesses.push('Nur ' + cbCount + ' Innenverteidiger – wenig Breite für Rotation');
  }
  if (counts['Recovery CB'] === 0 && cbCount >= 2) {
    weaknesses.push('Kein schneller Innenverteidiger (Recovery CB) – anfällig für Konter');
  }
  if (counts['Physical CB'] === 0 && cbCount >= 2) {
    weaknesses.push('Kein physischer Abwehrchef (Physical CB) – anfällig bei Standards');
  }
  if (counts['Ball-Winning DM'] === 0 && dmCount + cmCount >= 3) {
    weaknesses.push('Kein defensiver Abräumer (Ball-Winning DM) im Mittelfeld');
  }
  if (counts['Pace Winger'] === 0 && wfCount + wmCount >= 2) {
    weaknesses.push('Keine schnellen Flügelspieler – Tempo-Defizit im Umschaltspiel');
  }
  if (fbWbCount < 2) {
    weaknesses.push('Nur ' + fbWbCount + ' Außenverteidiger – Flügel unbesetzt');
  }
  if (basicRatio > 0.3) {
    weaknesses.push('Viele Spieler mit Basisdaten – Analyse teilweise unsicher');
  }

  if (gkCount < 2) {
    recommendations.push('Zweiten Torhüter für Ausfallsicherheit verpflichten');
  }
  if (counts['Ball-Winning DM'] === 0 && dmCount + cmCount >= 2) {
    recommendations.push('Defensiven Mittelfeldspieler (Ball-Winning DM) suchen');
  }
  if (counts['Recovery CB'] === 0 && cbCount >= 2) {
    recommendations.push('Schnellen Innenverteidiger (Recovery CB) verpflichten gegen Konter');
  }
  if (cbCount < 3) {
    recommendations.push('Weiteren Innenverteidiger für Rotation einplanen');
  }
  if (counts['Pace Winger'] < 2 && wfCount + wmCount >= 1) {
    recommendations.push('Schnellen Flügelspieler (Pace Winger) für mehr Tempo verpflichten');
  }

  const playerScores = valid
    .filter((p) => hasFullStats(p))
    .map((player) => {
      const archs = detectPlayerArchetypes(player);
      return { player, archetypes: archs };
    })
    .filter(({ archetypes }) => archetypes.length > 0)
    .sort((a, b) => {
      const aMax = a.archetypes.length > 0 ? Math.max(...a.archetypes.map((m) => m.score)) : 0;
      const bMax = b.archetypes.length > 0 ? Math.max(...b.archetypes.map((m) => m.score)) : 0;
      return bMax - aMax;
    });

  const keyPlayers = playerScores.slice(0, 5).map(({ player, archetypes }) => {
    const names = archetypes.map((a) => a.type).join(', ');
    return {
      playerId: player.id,
      name: player.name,
      archetypes,
      summary: player.name + ' (' + player.position + ', OVR ' + player.overall + '): ' + names,
    };
  });

  return {
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    recommendations: recommendations.slice(0, 4),
    keyPlayers,
  };
}
