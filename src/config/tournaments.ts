/**
 * Static tournament config for the current tournament cycle.
 *
 * Shape matches TournamentSummary from tournament-parser so the existing
 * evaluateTournamentRequirements() helper can be used directly without
 * any additional conversion.
 *
 * Rules (verified in-game 2026-07-04):
 *   Squad OVR = Math.round(sum of 11 starting-eleven OVRs / 11)
 *   Bank / substitutes do NOT count.
 *   OVR Max / OVR Min refer to Squad OVR, NOT individual player OVR.
 *
 * Update this file when a new tournament cycle starts.
 */

import type { TournamentSummary } from '@/lib/tournaments/tournament-parser';

export const CURRENT_TOURNAMENTS: TournamentSummary[] = [
  {
    name: 'Beginners Cup #5',
    timeLeft: null,
    mode: null,
    requirements: [{ key: 'OVR Max', value: '69' }],
    completionReward: [],
    rewardsPerRound: [],
  },
  {
    name: 'Challengers Cup #5',
    timeLeft: null,
    mode: null,
    requirements: [{ key: 'OVR Max', value: '79' }],
    completionReward: [],
    rewardsPerRound: [],
  },
  {
    name: 'Masters Cup #5',
    timeLeft: null,
    mode: null,
    requirements: [{ key: 'OVR Max', value: '84' }],
    completionReward: [],
    rewardsPerRound: [],
  },
  {
    name: 'Champions Cup #5',
    timeLeft: null,
    mode: null,
    requirements: [{ key: 'OVR Min', value: '70' }],
    completionReward: [],
    rewardsPerRound: [],
  },
];
