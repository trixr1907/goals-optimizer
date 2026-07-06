'use client';

import { useState } from 'react';
import { useSquadStore } from '@/lib/store/squad-store';
import { useLineupStore } from '@/lib/store/lineup-store';
import { Sidebar } from '@/components/layout/Sidebar';
import { appPath, apiPath } from '@/lib/app-url';
import { PlayerWithScores } from '@/lib/scraper/types';
import { MatchupCanvas } from '@/components/matchup/MatchupCanvas';
import { MatchupAnalysis } from '@/components/matchup/MatchupAnalysis';

export default function MatchupPage() {
  const { players: myPlayers, clubName: myClubName } = useSquadStore();
  const { formation, slots, lineup } = useLineupStore();

  const [opponentId, setOpponentId] = useState('');
  const [opponentPlayers, setOpponentPlayers] = useState<PlayerWithScores[] | null>(null);
  const [opponentClubName, setOpponentClubName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Build my lineup player list — ordered by slot, falling back to full squad
  const squadById = new Map(myPlayers.map((p) => [p.id, p]));
  const lineupPlayers: PlayerWithScores[] = Object.values(lineup)
    .filter((id): id is string => !!id)
    .map((id) => squadById.get(id))
    .filter((p): p is PlayerWithScores => !!p);

  // If lineup is set, use it; otherwise use full squad for analysis
  const myEffectivePlayers = lineupPlayers.length >= 7 ? lineupPlayers : myPlayers;

  async function analyzeOpponent(opponentOverride?: string) {
    const query = (opponentOverride ?? opponentId).trim();
    if (!query) return;
    setLoading(true);
    setError('');

    try {
      // Use the server-side /api/import endpoint — getClubRoster() is server-only
      // and cannot be called directly from the browser (no CORS, custom headers).
      const res = await fetch(apiPath('/api/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubName: query }),
      });
      const data = await res.json();

      if (!res.ok || !data.players?.length) {
        setError(data.message ?? data.error ?? 'Gegner nicht gefunden.');
        setOpponentPlayers(null);
        return;
      }

      // Players from /api/import are already enriched with fit_scores
      setOpponentPlayers(data.players as PlayerWithScores[]);
      setOpponentClubName(data.clubName || query);
      if (opponentOverride) setOpponentId(opponentOverride);
    } catch {
      setError('Fehler beim Laden des Gegners.');
    } finally {
      setLoading(false);
    }
  }

  if (myPlayers.length === 0) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center pt-11 lg:pt-0">
          <div className="text-center space-y-4">
            <p className="text-slate-400">Lade zuerst deinen Kader.</p>
            <a href={appPath('/')} className="text-emerald-400 underline text-sm">Zum Import</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 overflow-auto pt-14 lg:pt-4">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div>
            <h2 className="text-2xl font-bold text-white">Gegner-Analyse</h2>
            <p className="text-sm text-slate-500">
              Gib die goalsverse-ID oder den Club-Namen deines Gegners ein.
              {lineupPlayers.length >= 7 && (
                <span className="ml-2 text-emerald-600">
                  Deine Aufstellung ({formation}) wird verwendet.
                </span>
              )}
            </p>
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Gegner-ID oder Club-Name..."
              value={opponentId}
              onChange={(e) => setOpponentId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && analyzeOpponent()}
              className="flex-1 h-10 rounded-lg border border-slate-700 bg-slate-800 text-white text-sm px-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={() => analyzeOpponent()}
              disabled={loading}
              className="h-10 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {loading ? 'Lädt...' : 'Analysieren'}
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-400">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Nur testen? Lade einen Demo-Gegner und sieh sofort, wie Matchup-Vorteile und Risiken aussehen.
              </p>
              <button
                onClick={() => analyzeOpponent('demo')}
                disabled={loading}
                className="shrink-0 rounded-lg border border-emerald-900/70 bg-emerald-950/30 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-50"
              >
                Demo-Gegner laden
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* Results */}
          {opponentPlayers && (
            <div className="space-y-6">
              <MatchupCanvas
                myPlayers={myEffectivePlayers}
                opponentPlayers={opponentPlayers}
                myClubName={myClubName}
                opponentClubName={opponentClubName}
                myFormation={formation}
                mySlots={slots}
                myLineup={lineup}
              />
              <MatchupAnalysis
                myPlayers={myEffectivePlayers}
                opponentPlayers={opponentPlayers}
                myClubName={myClubName}
                opponentClubName={opponentClubName}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
