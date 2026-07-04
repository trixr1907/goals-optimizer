export const ALL_POSITIONS = [
  'GK', 'CB', 'FB', 'WB',
  'DM', 'CM', 'AM', 'WM',
  'WF', 'CF', 'ST',
] as const;

export type Position = (typeof ALL_POSITIONS)[number];

export type Rarity = 'Basic' | 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

export interface PlayerRoleRating {
  position: Position;
  overall: number;
}

export interface PlayerAging {
  currentAge: number;
  targetRating: number;
  upgradesRemaining: number;
  potentialRange: [number, number]; // [min, max]
}

// UI displays the original GOALS position abbreviations.
// Internal scoring uses the same Position values, so this is intentionally identity.
export function displayPosition(pos: Position): string {
  return pos;
}

export interface PlayerStats {
  // Category averages (kept for legacy compatibility — scoring uses individual stats)
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;

  // ── Pace ──
  acceleration: number;
  sprint_speed: number;

  // ── Shooting ──
  finishing: number;
  shot_power: number;
  long_shots: number;
  penalties: number;
  weak_foot: number;
  attacking_iq: number;

  // ── Passing ──
  ground_pass: number;
  lofted_pass: number;
  through_pass: number;
  crossing: number;
  curve: number;
  free_kick_accuracy: number;

  // ── Dribbling ──
  sprint_dribbling: number;
  close_dribbling: number;
  skills: number;
  agility: number;
  balance: number;
  first_touch: number;

  // ── Defending ──
  defensive_iq: number;
  stand_tackle: number;
  slide_tackle: number;
  jockeying: number;
  interceptions: number;
  blocking: number;

  // ── Physical ──
  strength: number;
  aggression: number;
  stamina: number;
  heading: number;
  jumping: number;

  // ── Goalkeeping ──
  div: number;
  kic: number;
  reflexes: number;
  positioning: number;
  catching: number;
  parrying: number;
  rushing?: number;
  command_of_area?: number;
  penalty_saving?: number;
  throwing?: number;
  kicking_power?: number;
}

export type DataQuality = 'full' | 'basic';

export type PositionSource = 'goals-tracker' | 'playgoals' | 'goalsverse' | 'heuristic';
export type RoleRatingsSource = 'goals-tracker' | 'goalsverse' | 'mixed' | 'none';

export function hasFullStats(player: Pick<Player, 'dataQuality' | 'stats'>): boolean {
  if (player.dataQuality) return player.dataQuality === 'full';
  return Object.values(player.stats).some((value) => typeof value === 'number' && value > 0);
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  overall: number;
  rarity: Rarity;
  stats: PlayerStats;
  preferred_foot?: 'left' | 'right';
  weak_foot?: number;
  height_cm?: number;
  age?: number;
  training_value?: number;
  xp_current?: number;
  xp_next_upgrade?: number;
  upgrade_count?: number;
  /** Avatar URL — https://cdn.playgoals.com/character/prod/{raw_id}.png */
  image_url?: string;
  /** Match statistics (from club activity page) */
  matches_played?: number;
  goals?: number;
  assists?: number;

  // GOALS position system
  roleRatings: PlayerRoleRating[];       // All positions with OVR from ovr_roles
  secondaryPositions: Position[];        // Positions with OVR >= primary - 2
  aging?: PlayerAging;

  /** Data quality indicator: 'full' = has individual stats, 'basic' = only role/OVR */
  dataQuality?: DataQuality;

  /** Which source determined the primary position */
  positionSource?: PositionSource;
  /** Which source provided the roleRatings array */
  roleRatingsSource?: RoleRatingsSource;
  /** Non-fatal data warnings (e.g. tracker unreachable, fallback used) */
  sourceWarnings?: string[];
}

export interface PlayerWithScores extends Player {
  fit_scores: Record<Position, number>;
  positionType: Record<Position, 'primary' | 'secondary' | 'out'>;
  effectiveStats: Record<Position, PlayerStats>;
}

/**
 * Returns the position classification for a player at a given slot position.
 *
 * GOALS position rules:
 *   primary   — player.position matches the slot (no penalty)
 *   secondary — slot is in player.secondaryPositions (OVR within 2 of primary → -2 on all stats)
 *   out       — all other positions (-5 on all stats)
 *
 * IMPORTANT: The penalty applies to individual stats only.
 * player.overall and Squad/Team OVR are NEVER changed by position assignment.
 */
export function getPositionType(player: Player, position: Position): 'primary' | 'secondary' | 'out' {
  if (player.position === position) return 'primary';
  if (player.secondaryPositions && player.secondaryPositions.includes(position)) return 'secondary';
  return 'out';
}

/**
 * Returns a copy of player.stats with the verified GOALS position penalty applied.
 *
 * Penalty rules (verifiziert, GOALS):
 *   primary position   → +0 (no change)
 *   secondary position → -2 on ALL stats (floor: 1)
 *   out of position    → -5 on ALL stats (floor: 1)
 *
 * IMPORTANT: player.overall is NOT modified. OVR and Squad/Team OVR are
 * independent of position assignment — only individual stats are penalised.
 * Use this function wherever a stat value feeds into a slot-specific evaluation
 * (tactics, scoring, optimizer). For pure squad/roster analysis without a
 * concrete slot context, raw player.stats are appropriate.
 */
export function getEffectiveStats(player: Player, position: Position): PlayerStats {
  const type = getPositionType(player, position);
  const penalty = type === 'primary' ? 0 : type === 'secondary' ? 2 : 5;
  const stats = { ...player.stats };
  (Object.keys(stats) as Array<keyof PlayerStats>).forEach((key) => {
    if (typeof stats[key] === 'number') {
      (stats as Record<string, number>)[key as string] = Math.max(1, (stats[key] as number) - penalty);
    }
  });
  return stats;
}
