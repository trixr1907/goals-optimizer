/**
 * Minimal HTML fixtures extracted from real playgoals.com player pages.
 *
 * PlayGOALS uses Next.js App Router with __next_f.push() RSC streaming.
 * Player data is embedded as a double-escaped JSON string inside those script
 * fragments. The key field is:
 *
 *   \"ovr\":{\"overall_rating\":N,\"role\":\"ROLE_XX\"}
 *
 * In the actual file bytes (one level of JSON-string escaping):
 *   \\"ovr\\":{\\"overall_rating\\":N,\\"role\\":\\"ROLE_XX\\"}
 *
 * Each fixture contains just enough context to exercise the parser, derived
 * from real pages fetched 2026-07-05. No live network calls in tests.
 */

export interface PlayGoalsFixture {
  characterId: string;
  expectedPosition: string;
  expectedOverall: number;
  html: string;
}

/**
 * Build a minimal but structurally faithful PlayGOALS HTML fragment.
 * Mirrors the __next_f.push playerInfo block as found in real pages.
 */
function buildFragment(
  uuid: string,
  firstName: string,
  lastName: string,
  nationality: string,
  height: number,
  weight: number,
  age: number,
  role: string,     // e.g. "ROLE_FB"
  overall: number,
): string {
  // The backslash-escape pattern as it appears in the real file
  const esc = (s: string) => `\\"${s}\\"`;
  const n   = (v: number) => String(v);

  // Core fragment (mirrors the actual __next_f.push encoding):
  //   \"playerInfo\":{\"id\":\"...\",\"first_name\":\"...\", ... \"ovr\":{...}}
  const inner = [
    `${esc('id')}:${esc(uuid)}`,
    `${esc('first_name')}:${esc(firstName)}`,
    `${esc('last_name')}:${esc(lastName)}`,
    `${esc('nationality')}:${esc(nationality)}`,
    `${esc('height')}:${n(height)}`,
    `${esc('weight')}:${n(weight)}`,
    `${esc('current_age')}:${n(age)}`,
    // The crucial field — what the parser reads:
    `${esc('ovr')}:{${esc('overall_rating')}:${n(overall)},${esc('role')}:${esc(role)}}`,
    `${esc('ovr_roles')}:[{${esc('role')}:${esc(role)},${esc('overall_rating')}:${n(overall)}}]`,
  ].join(',');

  const playerInfoBlock = `${esc('playerInfo')}:{${inner}}`;

  // Wrap in a minimal __next_f.push script tag (mirrors real structure)
  return (
    `<!DOCTYPE html><html><body>` +
    `<script>self.__next_f.push([1,"${playerInfoBlock}"])</script>` +
    `</body></html>`
  );
}

// ── Fixtures (data from playgoals.com, fetched 2026-07-05) ──────────────────

/**
 * Wendelin Pietsch — d6553983-f4d5-5923-8fe9-077939607a12
 * PlayGOALS primary: FB (ROLE_FB, ovr=76)
 * Key case: Goalsverse places CB=FB=WB in a 3-way tie and picks CB as primary.
 * PlayGOALS + Tracker both show FB — this fixture is the fallback when Tracker 403s.
 */
export const FIXTURE_PG_WENDELIN_PIETSCH: PlayGoalsFixture = {
  characterId: 'd6553983-f4d5-5923-8fe9-077939607a12',
  expectedPosition: 'FB',
  expectedOverall: 76,
  html: buildFragment('d6553983-f4d5-5923-8fe9-077939607a12', 'Wendelin', 'Pietsch', 'DE', 176, 83, 16, 'ROLE_FB', 76),
};

/**
 * Antoinette Sidibe — 1b1bafcd-1317-54ca-992c-55b9e0fe4a77
 * PlayGOALS primary: CM (ROLE_CM, ovr=73)
 * Key case: Goalsverse has WB=DM=FB=73 tie and picks WB. PlayGOALS + Tracker show CM.
 */
export const FIXTURE_PG_ANTOINETTE_SIDIBE: PlayGoalsFixture = {
  characterId: '1b1bafcd-1317-54ca-992c-55b9e0fe4a77',
  expectedPosition: 'CM',
  expectedOverall: 73,
  html: buildFragment('1b1bafcd-1317-54ca-992c-55b9e0fe4a77', 'Antoinette', 'Sidibe', 'BF', 180, 81, 22, 'ROLE_CM', 73),
};

/**
 * Jonathan Jones — 6dbe494a-0568-58e9-bd59-30c331515659
 * PlayGOALS primary: AM (ROLE_AM, ovr=81)
 * Goalsverse has 4-way tie DM/WB/CM/AM=81 and picks DM. PlayGOALS + Tracker show AM.
 */
export const FIXTURE_PG_JONATHAN_JONES: PlayGoalsFixture = {
  characterId: '6dbe494a-0568-58e9-bd59-30c331515659',
  expectedPosition: 'AM',
  expectedOverall: 81,
  html: buildFragment('6dbe494a-0568-58e9-bd59-30c331515659', 'Jonathan', 'Jones', 'DE', 183, 75, 20, 'ROLE_AM', 81),
};

/**
 * Vitor do Monte — 7cfe929a-32c9-5ef2-8690-322339963af8
 * PlayGOALS primary: ST (ROLE_ST, ovr=81)
 * ST absent from Goalsverse ovr_roles entirely. PlayGOALS + Tracker show ST.
 */
export const FIXTURE_PG_VITOR_DO_MONTE: PlayGoalsFixture = {
  characterId: '7cfe929a-32c9-5ef2-8690-322339963af8',
  expectedPosition: 'ST',
  expectedOverall: 81,
  html: buildFragment('7cfe929a-32c9-5ef2-8690-322339963af8', 'Vitor', 'do Monte', 'PT', 186, 86, 34, 'ROLE_ST', 81),
};

export const ALL_PG_FIXTURES: PlayGoalsFixture[] = [
  FIXTURE_PG_WENDELIN_PIETSCH,
  FIXTURE_PG_ANTOINETTE_SIDIBE,
  FIXTURE_PG_JONATHAN_JONES,
  FIXTURE_PG_VITOR_DO_MONTE,
];
