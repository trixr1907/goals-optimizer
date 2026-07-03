export const ALL_POSITIONS = [
  'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB',
  'CDM', 'CM', 'CAM', 'LM', 'RM',
  'ST', 'LW', 'RW', 'CF',
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
}

export interface PlayerWithScores extends Player {
  fit_scores: Record<Position, number>;
  positionType: Record<Position, 'primary' | 'secondary' | 'out'>;
  effectiveStats: Record<Position, PlayerStats>;
}

export function getPositionType(player: Player, position: Position): 'primary' | 'secondary' | 'out' {
  if (player.position === position) return 'primary';
  if (player.secondaryPositions && player.secondaryPositions.includes(position)) return 'secondary';
  return 'out';
}

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
