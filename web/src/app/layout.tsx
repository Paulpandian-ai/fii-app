import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { MobileNav } from '@/components/MobileNav';
import { AuthProvider } from '@/components/AuthProvider';
import { VisibilityManager } from '@/components/VisibilityManager';

export const metadata: Metadata = {
  title: 'FII — Factor-based Investment Intelligence',
  description: 'AI-powered stock analysis with 6-factor scoring, real-time signals, and portfolio optimization.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <AuthProvider>
          <VisibilityManager />
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 pb-16 lg:pb-0">
              {children}
            </main>
          </div>
          <MobileNav />
        </AuthProvider>
      </body>
    </html>
  );
}
