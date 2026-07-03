/**
 * Minimal HTML fixtures extracted from real goals-tracker.com responses.
 *
 * Each fixture contains two sections:
 *   1. The lime-badge header fragment (primary position + OVR + "full rating")
 *   2. The Positions pitch fragment ("Tap a position" + position buttons)
 *
 * Position data is from real tracker pages, fetched 2026-07-04.
 * The pitch shows different OVR numbers than Goalsverse ovr_roles —
 * that difference is the whole point of this enrichment layer.
 */

export interface TrackerFixture {
  characterId: string;
  expectedPosition: string;
  expectedOvr: number;
  /** Expected roleRatings from the visible Positions pitch (Tracker OVR formula) */
  expectedRoleRatings: Record<string, number>;
  html: string;
}

// ── Builder ────────────────────────────────────────────────────────────────

/**
 * Build a minimal but structurally accurate HTML fixture.
 *
 * @param primaryPosition - the lime-badge position label
 * @param primaryOvr      - OVR shown in the badge
 * @param pitchButtons    - array of [posLabel, rating, isPrimary] for the pitch
 */
function buildFixture(
  primaryPosition: string,
  primaryOvr: number,
  pitchButtons: Array<[string, number, boolean]>,
): string {
  // ── 1. Primary badge (from the attributes panel header) ──────────────────
  const badgeHtml = [
    `<div class="ml-auto shrink-0 whitespace-nowrap">`,
    `<div class="flex items-center gap-1.5">`,
    // Lime badge
    `<span class="rounded px-2 py-0.5 text-[10px] font-black uppercase"`,
    ` style="background:#9EFF00;color:#1a1f25">${primaryPosition}</span>`,
    // OVR value
    `<span class="text-[13px] font-black tabular-nums" style="color:#9EFF00">`,
    `${primaryOvr}<!-- --> OVR</span>`,
    // "full rating" label
    `<span class="hidden text-[10px] tracking-[0.02em] text-white/40 md:inline">full rating</span>`,
    `</div></div>`,
  ].join('');

  // ── 2. Positions pitch section ────────────────────────────────────────────
  // Anchored by "Tap a position" — the parser uses this as the section start.
  const pitchButtonsHtml = pitchButtons
    .map(([pos, rating, isPrimary]) => {
      const bgColor = isPrimary ? '#9EFF00' : 'rgba(0,0,0,0.5)';
      const ratingColor = isPrimary
        ? 'color:#1a1f25'
        : 'color:rgba(255,255,255,0.7)';
      return [
        `<button type="button" class="group absolute flex flex-col items-center"`,
        ` style="background:${bgColor};border-color:rgba(255,255,255,0.12);cursor:pointer">`,
        `<span class="text-[10px] font-black uppercase leading-none"`,
        ` style="${isPrimary ? 'color:#1a1f25' : 'color:rgba(255,255,255,0.92)'}">`,
        `${pos}</span>`,
        `<span class="mt-0.5 text-[10px] font-black tabular-nums leading-none"`,
        ` style="${ratingColor}">${rating}</span>`,
        `</button>`,
      ].join('');
    })
    .join('');

  // GK is always disabled for field players
  const gkButton = [
    `<button type="button" disabled="" class="group absolute"`,
    ` style="background:rgba(0,0,0,0.28);border-color:rgba(255,255,255,0.12);`,
    `box-shadow:0 2px 8px rgba(0,0,0,0.45);cursor:default;z-index:10">`,
    `<span class="text-[10px] font-black uppercase leading-none"`,
    ` style="color:rgba(255,255,255,0.3)">GK</span>`,
    `</button>`,
  ].join('');

  const pitchHtml = [
    `<div class="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 p-4 md:p-5">`,
    `<div class="mb-3 flex items-end justify-between">`,
    `<span class="text-sm font-black uppercase tracking-wider text-white">Positions</span>`,
    `<span class="text-[9px] font-bold uppercase tracking-[0.12em] text-white/40">`,
    `Tap a position</span></div>`,
    // Football pitch SVG (minimal — just enough for the section anchor)
    `<div class="relative w-full overflow-hidden rounded-xl ring-1 ring-inset ring-white/10"`,
    ` style="aspect-ratio:16 / 9">`,
    `<svg viewBox="0 0 160 90" class="absolute inset-0 h-full w-full"></svg>`,
    gkButton,
    pitchButtonsHtml,
    `</div>`,
    // Primary/Secondary legend (closes the pitch section)
    `<div class="mt-3 flex items-center justify-center gap-3 border-t border-white/10 pt-3">`,
    `<span class="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/45">`,
    `<span class="inline-block h-2 w-2 rounded-full" style="background:#9EFF00"></span> Primary</span>`,
    `<span class="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/45">`,
    `<span class="inline-block h-2 w-2 rounded-full"`,
    ` style="background:rgba(255,255,255,0.45)"></span> Secondary</span>`,
    `</div></div>`,
  ].join('');

  return `<!DOCTYPE html><html><body>${badgeHtml}${pitchHtml}</body></html>`;
}

// ── Real fixtures (data from goals-tracker.com, fetched 2026-07-04) ─────────

/**
 * Jonathan Jones — 6dbe494a-0568-58e9-bd59-30c331515659
 * Primary: AM (Tracker badge)
 * Tracker pitch ratings differ significantly from Goalsverse ovr_roles:
 *   Tracker:    AM:81, WM:79, CM:79, CF:79, WF:76, FB:76, CB:76, WB:76, DM:76, ST:76
 *   Goalsverse: DM:81, WB:81, CM:81, AM:81, WM:80, FB:76, CB:75 (all 81 is a 4-way tie)
 */
export const FIXTURE_JONATHAN_JONES: TrackerFixture = {
  characterId: '6dbe494a-0568-58e9-bd59-30c331515659',
  expectedPosition: 'AM',
  expectedOvr: 81,
  expectedRoleRatings: {
    AM: 81, WM: 79, CM: 79, CF: 79,
    WF: 76, FB: 76, CB: 76, WB: 76, DM: 76, ST: 76,
  },
  html: buildFixture('AM', 81, [
    // Pitch left-to-right, bottom-to-top as rendered by the tracker
    ['FB', 76, false], ['CB', 76, false], ['FB', 76, false],  // LB, CB, RB
    ['WB', 76, false], ['DM', 76, false], ['WB', 76, false],  // LWB, DM, RWB
    ['WM', 79, false], ['CM', 79, false], ['WM', 79, false],  // LM, CM, RM
    ['AM', 81, true],                                           // AM (primary)
    ['WF', 76, false], ['CF', 79, false], ['WF', 76, false],  // LW, CF, RW
    ['ST', 76, false],                                          // ST
  ]),
};

/**
 * Wendelin Pietsch — d6553983-f4d5-5923-8fe9-077939607a12
 * Primary: FB (Tracker badge)
 * Tracker shows CB:74, not CB:76 — Goalsverse has CB=FB=76 tie, Tracker corrects it.
 */
export const FIXTURE_WENDELIN_PIETSCH: TrackerFixture = {
  characterId: 'd6553983-f4d5-5923-8fe9-077939607a12',
  expectedPosition: 'FB',
  expectedOvr: 76,
  expectedRoleRatings: {
    FB: 76, WB: 76, CB: 74,
    WM: 74, CM: 71, DM: 71,
    AM: 71, WF: 71, CF: 71, ST: 71,
  },
  html: buildFixture('FB', 76, [
    ['FB', 76, true],  ['CB', 74, false], ['FB', 76, false],
    ['WB', 76, false], ['DM', 71, false], ['WB', 76, false],
    ['WM', 74, false], ['CM', 71, false], ['WM', 74, false],
    ['AM', 71, false],
    ['WF', 71, false], ['CF', 71, false], ['WF', 71, false],
    ['ST', 71, false],
  ]),
};

/**
 * Alfred Mengue — 8d45f3f7-5d7b-5ea1-b72d-890ec1dfa6f6
 * Primary: FB (Tracker badge)
 * Same Typ-A pattern as Pietsch — Tracker shows CB:73, not CB:75.
 */
export const FIXTURE_ALFRED_MENGUE: TrackerFixture = {
  characterId: '8d45f3f7-5d7b-5ea1-b72d-890ec1dfa6f6',
  expectedPosition: 'FB',
  expectedOvr: 75,
  expectedRoleRatings: {
    FB: 75, WB: 75, CB: 73,
    WM: 73, CM: 70, DM: 70,
    AM: 70, WF: 70, CF: 70, ST: 70,
  },
  html: buildFixture('FB', 75, [
    ['FB', 75, true],  ['CB', 73, false], ['FB', 75, false],
    ['WB', 75, false], ['DM', 70, false], ['WB', 75, false],
    ['WM', 73, false], ['CM', 70, false], ['WM', 73, false],
    ['AM', 70, false],
    ['WF', 70, false], ['CF', 70, false], ['WF', 70, false],
    ['ST', 70, false],
  ]),
};

/**
 * Elen de Mattos — 30ea7689-33ca-5b3e-bb95-6b0f094a7a1f
 * Primary: AM (Tracker badge)
 * Tracker: AM:70, CF:68, WM:68, CM:68 — Goalsverse has DM=WB=70 as top.
 */
export const FIXTURE_ELEN_DE_MATTOS: TrackerFixture = {
  characterId: '30ea7689-33ca-5b3e-bb95-6b0f094a7a1f',
  expectedPosition: 'AM',
  expectedOvr: 70,
  expectedRoleRatings: {
    AM: 70, WM: 68, CM: 68, CF: 68,
    FB: 65, CB: 65, WB: 65, DM: 65, WF: 65, ST: 65,
  },
  html: buildFixture('AM', 70, [
    ['FB', 65, false], ['CB', 65, false], ['FB', 65, false],
    ['WB', 65, false], ['DM', 65, false], ['WB', 65, false],
    ['WM', 68, false], ['CM', 68, false], ['WM', 68, false],
    ['AM', 70, true],
    ['WF', 65, false], ['CF', 68, false], ['WF', 65, false],
    ['ST', 65, false],
  ]),
};

/**
 * Antoinette Sidibe — 1b1bafcd-1317-54ca-992c-55b9e0fe4a77
 * Primary: CM (Tracker badge)
 * Tracker: CM:73, DM:71, WM:71, AM:71 — Goalsverse has WB=FB=DM=73 4-way tie.
 */
export const FIXTURE_ANTOINETTE_SIDIBE: TrackerFixture = {
  characterId: '1b1bafcd-1317-54ca-992c-55b9e0fe4a77',
  expectedPosition: 'CM',
  expectedOvr: 73,
  expectedRoleRatings: {
    CM: 73, DM: 71, WM: 71, AM: 71,
    FB: 68, CB: 68, WB: 68, WF: 68, CF: 68, ST: 68,
  },
  html: buildFixture('CM', 73, [
    ['FB', 68, false], ['CB', 68, false], ['FB', 68, false],
    ['WB', 68, false], ['DM', 71, false], ['WB', 68, false],
    ['WM', 71, false], ['CM', 73, true],  ['WM', 71, false],
    ['AM', 71, false],
    ['WF', 68, false], ['CF', 68, false], ['WF', 68, false],
    ['ST', 68, false],
  ]),
};

/**
 * Romário Vieira — b5b9e160-ee33-5ab6-82ab-4e660a067b6b
 * Primary: WF (Tracker badge)
 * WF:76 appears in the pitch but NOT in Goalsverse ovr_roles — badge + pitch are the only sources.
 */
export const FIXTURE_ROMARIO_VIEIRA: TrackerFixture = {
  characterId: 'b5b9e160-ee33-5ab6-82ab-4e660a067b6b',
  expectedPosition: 'WF',
  expectedOvr: 76,
  expectedRoleRatings: {
    WF: 76, WM: 74, CF: 74, ST: 74,
    FB: 71, CB: 71, WB: 71, DM: 71, CM: 71, AM: 71,
  },
  html: buildFixture('WF', 76, [
    ['FB', 71, false], ['CB', 71, false], ['FB', 71, false],
    ['WB', 71, false], ['DM', 71, false], ['WB', 71, false],
    ['WM', 74, false], ['CM', 71, false], ['WM', 74, false],
    ['AM', 71, false],
    ['WF', 76, true],  ['CF', 74, false], ['WF', 76, false],
    ['ST', 74, false],
  ]),
};

/**
 * Vitor do Monte — 7cfe929a-32c9-5ef2-8690-322339963af8
 * Primary: ST (Tracker badge)
 * ST:81 appears in the pitch but NOT in Goalsverse ovr_roles.
 */
export const FIXTURE_VITOR_DO_MONTE: TrackerFixture = {
  characterId: '7cfe929a-32c9-5ef2-8690-322339963af8',
  expectedPosition: 'ST',
  expectedOvr: 81,
  expectedRoleRatings: {
    ST: 81, WF: 79, CF: 79,
    WM: 76, CM: 76, AM: 76,
    FB: 76, CB: 76, WB: 76, DM: 76,
  },
  html: buildFixture('ST', 81, [
    ['FB', 76, false], ['CB', 76, false], ['FB', 76, false],
    ['WB', 76, false], ['DM', 76, false], ['WB', 76, false],
    ['WM', 76, false], ['CM', 76, false], ['WM', 76, false],
    ['AM', 76, false],
    ['WF', 79, false], ['CF', 79, false], ['WF', 79, false],
    ['ST', 81, true],
  ]),
};

export const ALL_FIXTURES: TrackerFixture[] = [
  FIXTURE_JONATHAN_JONES,
  FIXTURE_WENDELIN_PIETSCH,
  FIXTURE_ALFRED_MENGUE,
  FIXTURE_ELEN_DE_MATTOS,
  FIXTURE_ANTOINETTE_SIDIBE,
  FIXTURE_ROMARIO_VIEIRA,
  FIXTURE_VITOR_DO_MONTE,
];
