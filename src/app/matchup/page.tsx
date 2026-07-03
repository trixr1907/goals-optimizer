'use client';

import { useState } from 'react';
import { useSquadStore } from '@/lib/store/squad-store';
import { Sidebar } from '@/components/layout/Sidebar';
import { appPath } from '@/lib/app-url';
import { getClubRoster } from '@/lib/scraper/goalsverse-client';
import { PlayerWithScores } from '@/lib/scraper/types';
import { MatchupCanvas } from '@/components/matchup/MatchupCanvas';
import { MatchupAnalysis } from '@/components/matchup/MatchupAnalysis';

export default function MatchupPage() {
  const { players: myPlayers, clubName: myClubName } = useSquadStore();
  const [opponentId, setOpponentId] = useState('');
  const [opponentPlayers, setOpponentPlayers] = useState<PlayerWithScores[] | null>(null);
  const [opponentClubName, setOpponentClubName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function analyzeOpponent() {
    if (!opponentId.trim()) return;
    setLoading(true);
    setError('');

    try {
      const result = await getClubRoster(opponentId.trim());
      if (result.reason) {
        setError(result.reason);
        setOpponentPlayers(null);
      } else {
        const { enrichPlayerWithScores } = await import('@/lib/scoring/position-fit');
        const enriched = result.players.map(enrichPlayerWithScores);
        setOpponentPlayers(enriched);
        setOpponentClubName(result.clubName || opponentId);
      }
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
              onClick={analyzeOpponent}
              disabled={loading}
              className="h-10 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Lädt...' : 'Analysieren'}
            </button>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* Results */}
          {opponentPlayers && (
            <div className="space-y-6">
              <MatchupCanvas
                myPlayers={myPlayers}
                opponentPlayers={opponentPlayers}
                myClubName={myClubName}
                opponentClubName={opponentClubName}
              />
              <MatchupAnalysis
                myPlayers={myPlayers}
                opponentPlayers={opponentPlayers}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
