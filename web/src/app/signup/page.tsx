'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signUp, confirmSignUp, signIn } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';

export default function SignUpPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [step, setStep] = useState<'register' | 'confirm'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signUp(email, password, name);
      setStep('confirm');
    } catch (err) {
      setError((err as Error).message || 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmSignUp(email, code);
      const tokens = await signIn(email, password);
      setUser(
        { id: 'current', email, name: name || email },
        tokens.idToken,
      );
      router.push('/feed');
    } catch (err) {
      setError((err as Error).message || 'Failed to confirm');
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
          <h1 className="text-2xl font-bold text-white">
            {step === 'register' ? 'Create your account' : 'Verify your email'}
          </h1>
          <p className="text-fii-text-secondary text-sm mt-1">
            {step === 'register'
              ? 'Start making smarter investment decisions'
              : `We sent a code to ${email}`}
          </p>
        </div>

        {error && (
          <div className="p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {step === 'register' ? (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-fii-text-secondary mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-fii-card border border-fii-border rounded-lg text-white placeholder-fii-muted focus:outline-none focus:ring-2 focus:ring-fii-accent/50"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fii-text-secondary mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-fii-card border border-fii-border rounded-lg text-white placeholder-fii-muted focus:outline-none focus:ring-2 focus:ring-fii-accent/50"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fii-text-secondary mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2.5 bg-fii-card border border-fii-border rounded-lg text-white placeholder-fii-muted focus:outline-none focus:ring-2 focus:ring-fii-accent/50"
                placeholder="Min 8 characters"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-fii-accent text-white rounded-lg font-medium hover:bg-fii-accent-hover transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirm} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-fii-text-secondary mb-1">Verification Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-fii-card border border-fii-border rounded-lg text-white placeholder-fii-muted focus:outline-none focus:ring-2 focus:ring-fii-accent/50 text-center text-2xl tracking-widest"
                placeholder="000000"
                maxLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-fii-accent text-white rounded-lg font-medium hover:bg-fii-accent-hover transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-fii-text-secondary mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-fii-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
