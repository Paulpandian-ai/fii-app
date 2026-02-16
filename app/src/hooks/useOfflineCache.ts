import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OfflineCacheResult<T> {
  data: T | null;
  isLoading: boolean;
  isStale: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  cachedAt: string | null;
}

export function useOfflineCache<T>(
  key: string,
  fetcher: () => Promise<T>
): OfflineCacheResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(false);

    try {
      const result = await fetcher();
      setData(result);
      setIsStale(false);

      // Cache the result
      const cacheEntry = {
        data: result,
        cachedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(key, JSON.stringify(cacheEntry));
      setCachedAt(cacheEntry.cachedAt);
    } catch {
      // Try cache
      try {
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          setData(parsed.data);
          setIsStale(true);
          setCachedAt(parsed.cachedAt ?? null);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [key, fetcher]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, isLoading, isStale, error, refresh: load, cachedAt };
}
