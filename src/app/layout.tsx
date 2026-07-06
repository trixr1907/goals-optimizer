import type { Metadata, Viewport } from 'next';
import './globals.css';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';

export const metadata: Metadata = {
  title: 'GOALS Squad Optimizer',
  description: 'Inoffizielles Community-Tool zur Optimierung deines GOALS-Kaders mit Formation-Analyse, Taktik-Tipps und Entwicklungs-Tracker.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-slate-950 text-white antialiased
        /* Mobile: top/bottom padding to clear fixed nav bars */
        pt-11 pb-14
        lg:pt-0 lg:pb-0">
        <OnboardingModal />
        <div className="min-h-screen flex flex-col">
          <div className="flex-1">{children}</div>
          <footer className="border-t border-slate-900/80 px-4 py-3 text-center text-[10px] leading-relaxed text-slate-600">
            Inoffizielles Community-Tool — nicht verbunden mit GOALS AB. Datenquellen: goalsverse.com,
            goals-tracker.com und playgoals.com.
          </footer>
        </div>
      </body>
    </html>
  );
}
