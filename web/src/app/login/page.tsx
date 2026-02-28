'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';
import { getCurrentUserEmail } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const tokens = await signIn(email, password);
      const userEmail = await getCurrentUserEmail();
      setUser(
        { id: 'current', email: userEmail || email, name: userEmail || email },
        tokens.idToken,
      );
      router.push('/feed');
    } catch (err) {
      setError((err as Error).message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-fii-accent to-blue-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">FII</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-fii-text-secondary text-sm mt-1">
            Sign in to your FII account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-fii-text-secondary mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-fii-card border border-fii-border rounded-lg text-white placeholder-fii-muted focus:outline-none focus:ring-2 focus:ring-fii-accent/50 focus:border-fii-accent"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fii-text-secondary mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-fii-card border border-fii-border rounded-lg text-white placeholder-fii-muted focus:outline-none focus:ring-2 focus:ring-fii-accent/50 focus:border-fii-accent"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-fii-accent text-white rounded-lg font-medium hover:bg-fii-accent-hover transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-fii-text-secondary mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-fii-accent hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
