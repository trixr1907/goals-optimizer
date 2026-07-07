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
      <body className="bg-slate-950 text-white antialiased
        /* Mobile: top/bottom padding to clear fixed nav bars */
        pt-11 pb-14
        lg:pt-0 lg:pb-0
        /* layout-root: single definite height anchor for the flex scroll chain */
        layout-root">
        <OnboardingModal />
        <div className="layout-children flex flex-col">
          <DisclaimerBanner />
          <div className="layout-page-wrapper">{children}</div>
          <footer className="border-t border-slate-800 px-4 py-3 text-center text-xs leading-relaxed text-slate-500 shrink-0">
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
