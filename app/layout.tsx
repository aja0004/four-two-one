import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '4-2-1 • Dinner Decided',
  description: 'A sleek 4 → 2 → 1 dinner decision funnel for two.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '4-2-1',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F2F7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] bg-ios-bg text-ios-label antialiased selection:bg-ios-accent/20">
        {children}
      </body>
    </html>
  );
}
