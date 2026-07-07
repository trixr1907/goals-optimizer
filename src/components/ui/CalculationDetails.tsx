'use client';

import { useState } from 'react';

interface CalculationDetailsProps {
  title: string;
  formula: string;
  rows: Array<{ label: string; value: string; note?: string }>;
  result: string;
  className?: string;
}

/** Collapsed-by-default explanation block for calculated values. */
export function CalculationDetails({ title, formula, rows, result, className = '' }: CalculationDetailsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        aria-expanded={open}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>Rechenweg</span>
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-[11px] text-slate-400 space-y-2">
          <div>
            <p className="font-semibold text-slate-300">{title}</p>
            <p className="mt-0.5 font-mono text-[10px] text-slate-500">{formula}</p>
          </div>
          <div className="space-y-1">
            {rows.map((row) => (
              <div key={`${row.label}-${row.value}`} className="flex items-start justify-between gap-3">
                <span className="text-slate-500">{row.label}</span>
                <span className="text-right font-mono text-slate-300">
                  {row.value}
                  {row.note && <span className="ml-1 font-sans text-slate-600">{row.note}</span>}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-800 pt-1.5 font-semibold text-slate-200">
            ⇒ {result}
          </div>
        </div>
      )}
    </div>
  );
}

export type { CalculationDetailsProps };
