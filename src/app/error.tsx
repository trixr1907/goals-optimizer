'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="max-w-md space-y-4 rounded-2xl border border-red-900/50 bg-slate-900 p-6 text-center shadow-xl">
        <p className="text-lg font-bold text-red-400">Unerwarteter Fehler</p>
        <p className="text-sm leading-relaxed text-slate-400">
          {error.message || 'Die Seite konnte nicht geladen werden.'}
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Erneut versuchen
        </button>
        <p className="pt-2 text-xs text-slate-600">
          Inoffizielles Community-Tool — nicht verbunden mit GOALS AB.
        </p>
      </div>
    </div>
  );
}
