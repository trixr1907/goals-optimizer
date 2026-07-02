'use client';

import { useMemo, useState } from 'react';
import { useSquadStore } from '@/lib/store/squad-store';
import { Sidebar } from '@/components/layout/Sidebar';
import { appPath } from '@/lib/app-url';
import { recommendFormations, FormationRecommendation, FormationAssignment } from '@/lib/optimizer/formation-optimizer';

type TabKey = 'offensiv' | 'defensiv' | 'gegenMeta' | 'custom';

const TABS: { key: TabKey; label: string; icon: string; description: string }[] = [
  { key: 'offensiv', label: 'Offensiv', icon: '⚔️', description: 'Maximiert Angriffs-Stats. Ideal für Must-Win-Situationen.' },
  { key: 'defensiv', label: 'Defensiv', icon: '🛡️', description: 'Minimiert defensive Lücken. Ideal gegen starke Gegner.' },
  { key: 'gegenMeta', label: 'Gegen-Meta', icon: '🧠', description: 'Maximiert Pace + defensive Recovery — konteraufrüstung gegen Through-Ball-Meta.' },
  { key: 'custom', label: 'Custom', icon: '✏️', description: 'Wähle Formation und Variante manuell.' },
];

const FIT_COLOR: Record<string, string> = {
  high: 'text-emerald-400',
  mid: 'text-amber-400',
  low: 'text-red-400',
};

function fc(fit: number) {
  return fit >= 85 ? FIT_COLOR.high : fit >= 70 ? FIT_COLOR.mid : FIT_COLOR.low;
}

function fitBar(fit: number) {
  const color = fit >= 85 ? 'bg-emerald-500' : fit >= 70 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${fit}%` }} />
      </div>
      <span className={`font-mono text-[11px] ${fc(fit)}`}>{fit.toFixed(0)}</span>
    </div>
  );
}

// Mini pitch showing just dots at relative positions
function MiniPitch({ assignments }: { assignments: FormationAssignment[] }) {
  return (
    <div className="relative w-full aspect-[7/10] max-h-72 bg-green-900/20 border border-slate-800 rounded-xl overflow-hidden">
      {/* Field markings */}
      <div className="absolute inset-[5%] border border-white/10 rounded-lg" />
      <div className="absolute left-[5%] right-[5%] top-[50%] border-t border-white/10" />
      <div className="absolute left-[25%] right-[25%] top-[5%] h-[15%] border border-white/10" />
      <div className="absolute left-[25%] right-[25%] bottom-[5%] h-[15%] border border-white/10" />

      {assignments.map(({ slot, player, fit }) => (
        <div
          key={slot.position + slot.x + slot.y}
          className="absolute flex flex-col items-center"
          style={{
            left: `${slot.x * 100}%`,
            top: `${slot.y * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 ${
              fit >= 85 ? 'border-emerald-500 bg-emerald-900/60' :
              fit >= 70 ? 'border-amber-400 bg-amber-900/40' :
              'border-red-500 bg-red-900/40'
            }`}
          >
            {player.overall}
          </div>
          <span className="text-[8px] text-slate-300 mt-0.5 whitespace-nowrap max-w-14 truncate text-center">
            {player.name.split(' ')[0]}
          </span>
        </div>
      ))}
    </div>
  );
}

function AssignmentTable({ assignments }: { assignments: FormationAssignment[] }) {
  return (
    <div className="space-y-1">
      {assignments.map(({ slot, player, fit }) => (
        <div
          key={slot.position + slot.x + slot.y}
          className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-slate-900/40 hover:bg-slate-800/40"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] text-slate-500 w-10 shrink-0">{slot.position}</span>
            <span className="text-xs text-white truncate">{player.name}</span>
            <span className="text-[10px] text-slate-600 shrink-0">OVR {player.overall}</span>
          </div>
          {fitBar(fit)}
        </div>
      ))}
    </div>
  );
}

function FormationCard({
  rec,
  tab,
}: {
  rec: FormationRecommendation;
  tab: TabKey;
}) {
  const assignments = tab === 'offensiv' || tab === 'defensiv' || tab === 'gegenMeta'
    ? rec.variants[tab]
    : rec.variants.offensiv;

  const totalFit = assignments.reduce((s, a) => s + a.fit, 0);
  const avgFit = assignments.length ? totalFit / assignments.length : 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
      {/* Formation header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <span className="font-bold text-white">{rec.formation.name}</span>
          <span className="ml-2 text-xs text-slate-500">{rec.formation.playstyle}</span>
        </div>
        <div className="text-right">
          <span className={`font-mono text-sm font-bold ${fc(avgFit)}`}>{avgFit.toFixed(0)}</span>
          <span className="text-xs text-slate-600 ml-1">Ø Meta</span>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <MiniPitch assignments={assignments} />

        <div className="space-y-3">
          {/* Begründungen */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Begründung</p>
            <ul className="space-y-1">
              {rec.reasons.map((r, i) => (
                <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                  <span className="text-emerald-600 shrink-0">›</span> {r}
                </li>
              ))}
            </ul>
          </div>

          {/* Warnungen */}
          {rec.warnings.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-amber-600 mb-1">Warnungen</p>
              <ul className="space-y-1">
                {rec.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-300 flex items-start gap-1.5">
                    <span className="shrink-0">⚠️</span> {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Stärken/Schwächen */}
          {rec.formation.strengths && (
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <p className="text-emerald-600 mb-1">Stärken</p>
                {rec.formation.strengths.map((s, i) => <p key={i} className="text-slate-400">+ {s}</p>)}
              </div>
              {rec.formation.weaknesses && (
                <div>
                  <p className="text-red-600 mb-1">Schwächen</p>
                  {rec.formation.weaknesses.map((s, i) => <p key={i} className="text-slate-400">− {s}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Aufstellung-Liste */}
      <div className="border-t border-slate-800 p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Spielerzuweisung</p>
        <AssignmentTable assignments={assignments} />
      </div>
    </div>
  );
}

export default function AlternativeLineupsPage() {
  const { players, _hasHydrated } = useSquadStore();
  const [activeTab, setActiveTab] = useState<TabKey>('offensiv');
  const [customFormation, setCustomFormation] = useState('');
  const [customVariant, setCustomVariant] = useState<'offensiv' | 'defensiv' | 'gegenMeta'>('offensiv');

  const recommendations = useMemo(() => recommendFormations(players), [players]);

  const formationKeys = recommendations.map((r) => r.formationKey);

  const displayRecs = useMemo(() => {
    if (activeTab === 'custom' && customFormation) {
      const found = recommendations.find((r) => r.formationKey === customFormation);
      return found ? [found] : [];
    }
    return recommendations.slice(0, 3);
  }, [recommendations, activeTab, customFormation]);

  if (!_hasHydrated || players.length === 0) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-slate-400">Kein Kader geladen.</p>
            <a href={appPath('/')} className="text-emerald-400 underline text-sm">Zum Import</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
          <div>
            <h2 className="text-xl font-bold text-white">Alternative Aufstellungen</h2>
            <p className="text-sm text-slate-500">Offensive, defensive und Meta-angepasste Varianten deines Kaders.</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 flex-wrap border-b border-slate-800 pb-3">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-emerald-800/60 text-emerald-300 border border-emerald-700'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </div>

          {/* Tab description + custom controls */}
          <div className="rounded-xl bg-slate-900/30 border border-slate-800 p-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              {TABS.find((t) => t.key === activeTab)?.description}
            </p>
            {activeTab === 'custom' && (
              <div className="flex gap-2 flex-wrap">
                <select
                  value={customFormation}
                  onChange={(e) => setCustomFormation(e.target.value)}
                  className="h-7 rounded border border-slate-700 bg-slate-800 text-xs text-white px-2"
                >
                  <option value="">Formation wählen…</option>
                  {formationKeys.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <select
                  value={customVariant}
                  onChange={(e) => setCustomVariant(e.target.value as typeof customVariant)}
                  className="h-7 rounded border border-slate-700 bg-slate-800 text-xs text-white px-2"
                >
                  <option value="offensiv">Offensiv</option>
                  <option value="defensiv">Defensiv</option>
                  <option value="gegenMeta">Gegen-Meta</option>
                </select>
              </div>
            )}
          </div>

          {/* Formation Cards */}
          <div className="space-y-4">
            {displayRecs.length === 0 && (
              <p className="text-center text-slate-500 text-sm py-12">
                {activeTab === 'custom' ? 'Formation auswählen.' : 'Nicht genug Spieler (mind. 11).'}
              </p>
            )}
            {displayRecs.map((rec) => (
              <FormationCard
                key={rec.formationKey}
                rec={rec}
                tab={activeTab === 'custom' ? customVariant : activeTab}
              />
            ))}
          </div>

          <div className="text-center pt-2">
            <a href={appPath('/lineup')} className="text-xs text-emerald-400 underline">
              → Zur Hauptaufstellung wechseln
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
