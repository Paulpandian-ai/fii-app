import { useEffect, useRef } from 'react';
import { dataRefreshManager } from '../services/DataRefreshManager';

type FetchFn = (signal: AbortSignal) => Promise<void>;

/**
 * Hook that subscribes a data stream to the DataRefreshManager.
 *
 * Automatically subscribes on mount and unsubscribes on unmount.
 * The fetchFn receives an AbortSignal for cancellation support.
 *
 * @param key       Unique stream identifier (e.g. 'prices', 'portfolio-summary')
 * @param fetchFn   Async function that performs the actual data fetch
 * @param intervalMs Base polling interval in milliseconds
 * @param enabled   Set to false to skip subscription (e.g. when tab is not focused)
 */
export function useDataRefresh(
  key: string,
  fetchFn: FetchFn,
  intervalMs: number,
  enabled: boolean = true,
): void {
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  useEffect(() => {
    if (!enabled) return;

    const unsub = dataRefreshManager.subscribe(
      key,
      (signal) => fetchFnRef.current(signal),
      intervalMs,
    );

    return unsub;
  }, [key, intervalMs, enabled]);
}
