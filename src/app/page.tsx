'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { useSquadStore, ImportDelta } from '@/lib/store/squad-store';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { PlayerWithScores, displayPosition } from '@/lib/scraper/types';
import { enrichPlayerWithScores } from '@/lib/scoring/position-fit';
import { apiPath, appPath } from '@/lib/app-url';

interface SquadBackupFile {
  app: 'goals-squad-optimizer';
  version: 1;
  exportedAt: string;
  clubName: string;
  players: PlayerWithScores[];
}

// ── Delta-Bericht nach Re-Import ────────────────────────────────────────────

function DeltaReport({ delta, onDismiss }: { delta: ImportDelta; onDismiss: () => void }) {
  const hasChanges =
    delta.newPlayers.length > 0 ||
    delta.updatedPlayers.length > 0 ||
    delta.removedPlayers.length > 0;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-left space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-white text-sm">Re-Import Ergebnis</p>
        <button onClick={onDismiss} className="text-slate-500 hover:text-white text-sm">✕</button>
      </div>

      {!hasChanges && (
        <p className="text-sm text-slate-400">
          ✓ Kein Unterschied — {delta.unchanged} Spieler unverändert.
        </p>
      )}

      {delta.newPlayers.length > 0 && (
        <div>
          <p className="text-xs text-emerald-400 font-medium mb-1.5">
            🆕 {delta.newPlayers.length} neue Spieler erkannt
          </p>
          <div className="space-y-1">
            {delta.newPlayers.map((p) => (
              <p key={p.id} className="text-xs text-slate-300 pl-2">
                + {p.name} ({displayPosition(p.position)}, OVR {p.overall}, {p.rarity})
              </p>
            ))}
          </div>
        </div>
      )}

      {delta.updatedPlayers.length > 0 && (
        <div>
          <p className="text-xs text-amber-400 font-medium mb-1.5">
            ⬆️ {delta.updatedPlayers.length} Spieler haben Upgrades erhalten
          </p>
          <div className="space-y-1">
            {delta.updatedPlayers.map(({ player, changedStats }) => (
              <p key={player.id} className="text-xs text-slate-300 pl-2">
                {player.name} — geändert: {changedStats.join(', ')}
              </p>
            ))}
          </div>
        </div>
      )}

      {delta.removedPlayers.length > 0 && (
        <div>
          <p className="text-xs text-red-400 font-medium mb-1.5">
            🗑️ {delta.removedPlayers.length} Spieler entfernt (geswapt/released?)
          </p>
          <div className="space-y-1">
            {delta.removedPlayers.map((p) => (
              <p key={p.id} className="text-xs text-slate-400 pl-2 line-through">
                {p.name} ({displayPosition(p.position)})
              </p>
            ))}
          </div>
        </div>
      )}

      {delta.unchanged > 0 && hasChanges && (
        <p className="text-xs text-slate-600">{delta.unchanged} Spieler unverändert.</p>
      )}
    </div>
  );
}

// ── Haupt-Seite ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { clubName, players, lastImportedAt, setClubName, importPlayers, reimportPlayers } =
    useSquadStore();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [delta, setDelta] = useState<ImportDelta | null>(null);

  const hasSquad = players.length > 0;
  const isReimport = hasSquad && Boolean(clubName);

  async function fetchAndEnrich(name: string): Promise<{ players: PlayerWithScores[]; clubUrl?: string }> {
    const res = await fetch(apiPath('/api/import'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clubName: name }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? 'Live-Import fehlgeschlagen.');
    }
    if (data.clubName && data.source === 'goalsverse') {
      setClubName(data.clubName);
    }
    if (!data.players?.length) return { players: [] };
    return { players: data.players as PlayerWithScores[], clubUrl: data.clubUrl };
  }

  async function handleImport() {
    if (!clubName.trim()) return;
    setLoading(true);
    setStatus('Importiere…');
    setDelta(null);
    try {
      const { players: incoming, clubUrl } = await fetchAndEnrich(clubName.trim());
      if (!incoming.length) {
        setStatus('Keine Spieler gefunden.');
        return;
      }
      if (isReimport) {
        const result = reimportPlayers(incoming, clubUrl);
        setDelta(result);
        const total =
          result.newPlayers.length + result.updatedPlayers.length + result.removedPlayers.length;
        setStatus(
          total > 0
            ? `Re-Import: ${result.newPlayers.length} neu, ${result.updatedPlayers.length} upgegraded, ${result.removedPlayers.length} entfernt.`
            : 'Kein Unterschied zum letzten Import.'
        );
      } else {
        importPlayers(incoming, clubUrl);
        setStatus(`${incoming.length} Spieler importiert.`);
        router.push('/squad');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Fehler beim Import.');
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    if (!players.length) {
      setStatus('Kein Kader zum Exportieren.');
      return;
    }
    const backup: SquadBackupFile = {
      app: 'goals-squad-optimizer',
      version: 1,
      exportedAt: new Date().toISOString(),
      clubName: clubName || 'GOALS Club',
      players,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safe = backup.clubName.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'squad';
    link.href = url;
    link.download = `${safe}-goals-squad.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus(`${players.length} Spieler als JSON exportiert.`);
  }

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<SquadBackupFile>;
      if (parsed.app !== 'goals-squad-optimizer' || !Array.isArray(parsed.players)) {
        setStatus('Ungültige GOALS-Backup-Datei.');
        return;
      }
      const enriched = (parsed.players as PlayerWithScores[]).map(enrichPlayerWithScores);
      setClubName(parsed.clubName || 'Importierter Club');
      importPlayers(enriched);
      setStatus(`${enriched.length} Spieler aus Backup importiert.`);
      router.push('/squad');
    } catch {
      setStatus('Backup konnte nicht gelesen werden.');
    } finally {
      event.target.value = '';
    }
  }

  const importButtonLabel = loading
    ? 'Importiere…'
    : isReimport
    ? `🔄 Re-Import "${clubName}"`
    : 'Kader importieren';

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto flex items-start justify-center p-6 pt-8">
        <div className="max-w-md w-full space-y-5">

          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">GOALS Squad Optimizer</h1>
            <p className="text-slate-400 mt-1 text-sm">
              Importiere deinen Kader von goalsverse.com oder lade ein lokales Backup.
            </p>
          </div>

          {/* Aktueller Kader-Status */}
          {hasSquad && (
            <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">{clubName || 'Kader geladen'}</p>
                <p className="text-xs text-emerald-400">
                  {players.length} Spieler
                  {lastImportedAt && (
                    <> · zuletzt importiert {new Date(lastImportedAt).toLocaleDateString('de-DE')}</>
                  )}
                </p>
              </div>
              <a href={appPath('/squad')} className="text-xs text-emerald-400 underline whitespace-nowrap">
                → Kader ansehen
              </a>
            </div>
          )}

          {/* Import-Formular */}
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Club-Name eingeben..."
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleImport()}
              className="w-full px-4 py-3 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
            <button
              onClick={handleImport}
              disabled={loading || !clubName.trim()}
              className="w-full py-3 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {importButtonLabel}
            </button>
          </div>

          {/* Delta-Bericht */}
          {delta && <DeltaReport delta={delta} onDismiss={() => setDelta(null)} />}

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-slate-600 text-xs">oder</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="w-full py-2.5 rounded-lg border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            Backup importieren
          </button>

          <button
            onClick={handleExport}
            disabled={!players.length}
            className="w-full py-2 rounded-lg border border-emerald-900/80 bg-emerald-950/30 text-sm text-emerald-300 font-medium hover:bg-emerald-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Kader exportieren {players.length ? `(${players.length} Spieler)` : ''}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileImport}
            className="hidden"
          />

          {status && (
            <p
              className={`text-sm text-center ${
                status.includes('Fehler') || status.includes('Ungültig')
                  ? 'text-red-400'
                  : 'text-slate-400'
              }`}
            >
              {status}
            </p>
          )}

          {/* Info-Box nur wenn noch kein Kader */}
          {!hasSquad && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-xs text-slate-500 space-y-2">
              <p className="font-medium text-slate-400">So funktioniert&apos;s:</p>
              <p>1. Club-Name aus GOALS eingeben und importieren.</p>
              <p>
                2. Spieler müssen mindestens 1× in einem <strong className="text-slate-400">Online-Match</strong> gespielt
                haben (Quickplay empfohlen — kein Ranking-Risiko, kein Bot-Match).
              </p>
              <p>3. Bei ca. 50 Spielern: ~5 Quickplay-Matches (~20 Min) reichen.</p>
              <p className="text-slate-600">Bonus: Du verdienst dabei Match Points & XP!</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
