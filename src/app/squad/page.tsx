'use client';

import { Fragment, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSquadStore } from '@/lib/store/squad-store';
import { PlayerWithScores, Position, ALL_POSITIONS, displayPosition } from '@/lib/scraper/types';
import { Sidebar } from '@/components/layout/Sidebar';
import { appPath } from '@/lib/app-url';
import { Input } from '@/components/ui/input';
import { topWeightedStats } from '@/lib/scoring/position-fit';
import { analyzeSquad } from '@/lib/analysis/squad-analysis';
import { RARITY_COLOR, RARITY_TEXT, RARITY_ORDER, STAT_LABEL } from '@/config/display-constants';
import { extractRawId, avatarUrl } from '@/lib/player-id';

const StatRadarChart = dynamic(
  () => import('@/components/charts/StatRadarChart').then((m) => m.StatRadarChart),
  { ssr: false, loading: () => <div className="h-60 flex items-center justify-center text-xs text-slate-500">Lade Chart…</div> }
);

// ── Stat-Gruppen ─────────────────────────────────────────────────────────────

// Field player groups — never shown for GK
const FIELD_STAT_GROUPS: { label: string; color: string; keys: string[] }[] = [
  { label: 'Pace',      color: 'text-sky-400',     keys: ['acceleration', 'sprint_speed'] },
  { label: 'Shooting',  color: 'text-rose-400',    keys: ['finishing', 'shot_power', 'long_shots', 'penalties', 'weak_foot', 'attacking_iq'] },
  { label: 'Passing',   color: 'text-amber-400',   keys: ['ground_pass', 'lofted_pass', 'through_pass', 'crossing', 'curve', 'free_kick_accuracy'] },
  { label: 'Dribbling', color: 'text-purple-400',  keys: ['sprint_dribbling', 'close_dribbling', 'skills', 'agility', 'balance', 'first_touch'] },
  { label: 'Defending', color: 'text-emerald-400', keys: ['defensive_iq', 'stand_tackle', 'slide_tackle', 'jockeying', 'interceptions', 'blocking'] },
  { label: 'Physical',  color: 'text-orange-400',  keys: ['strength', 'aggression', 'stamina', 'heading', 'jumping'] },
];

// Full GK group — all 10 goalkeeping stats
const GK_STAT_GROUP: { label: string; color: string; keys: string[] } = {
  label: 'Goalkeeping',
  color: 'text-cyan-400',
  keys: ['div', 'reflexes', 'positioning', 'catching', 'parrying', 'rushing', 'command_of_area', 'penalty_saving', 'throwing', 'kicking_power'],
};

// ── Hilfs-Funktionen ─────────────────────────────────────────────────────────

type SortKey = 'name' | 'position' | 'overall' | 'rarity' | 'fit' | 'bestPos';
type SortDir = 'asc' | 'desc';

function metaColor(v: number) { return v >= 85 ? 'text-emerald-400' : v >= 70 ? 'text-amber-400' : 'text-red-400'; }
function metaBg(v: number)    { return v >= 85 ? 'bg-emerald-500'   : v >= 70 ? 'bg-amber-400'   : 'bg-red-500'; }
function statColor(v: number) { return v >= 85 ? 'bg-emerald-500'   : v >= 70 ? 'bg-sky-500'     : v >= 55 ? 'bg-amber-400' : 'bg-red-600'; }

function getBestPos(player: PlayerWithScores): [Position, number] {
  const entries = Object.entries(player.fit_scores) as [Position, number][];
  const sorted = entries.sort(([, a], [, b]) => b - a);
  const best = sorted[0];

  if (!best || best[1] < 5) {
    return [player.position, player.fit_scores[player.position] ?? 0];
  }

  return best;
}

// ── Avatar ───────────────────────────────────────────────────────────────────

function rawIdForPlayer(player: PlayerWithScores): string | undefined {
  return extractRawId(player.id) || undefined;
}

function imageUrlForPlayer(player: PlayerWithScores): string | undefined {
  if (player.image_url) return player.image_url;

  // Backfill for persisted squads imported before image_url existed.
  return avatarUrl(player.id) || undefined;
}

function playGoalsUrlForPlayer(player: PlayerWithScores): string | undefined {
  const rawId = rawIdForPlayer(player);

  return rawId ? `https://playgoals.com/en/player/${rawId}` : undefined;
}

function PlayerAvatar({
  player, size = 32,
}: { player: PlayerWithScores; size?: number }) {
  const [error, setError] = useState(false);
  const imageUrl = imageUrlForPlayer(player);

  if (error || !imageUrl) {
    // Fallback: coloured circle with OVR number
    return (
      <span
        className={`rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${RARITY_COLOR[player.rarity] ?? 'bg-slate-600'}`}
        style={{ width: size, height: size, fontSize: size < 40 ? 11 : 16 }}
      >
        {player.overall}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      onError={() => setError(true)}
      className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

// ── Stat-Bar ─────────────────────────────────────────────────────────────────

function StatBar({ label, value, missing = false }: { label: string; value: number; missing?: boolean }) {
  if (missing) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[10px] text-slate-400 w-28 shrink-0 truncate">{label}</span>
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden min-w-[40px]" />
        <span className="text-[10px] font-mono text-slate-600 w-6 text-right shrink-0">—</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[10px] text-slate-400 w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden min-w-[40px]">
        <div className={`h-full rounded-full ${statColor(value)}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-[10px] font-mono text-white w-6 text-right shrink-0">{value || '—'}</span>
    </div>
  );
}

// ── Inline Details-Panel ─────────────────────────────────────────────────────

function DetailsPanel({ player }: { player: PlayerWithScores }) {
  const stats   = player.stats as unknown as Record<string, number>;
  const isGK    = player.position === 'GK';
  // basic = only role/OVR data, no individual stats available
  const isBasic = player.dataQuality === 'basic';

  // top-5 contributing stats for this player's position
  const top5 = topWeightedStats(player, player.position, 5);

  // Meta-scores sorted desc, find best alternative
  const metaEntries = (Object.entries(player.fit_scores) as [Position, number][])
    .sort(([, a], [, b]) => b - a);
  const [bestAltPos, bestAltFit] = metaEntries.find(([p]) => p !== player.position) ?? [null, 0];
  const mainMeta  = player.fit_scores[player.position] ?? 0;
  const altBetter = bestAltPos && (bestAltFit as number) - mainMeta >= 10;

  // GK sees only GK stats; field players see only field stat groups
  const groups = isGK ? [GK_STAT_GROUP] : FIELD_STAT_GROUPS;

  return (
    <div className="bg-slate-950 border-t border-slate-800 px-4 pt-3 pb-4 space-y-4">

      {/* ── Header: Avatar + Name ── */}
      <div className="flex items-center gap-3">
        <PlayerAvatar player={player} size={80} />
        <div>
          <p className="text-sm font-bold text-white">{player.name}</p>
          <p className="text-xs text-slate-400">
            {displayPosition(player.position)} · OVR {player.overall} · {player.rarity}
            {player.height_cm && <> · {player.height_cm} cm</>}
            {player.preferred_foot && <> · {player.preferred_foot === 'left' ? 'Links' : 'Rechts'}</>}
          </p>
          {player.aging && (
            <p className="text-[11px] text-slate-500 mt-0.5">
              Alter: {player.aging.currentAge} | Potential: {player.aging.potentialRange[0]}–{player.aging.potentialRange[1]} | Upgrades: {player.aging.upgradesRemaining}
            </p>
          )}
          {(player.matches_played !== undefined || player.goals !== undefined) && (
            <p className="text-[11px] text-slate-500 mt-0.5">
              {player.matches_played !== undefined && <>{player.matches_played} Spiele</>}
              {player.goals !== undefined && <> · {player.goals} Tore</>}
              {player.assists !== undefined && <> · {player.assists} Vorlagen</>}
            </p>
          )}
        </div>
      </div>

      {/* ── Top-5 Beitrags-Stats ── */}
      {top5.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">
            Top-5 Stats für {displayPosition(player.position)}
          </p>
          <div className="flex flex-wrap gap-2">
            {top5.map(({ stat, value, contribution }) => (
              <div key={stat} className="flex items-center gap-1 bg-slate-800/70 rounded px-2 py-1">
                <span className="text-[10px] text-slate-300">{STAT_LABEL[stat] ?? stat}</span>
                <span className="text-[10px] font-mono text-emerald-400">{value}</span>
                <span className="text-[9px] text-slate-600">(+{contribution.toFixed(0)})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Alle Einzelstats – gruppiert ── */}
      <div className="overflow-x-auto">
        {isBasic && (
          <p className="text-[10px] text-amber-500/80 mb-2">
            Nur Positions-OVR verfügbar — Einzelstats nicht geladen.
          </p>
        )}
        <div className={`grid gap-x-6 gap-y-3 min-w-[280px] ${
          isGK ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        }`}>
          {groups.map((group) => (
            <div key={group.label}>
              <p className={`text-[10px] uppercase tracking-widest font-semibold mb-1.5 ${group.color}`}>
                {group.label}
              </p>
              <div className="space-y-1">
                {group.keys.map((key) => {
                  const val = stats[key] ?? 0;
                  return <StatBar key={key} label={STAT_LABEL[key] ?? key} value={val} missing={isBasic} />;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Meta-Scores alle 15 Positionen ── */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">
          Meta-Score alle Positionen
          {altBetter && (
            <span className="ml-2 text-amber-400 normal-case">
              → {displayPosition(bestAltPos as Position)} wäre +{((bestAltFit as number) - mainMeta).toFixed(0)} besser
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_POSITIONS.map((pos) => {
            const sc        = player.fit_scores[pos] ?? 0;
            const isCurrent = pos === player.position;
            const isBestAlt = pos === bestAltPos && altBetter;
            return (
              <span
                key={pos}
                className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
                  isCurrent
                    ? 'border-emerald-600 bg-emerald-950/50 text-emerald-300 font-bold'
                    : isBestAlt
                    ? 'border-amber-600 bg-amber-950/40 text-amber-300 font-semibold'
                    : sc >= 80
                    ? 'border-sky-800 bg-sky-950/30 text-sky-300'
                    : sc >= 65
                    ? 'border-slate-600 bg-slate-800/40 text-slate-300'
                    : 'border-slate-800 bg-slate-900/20 text-slate-600'
                }`}
              >
                {displayPosition(pos)} {sc}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Radar-Overlay ─────────────────────────────────────────────────────────────

function RadarOverlay({
  playerA, playerB, allPlayers, onClose, onSelectCompare,
}: {
  playerA: PlayerWithScores;
  playerB: PlayerWithScores | null;
  allPlayers: PlayerWithScores[];
  onClose: () => void;
  onSelectCompare: (p: PlayerWithScores | null) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () => allPlayers
      .filter((p) => p.id !== playerA.id && p.name.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 8),
    [allPlayers, playerA.id, search]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">

        {/* Header mit Avatar */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <PlayerAvatar player={playerA} size={40} />
            <div>
              <p className="font-bold text-white">{playerA.name}</p>
              <p className="text-xs text-slate-500">
                {displayPosition(playerA.position)} · OVR {playerA.overall} · {playerA.rarity}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg px-2">✕</button>
        </div>

        {/* Chart */}
        <div className="p-4">
          <StatRadarChart playerA={playerA} playerB={playerB} size={240} />
        </div>

        {/* Meta-Scores */}
        <div className="px-4 pb-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Meta-Score alle Positionen</p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(playerA.fit_scores) as [Position, number][])
              .sort(([, a], [, b]) => b - a)
              .map(([pos, score]) => (
                <span key={pos} className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                  score >= 85 ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                  : score >= 70 ? 'border-amber-800 bg-amber-950/30 text-amber-300'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400'
                }`}>
                  {displayPosition(pos)} {score.toFixed(0)}
                </span>
              ))}
          </div>
        </div>

        {/* Vergleich */}
        <div className="border-t border-slate-800 px-4 py-3">
          <p className="text-xs text-slate-500 mb-2">Vergleich mit:</p>
          <Input
            placeholder="Spieler suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 h-7 text-xs border-slate-700 bg-slate-800 text-white"
          />
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {playerB && (
              <button onClick={() => onSelectCompare(null)}
                className="text-[11px] px-2 py-0.5 rounded bg-amber-900/50 border border-amber-800 text-amber-300">
                ✕ {playerB.name}
              </button>
            )}
            {filtered.map((p) => (
              <button key={p.id} onClick={() => onSelectCompare(p)}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  playerB?.id === p.id
                    ? 'bg-amber-900/50 border-amber-700 text-amber-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                }`}>
                {p.name} ({p.overall})
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────

export default function SquadPage() {
  const { players, clubName, _hasHydrated } = useSquadStore();

  const [search,          setSearch]          = useState('');
  const [filterPos,       setFilterPos]       = useState('all');
  const [filterRarity,    setFilterRarity]    = useState('all');
  const [sortKey,         setSortKey]         = useState<SortKey>('overall');
  const [sortDir,         setSortDir]         = useState<SortDir>('desc');
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [selectedPlayer,  setSelectedPlayer]  = useState<PlayerWithScores | null>(null);
  const [comparePlayer,   setComparePlayer]   = useState<PlayerWithScores | null>(null);

  const positions = useMemo(() => {
    return ['all', ...ALL_POSITIONS];
  }, []);

  const rarities = useMemo(() => {
    const rs = new Set(players.map((p) => p.rarity));
    return ['all', ...Array.from(rs).sort((a, b) => (RARITY_ORDER[a] ?? 0) - (RARITY_ORDER[b] ?? 0))];
  }, [players]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sorted = useMemo(() => {
    return [...players]
      .filter((p) => {
        if (filterPos !== 'all' && p.position !== filterPos) return false;
        if (filterRarity !== 'all' && p.rarity !== filterRarity) return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortKey === 'name')          diff = a.name.localeCompare(b.name);
        else if (sortKey === 'position') diff = a.position.localeCompare(b.position);
        else if (sortKey === 'overall')  diff = a.overall - b.overall;
        else if (sortKey === 'rarity')   diff = (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0);
        else if (sortKey === 'fit')      diff = (a.fit_scores[a.position] ?? 0) - (b.fit_scores[b.position] ?? 0);
        else if (sortKey === 'bestPos')  {
          const [, sa] = getBestPos(a);
          const [, sb] = getBestPos(b);
          diff = sa - sb;
        }
        return sortDir === 'asc' ? diff : -diff;
      });
  }, [players, search, filterPos, filterRarity, sortKey, sortDir]);

  const summary = useMemo(() => {
    if (!players.length) return { avgOvr: 0, avgMeta: 0, avgAge: null, totalUpgrades: 0, rarityDist: [] as { rarity: string; count: number; pct: number }[] };

    const avgOvr  = Math.round(players.reduce((s, p) => s + p.overall, 0) / players.length);
    const avgMeta = Math.round(players.reduce((s, p) => s + (p.fit_scores[p.position] ?? 0), 0) / players.length);

    // Age — only players where aging data is present
    const withAge = players.filter((p) => p.aging?.currentAge);
    const avgAge  = withAge.length
      ? Math.round((withAge.reduce((s, p) => s + (p.aging!.currentAge), 0) / withAge.length) * 10) / 10
      : null;

    // Total remaining upgrades across squad
    const totalUpgrades = players.reduce((s, p) => s + (p.aging?.upgradesRemaining ?? 0), 0);

    // Rarity distribution
    const rarityCount: Record<string, number> = {};
    for (const p of players) rarityCount[p.rarity] = (rarityCount[p.rarity] ?? 0) + 1;
    const rarityOrder = ['Mythic', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common', 'Basic'];
    const rarityDist = rarityOrder
      .filter((r) => rarityCount[r])
      .map((r) => ({ rarity: r, count: rarityCount[r], pct: Math.round((rarityCount[r] / players.length) * 100) }));

    return { avgOvr, avgMeta, avgAge, totalUpgrades, rarityDist };
  }, [players]);

  const analysis = useMemo(() => {
    if (players.length === 0) return null;
    return analyzeSquad(players);
  }, [players]);

  function SortTh({ label, sk }: { label: string; sk: SortKey }) {
    const active = sortKey === sk;
    return (
      <th
        onClick={() => toggleSort(sk)}
        className={`px-3 py-2 text-left text-xs font-medium cursor-pointer select-none whitespace-nowrap ${
          active ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        {label} {active ? (sortDir === 'desc' ? '▼' : '▲') : ''}
      </th>
    );
  }

  if (!_hasHydrated || players.length === 0) {
    return (
      <div className="page-shell">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-slate-400">Kein Kader geladen.</p>
            <a href={appPath('/')} className="text-emerald-400 underline text-sm">Zum Import</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <Sidebar />
      <main className="page-main">

        {/* Radar-Overlay */}
        {selectedPlayer && (
          <RadarOverlay
            playerA={selectedPlayer}
            playerB={comparePlayer}
            allPlayers={players}
            onClose={() => { setSelectedPlayer(null); setComparePlayer(null); }}
            onSelectCompare={setComparePlayer}
          />
        )}

        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">{clubName || 'Kader'}</h2>

            </div>
            <p className="text-xs text-slate-600">Details → alle Einzelstats · 📊 → Radar-Chart</p>
          </div>

          {/* ── Squad Stats ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Spieler */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Spieler</p>
              <p className="text-2xl font-bold text-white">{players.length}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">im Kader</p>
            </div>

            {/* Ø OVR */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Ø OVR</p>
              <p className={`text-2xl font-bold ${summary.avgOvr >= 85 ? 'text-emerald-400' : summary.avgOvr >= 75 ? 'text-amber-400' : 'text-slate-200'}`}>
                {summary.avgOvr}
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5">Overall Rating</p>
            </div>

            {/* Ø Meta */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Ø Meta</p>
              <p className={`text-2xl font-bold ${summary.avgMeta >= 80 ? 'text-emerald-400' : summary.avgMeta >= 68 ? 'text-amber-400' : 'text-slate-200'}`}>
                {summary.avgMeta}
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5">Position-Fit</p>
            </div>

            {/* Ø Alter */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Ø Alter</p>
              {summary.avgAge !== null ? (
                <>
                  <p className={`text-2xl font-bold ${summary.avgAge <= 24 ? 'text-emerald-400' : summary.avgAge <= 28 ? 'text-amber-400' : 'text-red-400'}`}>
                    {summary.avgAge}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-0.5">Jahre</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-slate-600">—</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">keine Daten</p>
                </>
              )}
            </div>

            {/* Upgrades */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Upgrades</p>
              <p className={`text-2xl font-bold ${summary.totalUpgrades > 0 ? 'text-purple-400' : 'text-slate-600'}`}>
                {summary.totalUpgrades > 0 ? summary.totalUpgrades : '—'}
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5">verbleibend</p>
            </div>

            {/* Rarity-Mix */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Rarity-Mix</p>
              {summary.rarityDist.length > 0 ? (
                <div className="space-y-1 mt-1">
                  {/* Stacked bar */}
                  <div className="flex h-2 rounded-full overflow-hidden gap-px">
                    {summary.rarityDist.map(({ rarity, pct }) => (
                      <div
                        key={rarity}
                        title={`${rarity}: ${pct}%`}
                        style={{ width: `${pct}%` }}
                        className={`h-full ${RARITY_COLOR[rarity] ?? 'bg-slate-600'}`}
                      />
                    ))}
                  </div>
                  {/* Top-2 legend */}
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {summary.rarityDist.slice(0, 3).map(({ rarity, count }) => (
                      <span key={rarity} className={`text-[10px] ${RARITY_TEXT[rarity] ?? 'text-slate-400'}`}>
                        {rarity[0]} ×{count}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-2xl font-bold text-slate-600">—</p>
              )}
            </div>
          </div>

          {/* ── Kaderanalyse ── */}
          {analysis && (analysis.strengths.length > 0 || analysis.weaknesses.length > 0) && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="text-emerald-400">⚡</span> Kaderanalyse
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Stärken + Baustellen */}
                <div className="space-y-3">
                  {analysis.strengths.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1.5">Stärken</p>
                      <ul className="space-y-1">
                        {analysis.strengths.map((s, i) => (
                          <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                            <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.weaknesses.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-amber-400 mb-1.5">Baustellen</p>
                      <ul className="space-y-1">
                        {analysis.weaknesses.map((w, i) => (
                          <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                            <span className="text-amber-500 mt-0.5 shrink-0">!</span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Empfehlungen + Schlüsselspieler */}
                <div className="space-y-3">
                  {analysis.recommendations.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-sky-400 mb-1.5">Empfehlungen</p>
                      <ul className="space-y-1">
                        {analysis.recommendations.map((r, i) => (
                          <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                            <span className="text-sky-500 mt-0.5 shrink-0">→</span>
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.keyPlayers.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-purple-400 mb-1.5">Schlüsselspieler</p>
                      <ul className="space-y-1">
                        {analysis.keyPlayers.map((kp) => (
                          <li key={kp.playerId} className="text-xs text-slate-300">
                            <span className="text-white font-medium">{kp.name}</span>
                            <span className="text-slate-500">
                              {' '}— {kp.archetypes.map((a) => a.type).join(', ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Filter */}
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 text-xs border-slate-700 bg-slate-800 text-white"
            />
            <select value={filterPos} onChange={(e) => setFilterPos(e.target.value)}
              className="h-8 rounded border border-slate-700 bg-slate-800 text-xs text-white px-2">
              {positions.map((p) => (
                <option key={p} value={p}>
                  {p === 'all' ? 'Alle Pos.' : displayPosition(p as Position)}
                </option>
              ))}
            </select>
            <select value={filterRarity} onChange={(e) => setFilterRarity(e.target.value)}
              className="h-8 rounded border border-slate-700 bg-slate-800 text-xs text-white px-2">
              {rarities.map((r) => (
                <option key={r} value={r}>{r === 'all' ? 'Alle Raritäten' : r}</option>
              ))}
            </select>
            <span className="ml-auto self-center text-xs text-slate-600">{sorted.length} Treffer</span>
          </div>

          {/* ── Mobile Card-Liste (< lg) ── */}
          <div className="lg:hidden space-y-2">
            {sorted.map((player) => {
              const mainMeta  = player.fit_scores[player.position] ?? 0;
              const [bestPos, bestFit] = getBestPos(player);
              const isWasted   = bestPos !== player.position && bestFit - mainMeta >= 10;
              const isExpanded = expandedId === player.id;

              return (
                <div key={player.id} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                  {/* Card Header — tap to expand.
                      Uses div+role instead of <button> to avoid nested-button HTML violation
                      (the action buttons 📊 and 🔗 inside are interactive elements themselves). */}
                  <div
                    role="button"
                    tabIndex={0}
                    className="w-full text-left p-3 flex items-center gap-3 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : player.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedId(isExpanded ? null : player.id);
                      }
                    }}
                  >
                    <PlayerAvatar player={player} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white truncate">{player.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold text-white ${RARITY_COLOR[player.rarity] ?? 'bg-slate-600'}`}>
                          {player.rarity[0]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-400">{displayPosition(player.position)}</span>
                        <span className="text-xs font-mono text-white">{player.overall}</span>
                        <span className={`text-xs font-mono ${metaColor(mainMeta)}`}>Meta {mainMeta.toFixed(0)}</span>
                        {isWasted && (
                          <span className="text-[10px] text-amber-400">
                            ↑ {displayPosition(bestPos)} +{(bestFit - mainMeta).toFixed(0)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {playGoalsUrlForPlayer(player) && (
                        <a
                          href={playGoalsUrlForPlayer(player)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-500 hover:text-sky-400 text-sm"
                          title="Spielerprofil öffnen"
                        >
                          ↗
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedPlayer(player); setComparePlayer(null); }}
                        className="text-slate-500 hover:text-emerald-400 text-sm"
                        title="Radar-Chart öffnen"
                      >
                        📊
                      </button>
                      <span className="text-slate-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {/* Expanded Details */}
                  {isExpanded && <DetailsPanel player={player} />}
                </div>
              );
            })}
            {sorted.length === 0 && (
              <p className="text-center text-slate-500 text-sm py-8">Keine Spieler gefunden.</p>
            )}
          </div>

          {/* ── Desktop Tabelle (lg+) ── */}
          <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[800px] text-sm border-collapse">
              <thead className="bg-slate-900 border-b border-slate-800">
                <tr>
                  <SortTh label="Name"            sk="name" />
                  <SortTh label="Pos"             sk="position" />
                  <SortTh label="OVR"             sk="overall" />
                  <SortTh label="Rarity"          sk="rarity" />
                  <SortTh label="Meta (Pos)"      sk="fit" />
                  <SortTh label="Beste Position"  sk="bestPos" />
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Profil</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Details</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Chart</th>

                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sorted.map((player) => {
                  const mainMeta  = player.fit_scores[player.position] ?? 0;
                  const [bestPos, bestFit] = getBestPos(player);
                  const isWasted   = bestPos !== player.position && bestFit - mainMeta >= 10;
                  const isExpanded = expandedId === player.id;

                  return (
                    // key must sit on the Fragment, not on the inner <tr>, so React
                    // can correctly diff sibling row-pairs (row + optional details row).
                    <Fragment key={player.id}>
                      <tr
                        className={`transition-colors ${isExpanded ? 'bg-slate-800/20' : 'hover:bg-slate-800/30'}`}
                      >
                        {/* Name + Avatar */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <PlayerAvatar player={player} size={32} />
                            <div>
                              <p className="text-white font-medium text-xs">{player.name}</p>
                              {isWasted && (
                                <p className="text-[10px] text-amber-400">
                                  ↑ {displayPosition(bestPos)} +{(bestFit - mainMeta).toFixed(0)}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Position */}
                        <td className="px-3 py-2.5 text-xs text-slate-400">
                          {displayPosition(player.position)}
                          {' '}
                          {(() => {
                            const pt = player.positionType?.[player.position] ?? 'primary';
                            return pt === 'primary' ? '🟢' : pt === 'secondary' ? '⚪' : '🔴';
                          })()}
                        </td>

                        {/* OVR */}
                        <td className="px-3 py-2.5 text-xs font-mono font-bold text-white">
                          {player.overall}
                        </td>

                        {/* Rarity */}
                        <td className="px-3 py-2.5">
                          <span className={`text-[11px] font-medium ${RARITY_TEXT[player.rarity] ?? 'text-slate-400'}`}>
                            {player.rarity}
                          </span>
                        </td>

                        {/* Meta-Score */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${metaBg(mainMeta)}`}
                                style={{ width: `${mainMeta}%` }}
                              />
                            </div>
                            <span className={`text-[11px] font-mono ${metaColor(mainMeta)}`}>
                              {mainMeta.toFixed(0)}
                            </span>
                          </div>
                        </td>

                        {/* Beste Position */}
                        <td className="px-3 py-2.5">
                          <span className="text-[11px] text-emerald-400 font-mono">
                            {displayPosition(bestPos)} {bestFit.toFixed(0)}
                          </span>
                        </td>

                        {/* Player profile link */}
                        <td className="px-3 py-2.5">
                          {playGoalsUrlForPlayer(player) && (
                            <a
                              href={playGoalsUrlForPlayer(player)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] px-2 py-0.5 rounded border border-sky-800 text-sky-400 hover:bg-sky-950/40 whitespace-nowrap"
                            >
                              Spieler öffnen
                            </a>
                          )}
                        </td>

                        {/* Details-Button */}
                        <td className="px-3 py-2.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(isExpanded ? null : player.id);
                            }}
                            className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                              isExpanded
                                ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300'
                                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                            }`}
                          >
                            {isExpanded ? '▲ Details' : '▼ Details'}
                          </button>
                        </td>

                        {/* Chart-Button */}
                        <td className="px-3 py-2.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPlayer(player);
                              setComparePlayer(null);
                            }}
                            className="text-[11px] px-2 py-0.5 rounded border border-emerald-800 text-emerald-400 hover:bg-emerald-950/40"
                          >
                            📊
                          </button>
                        </td>

                      </tr>

                      {/* Inline Expand-Panel */}
                      {isExpanded && (
                        <tr key={`${player.id}-details`}>
                          <td colSpan={9} className="p-0">
                            <DetailsPanel player={player} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sorted.length === 0 && (
            <p className="hidden lg:block text-center text-slate-500 text-sm py-8">Keine Spieler gefunden.</p>
          )}
        </div>
      </main>
    </div>
  );
}
