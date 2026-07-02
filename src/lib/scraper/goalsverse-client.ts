import * as cheerio from 'cheerio';
import { ALL_POSITIONS, Player, PlayerStats, Position, Rarity } from './types';

const GOALSVERSE_BASE = 'https://goalsverse.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; GOALS Squad Optimizer/1.0)';

const POSITION_ALIASES: Record<string, Position> = {
  GK: 'GK',
  CB: 'CB',
  FB: 'RB',
  WB: 'RWB',
  DM: 'CDM',
  CM: 'CM',
  AM: 'CAM',
  WM: 'RM',
  WF: 'RW',
  CF: 'CF',
  ST: 'ST',
};

const POSITION_SET = new Set<string>(ALL_POSITIONS);

type GoalsverseFetchResult = {
  players: Player[];
  clubUrl?: string;
  clubName?: string;
  reason?: string;
};

type GoalsverseSearchUser = {
  userId?: string;
  username?: string;
  external_platforms?: {
    steam?: { persona_name?: string } | null;
    playstation?: { online_id?: string } | null;
    xbox?: { gamertag?: string } | null;
    epic?: { display_name?: string } | null;
  };
};

function clamp(value: number, fallback = 50): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(99, Math.round(value)));
}

function rarityFromOverall(overall: number): Rarity {
  if (overall >= 94) return 'Iconic';
  if (overall >= 90) return 'Mythic';
  if (overall >= 86) return 'Legendary';
  if (overall >= 80) return 'Epic';
  if (overall >= 72) return 'Rare';
  if (overall >= 62) return 'Uncommon';
  return 'Basic';
}

function normalizePosition(position: string, slotIndex: number): Position {
  const mapped = POSITION_ALIASES[position.toUpperCase()] ?? position.toUpperCase();
  if (mapped === 'RB' && slotIndex % 2 === 0) return 'LB';
  if (mapped === 'RWB' && slotIndex % 2 === 0) return 'LWB';
  if (mapped === 'RM' && slotIndex % 2 === 0) return 'LM';
  if (mapped === 'RW' && slotIndex % 2 === 0) return 'LW';
  return POSITION_SET.has(mapped) ? (mapped as Position) : 'CM';
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchHtml(pathOrUrl: string): Promise<string> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${GOALSVERSE_BASE}${pathOrUrl}`;
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
    },
    next: { revalidate: 60 * 15 },
  } as RequestInit & { next?: { revalidate: number } });

  if (!response.ok) {
    throw new Error(`goalsverse antwortet mit HTTP ${response.status}`);
  }
  return response.text();
}

async function fetchJson<T>(pathOrUrl: string): Promise<T> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${GOALSVERSE_BASE}${pathOrUrl}`;
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/json',
    },
    next: { revalidate: 60 * 15 },
  } as RequestInit & { next?: { revalidate: number } });

  if (!response.ok) {
    throw new Error(`goalsverse API antwortet mit HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function extractBodyText(html: string): string {
  const $ = cheerio.load(html);
  $('script,style,noscript').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function extractClubName(html: string, fallback: string): string {
  const $ = cheerio.load(html);
  const schema = $('script[type="application/ld+json"]').first().text();
  const match = schema.match(/"name"\s*:\s*"([^"]+)\s+—\s+GOALS stats"/);
  if (match?.[1]) return match[1];
  const title = $('title').text().replace(/\s+[-—]\s+.*$/, '').trim();
  return title || fallback;
}

function resolveDirectClubPath(input: string): string | null {
  const raw = input.trim();
  const uuid = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (uuid) return `/v1/club/${uuid}`;

  try {
    const url = new URL(raw);
    if (url.hostname.includes('goalsverse.com')) {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    // Not a URL; continue with slug handling.
  }

  if (raw.startsWith('/v1/club/') || raw.startsWith('/p/')) return raw;
  return null;
}

function normalizedName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, '');
}

function searchUserMatches(user: GoalsverseSearchUser, query: string): boolean {
  const wanted = normalizedName(query);
  const candidates = [
    user.username,
    user.external_platforms?.steam?.persona_name,
    user.external_platforms?.playstation?.online_id,
    user.external_platforms?.xbox?.gamertag,
    user.external_platforms?.epic?.display_name,
  ]
    .filter(Boolean)
    .map((value) => normalizedName(String(value)));

  return candidates.some((candidate) => candidate === wanted);
}

async function resolveViaSearchApi(clubName: string): Promise<string | null> {
  const data = await fetchJson<{ users?: GoalsverseSearchUser[] }>(
    `/api/v1/search?query=${encodeURIComponent(clubName.trim())}`
  );
  const users = data.users ?? [];
  const exact = users.find((user) => user.userId && searchUserMatches(user, clubName));
  const fallback = exact ?? users.find((user) => user.userId);
  return fallback?.userId ? `/v1/club/${fallback.userId}` : null;
}

async function resolveClubPath(clubName: string): Promise<string | null> {
  const direct = resolveDirectClubPath(clubName);
  if (direct) return direct;

  const viaSearch = await resolveViaSearchApi(clubName);
  if (viaSearch) return viaSearch;

  const html = await fetchHtml('/v1/clubs');
  const $ = cheerio.load(html);
  const wanted = clubName.trim().toLowerCase();
  const wantedSlug = slugify(clubName);
  let fallback: string | null = null;

  $('a[href^="/v1/club/"], a[href^="/p/"]').each((_, el) => {
    if (fallback) return;
    const href = String($(el).attr('href') ?? '');
    const text = $(el).text().replace(/\s+/g, ' ').trim().toLowerCase();
    const hrefSlug = slugify(href.split('/').pop() ?? '');
    if (text.includes(wanted) || hrefSlug === wantedSlug || href.toLowerCase().includes(wantedSlug)) {
      fallback = href;
    }
  });

  return fallback;
}

function statMapFromChunk(chunk: string): Record<string, number> {
  const stats: Record<string, number> = {};
  const statPattern = /(\d{1,2})(PAC|DRI|SHO|DEF|PAS|PHY|DIV|REF|HAN|AWA|DIS|ATH)/g;
  Array.from(chunk.matchAll(statPattern)).forEach((match) => {
    stats[match[2]] = clamp(Number(match[1]));
  });
  return stats;
}

function playerStatsFromGoalsverse(position: Position, overall: number, chunk: string): PlayerStats {
  const s = statMapFromChunk(chunk);

  if (position === 'GK') {
    return {
      pac: clamp(s.ATH ?? s.DIS ?? overall - 20, 45),
      sho: clamp(s.DIS ?? overall - 35, 25),
      pas: clamp(s.DIS ?? overall - 10, 55),
      dri: clamp(s.REF ?? overall - 25, 45),
      def: clamp(((s.DIV ?? overall) + (s.HAN ?? overall) + (s.AWA ?? overall)) / 3, overall),
      phy: clamp(s.ATH ?? overall - 5, 65),
      div: s.DIV,
      kic: s.DIS,
    };
  }

  return {
    pac: clamp(s.PAC ?? overall, overall),
    sho: clamp(s.SHO ?? overall, overall),
    pas: clamp(s.PAS ?? overall, overall),
    dri: clamp(s.DRI ?? overall, overall),
    def: clamp(s.DEF ?? overall, overall),
    phy: clamp(s.PHY ?? overall, overall),
  };
}

function parseSquadFromText(text: string, clubPath: string): Player[] {
  const start = text.indexOf('Current squad');
  if (start === -1) return [];

  const endCandidates = ['Accolades', 'VerseSight', 'Shot DNA', 'Recent matches']
    .map((marker) => text.indexOf(marker, start + 20))
    .filter((idx) => idx > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : Math.min(text.length, start + 9000);
  const squadText = text.slice(start, end);

  const tokenPattern = /([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]{1,28})(GK|CB|FB|WB|DM|CM|AM|WM|WF|CF|ST)(\d{2})(?:\d)?(\d{2})(.*?)(?=[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]{1,28}(?:GK|CB|FB|WB|DM|CM|AM|WM|WF|CF|ST)\d{2}(?:\d)?\d{2}|Defend|Balanced|Attack|Bench|$)/g;
  const players: Player[] = [];
  let slotIndex = 0;

  Array.from(squadText.matchAll(tokenPattern)).forEach((match) => {
    const rawName = match[1].trim();
    const rawPosition = match[2];
    const age = Number(match[3]);
    const overall = clamp(Number(match[4]));
    const statChunk = match[5];
    const position = normalizePosition(rawPosition, slotIndex);

    // Skip obvious UI fragments if the regex catches navigation/title text.
    if (rawName.length < 2 || rawName === 'Bench') return;

    players.push({
      id: `goalsverse-${slugify(clubPath)}-${slotIndex}-${slugify(rawName)}`,
      name: rawName,
      position,
      overall,
      rarity: rarityFromOverall(overall),
      stats: playerStatsFromGoalsverse(position, overall, statChunk),
      age: Number.isFinite(age) ? age : undefined,
    });
    slotIndex += 1;
  });

  return players;
}

export async function getClubRoster(clubName: string): Promise<GoalsverseFetchResult> {
  const path = await resolveClubPath(clubName);
  if (!path) {
    return { players: [], reason: `Club "${clubName}" wurde auf goalsverse nicht gefunden.` };
  }

  const html = await fetchHtml(path);
  const text = extractBodyText(html);
  const players = parseSquadFromText(text, path);

  return {
    players,
    clubUrl: `${GOALSVERSE_BASE}${path}`,
    clubName: extractClubName(html, clubName),
    reason: players.length ? undefined : 'Club gefunden, aber keine Current-squad-Spieler im HTML erkannt.',
  };
}
