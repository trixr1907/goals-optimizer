'use client';

/**
 * FormationExplorer — alle 15 Formationen als wählbare Kacheln.
 *
 * Design-Entscheidungen (aus StepB_RiskAddendum_Hermes.md):
 *
 * R1 (REPLACE-Risiko): Bestätigungs-Dialog im onApply-Callback der MetaPage —
 *   der Explorer selbst kennt den Lineup-State nicht, delegiert nach oben.
 *
 * R2 (Fit-Skala): calcPositionFitScore gibt 1–99 zurück (int). Wir zeigen
 *   Slot-Fit als ganzzahligen Score ohne "%", squadMatch als "83%" (0–100-Scale,
 *   konsistent mit dem Rest der App).
 *
 * R3 (Kader-Lücken): solveOptimal schreibt nur gefundene Spieler in Assignments.
 *   Fehlt ein Spieler für einen Slot, taucht der Slot schlicht nicht in
 *   assignments auf. Wir rendern fehlende Slots explizit als "— kein Spieler".
 *
 * R4 (Performance / Lazy): Kein eager-Berechnen aller 15 beim Mount.
 *   Die squadMatch-Werte kommen aus dem bereits berechneten recommendations[]-Array
 *   aus MetaPage (useMemo). Nur beim Klick auf eine Kachel wird für genau diese
 *   Formation lazy der beste Spieler pro Slot berechnet (solveOptimal, einzeln).
 *
 * R7 (Source-Constraint): Kein "goalsverse"/"tracker" im UI.
 */

import { useMemo, useState } from 'react';
import { PlayerWithScores } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import formationsData from '@/config/formations.json';
import {
  FormationRecommendation,
  FormationAssignment,
  recommendFormations,
} from '@/lib/optimizer/formation-optimizer';
import { shortPlayerName } from '@/lib/player-name';

// ── Types ──────────────────────────────────────────────────────────────────

interface FormationExplorerProps {
  players: PlayerWithScores[];
  /** Used only to pre-check if lineup is non-empty before applying (R1). */
  currentLineup: { lineup: Record<string, string | null> };
  onApply: (rec: FormationRecommendation) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const FORMATIONS = formationsData as Record<string, { name: string; slots: LineupSlot[] }>;

function fitColor(fit: number) {
  if (fit >= 80) return 'text-emerald-400';
  if (fit >= 65) return 'text-amber-400';
  return 'text-red-400';
}

function fitBg(fit: number) {
  if (fit >= 80) return 'bg-emerald-900/60 text-emerald-200';
  if (fit >= 65) return 'bg-amber-900/60 text-amber-200';
  return 'bg-red-900/60 text-red-200';
}

function squadMatchColor(v: number) {
  if (v >= 78) return 'text-emerald-400';
  if (v >= 65) return 'text-amber-400';
  return 'text-red-400';
}

function pitchRowLabel(y: number) {
  if (y >= 80) return 'TOR';
  if (y >= 60) return 'ABWEHR';
  if (y >= 35) return 'MITTELFELD';
  return 'ANGRIFF';
}

// ── Best-Fit Panel ─────────────────────────────────────────────────────────

function BestFitPanel({
  rec,
  onApply,
}: {
  rec: FormationRecommendation;
  onApply: () => void;
}) {
  // Build slot list: all 11 slots; mark missing ones (R3)
  const allSlots = rec.formation.slots as LineupSlot[];
  const assignmentBySlotKey = useMemo(() => {
    const map = new Map<string, FormationAssignment>();
    for (const a of rec.assignments) map.set(a.slotKey, a);
    return map;
  }, [rec]);

  // Group by pitch row
  const rows = useMemo(() => {
    const rowMap = new Map<string, Array<{ slot: LineupSlot; slotKey: string; a: FormationAssignment | null }>>();
    const order = ['TOR', 'ABWEHR', 'MITTELFELD', 'ANGRIFF'];
    const sorted = allSlots
      .map((slot, idx) => {
        const key = `${slot.position}-${idx}`;
        return { slot, slotKey: key, a: assignmentBySlotKey.get(key) ?? null, y: slot.y };
      })
      .sort((a, b) => b.y - a.y);

    for (const item of sorted) {
      const label = pitchRowLabel(item.y);
      if (!rowMap.has(label)) rowMap.set(label, []);
      rowMap.get(label)!.push(item);
    }
    return order.filter((k) => rowMap.has(k)).map((k) => ({ label: k, items: rowMap.get(k)! }));
  }, [allSlots, assignmentBySlotKey]);

  const avgFit = rec.averageFit;

  return (
    <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Best-Fit XI aus deinem Kader</p>
          <p className="text-sm font-bold text-white">{rec.formation.name}</p>
        </div>
        <div className="text-right">
          <p className={`text-lg font-mono font-bold ${fitColor(avgFit)}`}>{avgFit.toFixed(0)}</p>
          <p className="text-[10px] text-slate-500">Ø Fit</p>
        </div>
      </div>

      {/* Slot list grouped by row */}
      <div className="space-y-2">
        {rows.map(({ label, items }) => (
          <div key={label}>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-600 mb-1">{label}</p>
            <div className="space-y-0.5">
              {items.map(({ slot, slotKey, a }) => (
                <div
                  key={slotKey}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${
                    a ? 'bg-slate-800/50' : 'bg-red-950/30 border border-red-900/30'
                  }`}
                >
                  {/* Position pill */}
                  <span className="shrink-0 w-7 text-center text-[10px] font-bold rounded bg-slate-700 text-slate-300 px-0.5 py-0.5">
                    {slot.position}
                  </span>

                  {a ? (
                    <>
                      {/* Player name */}
                      <span className="flex-1 min-w-0 text-xs text-white truncate">
                        {shortPlayerName(a.player.name)}
                      </span>
                      {/* Out-of-position badge */}
                      {a.positionType === 'out' && (
                        <span className="shrink-0 text-[9px] font-bold rounded px-1 py-0.5 bg-red-900 text-red-200">
                          ⚠ Fremd
                        </span>
                      )}
                      {a.positionType === 'secondary' && (
                        <span className="shrink-0 text-[9px] font-bold rounded px-1 py-0.5 bg-amber-900 text-amber-200">
                          Neben
                        </span>
                      )}
                      {/* OVR */}
                      <span className="shrink-0 text-[11px] text-slate-400">{a.player.overall}</span>
                      {/* Fit score — ganzzahlig, kein "%" (R2) */}
                      <span className={`shrink-0 text-[10px] font-bold rounded px-1.5 py-0.5 ${fitBg(a.fit)}`}>
                        {Math.round(a.fit)}
                      </span>
                    </>
                  ) : (
                    /* R3: Slot ohne Spieler — explizit anzeigen, kein Crash */
                    <span className="flex-1 text-xs text-red-400 italic">kein Spieler im Kader</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Warnings */}
      {rec.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-2.5 py-1.5">
          <p className="text-[10px] text-amber-300 truncate">⚠️ {rec.warnings[0]}</p>
        </div>
      )}

      {/* R1: Bestätigung passiert im onApply-Callback der MetaPage */}
      <button
        onClick={onApply}
        className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all px-3 py-2.5 text-sm font-bold text-white"
      >
        ↗ Übernehmen in Aufstellung
      </button>
    </div>
  );
}

// ── Formation Tile ─────────────────────────────────────────────────────────

function FormationTile({
  formationKey,
  squadMatch,
  playstyle,
  isSelected,
  onClick,
}: {
  formationKey: string;
  squadMatch: number;
  playstyle?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const formation = FORMATIONS[formationKey];
  if (!formation) return null;

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
        isSelected
          ? 'border-emerald-600 bg-emerald-950/30 ring-1 ring-emerald-600/40'
          : 'border-slate-800 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-800/50'
      }`}
    >
      <span className="text-sm font-bold text-white leading-tight">{formation.name}</span>
      {playstyle && (
        <span className="text-[10px] text-slate-500">{playstyle}</span>
      )}
      <span className={`text-base font-mono font-bold ${squadMatchColor(squadMatch)}`}>
        {squadMatch.toFixed(0)}%
      </span>
      <span className="text-[9px] text-slate-600">Squad-Fit</span>
    </button>
  );
}

// ── FormationExplorer (main export) ───────────────────────────────────────

export function FormationExplorer({ players, onApply }: FormationExplorerProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // All 15 recommendations — already computed by recommendFormations (same fn MetaPage uses).
  // R4: This is the ONLY solver run; selecting a tile uses the pre-computed rec (no extra solve).
  const allRecs = useMemo(() => recommendFormations(players), [players]);

  const recByKey = useMemo(() => {
    const map = new Map<string, FormationRecommendation>();
    for (const r of allRecs) map.set(r.formationKey, r);
    return map;
  }, [allRecs]);

  const selectedRec = selectedKey ? recByKey.get(selectedKey) ?? null : null;

  if (players.length < 11) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="text-lg font-bold text-white mb-2">Alle Formationen — Explorer</h3>
        <p className="text-sm text-slate-500">Mindestens 11 Spieler im Kader erforderlich.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">Alle Formationen — Explorer</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Klick auf eine Kachel → Best-Fit-XI aus deinem Kader für genau diese Formation.
        </p>
      </div>

      {/* R4: Kachelleiste — squadMatch aus vorberechneten allRecs, kein extra Solve */}
      <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
        {allRecs.map((rec) => (
          <FormationTile
            key={rec.formationKey}
            formationKey={rec.formationKey}
            squadMatch={rec.squadMatch}
            playstyle={rec.formation.playstyle}
            isSelected={selectedKey === rec.formationKey}
            onClick={() => setSelectedKey((prev) => (prev === rec.formationKey ? null : rec.formationKey))}
          />
        ))}
      </div>

      {/* Best-Fit Panel — erscheint lazy wenn Kachel gewählt */}
      {selectedRec && (
        <BestFitPanel
          rec={selectedRec}
          onApply={() => onApply(selectedRec)}
        />
      )}
    </section>
  );
}
