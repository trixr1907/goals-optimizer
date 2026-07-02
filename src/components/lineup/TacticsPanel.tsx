'use client';

import { useState, useMemo } from 'react';
import { PlayerWithScores, Position } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';
import { analyzeTactics, TACTICS_SETTINGS, TacticsTip, TipCategory } from '@/lib/tactics/tactics-engine';
import { useTacticsStore } from '@/lib/store/tactics-store';

const CAT_LABEL: Record<TipCategory, string> = {
  angriff: 'Angriff',
  verteidigung: 'Verteidigung',
  mittelfeld: 'Mittelfeld',
  torwart: 'Torwart',
  warnung: 'Warnung',
};

const CAT_COLOR: Record<TipCategory, string> = {
  angriff: 'border-emerald-800 bg-emerald-950/30',
  verteidigung: 'border-blue-800 bg-blue-950/30',
  mittelfeld: 'border-amber-800 bg-amber-950/30',
  torwart: 'border-purple-800 bg-purple-950/30',
  warnung: 'border-red-800 bg-red-950/30',
};

const CAT_BADGE: Record<TipCategory, string> = {
  angriff: 'bg-emerald-900/60 text-emerald-300',
  verteidigung: 'bg-blue-900/60 text-blue-300',
  mittelfeld: 'bg-amber-900/60 text-amber-300',
  torwart: 'bg-purple-900/60 text-purple-300',
  warnung: 'bg-red-900/60 text-red-300',
};

const STYLE_ICONS = {
  offensiv: '⚔️ Offensiv',
  ausgewogen: '⚖️ Ausgewogen',
  defensiv: '🛡️ Defensiv',
  konter: '⚡ Konter',
};

const PRESSING_ICONS = {
  hoch: '🔝 Hoch',
  mittel: '🔄 Mittel',
  tief: '⬇️ Tief',
};

const WIDTH_ICONS = {
  breit: '↔️ Breit',
  normal: '◾ Normal',
  eng: '↕️ Eng',
};

interface TacticsPanelProps {
  slots: LineupSlot[];
  lineup: Record<string, string | null>;
  players: PlayerWithScores[];
  benchPlayers: PlayerWithScores[];
  slotKeyFor: (pos: Position, idx: number) => string;
}

function TipCard({ tip }: { tip: TacticsTip }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border p-3 ${CAT_COLOR[tip.category]}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{tip.icon}</span>
            <span className="text-xs font-semibold text-white">{tip.headline}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${CAT_BADGE[tip.category]}`}>
              {CAT_LABEL[tip.category]}
            </span>
            <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>
      {open && (
        <p className="mt-2 text-xs text-slate-300 leading-relaxed border-t border-slate-700 pt-2">
          {tip.detail}
        </p>
      )}
    </div>
  );
}

const SETTING_GROUPS = [...new Set(TACTICS_SETTINGS.map((s) => s.group))];

function TacticsSettings() {
  const { settings, setSetting, resetAll } = useTacticsStore();
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 text-sm"
      >
        <span className="text-slate-300 font-medium">⚙️ Taktik-Einstellungen</span>
        <span className="text-slate-500 text-xs">{open ? '▲ einklappen' : '▼ ausklappen'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5 border-t border-slate-800 pt-4">
          {SETTING_GROUPS.map((group) => (
            <div key={group}>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">{group}</p>
              <div className="space-y-2">
                {TACTICS_SETTINGS.filter((s) => s.group === group).map((setting) => (
                  <div key={setting.id} className="flex items-center justify-between gap-3">
                    <label className="text-xs text-slate-400 shrink-0 w-40">{setting.label}</label>
                    {setting.type === 'select' && setting.options && (
                      <select
                        value={settings[setting.id] ?? setting.default}
                        onChange={(e) => setSetting(setting.id, e.target.value)}
                        className="flex-1 rounded border border-slate-700 bg-slate-800 text-xs text-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {setting.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={resetAll}
            className="text-[11px] text-slate-500 hover:text-red-300 mt-2"
          >
            Alle zurücksetzen
          </button>
        </div>
      )}
    </div>
  );
}

export function TacticsPanel({ slots, lineup, players, slotKeyFor }: TacticsPanelProps) {
  const { settings } = useTacticsStore();
  const [catFilter, setCatFilter] = useState<TipCategory | 'alle'>('alle');

  const filled = useMemo(() =>
    slots
      .map((slot, idx) => {
        const key = slotKeyFor(slot.position, idx);
        const pid = lineup[key];
        const player = pid ? players.find((p) => p.id === pid) : null;
        return { slot, player };
      })
      .filter((f) => f.player !== null) as { slot: LineupSlot; player: PlayerWithScores }[],
    [slots, lineup, players, slotKeyFor]
  );

  const analysis = useMemo(() => analyzeTactics(filled, settings), [filled, settings]);

  if (filled.length < 3) return null;

  const filteredTips = catFilter === 'alle'
    ? analysis.tips
    : analysis.tips.filter((t) => t.category === catFilter);

  const categories = [...new Set(analysis.tips.map((t) => t.category))];

  return (
    <div className="space-y-4 text-sm">
      {/* Schnellübersicht */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
        <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Taktik-Analyse</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-800/60 p-2 text-center">
            <p className="text-[10px] text-slate-500">Spielstil</p>
            <p className="text-xs font-bold text-white mt-0.5">{STYLE_ICONS[analysis.styleSuggestion]}</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-2 text-center">
            <p className="text-[10px] text-slate-500">Pressing</p>
            <p className="text-xs font-bold text-white mt-0.5">{PRESSING_ICONS[analysis.pressingSuggestion]}</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-2 text-center">
            <p className="text-[10px] text-slate-500">Breite</p>
            <p className="text-xs font-bold text-white mt-0.5">{WIDTH_ICONS[analysis.widthSuggestion]}</p>
          </div>
        </div>

        {analysis.overallWarnings.length > 0 && (
          <div className="space-y-1">
            {analysis.overallWarnings.map((w, i) => (
              <p key={i} className="text-xs text-red-400 flex items-start gap-1.5">
                <span className="shrink-0">⚠️</span> {w}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Taktik-Tipps */}
      {analysis.tips.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
              Taktik-Tipps ({analysis.tips.length})
            </p>
          </div>

          {/* Kategorie-Filter */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setCatFilter('alle')}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${catFilter === 'alle' ? 'bg-slate-600 border-slate-500 text-white' : 'border-slate-700 text-slate-400'}`}
            >
              Alle
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${catFilter === cat ? 'bg-slate-600 border-slate-500 text-white' : 'border-slate-700 text-slate-400'}`}
              >
                {CAT_LABEL[cat]}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredTips.length === 0 ? (
              <p className="text-xs text-slate-600">Keine Tipps für diese Kategorie.</p>
            ) : (
              filteredTips.map((tip) => <TipCard key={tip.id} tip={tip} />)
            )}
          </div>
        </div>
      )}

      {/* Taktik-Einstellungen */}
      <TacticsSettings />
    </div>
  );
}
