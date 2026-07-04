import type { PlayerWithScores, Position } from '@/lib/scraper/types';
import type { TournamentSummary } from '@/lib/tournaments/tournament-parser';

export type DevelopmentLabel =
  | 'Starter'
  | 'Trainieren'
  | 'Turnier-Spezialist'
  | 'Rotation'
  | 'Ersetzen';

export interface DevelopmentAdvice {
  playerId: string;
  label: DevelopmentLabel;
  score: number; // 0-100
  reasons: string[];
  warnings: string[];
  tournamentValue?: {
    hasValue: boolean;
    relevantTournaments: string[];
    reason?: string;
  };
  bestRole?: {
    position: Position;
    fit: number;
  };
}

/**
 * Strips a trailing "#N" suffix from tournament names for display.
 * e.g. "Beginners Cup #5" → "Beginners Cup"
 */
function shortTournamentName(name: string): string {
  return name.replace(/\s*#\d+\s*$/, '');
}

/**
 * Compute development advice for a single player given the full squad and active tournaments.
 */
export function adviseDevelopment(
  player: PlayerWithScores,
  _allPlayers: PlayerWithScores[],
  tournaments: TournamentSummary[],
): DevelopmentAdvice {
  // ── Step 1: Best role ─────────────────────────────────────────────────
  const fitEntries = Object.entries(player.fit_scores) as [Position, number][];
  let bestPosition: Position = player.position;
  let bestFit = 0;
  for (const [pos, fit] of fitEntries) {
    if (fit > bestFit) {
      bestFit = fit;
      bestPosition = pos;
    }
  }
  const primaryFit = player.fit_scores[player.position] ?? 0;

  // ── Step 2: Tournament value ──────────────────────────────────────────
  // A player is "usable" for a tournament only if they have a decent fit
  // or overall — otherwise OVR-eligibility alone is not meaningful.
  const usableForTournament = bestFit >= 60 || player.overall >= 60;

  const relevantTournaments: string[] = [];
  for (const tournament of tournaments) {
    for (const req of tournament.requirements) {
      const val = parseInt(req.value, 10);
      if (isNaN(val)) continue;
      if (req.key === 'OVR Max' && player.overall <= val && usableForTournament) {
        relevantTournaments.push(shortTournamentName(tournament.name));
      } else if (req.key === 'OVR Min' && player.overall >= val && usableForTournament) {
        relevantTournaments.push(shortTournamentName(tournament.name));
      }
    }
  }
  const hasTournamentValue = relevantTournaments.length > 0;

  const tournamentValue = {
    hasValue: hasTournamentValue,
    relevantTournaments,
    reason: hasTournamentValue
      ? `Wertvoll für ${relevantTournaments.join(', ')}`
      : undefined,
  };

  // ── Step 3: Score (0-100) ────────────────────────────────────────────
  const youthBonus = player.age && player.age <= 23 ? 10 : 0;
  const tournamentBonus = hasTournamentValue ? 15 : 0;
  const rawScore =
    bestFit * 0.4 +
    (player.overall / 100) * 30 +
    tournamentBonus +
    youthBonus;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  // ── Step 4: Label assignment (priority order) ────────────────────────
  let label: DevelopmentLabel = 'Ersetzen';

  if (bestFit >= 75 && primaryFit >= 68 && player.overall >= 65) {
    label = 'Starter';
  } else if (
    (player.age && player.age <= 23 && player.overall >= 55) ||
    (bestFit >= 65 && player.overall < 70 && score >= 55)
  ) {
    label = 'Trainieren';
  } else if (
    hasTournamentValue &&
    (bestFit >= 60 || player.overall >= 60)
  ) {
    label = 'Turnier-Spezialist';
  } else if (bestFit >= 58 || player.overall >= 58) {
    label = 'Rotation';
  } else {
    label = 'Ersetzen';
  }

  // ── Step 5: Reasons (German, product-facing) ─────────────────────────
  const reasons: string[] = [];

  if (label === 'Starter') {
    reasons.push(`Starterqualität auf ${bestPosition}`);
  }
  if (hasTournamentValue) {
    reasons.push(`Wertvoll für ${relevantTournaments.join(', ')}`);
  }
  if (player.age && player.age <= 23) {
    reasons.push('Jung mit Entwicklungspotenzial');
  }
  if (bestPosition !== player.position) {
    reasons.push(`Beste Rolle: ${bestPosition} (Fit ${bestFit})`);
  }
  if (label === 'Rotation') {
    reasons.push('Gute Rolle, aber nur Rotation');
  }
  if (label === 'Ersetzen') {
    // hasTournamentValue is false here by definition (Turnier-Spezialist would have fired first)
    // so "kein Turnierwert" is always factually correct when label is 'Ersetzen'.
    reasons.push('Kaum Fit, kein Turnierwert, wenig Entwicklung');
  }

  // ── Step 6: Warnings ─────────────────────────────────────────────────
  const warnings: string[] = [];
  if (player.dataQuality === 'basic') {
    warnings.push('Nur Basis-Daten — Empfehlung eingeschränkt');
  }
  if (bestFit < 50) {
    warnings.push('Sehr schwacher Fit auf allen Positionen');
  }

  return {
    playerId: player.id,
    label,
    score,
    reasons,
    warnings,
    tournamentValue,
    bestRole: { position: bestPosition, fit: bestFit },
  };
}
