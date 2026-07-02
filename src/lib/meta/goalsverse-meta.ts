export interface LiveFormationMeta {
  key: string;
  matches: number;
  matchShare: number;
  players: number;
  playerShare: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  avgGoalDiff: number;
}

export interface LiveMetaSnapshot {
  generatedAt: string;
  source: 'goalsverse' | 'fallback';
  patch?: string;
  label?: string;
  matches?: number;
  formations: LiveFormationMeta[];
}

const GOALSVERSE_META_URL = 'https://goalsverse.com/v1/meta';

function extractEscapedJsonArray(html: string, propName: string): string | null {
  // Next/React flight payload embeds JSON escaped inside script strings, e.g.
  // \"formations\":[{\"key\":...}],\"buildup\"
  const marker = `\\"${propName}\\":[`;
  const start = html.indexOf(marker);
  if (start < 0) return null;

  let i = start + marker.length - 1; // points at [
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) {
        return html.slice(start + marker.length - 1, i + 1);
      }
    }
  }
  return null;
}

function unescapeFlightJson(raw: string): string {
  return raw
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\u0026/g, '&');
}

function extractWindowInfo(html: string) {
  const patch = html.match(/\\"patch\\":\\"([^\\"]+)\\"/)?.[1];
  const label = html.match(/\\"label\\":\\"([^\\"]+)\\"/)?.[1];
  const matches = html.match(/\\"window\\":\{\\"patch\\":\\"[^\\"]+\\",\\"label\\":\\"[^\\"]+\\",\\"matches\\":(\d+)/)?.[1];
  return { patch, label, matches: matches ? Number(matches) : undefined };
}

export async function fetchGoalsverseLiveMeta(): Promise<LiveMetaSnapshot> {
  const res = await fetch(GOALSVERSE_META_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 GOALS-Squad-Optimizer/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
    // Next route handler cache. It protects goalsverse from repeated calls.
    next: { revalidate: 60 * 30 },
  } as RequestInit & { next: { revalidate: number } });

  if (!res.ok) throw new Error(`goalsverse meta status ${res.status}`);
  const html = await res.text();
  const rawFormations = extractEscapedJsonArray(html, 'formations');
  if (!rawFormations) throw new Error('formations payload not found in goalsverse meta page');

  const formations = JSON.parse(unescapeFlightJson(rawFormations)) as LiveFormationMeta[];
  const windowInfo = extractWindowInfo(html);

  return {
    generatedAt: new Date().toISOString(),
    source: 'goalsverse',
    ...windowInfo,
    formations,
  };
}

export function findLiveFormation(
  snapshot: LiveMetaSnapshot | null,
  formationKey: string,
): LiveFormationMeta | null {
  if (!snapshot) return null;
  const normalized = formationKey.toLowerCase();
  return snapshot.formations.find((f) => f.key.toLowerCase() === normalized) ?? null;
}

export function liveWinratePercent(meta: LiveFormationMeta | null): number | null {
  return meta ? meta.winRate * 100 : null;
}

export function liveUsagePercent(meta: LiveFormationMeta | null): number | null {
  return meta ? meta.matchShare * 100 : null;
}
