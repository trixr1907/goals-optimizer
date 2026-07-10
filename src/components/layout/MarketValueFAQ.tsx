import { HelpCircle } from 'lucide-react';

const MARKET_VALUE_FAQ_TEXT =
  'Warum sehe ich keine Marktwerte? Aktuell gibt es leider keine öffentliche Preis-API (weder von GOALS noch von Drittanbietern wie goalsvalue). Sobald sich das ändert, binden wir die Live-Preise sofort für euch ein!';

export function MarketValueFAQ() {
  return (
    <details className="mx-auto max-w-3xl rounded-xl border border-amber-900/40 bg-slate-900/60 px-3 py-2 text-left text-xs text-slate-300 open:bg-slate-900/90">
      <summary className="flex cursor-pointer list-none items-center justify-center gap-2 text-amber-300 transition-colors hover:text-amber-200">
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Warum keine Marktwerte?</span>
      </summary>
      <p className="mt-2 text-center leading-relaxed text-slate-400">{MARKET_VALUE_FAQ_TEXT}</p>
    </details>
  );
}
