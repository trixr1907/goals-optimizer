'use client';

import { useState, useEffect } from 'react';

const ONBOARDING_SEEN_KEY = 'goals-onboarding-seen-v1';

export function OnboardingModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_SEEN_KEY);
    if (!seen) setOpen(true);
  }, []);

  function dismiss() {
    localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4">
        <h2 className="text-xl font-bold text-white">Willkommen beim GOALS Squad Optimizer</h2>

        <div className="space-y-3 text-sm text-slate-300">
          <p>
            Diese App hilft dir, dein GOALS-Team zu optimieren. Sie analysiert deinen Kader
            und gibt dir taktische Empfehlungen — basierend auf echten Spieler-Stats.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <FeatureCard
              icon="📊"
              title="Kader-Analyse"
              desc="Alle Spieler mit Stats, Positionen und Potential"
            />
            <FeatureCard
              icon="⚽"
              title="Aufstellung"
              desc="Optimiere deine Formation mit Drag & Drop"
            />
            <FeatureCard
              icon="🎯"
              title="Gegner-Analyse"
              desc="Analysiere Gegner vor dem Match"
            />
            <FeatureCard
              icon="📈"
              title="Entwicklung"
              desc="Track das Potential deiner Spieler"
            />
          </div>

          <p className="text-xs text-slate-500">
            Datenquellen: goalsverse.com, goals-tracker.com und playgoals.com · Keine erfundenen Zahlen — nur echte Stats.
          </p>

          <p className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-2 text-[10px] leading-relaxed text-amber-200/80">
            Inoffizielles Community-Tool — nicht verbunden mit GOALS AB. Keine offiziellen GOALS-Assets,
            keine Partnerschaft und kein offizieller Support durch GOALS AB.
          </p>
        </div>

        <button
          onClick={dismiss}
          className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors"
        >
          Loslegen
        </button>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="text-lg mb-1">{icon}</div>
      <p className="font-medium text-white text-xs">{title}</p>
      <p className="text-[10px] text-slate-500">{desc}</p>
    </div>
  );
}
