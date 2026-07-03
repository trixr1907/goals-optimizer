import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GOALS Squad Optimizer',
  description: 'Optimiere deinen GOALS-Kader mit Formation-Analyse, Taktik-Tipps und Entwicklungs-Tracker.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // safe-area support for notch devices
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-slate-950 text-white antialiased
        /* Mobile: top/bottom padding to clear fixed nav bars */
        pt-11 pb-14
        lg:pt-0 lg:pb-0">
        {children}
      </body>
    </html>
  );
}
