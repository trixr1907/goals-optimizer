import type { Metadata, Viewport } from 'next';
import './globals.css';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';

export const metadata: Metadata = {
  title: 'GOALS Squad Optimizer',
  description: 'Optimiere deinen GOALS-Kader mit Formation-Analyse, Taktik-Tipps und Entwicklungs-Tracker.',
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
        {children}
      </body>
    </html>
  );
}
