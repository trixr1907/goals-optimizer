'use client';

/**
 * WeightsPanel — opt-in Slider für Opinion-Gewichte (Phase F).
 *
 * Leitprinzip aus StepEF-Brief:
 *  - collapsed / advanced mode, kein Clutter
 *  - nur Opinion-Gewichte (🔓); Game-Truth gesperrt/unsichtbar
 *  - Reset-auf-Default Button
 *  - "angepasst"-Badge wenn weights ≠ Default
 *  - Auto-Normalisierung auf Σ=1 beim Slice-Change
 */

import { useWeightsStore, DEFAULT_WEIGHTS } from '@/lib/store/weights-store';
import { useState } from 'react';

interface SliderRowProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  note?: string;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, min = 0, max = 1, step = 0.05, note, onChange }: SliderRowProps) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-slate-400">{label}</label>
        <div className="flex items-center gap-2">
          {note && <span className="text-[10px] text-slate-600">{note}</span>}
          <span className="text-[11px] font-mono text-slate-300 w-8 text-right">
            {value.toFixed(2)}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-emerald-500"
      />
    </div>
  );
}

function ToggleRow({
  label,
  value,
  note,
  onChange,
}: {
  label: string;
  value: boolean;
  note?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[11px] text-slate-400">{label}</p>
        {note && <p className="text-[10px] text-slate-600">{note}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative shrink-0 w-8 h-4 rounded-full transition-colors ${
          value ? 'bg-emerald-600' : 'bg-slate-700'
        }`}
        aria-pressed={value}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function WeightsPanel() {
  const [open, setOpen] = useState(false);
  const { weights, isCustomized, setTrueValueWeight, setRatingBlendWeight, setRoiToggle, resetToDefault } =
    useWeightsStore();
  const tv = weights.trueValue;
  const rb = weights.ratingBlend;
  const rt = weights.roiToggles;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">⚙ Eigene Gewichtung</span>
          {isCustomized && (
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-amber-900/70 text-amber-300 font-semibold">
              angepasst
            </span>
          )}
          {!open && (
            <span className="text-[10px] text-slate-600 hidden sm:inline">
              — Optional · nur Opinion-Gewichte
            </span>
          )}
        </div>
        <span className="text-slate-500 text-xs">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-800 px-3 pb-3 pt-2 space-y-4">
          {/* Game-Truth: gesperrt */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-2 text-[10px] text-slate-600">
            🔒 Positions-Fit, Positions-Penalty und Rarity-Tiers sind GOALS-Spielmechanik —
            diese Werte sind nicht editierbar (würde das Spiel &quot;erfinden&quot;).
          </div>

          {/* True-Value Pillars */}
          <section className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              🔓 True-Value Pillar-Blend
            </p>
            <p className="text-[10px] text-slate-600">Auto-normalisiert auf Σ=1</p>
            <SliderRow
              label="Aktueller Stand (current)"
              value={tv.current}
              note={`Default ${DEFAULT_WEIGHTS.trueValue.current}`}
              onChange={(v) => setTrueValueWeight('current', v)}
            />
            <SliderRow
              label="Entwicklungsdecke (ceiling)"
              value={tv.ceiling}
              note={`Default ${DEFAULT_WEIGHTS.trueValue.ceiling}`}
              onChange={(v) => setTrueValueWeight('ceiling', v)}
            />
            <SliderRow
              label="Entwicklungsraum + TV (headroom)"
              value={tv.headroom}
              note={`Default ${DEFAULT_WEIGHTS.trueValue.headroom}`}
              onChange={(v) => setTrueValueWeight('headroom', v)}
            />
            <SliderRow
              label="Verbleibende Karriere (lifecycle)"
              value={tv.lifecycle}
              note={`Default ${DEFAULT_WEIGHTS.trueValue.lifecycle}`}
              onChange={(v) => setTrueValueWeight('lifecycle', v)}
            />
            <p className="text-[10px] text-slate-600 font-mono">
              Σ = {(tv.current + tv.ceiling + tv.headroom + tv.lifecycle).toFixed(2)}
            </p>
          </section>

          {/* Rating-Blend */}
          <section className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              🔓 Rating-Blend
            </p>
            <p className="text-[10px] text-slate-600">
              score = overall/99 · overallW + fit/100 · fitW · Auto-Σ=1
            </p>
            <SliderRow
              label="OVR-Anteil"
              value={rb.overallW}
              note={`Default ${DEFAULT_WEIGHTS.ratingBlend.overallW}`}
              onChange={(v) => setRatingBlendWeight('overallW', v)}
            />
            <SliderRow
              label="Fit-Anteil"
              value={rb.fitW}
              note={`Default ${DEFAULT_WEIGHTS.ratingBlend.fitW}`}
              onChange={(v) => setRatingBlendWeight('fitW', v)}
            />
          </section>

          {/* ROI Toggles */}
          <section className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              🔓 Upgrade-ROI Toggles
            </p>
            <ToggleRow
              label="Nur Tier-Cross → INVEST_NOW"
              note="Deaktiviert INVEST_NOW wenn kein sicherer Rarity-Sprung vorliegt"
              value={rt.tierCrossOnly}
              onChange={(v) => setRoiToggle('tierCrossOnly', v)}
            />
            <ToggleRow
              label="Alter ≥ 34 ignorieren"
              note="Zeigt normalen ROI auch für ältere Spieler (kein SELL_OR_LEGEND)"
              value={rt.ignoreLateAge}
              onChange={(v) => setRoiToggle('ignoreLateAge', v)}
            />
          </section>

          {/* Reset */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
            <p className="text-[10px] text-slate-600">
              Deine Anpassungen werden lokal gespeichert.
            </p>
            <button
              type="button"
              onClick={resetToDefault}
              disabled={!isCustomized}
              className="text-[11px] text-slate-500 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ↺ Reset auf Default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
