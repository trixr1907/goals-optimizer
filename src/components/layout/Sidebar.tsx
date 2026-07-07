'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSquadStore } from '@/lib/store/squad-store';

const NAV_ITEMS = [
  { href: '/', label: 'Heim', icon: '🏠', exact: true },
  { href: '/squad', label: 'Kader', icon: '👥' },
  { href: '/lineup', label: 'Aufstellung', icon: '⚽', exact: true },
  { href: '/lineup/alternatives', label: 'Alternativen', icon: '🔄' },
  { href: '/development', label: 'Entwicklung', icon: '📈' },
  { href: '/meta', label: 'Meta Center', icon: '🎯' },
  { href: '/matchup', label: 'Gegner-Analyse', icon: '⚔️' },
  { href: '/debug', label: 'Debug Canvas', icon: '🗺️' },
];

// Items shown in the mobile bottom bar (max 5 to fit)
const MOBILE_NAV = [
  { href: '/', label: 'Import', icon: '🏠', exact: true },
  { href: '/squad', label: 'Kader', icon: '👥' },
  { href: '/lineup', label: 'Lineup', icon: '⚽', exact: true },
  { href: '/development', label: 'Dev', icon: '📈' },
  { href: '/matchup', label: 'Matchup', icon: '⚔️' },
];

function isActive(href: string, pathname: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  const { clubName, clubId, clearSquad } = useSquadStore();
  const router = useRouter();

  return (
    <>
      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-900/50 hidden lg:flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <h1 className="text-lg font-bold text-white tracking-tight">GOALS</h1>
          <p className="text-xs text-slate-500">Squad Optimizer</p>
          <p className="text-[10px] text-slate-600 mt-0.5">by ivo-tech · unofficial</p>
        </div>
        {/* Club-Info + Wechseln */}
        {clubId && (
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase">Club</p>
            <p className="text-xs text-white truncate">{clubName || 'Kein Club'}</p>
            <button
              onClick={() => { clearSquad(); router.push('/'); }}
              className="text-[10px] text-emerald-400 hover:underline mt-1"
            >
              Wechseln
            </button>
          </div>
        )}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href, pathname, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-slate-800 text-white font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
                {(item.href === '/development' || item.href === '/meta') && (
                  <span className="ml-auto text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                    NEU
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ── Mobile top header (visible on small screens) ── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-11 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <span className="text-sm font-bold text-white tracking-tight">GOALS</span>
        <span className="text-xs text-slate-500">Squad Optimizer</span>
      </header>

      {/* ── Mobile bottom nav bar ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex bg-slate-950/95 backdrop-blur border-t border-slate-800 safe-area-bottom">
        {MOBILE_NAV.map((item) => {
          const active = isActive(item.href, pathname, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] transition-colors ${
                active ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
