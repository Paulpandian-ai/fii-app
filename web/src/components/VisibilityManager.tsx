'use client';

import { useEffect } from 'react';
import { dataRefreshManager } from '@/lib/DataRefreshManager';

export function VisibilityManager() {
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        dataRefreshManager.pause();
      } else {
        dataRefreshManager.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return null;
}
