export const ALL_POSITIONS = [
  'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB',
  'CDM', 'CM', 'CAM', 'LM', 'RM',
  'ST', 'LW', 'RW', 'CF',
] as const;

export type Position = (typeof ALL_POSITIONS)[number];

export type Rarity = 'Basic' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic' | 'Iconic';

// ── German display names for positions ───────────────────────────────────────
const DISPLAY_POSITION_MAP: Record<Position, string> = {
  GK:  'TW',
  CB:  'IV',
  LB:  'LV',
  RB:  'RV',
  LWB: 'LM',
  RWB: 'RM',
  CDM: 'ZDM',
  CM:  'ZM',
  CAM: 'ZOM',
  LM:  'LM',
  RM:  'RM',
  LW:  'LS',
  RW:  'RS',
  CF:  'HS',
  ST:  'ST',
};

/** Returns the German short label for display in UI. Internal scoring always uses Position. */
export function displayPosition(pos: Position): string {
  return DISPLAY_POSITION_MAP[pos] ?? pos;
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
}

export interface PlayerWithScores extends Player {
  fit_scores: Record<Position, number>;
}
