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

function bestPlayerForPosition(players: PlayerWithScores[], pos: Position): PlayerWithScores | undefined {
  const candidates = players.filter((p) => p.fit_scores[pos] > 0);
  if (!candidates.length) return undefined;
  return candidates.reduce((best, p) => (p.fit_scores[pos] > best.fit_scores[pos] ? p : best));
}

// Default formation rows if no lineup is provided
const DEFAULT_FORMATION_ROWS: Position[][] = [
  ['GK'],
  ['FB', 'CB', 'CB', 'FB'],
  ['DM', 'CM'],
  ['WF', 'AM', 'WF'],
  ['ST'],
];

function groupSlotsByRow(slots: LineupSlot[]): Position[][] {
  if (!slots.length) return DEFAULT_FORMATION_ROWS;
  // Sort by y descending (GK at bottom = high y, strikers at top = low y)
  const sorted = [...slots].sort((a, b) => b.y - a.y);
  // Bucket into rows by y proximity (within 12 units = same row)
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

export function MatchupCanvas({
  myPlayers,
  opponentPlayers,
  myClubName,
  opponentClubName,
  myFormation,
  mySlots,
  myLineup,
}: Props) {
  // Build set of my lineup player IDs (if lineup is active)
  const lineupIds = myLineup ? new Set(Object.values(myLineup).filter(Boolean) as string[]) : new Set<string>();
  const hasActiveLineup = lineupIds.size >= 7;

  // Determine formation rows
  const formationRows = (mySlots && mySlots.length > 0)
    ? groupSlotsByRow(mySlots)
    : DEFAULT_FORMATION_ROWS;

  // All positions present in the formation (used for row rendering via uniqueRows below)
  // const formationPositions = formationRows.flat(); // retained for future use

  // For each position, pick the best from my active lineup (or full squad fallback)
  function myBestForPos(pos: Position): PlayerWithScores | undefined {
    if (hasActiveLineup) {
      const lineupPlayers = myPlayers.filter((p) => lineupIds.has(p.id));
      const candidate = lineupPlayers.find((p) => p.fit_scores[pos] > 0);
      if (candidate) return lineupPlayers.reduce((best, p) =>
        (p.fit_scores[pos] ?? 0) > (best.fit_scores[pos] ?? 0) ? p : best, candidate);
    }
    return bestPlayerForPosition(myPlayers, pos);
  }

  // Deduplicate positions to avoid comparing same pos twice
  const seen = new Set<string>();
  const uniqueRows = formationRows.map((row) =>
    row.filter((pos) => {
      const key = pos;
      if (seen.has(key)) return true; // keep duplicates (CB CB is intentional)
      seen.add(key);
      return true;
    })
  );

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-white">
          {myClubName || 'Mein Team'} <span className="text-slate-600 text-xs font-normal">{myFormation && `(${myFormation})`}</span>
          <span className="text-slate-500 mx-2">vs</span>
          {opponentClubName || 'Gegner'}
        </h3>
        {hasActiveLineup && (
          <span className="text-[10px] text-emerald-600 bg-emerald-950/40 border border-emerald-900/50 px-2 py-0.5 rounded">
            Deine Aufstellung aktiv
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {uniqueRows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex justify-center gap-2 flex-wrap">
            {row.map((pos, posIdx) => {
              const myBest = myBestForPos(pos);
              const oppBest = bestPlayerForPosition(opponentPlayers, pos);
              const myScore = myBest?.fit_scores[pos] ?? 0;
              const oppScore = oppBest?.fit_scores[pos] ?? 0;
              const total = myScore + oppScore || 1;
              const myWins = myScore > oppScore + 2;
              const oppWins = oppScore > myScore + 2;

              return (
                <div
                  key={`${pos}-${posIdx}`}
                  className={`flex flex-col items-center gap-1 min-w-[110px] rounded-lg border p-2 ${
                    myWins
                      ? 'border-emerald-900/70 bg-emerald-950/20'
                      : oppWins
                      ? 'border-amber-900/70 bg-amber-950/20'
                      : 'border-slate-800 bg-slate-950/50'
                  }`}
                >
                  <p className={`text-[10px] font-semibold ${
                    myWins ? 'text-emerald-400' : oppWins ? 'text-amber-400' : 'text-slate-500'
                  }`}>{pos}</p>
                  <div className="flex items-center gap-1.5 w-full">
                    <span className={`text-xs font-mono w-7 text-right ${myWins ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
                      {myScore}
                    </span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className={`h-full ${myWins ? 'bg-emerald-500' : 'bg-emerald-800'} rounded-l`}
                        style={{ width: `${Math.max(0, Math.min(100, (myScore / total) * 100))}%` }}
                      />
                      <div
                        className={`h-full ${oppWins ? 'bg-amber-500' : 'bg-amber-800'} rounded-r`}
                        style={{ width: `${Math.max(0, Math.min(100, (oppScore / total) * 100))}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono w-7 text-left ${oppWins ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                      {oppScore}
                    </span>
                  </div>
                  <div className="flex justify-between w-full">
                    <p className="text-[9px] text-slate-600 truncate max-w-[48px]">{myBest?.name ?? '—'}</p>
                    <p className="text-[9px] text-slate-600 truncate max-w-[48px] text-right">{oppBest?.name ?? '—'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Gesamtübersicht */}
      <div className="flex gap-4 text-xs pt-1 border-t border-slate-800/60">
        <div>
          <span className="text-slate-500">Ø OVR: </span>
          <span className="text-white font-mono">
            {myPlayers.length ? Math.round(myPlayers.reduce((s, p) => s + p.overall, 0) / myPlayers.length) : 0}
          </span>
          <span className="text-slate-600"> vs </span>
          <span className="text-white font-mono">
            {opponentPlayers.length ? Math.round(opponentPlayers.reduce((s, p) => s + p.overall, 0) / opponentPlayers.length) : 0}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Spieler: </span>
          <span className="text-white font-mono">{myPlayers.length}</span>
          <span className="text-slate-600"> vs </span>
          <span className="text-white font-mono">{opponentPlayers.length}</span>
        </div>
      </div>
    </div>
  );
}
