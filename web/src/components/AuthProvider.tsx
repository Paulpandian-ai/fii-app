'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getCurrentSession, getCurrentUserEmail } from '@/lib/auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setUser, clearAuth, setLoading } = useAuthStore();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await getCurrentSession();
        if (session) {
          const email = await getCurrentUserEmail();
          setUser(
            { id: 'current', email: email || '', name: email || '' },
            session.idToken,
          );
        } else {
          clearAuth();
        }
      } catch {
        clearAuth();
      }
    };
    checkAuth();
  }, [setUser, clearAuth, setLoading]);

  return <>{children}</>;
}
