'use client';

import { useMemo, useState } from 'react';
import { useSquadStore } from '@/lib/store/squad-store';
import { PlayerWithScores, Position, displayPosition } from '@/lib/scraper/types';
import {
  DevelopmentPriority,
  PRIORITY_CLASSES,
  PRIORITY_LABELS,
  UpgradeEntry,
  useDevelopmentStore,
} from '@/lib/store/development-store';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sidebar } from '@/components/layout/Sidebar';
import { appPath } from '@/lib/app-url';

// ── Konstanten ──────────────────────────────────────────────────────────────

const RARITY_COLOR: Record<string, string> = {
  Basic: 'bg-slate-600',
  Uncommon: 'bg-green-700',
  Rare: 'bg-blue-700',
  Epic: 'bg-purple-700',
  Legendary: 'bg-amber-600',
  Mythic: 'bg-red-700',
  Common: 'bg-stone-500',
};

const RARITY_ORDER = ['Basic', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Common'];

const STAT_LABELS: Record<string, string> = {
  pac: 'Pace',
  sho: 'Shooting',
  pas: 'Passing',
  dri: 'Dribbling',
  def: 'Defending',
  phy: 'Physicality',
};

// GK stat keys — only shown for players with position === 'GK'
const GK_STAT_KEYS = [
  'div', 'reflexes', 'positioning', 'catching', 'parrying',
  'rushing', 'command_of_area', 'penalty_saving', 'throwing', 'kicking_power',
] as const;

function getDevelopmentScore(player: PlayerWithScores) {
  const bestFit = Math.max(...Object.values(player.fit_scores));
  const mainFit = player.fit_scores[player.position] ?? 0;
  const avgStats =
    Object.values(player.stats).reduce((sum, val) => sum + val, 0) /
    Object.values(player.stats).length;
  const roleBonus = bestFit - mainFit;
  return Math.round(
    bestFit * 0.45 + avgStats * 0.35 + player.overall * 0.2 + Math.max(0, roleBonus) * 0.25
  );
}

function suggestPriority(player: PlayerWithScores): DevelopmentPriority {
  const bestFit = Math.max(...Object.values(player.fit_scores));
  const mainFit = player.fit_scores[player.position] ?? 0;
  if (player.overall >= 65 && bestFit >= 72) return 'play_now';
  if (bestFit - mainFit >= 8 || getDevelopmentScore(player) >= 68) return 'train';
  if (player.overall < 55 && bestFit < 60) return 'sell';
  return 'bench';
}

// Retirement warning: OVR < 60 AND dev score low AND rarity not progressed
function getRetirementWarning(
  player: PlayerWithScores,
  rarityIndex: number
): string | null {
  const devScore = getDevelopmentScore(player);
  if (player.overall < 58 && devScore < 55 && rarityIndex <= 1) {
    return `${player.name} hat kaum Entwicklungspotenzial (Dev ${devScore}, OVR ${player.overall}) — ggf. aussortieren und ersetzen.`;
  }
  return null;
}

// Swap suggestion: find a benched player that fits BETTER than a playing player at same position
function getSwapSuggestions(players: PlayerWithScores[], playNow: PlayerWithScores[]) {
  const suggestions: { out: PlayerWithScores; in: PlayerWithScores; gain: number; pos: string }[] = [];
  const benched = players.filter((p) => !playNow.some((q) => q.id === p.id));

  playNow.forEach((active) => {
    const activeFit = active.fit_scores[active.position] ?? 0;
    benched.forEach((bench) => {
      // Check if bench player fits better at the active player's position
      const benchFit = bench.fit_scores[active.position] ?? 0;
      const gain = benchFit - activeFit;
      if (gain >= 8 && bench.overall >= active.overall - 5) {
        suggestions.push({ out: active, in: bench, gain, pos: active.position });
      }
    });
  });

  // Deduplicate: keep best gain per "out" slot
  const bestByOut = new Map<string, typeof suggestions[0]>();
  suggestions.forEach((s) => {
    const existing = bestByOut.get(s.out.id);
    if (!existing || s.gain > existing.gain) bestByOut.set(s.out.id, s);
  });

  return [...bestByOut.values()].sort((a, b) => b.gain - a.gain).slice(0, 5);
}

// ── Sub-Komponenten ─────────────────────────────────────────────────────────

function StatBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 80 ? 'bg-emerald-500' : value >= 65 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-slate-400 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(value, 99)}%` }}
        />
      </div>
      <span className="w-6 text-right font-mono text-slate-300">{value}</span>
    </div>
  );
}

function UpgradeModal({
  player,
  onClose,
  onAdd,
}: {
  player: PlayerWithScores;
  onClose: () => void;
  onAdd: (entry: UpgradeEntry) => void;
}) {
  const [ovrBefore, setOvrBefore] = useState(player.overall.toString());
  const [ovrAfter, setOvrAfter] = useState((player.overall + 1).toString());
  const [label, setLabel] = useState('');

  function submit() {
    const before = parseInt(ovrBefore, 10);
    const after = parseInt(ovrAfter, 10);
    if (isNaN(before) || isNaN(after) || !label.trim()) return;
    onAdd({
      date: new Date().toISOString().slice(0, 10),
      ovrBefore: before,
      ovrAfter: after,
      label: label.trim(),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-80 space-y-4 shadow-2xl">
        <p className="text-sm font-bold text-white">Upgrade eintragen — {player.name}</p>
        <div className="space-y-2">
          <label className="text-xs text-slate-400">Bezeichnung (z.B. Silber → Gold)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Upgrade-Label..."
            className="w-full rounded border border-slate-700 bg-slate-800 text-xs text-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-400">OVR vorher</label>
            <input
              type="number"
              value={ovrBefore}
              onChange={(e) => setOvrBefore(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 text-xs text-white px-2 py-1"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">OVR nachher</label>
            <input
              type="number"
              value={ovrAfter}
              onChange={(e) => setOvrAfter(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 text-xs text-white px-2 py-1"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            className="flex-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs py-1.5"
          >
            Eintragen
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-700 text-slate-400 text-xs py-1.5 hover:bg-slate-800"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayerDevCard({ player }: { player: PlayerWithScores }) {
  const { notesByPlayerId, setPriority, setNotes, resetPlayer, addUpgrade } =
    useDevelopmentStore();
  const tracked = notesByPlayerId[player.id];
  const priority = tracked?.priority ?? suggestPriority(player);
  const statEntries = Object.entries(player.stats) as [string, number][];
  const bestPos = Object.entries(player.fit_scores).sort(([, a], [, b]) => b - a)[0];
  const mainFit = player.fit_scores[player.position] ?? 0;
  const fitColor =
    mainFit >= 85 ? 'text-emerald-400' : mainFit >= 70 ? 'text-amber-400' : 'text-red-400';
  const developmentScore = getDevelopmentScore(player);
  const rarityIndex = RARITY_ORDER.indexOf(player.rarity);
  const retirementWarning = getRetirementWarning(player, rarityIndex);
  const upgradeHistory = tracked?.upgradeHistory ?? [];
  const aging = player.aging;
  const [minPotential, maxPotential] = aging?.potentialRange ?? [player.overall, player.overall];
  const potentialWidth = Math.max(1, maxPotential - minPotential);
  const potentialProgress = Math.max(
    0,
    Math.min(100, ((player.overall - minPotential) / potentialWidth) * 100),
  );
  const [showHistory, setShowHistory] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  return (
    <>
      {showUpgradeModal && (
        <UpgradeModal
          player={player}
          onClose={() => setShowUpgradeModal(false)}
          onAdd={(entry) => addUpgrade(player.id, entry)}
        />
      )}

      <Card className="border-slate-800 bg-slate-900/50">
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3 min-w-0">
              {player.image_url ? (
                <img
                  src={player.image_url}
                  alt={player.name}
                  className="h-12 w-12 rounded-full object-cover bg-slate-800 shrink-0"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-slate-800 grid place-items-center text-xs font-bold text-slate-400 shrink-0">
                  {player.overall}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-white text-sm truncate">{player.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-bold text-white ${RARITY_COLOR[player.rarity] ?? 'bg-slate-600'}`}
                >
                  {player.overall}
                </span>
                <span className="text-xs text-slate-500">{displayPosition(player.position)}</span>
                <span className={`text-xs font-mono font-bold ${fitColor}`}>
                  Meta {mainFit.toFixed(0)}
                </span>
                  <span className="text-xs font-mono text-cyan-300">Dev {developmentScore}</span>
                </div>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Beste Pos.</p>
              <p className="font-bold text-emerald-400">
                {bestPos?.[0] ? displayPosition(bestPos[0] as Position) : "-"} ({bestPos?.[1].toFixed(0)})
              </p>
            </div>
          </div>

          {/* Retirement Warning */}
          {retirementWarning && (
            <div className="rounded-lg bg-red-950/40 border border-red-900 px-2 py-1.5 text-[11px] text-red-300 flex items-start gap-1.5">
              <span className="shrink-0">🚨</span>
              <span>{retirementWarning}</span>
            </div>
          )}

          {/* Status-Kacheln */}
          <div className="rounded-lg bg-slate-800/50 p-2 text-xs grid grid-cols-3 gap-2">
            <div>
              <p className="text-slate-500">Spielzeit</p>
              <p className="text-white font-mono">{tracked?.minutesPlayed ?? 0}m</p>
            </div>
            <div>
              <p className="text-slate-500">XP grob</p>
              <p className="text-white font-mono">{tracked?.xpEstimate ?? 0}</p>
            </div>
            <div>
              <p className="text-slate-500">Status</p>
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(player.id, event.target.value as DevelopmentPriority)
                }
                className={`mt-0.5 w-full rounded border px-1 py-0.5 text-[11px] ${PRIORITY_CLASSES[priority]}`}
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Potential-Bar from goalsverse aging data */}
          <div className="rounded-lg bg-slate-800/50 p-2 text-xs space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400">Potential</span>
              {aging ? (
                <span className="font-mono text-emerald-300">
                  Alter {aging.currentAge} · Ziel {aging.targetRating} · {aging.upgradesRemaining} Upgrades
                </span>
              ) : (
                <span className="font-mono text-slate-500">Keine Aging-Daten</span>
              )}
            </div>
            {aging && (
              <>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Min {minPotential}</span>
                  <span>{player.overall} / {maxPotential}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-cyan-400"
                    style={{ width: `${potentialProgress}%` }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Stat-Bars — Feldspieler zeigen 6 Gruppen, GK zeigen nur GK-Stats */}
          <div className="space-y-1.5">
            {player.position === 'GK'
              ? GK_STAT_KEYS.map((key) => {
                  const val = (player.stats as unknown as Record<string, number>)[key];
                  if (typeof val !== 'number' || val === 0) return null;
                  return <StatBar key={key} label={STAT_LABELS[key] ?? key} value={val} />;
                })
              : statEntries
                  .filter(([key]) => !(GK_STAT_KEYS as readonly string[]).includes(key))
                  .map(([key, val]) => (
                    <StatBar key={key} label={STAT_LABELS[key] ?? key} value={val} />
                  ))
            }
          </div>

          {/* Upgrade-Tracker ─────────────────────────────────────────────── */}
          <div className="rounded-lg bg-slate-800/40 border border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs text-slate-400 font-medium">
                🏆 Upgrade-Verlauf ({upgradeHistory.length})
              </span>
              <div className="flex gap-2">
                {upgradeHistory.length > 0 && (
                  <button
                    onClick={() => setShowHistory((o) => !o)}
                    className="text-[11px] text-slate-500 hover:text-slate-300"
                  >
                    {showHistory ? 'einklappen' : 'anzeigen'}
                  </button>
                )}
                <button
                  onClick={() => setShowUpgradeModal(true)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300"
                >
                  + Eintragen
                </button>
              </div>
            </div>

            {showHistory && upgradeHistory.length > 0 && (
              <div className="border-t border-slate-700 divide-y divide-slate-800">
                {upgradeHistory.map((entry, idx) => (
                  <div key={idx} className="px-3 py-1.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-white">{entry.label}</p>
                      <p className="text-[11px] text-slate-500">{entry.date}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-slate-500 font-mono">
                        {entry.ovrBefore}
                      </span>
                      <span className="text-[11px] text-slate-600"> → </span>
                      <span className="text-[11px] text-emerald-400 font-mono font-bold">
                        {entry.ovrAfter}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notizen */}
          <textarea
            value={tracked?.notes ?? ''}
            onChange={(event) => setNotes(player.id, event.target.value)}
            placeholder="Notiz: Rolle, Gefühl im Spiel, nächste Tests..."
            className="min-h-16 w-full rounded-lg border border-slate-700 bg-slate-950/60 p-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          {tracked && (
            <button
              onClick={() => resetPlayer(player.id)}
              className="text-[11px] text-slate-500 hover:text-red-300"
            >
              Tracking für diesen Spieler zurücksetzen
            </button>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ── Swap-Empfehlungen ────────────────────────────────────────────────────────

function SwapSuggestionPanel({ players }: { players: PlayerWithScores[] }) {
  const { notesByPlayerId } = useDevelopmentStore();
  const playNow = players.filter(
    (p) => (notesByPlayerId[p.id]?.priority ?? suggestPriority(p)) === 'play_now'
  );

  const swaps = useMemo(() => getSwapSuggestions(players, playNow), [players, playNow]);

  if (swaps.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-900 bg-amber-950/20 p-4 space-y-3">
      <p className="text-xs text-amber-400 uppercase tracking-wide font-medium">
        🔄 Swap-Empfehlungen
      </p>
      <p className="text-xs text-slate-400">
        Spieler auf der Bank könnten deine Startelf verbessern:
      </p>
      <div className="space-y-2">
        {swaps.map((s, i) => (
          <div
            key={i}
            className="rounded-lg bg-slate-900/60 border border-slate-800 p-3 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <p className="text-xs text-white">
                <span className="text-red-400 font-medium">{s.out.name}</span>
                <span className="text-slate-500"> → </span>
                <span className="text-emerald-400 font-medium">{s.in.name}</span>
              </p>
              <p className="text-[11px] text-slate-500">
                Position: {displayPosition(s.pos as Position)} · Meta-Gewinn:{' '}
                <span className="text-emerald-400 font-mono">+{s.gain.toFixed(0)}</span>
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-500 shrink-0">
              <p>
                OVR {s.out.overall}{' '}
                <span className="text-slate-600">→</span> {s.in.overall}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hauptseite ───────────────────────────────────────────────────────────────

export default function DevelopmentPage() {
  const { players, _hasHydrated } = useSquadStore();
  const { notesByPlayerId } = useDevelopmentStore();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'overall' | 'fit' | 'potential' | 'tracked'>('tracked');
  const [filterPos, setFilterPos] = useState('all');

  const positions = useMemo(() => {
    const ps = new Set(players.map((p) => p.position));
    return ['all', ...Array.from(ps).sort()];
  }, [players]);

  const summary = useMemo(() => {
    const tracked = Object.values(notesByPlayerId);
    const minutes = tracked.reduce((sum, note) => sum + note.minutesPlayed, 0);
    const xp = tracked.reduce((sum, note) => sum + note.xpEstimate, 0);
    const playNow = players.filter(
      (player) =>
        (notesByPlayerId[player.id]?.priority ?? suggestPriority(player)) === 'play_now'
    ).length;
    const train = players.filter(
      (player) =>
        (notesByPlayerId[player.id]?.priority ?? suggestPriority(player)) === 'train'
    ).length;
    const retirementRisk = players.filter((player) => {
      const ri = RARITY_ORDER.indexOf(player.rarity);
      return getRetirementWarning(player, ri) !== null;
    }).length;
    const withAging = players.filter((player) => player.aging).length;
    const remainingUpgrades = players.reduce(
      (sum, player) => sum + (player.aging?.upgradesRemaining ?? 0),
      0,
    );
    return { minutes, xp, playNow, train, retirementRisk, withAging, remainingUpgrades };
  }, [notesByPlayerId, players]);

  const sorted = useMemo(() => {
    return [...players]
      .filter(
        (p) =>
          (filterPos === 'all' || p.position === filterPos) &&
          p.name.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        if (sortBy === 'overall') return b.overall - a.overall;
        if (sortBy === 'fit')
          return (
            (b.fit_scores[b.position] ?? 0) - (a.fit_scores[a.position] ?? 0)
          );
        if (sortBy === 'potential') return getDevelopmentScore(b) - getDevelopmentScore(a);
        const pa = notesByPlayerId[a.id]?.priority ?? suggestPriority(a);
        const pb = notesByPlayerId[b.id]?.priority ?? suggestPriority(b);
        const order: Record<DevelopmentPriority, number> = {
          play_now: 0,
          train: 1,
          bench: 2,
          sell: 3,
        };
        return order[pa] - order[pb] || getDevelopmentScore(b) - getDevelopmentScore(a);
      });
  }, [players, search, sortBy, filterPos, notesByPlayerId]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        {!_hasHydrated || players.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
            <p className="text-slate-400">Noch keine Spieler importiert.</p>
            <a href={appPath('/')} className="text-emerald-400 underline text-sm">
              Jetzt importieren
            </a>
          </div>
        ) : (
          <div className="space-y-5 max-w-7xl mx-auto">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-white">Development Center</h2>
                <p className="text-sm text-slate-500">
                  Spielzeit, XP-Schätzung, Upgrades und Entwicklungs-Prioritäten.
                </p>
              </div>
              <span className="text-sm text-slate-500">{sorted.length} Spieler</span>
            </div>

            {/* Summary-Kacheln */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-xs text-slate-500">Spielzeit getrackt</p>
                <p className="text-2xl font-bold text-white">{summary.minutes}m</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-xs text-slate-500">Aging-Daten</p>
                <p className="text-2xl font-bold text-white">{summary.withAging}</p>
              </div>
              <div className="rounded-xl border border-emerald-900 bg-emerald-950/30 p-3">
                <p className="text-xs text-emerald-500">Sofort spielen</p>
                <p className="text-2xl font-bold text-emerald-300">{summary.playNow}</p>
              </div>
              <div className="rounded-xl border border-amber-900 bg-amber-950/30 p-3">
                <p className="text-xs text-amber-500">Trainingskandidaten</p>
                <p className="text-2xl font-bold text-amber-300">{summary.train}</p>
              </div>
              <div className="rounded-xl border border-red-900 bg-red-950/30 p-3">
                <p className="text-xs text-red-500">🚨 Austauschkandidaten</p>
                <p className="text-2xl font-bold text-red-300">{summary.retirementRisk}</p>
              </div>
            </div>

            {/* Swap-Empfehlungen */}
            <SwapSuggestionPanel players={players} />

            {/* Filter-Zeile */}
            <div className="flex gap-3 flex-wrap">
              <Input
                placeholder="Spieler suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs border-slate-700 bg-slate-800 text-white"
              />
              <Select value={filterPos} onValueChange={setFilterPos}>
                <SelectTrigger className="w-32 border-slate-700 bg-slate-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {positions.map((p) => (
                    <SelectItem key={p} value={p} className="text-white focus:bg-slate-700">
                      {p === 'all' ? 'Alle Pos.' : displayPosition(p as Position)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-44 border-slate-700 bg-slate-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="tracked" className="text-white focus:bg-slate-700">
                    Nach Priorität
                  </SelectItem>
                  <SelectItem value="overall" className="text-white focus:bg-slate-700">
                    Nach OVR
                  </SelectItem>
                  <SelectItem value="fit" className="text-white focus:bg-slate-700">
                    Nach Meta-Score
                  </SelectItem>
                  <SelectItem value="potential" className="text-white focus:bg-slate-700">
                    Nach Dev-Score
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Spieler-Karten */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sorted.map((p) => (
                <PlayerDevCard key={p.id} player={p} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
