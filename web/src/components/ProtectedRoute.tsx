'use client';

import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fii-accent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="w-16 h-16 rounded-full bg-fii-accent/10 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-fii-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Sign in to access</h2>
        <p className="text-fii-text-secondary text-sm mb-6 text-center max-w-sm">
          Create an account or sign in to access your portfolio, strategy tools, and personalized coaching.
        </p>
        <Link
          href="/login"
          className="px-6 py-2.5 bg-fii-accent text-white rounded-lg font-medium hover:bg-fii-accent-hover transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
