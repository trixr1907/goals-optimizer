import { PlayerStats } from './types';

/**
 * Leitet aus 6 Kategorie-Werten (pac, sho, pas, dri, def, phy) alle
 * ~30 Einzelstats ab. Wird für Mock-Daten, OCR-Fallback und Legacy-Imports genutzt.
 */
export function inferFullStats(
  pac: number,
  sho: number,
  pas: number,
  dri: number,
  def: number,
  phy: number
): PlayerStats {
  return {
    // Categories
    pac, sho, pas, dri, def, phy,

    // Pace
    acceleration: pac,
    sprint_speed: pac,

    // Shooting
    finishing: sho,
    shot_power: sho,
    long_shots: sho,
    penalties: sho,
    weak_foot: 70,
    attacking_iq: sho,

    // Passing
    ground_pass: pas,
    lofted_pass: pas,
    through_pass: pas,
    crossing: pas,
    curve: pas,
    free_kick_accuracy: pas,

    // Dribbling
    sprint_dribbling: dri,
    close_dribbling: dri,
    skills: dri,
    agility: dri,
    balance: dri,
    first_touch: dri,

    // Defending
    defensive_iq: def,
    stand_tackle: def,
    slide_tackle: def,
    jockeying: def,
    interceptions: def,
    blocking: def,

    // Physical
    strength: phy,
    aggression: phy,
    stamina: phy,
    heading: phy,
    jumping: phy,

    // Goalkeeping
    div: 25,
    kic: 25,
    reflexes: 25,
    positioning: 25,
    catching: 25,
    parrying: 25,
    kicking_power: 25,
  };
}
