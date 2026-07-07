import type { Metadata, Viewport } from 'next';
import './globals.css';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { DisclaimerBanner } from '@/components/layout/DisclaimerBanner';

export const metadata: Metadata = {
  title: 'GOALS Squad Optimizer',
  description:
    'Unofficial community fan tool by ivo-tech for the game Goals. Not affiliated with, endorsed by, or connected to the Goals developers.',
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
          <DisclaimerBanner />
          <div className="flex-1">{children}</div>
          <footer className="border-t border-slate-800 px-4 py-3 text-center text-xs leading-relaxed text-slate-500">
            Unofficial community tool by{' '}
            <span className="text-slate-400 font-medium">ivo-tech</span> /{' '}
            <span className="text-slate-400 font-medium">trixr1907</span> — not affiliated with or
            endorsed by the Goals developers.
          </footer>
        </div>
      </body>
    </html>
  );
}
