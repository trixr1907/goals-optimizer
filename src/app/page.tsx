'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useSquadStore, ImportDelta } from '@/lib/store/squad-store';
import { useLineupStore } from '@/lib/store/lineup-store';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { RotationPlanGenerator } from '@/components/onboarding/RotationPlanGenerator';
import { PlayerWithScores, displayPosition } from '@/lib/scraper/types';
import { enrichPlayerWithScores } from '@/lib/scoring/position-fit';
import { apiPath, appPath } from '@/lib/app-url';
import { mergeWithTrackerCache, hydrateCache, pruneExpiredEntries } from '@/lib/tracker-cache';

interface SquadBackupFile {
  app: 'goals-squad-optimizer';
  version: 1;
  exportedAt: string;
  clubName: string;
  players: PlayerWithScores[];
}

interface ImportDiagnostics {
  full: number;
  basic: number;
  warnings: number;
  positionSources: Record<string, number>;
  roleRatingSources: Record<string, number>;
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

/** Returns a human-readable relative age string for a past ISO timestamp. */
function relativeAge(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours   = Math.floor(diff / 3_600_000);
  const days    = Math.floor(diff / 86_400_000);
  if (minutes < 2)  return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  if (hours   < 24) return `vor ${hours} Std.`;
  if (days    < 2)  return 'gestern';
  if (days    < 7)  return `vor ${days} Tagen`;
  if (days    < 14) return 'vor 1 Woche';
  if (days    < 30) return `vor ${Math.floor(days / 7)} Wochen`;
  if (days    < 60) return 'vor 1 Monat';
  return `vor ${Math.floor(days / 30)} Monaten`;
}

function importErrorMessage(errorCode?: string, fallback = 'Live-Import fehlgeschlagen.'): string {
  switch (errorCode) {
    case 'invalid_club_name': return 'Club-Name ist ungültig. Nutze 2–100 Zeichen ohne Sonderzeichen außer Leerzeichen, Punkt, Bindestrich, Unterstrich oder Apostroph.';
    case 'club_not_found': return 'Club nicht gefunden. Prüfe Schreibweise und Sonderzeichen.';
    case 'goalsverse_timeout': return 'Der Importdienst antwortet zu langsam. Bitte gleich erneut versuchen.';
    case 'rsc_payload_incomplete': return 'Der Import hat unvollständige Kaderdaten geliefert.';
    case 'no_players_found': return 'Keine Spieler im importierten Kader gefunden.';
    case 'network_error': return 'Netzwerk- oder Importdienst-Fehler.';
    default: return fallback;
  }
}

function importDiagnosticsWarning(diagnostics?: ImportDiagnostics): string | null {
  if (!diagnostics) return null;
  const trackerPrimary = diagnostics.positionSources['goals-tracker'] ?? 0;
  const playGoalsPrimary = diagnostics.positionSources.playgoals ?? 0;
  const goalsversePrimary = diagnostics.positionSources.goalsverse ?? 0;

  if (diagnostics.warnings > 0) {
    return `⚠️ ${diagnostics.warnings} Datenwarnungen: Positionswerte konnten teilweise nur eingeschränkt bestimmt werden. Prüfe enge Entscheidungen besonders sorgfältig.`;
  }
  if (trackerPrimary === 0 && goalsversePrimary > 0 && playGoalsPrimary === 0) {
    return '⚠️ Positionsdaten konnten nur eingeschränkt bestimmt werden und können ungenauer sein.';
  }
  if (playGoalsPrimary > 0) {
    return `ℹ️ ${playGoalsPrimary} Primary-Positionen wurden über einen Ersatzpfad bestimmt. Rollenwerte können eingeschränkt sein.`;
  }
  return null;
}

export default function OnboardingPage() {
  const { clubName, clubId, players, lastImportedAt, setClubName, importPlayers, reimportPlayers, _hasHydrated } =
    useSquadStore();
  const { clearLineup, purgeOrphanedAssignments } = useLineupStore();
  const router = useRouter();

  // Local input state — decoupled from store to avoid hydration-timing disabled bug
  const [inputValue, setInputValue] = useState('');

  // Sync store clubName → inputValue once after hydration (for re-import label)
  useEffect(() => {
    if (_hasHydrated && clubName) {
      setInputValue(clubName);
    }
  }, [_hasHydrated, clubName]);

  // Auto-Redirect: Club-ID + Spieler vorhanden → direkt zur Aufstellung (nicht Squad-Liste)
  useEffect(() => {
    if (_hasHydrated && clubId && players.length > 0) {
      router.push('/lineup');
    }
  }, [_hasHydrated, clubId, players.length, router]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [delta, setDelta] = useState<ImportDelta | null>(null);
  const [importResult, setImportResult] = useState<{
    requestedName: string;
    resolvedName: string;
    count: number;
    clubUrl?: string;
    diagnostics?: ImportDiagnostics;
  } | null>(null);

  const hasSquad = players.length > 0;
  const isReimport = hasSquad && Boolean(clubName);

  async function fetchAndEnrich(name: string): Promise<{
    players: PlayerWithScores[];
    clubId?: string;
    clubUrl?: string;
    resolvedName?: string;
    diagnostics?: ImportDiagnostics;
  }> {
    // Prune expired cache entries once per import call
    pruneExpiredEntries();

    const res = await fetch(apiPath('/api/import'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clubName: name }),
    });
    const json = await res.json();
    const data = json.data;
    if (!json.success) {
      throw new Error(importErrorMessage(json.errorCode, json.error));
    }
    const resolvedName = data.clubName && data.source === 'goalsverse'
      ? String(data.clubName)
      : name;
    if (data.clubName && data.source === 'goalsverse') {
      setClubName(data.clubName);
    }
    const diagnostics = data.diagnostics as ImportDiagnostics | undefined;
    if (!data.players?.length) return { players: [], clubId: data.clubId, resolvedName, clubUrl: data.clubUrl, diagnostics };

    const freshPlayers = data.players as PlayerWithScores[];

    // 1. Hydrate cache with any Tracker-exclusive fields the server already
    //    filled in (training_value, xp_next_upgrade). Over time this cache
    //    fills as Tracker returns HTTP 200 intermittently.
    hydrateCache(freshPlayers);

    // 2. Merge cached Tracker fields into players that arrived without them
    //    (Tracker was 403 this time, but we have a cached value from before).
    const merged = mergeWithTrackerCache(freshPlayers);

    return { players: merged, clubId: data.clubId, clubUrl: data.clubUrl, resolvedName, diagnostics };
  }

  async function handleImport(clubNameOverride?: string) {
    const name = (clubNameOverride ?? inputValue).trim();
    if (!name) return;
    setClubName(name);
    setLoading(true);
    setStatus('Importiere…');
    setDelta(null);
    setImportResult(null);
    try {
      const requestedName = name;
      const { players: incoming, clubId: resolvedClubId, clubUrl, resolvedName, diagnostics } = await fetchAndEnrich(requestedName);
      if (!incoming.length) {
        setStatus('Keine Spieler gefunden.');
        return;
      }
      setImportResult({
        requestedName,
        resolvedName: resolvedName ?? requestedName,
        count: incoming.length,
        clubUrl,
        diagnostics,
      });

      // Detect club switch: different clubId (reliable) or different resolved name.
      // "demo" → any real club and vice versa always counts as a switch.
      const currentIsDemo = clubName.toLowerCase() === 'demo';
      const incomingIsDemo = requestedName.toLowerCase() === 'demo';
      const clubIdChanged = Boolean(clubId) && Boolean(resolvedClubId) && clubId !== resolvedClubId;
      const nameChanged =
        clubName &&
        resolvedName &&
        resolvedName.toLowerCase() !== clubName.toLowerCase();
      const isClubSwitch =
        currentIsDemo !== incomingIsDemo || clubIdChanged || Boolean(nameChanged);

      if (isReimport && !isClubSwitch) {
        // Same club — merge and keep lineup, but purge any player that was released.
        const result = reimportPlayers(incoming, clubUrl, resolvedClubId);
        if (result.removedPlayers.length > 0) {
          // Players were released — their IDs may still be in the lineup.
          const knownIds = new Set(incoming.map((p) => p.id));
          purgeOrphanedAssignments(knownIds);
        }
        setDelta(result);
        const total =
          result.newPlayers.length + result.updatedPlayers.length + result.removedPlayers.length;
        setStatus(
          total > 0
            ? `Re-Import: ${result.newPlayers.length} neu, ${result.updatedPlayers.length} upgegraded, ${result.removedPlayers.length} entfernt.`
            : 'Kein Unterschied zum letzten Import.'
        );
      } else {
        // Fresh import or club switch — clear lineup first so no orphaned IDs remain.
        if (isClubSwitch) clearLineup();
        importPlayers(incoming, clubUrl, resolvedClubId);
        setStatus(`${incoming.length} Spieler importiert.`);
        router.push('/lineup');
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
    <div className="page-shell">
      <Sidebar />
      <main className="page-main flex items-start justify-center p-6 pt-8">
        <div className="max-w-md w-full space-y-5">

          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">GOALS Squad Optimizer</h1>
            <p className="text-slate-400 mt-1 text-sm">
              Importiere deinen Kader oder lade ein lokales Backup.
            </p>
          </div>

          {/* Aktueller Kader-Status */}
          {hasSquad && (() => {
            const isStale = lastImportedAt
              ? Date.now() - new Date(lastImportedAt).getTime() > 3 * 86_400_000
              : false;
            return (
              <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${
                isStale
                  ? 'border-amber-900/60 bg-amber-950/20'
                  : 'border-emerald-900/60 bg-emerald-950/20'
              }`}>
                <div>
                  <p className="text-sm font-medium text-white">{clubName || 'Kader geladen'}</p>
                  <p className={`text-xs ${isStale ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {players.length} Spieler
                    {lastImportedAt && (
                      <> · {isStale ? '⚠️ ' : ''}importiert {relativeAge(lastImportedAt)}</>
                    )}
                  </p>
                  {isStale && (
                    <p className="text-xs text-amber-500 mt-0.5">
                      Kader ist veraltet — Re-Import empfohlen.
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <a href={appPath('/lineup')} className="text-xs text-emerald-400 underline whitespace-nowrap">
                    → Aufstellung
                  </a>
                  <a href={appPath('/squad')} className="text-xs text-slate-500 underline whitespace-nowrap">
                    Kader ansehen
                  </a>
                </div>
              </div>
            );
          })()}

          {/* Import-Formular */}
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Club-Name eingeben..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleImport()}
              className="w-full px-4 py-3 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
            <button
              onClick={() => handleImport()}
              disabled={loading || !inputValue.trim()}
              className="w-full py-3 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {importButtonLabel}
            </button>
          </div>

          {/* Demo-Button */}
          <div className="text-center space-y-1">
            <button
              onClick={() => handleImport('demo')}
              disabled={loading}
              className="w-full py-2.5 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 text-sm font-medium hover:bg-slate-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Demo laden
            </button>
            <p className="text-xs text-slate-600">Zum Ausprobieren ohne echten Club.</p>
          </div>

          {/* Import-Bestätigung */}
          {importResult && (
            <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-3 text-left space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-500 font-medium">
                    Club gefunden
                  </p>
                  <p className="text-sm text-white font-semibold">
                    {importResult.resolvedName}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {importResult.count} Spieler importiert
                    {importResult.resolvedName.toLowerCase() !== importResult.requestedName.toLowerCase() && (
                      <> · gesucht: “{importResult.requestedName}”</>
                    )}
                  </p>
                  {importResult.diagnostics && (
                    <>
                      <p className="text-xs text-slate-500 mt-1">
                        Datenqualität: {importResult.diagnostics.full} vollständig / {importResult.diagnostics.basic} eingeschränkt · Warnungen:{' '}
                        {importResult.diagnostics.warnings}
                      </p>
                      {importDiagnosticsWarning(importResult.diagnostics) && (
                        <p className="mt-2 rounded-lg border border-amber-900/60 bg-amber-950/30 px-2 py-1.5 text-[11px] leading-relaxed text-amber-200">
                          {importDiagnosticsWarning(importResult.diagnostics)}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {importResult.clubUrl && (
                  <a
                    href={importResult.clubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 underline whitespace-nowrap"
                  >
                    Profil öffnen
                  </a>
                )}
              </div>
            </div>
          )}

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
            <div className="space-y-4">
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
              <RotationPlanGenerator />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
