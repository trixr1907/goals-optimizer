import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  findUnknownRequirementKeys,
  parseGoalsTrackerTournaments,
  requirementsToRecord,
} from './tournament-parser';

const fixtureHtml = readFileSync(
  path.join(__dirname, '__fixtures__/goals-tracker-tournaments.html'),
  'utf8',
);

describe('parseGoalsTrackerTournaments', () => {
  it('extracts visible tournament cards from a stored Goals Tracker fixture', () => {
    const tournaments = parseGoalsTrackerTournaments(fixtureHtml);

    expect(tournaments.length).toBeGreaterThanOrEqual(1);
    expect(tournaments[0]).toMatchObject({
      name: 'Beginners Cup #5',
      timeLeft: '3d left',
      mode: '1V1',
    });
  });

  it('extracts flexible squad requirements as key/value pairs', () => {
    const tournaments = parseGoalsTrackerTournaments(fixtureHtml);
    const beginnersCup = tournaments.find((tournament) => tournament.name === 'Beginners Cup #5');

    expect(beginnersCup).toBeDefined();
    expect(requirementsToRecord(beginnersCup!.requirements)).toEqual({
      Retired: '0',
      'OVR Max': '69',
      'Duplicated Originals': '0',
    });
  });

  it('extracts OVR Min requirements when shown', () => {
    const tournaments = parseGoalsTrackerTournaments(fixtureHtml);
    const tournamentWithMin = tournaments.find((tournament) =>
      tournament.requirements.some((requirement) => requirement.key === 'OVR Min'),
    );

    expect(tournamentWithMin).toBeDefined();
    expect(requirementsToRecord(tournamentWithMin!.requirements)['OVR Min']).toBe('70');
  });

  it('extracts completion reward and rewards per round when visible', () => {
    const tournaments = parseGoalsTrackerTournaments(fixtureHtml);
    const beginnersCup = tournaments.find((tournament) => tournament.name === 'Beginners Cup #5');

    expect(beginnersCup?.completionReward).toEqual(
      expect.arrayContaining(['200K XP', '4K pts', '3 Common+ Players']),
    );
    expect(beginnersCup?.rewardsPerRound[0]).toEqual({
      round: 'R16',
      title: 'Round of 16',
      points: '300',
      xp: '6K xp',
    });
  });

  it('keeps currently unknown requirement keys discoverable', () => {
    const tournaments = parseGoalsTrackerTournaments(fixtureHtml);

    expect(findUnknownRequirementKeys(tournaments)).toEqual([]);
  });
});
