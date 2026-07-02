'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSquadStore } from '@/lib/store/squad-store';
import { PlayerWithScores, Position, ALL_POSITIONS } from '@/lib/scraper/types';
import { Sidebar } from '@/components/layout/Sidebar';
import { appPath } from '@/lib/app-url';
import { Input } from '@/components/ui/input';
import { topWeightedStats } from '@/lib/scoring/position-fit';

const StatRadarChart = dynamic(
  () => import('@/components/charts/StatRadarChart').then((m) => m.StatRadarChart),
  { ssr: false, loading: () => <div className="h-60 flex items-center justify-center text-xs text-slate-500">Lade Chart…</div> }
);

// ── Farben / Rarity ──────────────────────────────────────────────────────────

const RARITY_COLOR: Record<string, string> = {
  Basic: 'bg-slate-600', Uncommon: 'bg-green-700', Rare: 'bg-blue-700',
  Epic: 'bg-purple-700', Legendary: 'bg-amber-600', Mythic: 'bg-red-700', Iconic: 'bg-cyan-700',
};
const RARITY_TEXT: Record<string, string> = {
  Basic: 'text-slate-300', Uncommon: 'text-green-300', Rare: 'text-blue-300',
  Epic: 'text-purple-300', Legendary: 'text-amber-300', Mythic: 'text-red-300', Iconic: 'text-cyan-300',
};
const RARITY_ORDER: Record<string, number> = {
  Basic: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5, Iconic: 6,
};

// ── Stat-Gruppen ─────────────────────────────────────────────────────────────

const STAT_GROUPS: { label: string; color: string; keys: string[] }[] = [
  { label: 'Pace',       color: 'text-sky-400',    keys: ['acceleration', 'sprint_speed'] },
  { label: 'Shooting',   color: 'text-rose-400',   keys: ['finishing', 'shot_power', 'long_shots', 'penalties', 'weak_foot', 'attacking_iq'] },
  { label: 'Passing',    color: 'text-amber-400',  keys: ['ground_pass', 'lofted_pass', 'through_pass', 'crossing', 'curve', 'free_kick_accuracy'] },
  { label: 'Dribbling',  color: 'text-purple-400', keys: ['sprint_dribbling', 'close_dribbling', 'skills', 'agility', 'balance', 'first_touch'] },
  { label: 'Defending',  color: 'text-emerald-400',keys: ['defensive_iq', 'stand_tackle', 'slide_tackle', 'jockeying', 'interceptions', 'blocking'] },
  { label: 'Physical',   color: 'text-orange-400', keys: ['strength', 'aggression', 'stamina', 'heading', 'jumping'] },
];

const GK_STATS: { label: string; color: string; keys: string[] } = {
  label: 'Goalkeeping', color: 'text-cyan-400',
  keys: ['div', 'reflexes', 'positioning', 'catching', 'parrying'],
};

const STAT_LABEL: Record<string, string> = {
  acceleration: 'Acceleration', sprint_speed: 'Sprint Speed',
  finishing: 'Finishing', shot_power: 'Shot Power', long_shots: 'Long Shots',
  penalties: 'Penalties', weak_foot: 'Weak Foot', attacking_iq: 'Attacking IQ',
  ground_pass: 'Ground Pass', lofted_pass: 'Lofted Pass', through_pass: 'Through Pass',
  crossing: 'Crossing', curve: 'Curve', free_kick_accuracy: 'FK Accuracy',
  sprint_dribbling: 'Sprint Drib.', close_dribbling: 'Close Drib.', skills: 'Skills',
  agility: 'Agility', balance: 'Balance', first_touch: 'First Touch',
  defensive_iq: 'Def. IQ', stand_tackle: 'Stand Tackle', slide_tackle: 'Slide Tackle',
  jockeying: 'Jockeying', interceptions: 'Interceptions', blocking: 'Blocking',
  strength: 'Strength', aggression: 'Aggression', stamina: 'Stamina',
  heading: 'Heading', jumping: 'Jumping',
  div: 'Diving', reflexes: 'Reflexes', positioning: 'Positioning',
  catching: 'Catching', parrying: 'Parrying',
};

// ── Hilfs-Hooks / -Funktionen ────────────────────────────────────────────────

type SortKey = 'name' | 'position' | 'overall' | 'rarity' | 'fit' | 'bestPos';
type SortDir = 'asc' | 'desc';

function fitColor(v: number) { return v >= 85 ? 'text-emerald-400' : v >= 70 ? 'text-amber-400' : 'text-red-400'; }
function fitBg(v: number)    { return v >= 85 ? 'bg-emerald-500'  : v >= 70 ? 'bg-amber-400'   : 'bg-red-500'; }
function statColor(v: number){ return v >= 85 ? 'bg-emerald-500'  : v >= 70 ? 'bg-sky-500'     : v >= 55 ? 'bg-amber-400' : 'bg-red-600'; }

function getBestPos(player: PlayerWithScores): [Position, number] {
  const entries = Object.entries(player.fit_scores) as [Position, number][];
  return entries.sort(([, a], [, b]) => b - a)[0] ?? [player.position, 0];
}

// ── Stat-Bar ─────────────────────────────────────────────────────────────────

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[10px] text-slate-400 w-24 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden min-w-[40px]">
        <div className={`h-full rounded-full ${statColor(value)}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-mono text-white w-6 text-right shrink-0">{value}</span>
    </div>
  );
}

// ── Inline Details-Panel ─────────────────────────────────────────────────────

function DetailsPanel({ player }: { player: PlayerWithScores }) {
  const stats = player.stats as unknown as Record<string, number>;
  const isGK  = player.position === 'GK';

  // top-5 contributing stats for this player's primary position
  const top5 = topWeightedStats(player, player.position, 5);

  // fit scores sorted desc, mark best alternative
  const fitEntries = (Object.entries(player.fit_scores) as [Position, number][])
    .sort(([, a], [, b]) => b - a);
  const [bestAltPos, bestAltFit] = fitEntries.find(([p]) => p !== player.position) ?? [null, 0];
  const mainFit = player.fit_scores[player.position] ?? 0;
  const altIsBetter = bestAltPos && (bestAltFit as number) - mainFit >= 10;

  const groups = isGK ? [GK_STATS, ...STAT_GROUPS] : STAT_GROUPS;

  return (
    <div className="bg-slate-950 border-t border-slate-800 px-4 pt-3 pb-4 space-y-4">

      {/* ── Top-5 Beitrags-Stats ── */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">
          Top-5 Stats für {player.position}
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

      {/* ── Alle Einzelstats – gruppiert ── */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 min-w-[280px]">
          {groups.map((group) => (
            <div key={group.label}>
              <p className={`text-[10px] uppercase tracking-widest font-semibold mb-1.5 ${group.color}`}>
                {group.label}
              </p>
              <div className="space-y-1">
                {group.keys.map((key) => {
                  const val = stats[key] ?? 0;
                  if (!isGK && val === 0 && GK_STATS.keys.includes(key)) return null;
                  return <StatBar key={key} label={STAT_LABEL[key] ?? key} value={val} />;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Fit-Scores alle 15 Positionen ── */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">
          Fit-Score alle Positionen
          {altIsBetter && (
            <span className="ml-2 text-amber-400 normal-case">
              → {bestAltPos} wäre +{((bestAltFit as number) - mainFit).toFixed(0)} besser
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_POSITIONS.map((pos) => {
            const sc = player.fit_scores[pos] ?? 0;
            const isCurrent = pos === player.position;
            const isBestAlt = pos === bestAltPos && altIsBetter;
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
                {pos} {sc}
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
    () => allPlayers.filter((p) => p.id !== playerA.id && p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8),
    [allPlayers, playerA.id, search]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <p className="font-bold text-white">{playerA.name}</p>
            <p className="text-xs text-slate-500">{playerA.position} · OVR {playerA.overall} · {playerA.rarity}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg px-2">✕</button>
        </div>
        <div className="p-4">
          <StatRadarChart playerA={playerA} playerB={playerB} size={240} />
        </div>
        <div className="px-4 pb-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Fit-Scores alle Positionen</p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(playerA.fit_scores) as [Position, number][])
              .sort(([, a], [, b]) => b - a)
              .map(([pos, score]) => (
                <span key={pos} className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                  score >= 85 ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                  : score >= 70 ? 'border-amber-800 bg-amber-950/30 text-amber-300'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400'
                }`}>
                  {pos} {score.toFixed(0)}
                </span>
              ))}
          </div>
        </div>
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

  const [search,        setSearch]        = useState('');
  const [filterPos,     setFilterPos]     = useState('all');
  const [filterRarity,  setFilterRarity]  = useState('all');
  const [sortKey,       setSortKey]       = useState<SortKey>('overall');
  const [sortDir,       setSortDir]       = useState<SortDir>('desc');
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithScores | null>(null);
  const [comparePlayer,  setComparePlayer]  = useState<PlayerWithScores | null>(null);

  const positions = useMemo(() => {
    const ps = new Set(players.map((p) => p.position));
    return ['all', ...Array.from(ps).sort()];
  }, [players]);

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
        if (sortKey === 'name')     diff = a.name.localeCompare(b.name);
        else if (sortKey === 'position') diff = a.position.localeCompare(b.position);
        else if (sortKey === 'overall')  diff = a.overall - b.overall;
        else if (sortKey === 'rarity')   diff = (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0);
        else if (sortKey === 'fit')      diff = (a.fit_scores[a.position] ?? 0) - (b.fit_scores[b.position] ?? 0);
        else if (sortKey === 'bestPos')  { const [,sa] = getBestPos(a); const [,sb] = getBestPos(b); diff = sa - sb; }
        return sortDir === 'asc' ? diff : -diff;
      });
  }, [players, search, filterPos, filterRarity, sortKey, sortDir]);

  const summary = useMemo(() => ({
    avgOvr: players.length ? Math.round(players.reduce((s, p) => s + p.overall, 0) / players.length) : 0,
    avgFit: players.length ? Math.round(players.reduce((s, p) => s + (p.fit_scores[p.position] ?? 0), 0) / players.length) : 0,
  }), [players]);

  function SortTh({ label, sk }: { label: string; sk: SortKey }) {
    const active = sortKey === sk;
    return (
      <th onClick={() => toggleSort(sk)}
        className={`px-3 py-2 text-left text-xs font-medium cursor-pointer select-none whitespace-nowrap ${active ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
        {label} {active ? (sortDir === 'desc' ? '▼' : '▲') : ''}
      </th>
    );
  }

  if (!_hasHydrated || players.length === 0) {
    return (
      <div className="flex h-screen">
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
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">

        {/* Radar-Overlay (Chart-Button) */}
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
              <p className="text-sm text-slate-500">{players.length} Spieler · Ø OVR {summary.avgOvr} · Ø Fit {summary.avgFit}</p>
            </div>
            <p className="text-xs text-slate-600">Details → alle Einzelstats · 📊 → Radar-Chart</p>
          </div>

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
              {positions.map((p) => <option key={p} value={p}>{p === 'all' ? 'Alle Pos.' : p}</option>)}
            </select>
            <select value={filterRarity} onChange={(e) => setFilterRarity(e.target.value)}
              className="h-8 rounded border border-slate-700 bg-slate-800 text-xs text-white px-2">
              {rarities.map((r) => <option key={r} value={r}>{r === 'all' ? 'Alle Raritäten' : r}</option>)}
            </select>
            <span className="ml-auto self-center text-xs text-slate-600">{sorted.length} Treffer</span>
          </div>

          {/* Tabelle */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-900 border-b border-slate-800">
                <tr>
                  <SortTh label="Name"      sk="name" />
                  <SortTh label="Pos"       sk="position" />
                  <SortTh label="OVR"       sk="overall" />
                  <SortTh label="Rarity"    sk="rarity" />
                  <SortTh label="Fit (Pos)" sk="fit" />
                  <SortTh label="Beste Pos" sk="bestPos" />
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Details</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Chart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sorted.map((player) => {
                  const mainFit = player.fit_scores[player.position] ?? 0;
                  const [bestPos, bestFit] = getBestPos(player);
                  const isWasted = bestPos !== player.position && bestFit - mainFit >= 10;
                  const isExpanded = expandedId === player.id;

                  return (
                    <>
                      <tr
                        key={player.id}
                        className={`transition-colors ${isExpanded ? 'bg-slate-800/20' : 'hover:bg-slate-800/30'}`}
                      >
                        {/* Name */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${RARITY_COLOR[player.rarity] ?? 'bg-slate-600'}`}>
                              {player.overall}
                            </span>
                            <div>
                              <p className="text-white font-medium text-xs">{player.name}</p>
                              {isWasted && (
                                <p className="text-[10px] text-amber-400">↑ {bestPos} +{(bestFit - mainFit).toFixed(0)}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Position */}
                        <td className="px-3 py-2.5 text-xs text-slate-400">{player.position}</td>

                        {/* OVR */}
                        <td className="px-3 py-2.5 text-xs font-mono font-bold text-white">{player.overall}</td>

                        {/* Rarity */}
                        <td className="px-3 py-2.5">
                          <span className={`text-[11px] font-medium ${RARITY_TEXT[player.rarity] ?? 'text-slate-400'}`}>
                            {player.rarity}
                          </span>
                        </td>

                        {/* Fit */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${fitBg(mainFit)}`} style={{ width: `${mainFit}%` }} />
                            </div>
                            <span className={`text-[11px] font-mono ${fitColor(mainFit)}`}>{mainFit.toFixed(0)}</span>
                          </div>
                        </td>

                        {/* Beste Pos */}
                        <td className="px-3 py-2.5">
                          <span className="text-[11px] text-emerald-400 font-mono">{bestPos} {bestFit.toFixed(0)}</span>
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
                          <td colSpan={8} className="p-0">
                            <DetailsPanel player={player} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sorted.length === 0 && (
            <p className="text-center text-slate-500 text-sm py-8">Keine Spieler gefunden.</p>
          )}
        </div>
      </main>
    </div>
  );
}
