'use client';

import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';

interface Props {
  myPlayers: PlayerWithScores[];
  opponentPlayers: PlayerWithScores[];
  myClubName: string;
  opponentClubName: string;
  myFormation?: string;
  mySlots?: LineupSlot[];
  myLineup?: Record<string, string | null>;
}

// ── Formation estimation ─────────────────────────────────────────────────────
// Given a pool of players, count their positions and map to a formation name.
// We use the top-11 players by overall rating (best available XI).

const FORMATION_TEMPLATES: { name: string; positions: Position[] }[] = [
  { name: '4-3-3', positions: ['GK','FB','CB','CB','FB','CM','CM','CM','WF','ST','WF'] },
  { name: '4-4-2', positions: ['GK','FB','CB','CB','FB','WM','CM','CM','WM','ST','ST'] },
  { name: '4-2-3-1', positions: ['GK','FB','CB','CB','FB','DM','DM','WM','AM','WM','ST'] },
  { name: '3-5-2', positions: ['GK','CB','CB','CB','WB','CM','CM','CM','WB','ST','ST'] },
  { name: '4-1-2-1-2', positions: ['GK','FB','CB','CB','FB','DM','CM','CM','AM','ST','ST'] },
  { name: '5-3-2', positions: ['GK','WB','CB','CB','CB','WB','CM','CM','CM','ST','ST'] },
  { name: '4-5-1', positions: ['GK','FB','CB','CB','FB','WM','CM','CM','CM','WM','ST'] },
  { name: '3-4-3', positions: ['GK','CB','CB','CB','WM','CM','CM','WM','WF','ST','WF'] },
];

function estimateFormation(players: PlayerWithScores[]): {
  name: string;
  rows: { position: Position; player: PlayerWithScores | undefined; fit: number }[][];
} {
  // Pick top 11 by overall
  const top11 = [...players].sort((a, b) => b.overall - a.overall).slice(0, 11);

  // Score each template against these 11 players (greedy best-fit assignment)
  let bestTemplate = FORMATION_TEMPLATES[0];
  let bestScore = -Infinity;

  for (const tmpl of FORMATION_TEMPLATES) {
    const pool = [...top11];
    let score = 0;
    for (const pos of tmpl.positions) {
      const idx = pool.reduce<number>((best, p, i) => {
        const s = p.fit_scores[pos] ?? 0;
        return s > (pool[best]?.fit_scores[pos] ?? 0) ? i : best;
      }, 0);
      score += pool[idx]?.fit_scores[pos] ?? 0;
      pool.splice(idx, 1);
    }
    if (score > bestScore) { bestScore = score; bestTemplate = tmpl; }
  }

  // Assign players to positions greedily
  const pool = [...top11];
  const assignments: { position: Position; player: PlayerWithScores | undefined; fit: number }[] = [];
  for (const pos of bestTemplate.positions) {
    if (pool.length === 0) { assignments.push({ position: pos, player: undefined, fit: 0 }); continue; }
    const idx = pool.reduce<number>((best, p, i) =>
      (p.fit_scores[pos] ?? 0) > (pool[best]?.fit_scores[pos] ?? 0) ? i : best, 0);
    const player = pool[idx];
    assignments.push({ position: pos, player, fit: player?.fit_scores[pos] ?? 0 });
    pool.splice(idx, 1);
  }

  // Group into rows by formation name (parse "4-3-3" → [1, 4, 3, 3])
  const counts = [1, ...bestTemplate.name.split('-').map(Number)]; // GK + lines
  const rows: typeof assignments[] = [];
  let offset = 0;
  for (const count of counts) {
    rows.push(assignments.slice(offset, offset + count));
    offset += count;
  }
  return { name: bestTemplate.name, rows };
}

// ── My formation from lineup store ──────────────────────────────────────────

function groupSlotsByRow(slots: LineupSlot[]): Position[][] {
  if (!slots.length) return [];
  const sorted = [...slots].sort((a, b) => b.y - a.y);
  const rows: LineupSlot[][] = [];
  let currentRow: LineupSlot[] = [];
  let lastY = sorted[0]?.y ?? 0;
  for (const slot of sorted) {
    if (Math.abs(slot.y - lastY) > 12 && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
    }
    currentRow.push(slot);
    lastY = slot.y;
  }
  if (currentRow.length > 0) rows.push(currentRow);
  return rows.map((row) => row.map((s) => s.position as Position));
}

// ── Dot colours ──────────────────────────────────────────────────────────────

function scoreColor(fit: number) {
  if (fit >= 85) return 'bg-emerald-500 border-emerald-400';
  if (fit >= 70) return 'bg-amber-500 border-amber-400';
  return 'bg-red-600 border-red-500';
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PlayerDot({
  name, fit, pos, dim = false,
}: { name: string; fit: number; pos: Position; dim?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 transition-opacity ${dim ? 'opacity-40' : ''}`}>
      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold text-white ${scoreColor(fit)}`}>
        {pos}
      </div>
      <p className="text-[8px] text-slate-300 max-w-[52px] truncate text-center leading-tight">{name || '—'}</p>
      <p className="text-[8px] font-mono text-slate-500">{fit > 0 ? fit : '?'}</p>
    </div>
  );
}

function FormationHalf({
  rows,
  flip = false,
}: {
  rows: { position: Position; player: PlayerWithScores | undefined; fit: number }[][];
  flip?: boolean;
}) {
  const orderedRows = flip ? [...rows].reverse() : rows;
  return (
    <div className="flex flex-col gap-2 w-full">
      {orderedRows.map((row, i) => (
        <div key={i} className="flex justify-center gap-1.5 flex-wrap">
          {row.map((a, j) => (
            <PlayerDot
              key={`${i}-${j}`}
              name={a.player?.name ?? '—'}
              fit={a.fit}
              pos={a.position}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function MatchupCanvas({
  myPlayers,
  opponentPlayers,
  myClubName,
  opponentClubName,
  myFormation,
  mySlots,
  myLineup,
}: Props) {
  // My team: use active lineup if set, else full squad
  const lineupIds = myLineup
    ? new Set(Object.values(myLineup).filter(Boolean) as string[])
    : new Set<string>();
  const hasActiveLineup = lineupIds.size >= 7;
  const myPool = hasActiveLineup
    ? myPlayers.filter((p) => lineupIds.has(p.id))
    : myPlayers;

  // Estimate my formation from slots (if lineup active) or infer from pool
  let myRows: { position: Position; player: PlayerWithScores | undefined; fit: number }[][];
  if (mySlots && mySlots.length > 0) {
    const posRows = groupSlotsByRow(mySlots);
    // Assign players to each slot position
    const pool = [...myPool];
    myRows = posRows.map((row) =>
      row.map((pos) => {
        const idx = pool.reduce<number>((best, p, i) =>
          (p.fit_scores[pos] ?? 0) > (pool[best]?.fit_scores[pos] ?? 0) ? i : best, 0);
        const player = pool.splice(idx, 1)[0];
        return { position: pos, player, fit: player?.fit_scores[pos] ?? 0 };
      })
    );
  } else {
    myRows = estimateFormation(myPool).rows;
  }

  const oppEstimate = estimateFormation(opponentPlayers);

  // Duell per position — highlight diffs
  const myFlat = myRows.flat();
  const oppFlat = oppEstimate.rows.flat();
  const myAvgFit = myFlat.length
    ? Math.round(myFlat.reduce((s, a) => s + a.fit, 0) / myFlat.length)
    : 0;
  const oppAvgFit = oppFlat.length
    ? Math.round(oppFlat.reduce((s, a) => s + a.fit, 0) / oppFlat.length)
    : 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white truncate max-w-[120px]">{myClubName || 'Mein Team'}</span>
          {(myFormation || hasActiveLineup) && (
            <span className="text-[10px] text-emerald-600 bg-emerald-950/40 border border-emerald-900/50 px-1.5 py-0.5 rounded">
              {myFormation ?? 'Lineup aktiv'}
            </span>
          )}
        </div>
        <div className="text-center">
          <p className="text-[10px] text-slate-500">Ø Meta</p>
          <p className="text-sm font-mono font-bold">
            <span className={myAvgFit >= oppAvgFit ? 'text-emerald-400' : 'text-slate-300'}>{myAvgFit}</span>
            <span className="text-slate-700 mx-1">–</span>
            <span className={oppAvgFit > myAvgFit ? 'text-amber-400' : 'text-slate-300'}>{oppAvgFit}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 justify-end">
          <span className="text-[10px] text-slate-500 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded">
            {oppEstimate.name}
          </span>
          <span className="text-sm font-semibold text-white truncate max-w-[120px] text-right">{opponentClubName || 'Gegner'}</span>
        </div>
      </div>

      {/* Pitch */}
      <div className="relative p-3">
        {/* Field background */}
        <div className="relative rounded-lg overflow-hidden bg-emerald-950/30 border border-emerald-900/20 p-3 space-y-1">
          {/* Centre line */}
          <div className="absolute left-3 right-3 top-1/2 border-t border-white/10" />

          {/* My half (bottom) */}
          <div className="space-y-2 pb-2">
            <FormationHalf rows={myRows} flip />
          </div>

          {/* Divider label */}
          <div className="flex items-center gap-2 py-0.5">
            <div className="flex-1 border-t border-white/10" />
            <span className="text-[9px] text-slate-700 tracking-widest uppercase">Mittelfeld</span>
            <div className="flex-1 border-t border-white/10" />
          </div>

          {/* Opponent half (top) */}
          <div className="space-y-2 pt-2">
            <FormationHalf rows={oppEstimate.rows} />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-800/60 text-[9px]">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-slate-500">Meta ≥ 85</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span className="text-slate-500">70–84</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-red-600" />
          <span className="text-slate-500">&lt; 70</span>
        </div>
        <span className="ml-auto text-slate-700">Formation geschätzt</span>
      </div>
    </div>
  );
}
