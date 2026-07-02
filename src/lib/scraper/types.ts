export const ALL_POSITIONS = [
  'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB',
  'CDM', 'CM', 'CAM', 'LM', 'RM',
  'ST', 'LW', 'RW', 'CF',
] as const;

export type Position = (typeof ALL_POSITIONS)[number];

export type Rarity = 'Basic' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic' | 'Iconic';

export interface PlayerStats {
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
  // Extended stats (optional — present in full scraper output)
  heading?: number;
  jumping?: number;
  finishing?: number;
  close_dribbling?: number;
  skills?: number;
  crossing?: number;
  defensive_iq?: number;
  interceptions?: number;
  stamina?: number;
  attacking_iq?: number;
  div?: number;   // GK diving
  spd?: number;   // GK speed
  kic?: number;   // GK kicking
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  overall: number;
  rarity: Rarity;
  stats: PlayerStats;
  // Optional extended fields
  preferred_foot?: 'left' | 'right';
  weak_foot?: number; // 1-99 or percentage-like GOALS weak-foot value; default 70 if unknown
  height_cm?: number;
  age?: number;            // In-game age (increases via playtime)
  training_value?: number; // 1–8, determines development ceiling
  xp_current?: number;
  xp_next_upgrade?: number;
  upgrade_count?: number;
}

export interface PlayerWithScores extends Player {
  fit_scores: Record<Position, number>;
}
