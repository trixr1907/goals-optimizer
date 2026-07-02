'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSquadStore } from '@/lib/store/squad-store';
import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { Sidebar } from '@/components/layout/Sidebar';
import { appPath } from '@/lib/app-url';
import { Input } from '@/components/ui/input';
import { StatTooltip } from '@/components/ui/StatTooltip';

// Recharts is client-only — use dynamic to skip SSR
const StatRadarChart = dynamic(
  () => import('@/components/charts/StatRadarChart').then((m) => m.StatRadarChart),
  { ssr: false, loading: () => <div className="h-60 flex items-center justify-center text-xs text-slate-500">Lade Chart…</div> }
);

// ── Konstanten ──────────────────────────────────────────────────────────────

const RARITY_COLOR: Record<string, string> = {
  Basic: 'bg-slate-600',
  Uncommon: 'bg-green-700',
  Rare: 'bg-blue-700',
  Epic: 'bg-purple-700',
  Legendary: 'bg-amber-600',
  Mythic: 'bg-red-700',
  Iconic: 'bg-cyan-700',
};

const RARITY_TEXT: Record<string, string> = {
  Basic: 'text-slate-300',
  Uncommon: 'text-green-300',
  Rare: 'text-blue-300',
  Epic: 'text-purple-300',
  Legendary: 'text-amber-300',
  Mythic: 'text-red-300',
  Iconic: 'text-cyan-300',
};

type SortKey = 'name' | 'position' | 'overall' | 'rarity' | 'fit' | 'bestPos';
type SortDir = 'asc' | 'desc';

const RARITY_ORDER: Record<string, number> = {
  Basic: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5, Iconic: 6,
};

// ── Hilfsfunktionen ─────────────────────────────────────────────────────────

function fitColor(fit: number) {
  if (fit >= 85) return 'text-emerald-400';
  if (fit >= 70) return 'text-amber-400';
  return 'text-red-400';
}

function fitBg(fit: number) {
  if (fit >= 85) return 'bg-emerald-500';
  if (fit >= 70) return 'bg-amber-400';
  return 'bg-red-500';
}

function getBestPos(player: PlayerWithScores): [Position, number] {
  const entries = Object.entries(player.fit_scores) as [Position, number][];
  return entries.sort(([, a], [, b]) => b - a)[0] ?? [player.position, 0];
}

// ── Radar-Overlay ────────────────────────────────────────────────────────────

function RadarOverlay({
  playerA,
  playerB,
  allPlayers,
  onClose,
  onSelectCompare,
}: {
  playerA: PlayerWithScores;
  playerB: PlayerWithScores | null;
  allPlayers: PlayerWithScores[];
  onClose: () => void;
  onSelectCompare: (p: PlayerWithScores | null) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () =>
      allPlayers
        .filter((p) => p.id !== playerA.id && p.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 8),
    [allPlayers, playerA.id, search]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <p className="font-bold text-white">{playerA.name}</p>
            <p className="text-xs text-slate-500">
              {playerA.position} · OVR {playerA.overall} · {playerA.rarity}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg px-2">✕</button>
        </div>

        {/* Chart */}
        <div className="p-4">
          <StatRadarChart playerA={playerA} playerB={playerB} size={240} />
        </div>

        {/* Fit-Scores */}
        <div className="px-4 pb-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Fit-Scores alle Positionen</p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(playerA.fit_scores) as [Position, number][])
              .sort(([, a], [, b]) => b - a)
              .map(([pos, score]) => (
                <span
                  key={pos}
                  className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                    score >= 85
                      ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                      : score >= 70
                      ? 'border-amber-800 bg-amber-950/30 text-amber-300'
                      : 'border-slate-700 bg-slate-800/50 text-slate-400'
                  }`}
                >
                  {pos} {score.toFixed(0)}
                </span>
              ))}
          </div>
        </div>

        {/* Vergleichsauswahl */}
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
              <button
                onClick={() => onSelectCompare(null)}
                className="text-[11px] px-2 py-0.5 rounded bg-amber-900/50 border border-amber-800 text-amber-300"
              >
                ✕ {playerB.name}
              </button>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelectCompare(p)}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  playerB?.id === p.id
                    ? 'bg-amber-900/50 border-amber-700 text-amber-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                }`}
              >
                {p.name} ({p.overall})
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Haupt-Komponente ─────────────────────────────────────────────────────────

export default function SquadPage() {
  const { players, clubName, _hasHydrated } = useSquadStore();

  const [search, setSearch] = useState('');
  const [filterPos, setFilterPos] = useState('all');
  const [filterRarity, setFilterRarity] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithScores | null>(null);
  const [comparePlayer, setComparePlayer] = useState<PlayerWithScores | null>(null);

  const positions = useMemo(() => {
    const ps = new Set(players.map((p) => p.position));
    return ['all', ...Array.from(ps).sort()];
  }, [players]);

  const rarities = useMemo(() => {
    const rs = new Set(players.map((p) => p.rarity));
    return ['all', ...Array.from(rs).sort((a, b) => (RARITY_ORDER[a] ?? 0) - (RARITY_ORDER[b] ?? 0))];
  }, [players]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
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
        if (sortKey === 'name') diff = a.name.localeCompare(b.name);
        else if (sortKey === 'position') diff = a.position.localeCompare(b.position);
        else if (sortKey === 'overall') diff = a.overall - b.overall;
        else if (sortKey === 'rarity') diff = (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0);
        else if (sortKey === 'fit') diff = (a.fit_scores[a.position] ?? 0) - (b.fit_scores[b.position] ?? 0);
        else if (sortKey === 'bestPos') {
          const [, sa] = getBestPos(a);
          const [, sb] = getBestPos(b);
          diff = sa - sb;
        }
        return sortDir === 'asc' ? diff : -diff;
      });
  }, [players, search, filterPos, filterRarity, sortKey, sortDir]);

  // Summary stats
  const summary = useMemo(() => {
    const avgOvr = players.length
      ? Math.round(players.reduce((s, p) => s + p.overall, 0) / players.length)
      : 0;
    const avgFit = players.length
      ? Math.round(
          players.reduce((s, p) => s + (p.fit_scores[p.position] ?? 0), 0) / players.length
        )
      : 0;
    return { avgOvr, avgFit };
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
            <p className="text-xs text-slate-600">Klick auf einen Spieler → Radar-Chart + Vergleich</p>
          </div>

          {/* Filter-Zeile */}
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 text-xs border-slate-700 bg-slate-800 text-white"
            />
            <select
              value={filterPos}
              onChange={(e) => setFilterPos(e.target.value)}
              className="h-8 rounded border border-slate-700 bg-slate-800 text-xs text-white px-2"
            >
              {positions.map((p) => (
                <option key={p} value={p}>{p === 'all' ? 'Alle Pos.' : p}</option>
              ))}
            </select>
            <select
              value={filterRarity}
              onChange={(e) => setFilterRarity(e.target.value)}
              className="h-8 rounded border border-slate-700 bg-slate-800 text-xs text-white px-2"
            >
              {rarities.map((r) => (
                <option key={r} value={r}>{r === 'all' ? 'Alle Raritäten' : r}</option>
              ))}
            </select>
            <span className="ml-auto self-center text-xs text-slate-600">{sorted.length} Treffer</span>
          </div>

          {/* Tabelle — scroll horizontal auf Mobile */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-900 border-b border-slate-800">
                <tr>
                  <SortTh label="Name" sk="name" />
                  <SortTh label="Pos" sk="position" />
                  <SortTh label="OVR" sk="overall" />
                  <SortTh label="Rarity" sk="rarity" />
                  <SortTh label="Fit (Pos)" sk="fit" />
                  <SortTh label="Beste Pos" sk="bestPos" />
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Stats</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Chart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sorted.map((player) => {
                  const mainFit = player.fit_scores[player.position] ?? 0;
                  const [bestPos, bestFit] = getBestPos(player);
                  const isWasted = bestPos !== player.position && bestFit - mainFit >= 10;

                  return (
                    <tr
                      key={player.id}
                      className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                      onClick={() => { setSelectedPlayer(player); setComparePlayer(null); }}
                    >
                      {/* Name */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${RARITY_COLOR[player.rarity] ?? 'bg-slate-600'}`}
                          >
                            {player.overall}
                          </span>
                          <div>
                            <p className="text-white font-medium text-xs">{player.name}</p>
                            {isWasted && (
                              <p className="text-[10px] text-amber-400">
                                ↑ {bestPos} wäre +{(bestFit - mainFit).toFixed(0)} besser
                              </p>
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

                      {/* Fit (Pos) */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${fitBg(mainFit)}`}
                              style={{ width: `${mainFit}%` }}
                            />
                          </div>
                          <span className={`text-[11px] font-mono ${fitColor(mainFit)}`}>
                            {mainFit.toFixed(0)}
                          </span>
                        </div>
                      </td>

                      {/* Beste Position */}
                      <td className="px-3 py-2.5">
                        <span className="text-[11px] text-emerald-400 font-mono">
                          {bestPos} {bestFit.toFixed(0)}
                        </span>
                      </td>

                      {/* Stats mini — with tooltip on each label */}
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5 text-[10px] font-mono text-slate-500 flex-wrap">
                          <StatTooltip statKey="acceleration"><span title="Pace">P{player.stats.pac}</span></StatTooltip>
                          <StatTooltip statKey="finishing"><span title="Shooting">S{player.stats.sho}</span></StatTooltip>
                          <StatTooltip statKey="ground_pass"><span title="Passing">A{player.stats.pas}</span></StatTooltip>
                          <StatTooltip statKey="sprint_dribbling"><span title="Dribbling">D{player.stats.dri}</span></StatTooltip>
                          <StatTooltip statKey="defensive_iq"><span title="Defending">V{player.stats.def}</span></StatTooltip>
                          <StatTooltip statKey="strength"><span title="Physicality">K{player.stats.phy}</span></StatTooltip>
                        </div>
                      </td>

                      {/* Chart Button */}
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
