import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import formationsData from '@/config/formations.json';

export interface FormationMeta {
  name: string;
  slots: LineupSlot[];
  winrate_current_patch?: number;
  usage_rate?: number;
  skill_cohort?: string;
  playstyle?: 'Offensiv' | 'Defensiv' | 'Ausgewogen' | 'Konter' | string;
  strengths?: string[];
  weaknesses?: string[];
}

export interface FormationAssignment {
  slotKey: string;
  slot: LineupSlot;
  player: PlayerWithScores;
  fit: number;
}

export interface FormationRecommendation {
  formationKey: string;
  formation: FormationMeta;
  assignments: FormationAssignment[];
  totalFit: number;
  averageFit: number;
  metaScore: number;
  squadMatch: number;
  warnings: string[];
  reasons: string[];
  variants: Record<'offensiv' | 'defensiv' | 'gegenMeta', FormationAssignment[]>;
}

const FORMATIONS = formationsData as Record<string, FormationMeta>;
const DEF_POSITIONS = new Set<Position>(['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM']);
const ATT_POSITIONS = new Set<Position>(['CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST']);

function slotKeyFor(position: Position, index: number) {
  return `${position}-${index}`;
}

function getRoleBias(player: PlayerWithScores, position: Position, mode: 'balanced' | 'offensiv' | 'defensiv' | 'gegenMeta') {
  if (mode === 'balanced') return 0;
  const stats = player.stats;
  if (mode === 'offensiv') {
    if (ATT_POSITIONS.has(position)) return stats.pac * 0.08 + stats.sho * 0.1 + stats.dri * 0.06 + stats.pas * 0.04;
    if (position === 'CM' || position === 'CAM') return stats.pas * 0.08 + stats.dri * 0.05 + stats.sho * 0.04;
    return 0;
  }
  if (mode === 'defensiv') {
    if (DEF_POSITIONS.has(position)) return stats.def * 0.1 + stats.phy * 0.06 + stats.pac * 0.04;
    if (position === 'CM' || position === 'CDM') return stats.def * 0.08 + stats.pas * 0.04 + stats.phy * 0.05;
    return 0;
  }
  // Gegen-Meta: prefer pace + defensive recovery because through-balls and wide counters are common pain points.
  return stats.pac * 0.07 + stats.def * 0.06 + stats.phy * 0.03;
}

function solveGreedy(players: PlayerWithScores[], slots: LineupSlot[], mode: 'balanced' | 'offensiv' | 'defensiv' | 'gegenMeta') {
  const used = new Set<string>();
  const sortedSlots = [...slots].sort((a, b) => {
    const bestA = Math.max(...players.map((p) => p.fit_scores[a.position] ?? 0));
    const bestB = Math.max(...players.map((p) => p.fit_scores[b.position] ?? 0));
    return bestA - bestB;
  });

  const assignmentsByOriginalIndex = new Map<number, FormationAssignment>();
  sortedSlots.forEach((slot) => {
    const originalIndex = slots.findIndex((candidate, idx) => candidate === slot || (candidate.position === slot.position && candidate.x === slot.x && candidate.y === slot.y && !assignmentsByOriginalIndex.has(idx)));
    const best = players
      .filter((player) => !used.has(player.id))
      .map((player) => ({
        player,
        fit: player.fit_scores[slot.position] ?? 0,
        score: (player.fit_scores[slot.position] ?? 0) + getRoleBias(player, slot.position, mode),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (best && originalIndex >= 0) {
      used.add(best.player.id);
      assignmentsByOriginalIndex.set(originalIndex, {
        slotKey: slotKeyFor(slot.position, originalIndex),
        slot,
        player: best.player,
        fit: best.fit,
      });
    }
  });

  return Array.from(assignmentsByOriginalIndex.entries())
    .sort(([a], [b]) => a - b)
    .map(([, assignment]) => assignment);
}

function makeWarnings(assignments: FormationAssignment[]) {
  const warnings: string[] = [];
  const weak = assignments.filter((item) => item.fit < 62).sort((a, b) => a.fit - b.fit).slice(0, 3);
  weak.forEach((item) => warnings.push(`${item.slot.position}: ${item.player.name} hat nur ${item.fit.toFixed(0)} Fit — Upgrade oder Positionsswap prüfen.`));

  const defenders = assignments.filter((item) => DEF_POSITIONS.has(item.slot.position) && item.slot.position !== 'GK');
  const avgDefPace = defenders.length ? defenders.reduce((sum, item) => sum + item.player.stats.pac, 0) / defenders.length : 0;
  if (defenders.length && avgDefPace < 68) warnings.push('Abwehr-Pace ist niedrig — keine hohe Linie gegen schnelle Stürmer spielen.');

  const attackers = assignments.filter((item) => ATT_POSITIONS.has(item.slot.position));
  const avgAttackFit = attackers.length ? attackers.reduce((sum, item) => sum + item.fit, 0) / attackers.length : 0;
  if (attackers.length && avgAttackFit < 68) warnings.push('Angriff passt noch nicht sauber zur Formation — alternative Formation testen.');

  return warnings;
}

function makeReasons(formation: FormationMeta, assignments: FormationAssignment[], averageFit: number, squadMatch: number) {
  const reasons: string[] = [];
  reasons.push(`${squadMatch.toFixed(0)}% Kader-Fit bei ${averageFit.toFixed(1)} durchschnittlichem Slot-Fit.`);
  if (formation.winrate_current_patch) reasons.push(`Meta-Winrate aktuell ca. ${formation.winrate_current_patch.toFixed(1)}%.`);
  if (formation.playstyle) reasons.push(`Spielstil: ${formation.playstyle}.`);

  const bestLine = assignments.slice().sort((a, b) => b.fit - a.fit).slice(0, 2);
  if (bestLine.length) reasons.push(`Stärkste Rollen: ${bestLine.map((item) => `${item.player.name} auf ${item.slot.position}`).join(', ')}.`);
  return reasons;
}

export function recommendFormations(players: PlayerWithScores[]): FormationRecommendation[] {
  if (players.length < 11) return [];

  return Object.entries(FORMATIONS)
    .map(([formationKey, formation]) => {
      const assignments = solveGreedy(players, formation.slots, 'balanced');
      const totalFit = assignments.reduce((sum, item) => sum + item.fit, 0);
      const averageFit = assignments.length ? totalFit / assignments.length : 0;
      const metaScore = (formation.winrate_current_patch ?? 50) * 0.65 + (formation.usage_rate ?? 5) * 0.35;
      const squadMatch = Math.max(0, Math.min(100, averageFit * 0.9 + metaScore * 0.1));
      return {
        formationKey,
        formation,
        assignments,
        totalFit,
        averageFit,
        metaScore,
        squadMatch,
        warnings: makeWarnings(assignments),
        reasons: makeReasons(formation, assignments, averageFit, squadMatch),
        variants: {
          offensiv: solveGreedy(players, formation.slots, 'offensiv'),
          defensiv: solveGreedy(players, formation.slots, 'defensiv'),
          gegenMeta: solveGreedy(players, formation.slots, 'gegenMeta'),
        },
      } satisfies FormationRecommendation;
    })
    .sort((a, b) => b.squadMatch - a.squadMatch);
}

export function recommendationToLineup(recommendation: FormationRecommendation) {
  return recommendation.assignments.reduce<Record<string, string>>((lineup, assignment) => {
    lineup[assignment.slotKey] = assignment.player.id;
    return lineup;
  }, {});
}
