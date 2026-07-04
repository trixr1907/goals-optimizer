import * as cheerio from 'cheerio';

export interface TournamentRequirement {
  key: string;
  value: string;
}

export interface TournamentRoundReward {
  round: string;
  title?: string;
  points?: string;
  xp?: string;
}

export interface TournamentSummary {
  name: string;
  timeLeft: string | null;
  mode: string | null;
  requirements: TournamentRequirement[];
  completionReward: string[];
  rewardsPerRound: TournamentRoundReward[];
}

const KNOWN_REQUIREMENTS = new Set(['Retired', 'OVR Max', 'OVR Min', 'Duplicated Originals']);

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function compactRewardText(text: string): string {
  return cleanText(text)
    .replace(/(\d+(?:\.\d+)?K?)\s+(XP|pts)/gi, '$1 $2')
    .replace(/\s+/g, ' ');
}

export function parseGoalsTrackerTournaments(html: string): TournamentSummary[] {
  const $ = cheerio.load(html);

  return $('section')
    .toArray()
    .map((section) => {
      const $section = $(section);
      const name = cleanText($section.find('h2').first().text());
      if (!name) return null;

      const timeLeft = cleanText($section.find('.absolute.left-3.top-3').first().text()) || null;
      const mode = cleanText($section.find('.absolute.right-3.top-3').first().text()) || null;

      const requirements: TournamentRequirement[] = [];
      const $requirementsHeading = $section.find('p').filter((_, el) => cleanText($(el).text()) === 'Squad requirements').first();
      const $requirementsList = $requirementsHeading.next('div');
      $requirementsList.children('div').each((_, row) => {
        const spans = $(row).find('span').toArray().map((span) => cleanText($(span).text())).filter(Boolean);
        if (spans.length >= 2) {
          requirements.push({ key: spans[0], value: spans[spans.length - 1] });
        }
      });

      const completionReward: string[] = [];
      const $completionHeading = $section.find('p').filter((_, el) => cleanText($(el).text()) === 'Completion reward').first();
      const $completionList = $completionHeading.next('div');
      $completionList.children().each((_, item) => {
        const text = compactRewardText($(item).text());
        if (text) completionReward.push(text);
      });

      const rewardsPerRound: TournamentRoundReward[] = [];
      const $roundHeading = $section.find('p').filter((_, el) => cleanText($(el).text()) === 'Rewards per round').first();
      const $roundGrid = $roundHeading.next('div');
      $roundGrid.children('div').each((_, item) => {
        const $item = $(item);
        const spans = $item.find('span').toArray().map((span) => cleanText($(span).text())).filter(Boolean);
        if (spans.length === 0) return;
        rewardsPerRound.push({
          round: spans[0],
          title: $item.attr('title') || undefined,
          points: spans[1],
          xp: spans[2]?.replace(/\s+/g, ' '),
        });
      });

      return { name, timeLeft, mode, requirements, completionReward, rewardsPerRound } satisfies TournamentSummary;
    })
    .filter((tournament): tournament is TournamentSummary => tournament !== null);
}

export function requirementsToRecord(requirements: TournamentRequirement[]): Record<string, string> {
  return Object.fromEntries(requirements.map((requirement) => [requirement.key, requirement.value]));
}

export function findUnknownRequirementKeys(tournaments: TournamentSummary[]): string[] {
  const keys = new Set<string>();
  for (const tournament of tournaments) {
    for (const requirement of tournament.requirements) {
      if (!KNOWN_REQUIREMENTS.has(requirement.key)) keys.add(requirement.key);
    }
  }
  return Array.from(keys).sort();
}
