'use client';

// Compact stat tooltip that shows mechanic details from stat-reference.json
// Usage: <StatTooltip statKey="finishing" />

import { useState } from 'react';
import statRef from '@/config/stat-reference.json';

type StatRefEntry = {
  display_de: string;
  category: string;
  description: string;
  mechanic: string;
  interactions: string[];
  is_active: boolean;
  note?: string;
};

const STAT_DATA = statRef as Record<string, StatRefEntry>;

const CAT_COLOR: Record<string, string> = {
  Pace: 'text-yellow-400',
  Shooting: 'text-red-400',
  Passing: 'text-blue-400',
  Dribbling: 'text-emerald-400',
  Defending: 'text-purple-400',
  Physical: 'text-orange-400',
  Goalkeeping: 'text-cyan-400',
};

interface StatTooltipProps {
  statKey: string;
  children?: React.ReactNode;
}

export function StatTooltip({ statKey, children }: StatTooltipProps) {
  const [open, setOpen] = useState(false);
  const info = STAT_DATA[statKey];

  if (!info) return <>{children}</>;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 group"
        title={info.display_de}
      >
        {children}
        <span className="text-slate-600 group-hover:text-slate-400 text-[10px]">ⓘ</span>
      </button>

      {open && (
        <>
          {/* Backdrop to close */}
          <span
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-50 left-0 top-full mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">{info.display_de}</span>
              <span className={`text-[10px] font-medium ${CAT_COLOR[info.category] ?? 'text-slate-400'}`}>
                {info.category}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">{info.description}</p>
            <div className="border-t border-slate-800 pt-2">
              <p className="text-slate-500 text-[11px] font-medium mb-1">Mechanik</p>
              <p className="text-slate-400 leading-relaxed">{info.mechanic}</p>
            </div>
            {info.interactions.length > 0 && (
              <div>
                <p className="text-slate-500 text-[11px] font-medium mb-1">Synergiert mit</p>
                <div className="flex flex-wrap gap-1">
                  {info.interactions.map((k) => (
                    <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {STAT_DATA[k]?.display_de ?? k}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!info.is_active && info.note && (
              <p className="text-amber-400 text-[10px] border-t border-slate-800 pt-2">{info.note}</p>
            )}
          </div>
        </>
      )}
    </span>
  );
}

// Hook: get stat info by key
export function useStatInfo(statKey: string): StatRefEntry | null {
  return STAT_DATA[statKey] ?? null;
}

// List of all stat keys
export const ALL_STAT_KEYS = Object.keys(STAT_DATA);
