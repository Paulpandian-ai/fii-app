/**
 * DataRefreshManager — Unified data polling service.
 *
 * Manages automatic data refreshes across all screens with:
 * - Per-stream poll intervals (prices 30s, portfolio 60s, etc.)
 * - Market-hours awareness (intervals 5× longer outside 9:30–4:00 ET Mon-Fri)
 * - App state awareness (pause when backgrounded, resume on foreground)
 * - Request deduplication (one fetch per stream regardless of subscriber count)
 * - Exponential backoff on errors (30s → 60s → 120s → 5min, reset on success)
 * - AbortController cancellation when paused
 */

type FetchFn = (signal: AbortSignal) => Promise<void>;

interface StreamConfig {
  key: string;
  fetchFn: FetchFn;
  baseIntervalMs: number;
  subscriberCount: number;
  timerId: ReturnType<typeof setTimeout> | null;
  abortController: AbortController | null;
  lastFetchedAt: number;
  consecutiveErrors: number;
  isFetching: boolean;
}

class DataRefreshManager {
  private streams: Map<string, StreamConfig> = new Map();
  private isAppActive: boolean = true;
  private _marketOpenCached: boolean | null = null;
  private _marketCheckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Refresh market-hours check every 60s
    this._refreshMarketStatus();
    this._marketCheckTimer = setInterval(() => this._refreshMarketStatus(), 60_000);
  }

  /** Check if US market is currently open (9:30 AM – 4:00 PM ET, Mon–Fri). */
  get isMarketOpen(): boolean {
    if (this._marketOpenCached !== null) return this._marketOpenCached;
    this._refreshMarketStatus();
    return this._marketOpenCached ?? false;
  }

  private _refreshMarketStatus(): void {
    const now = new Date();
    // Convert to Eastern Time
    const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etString);
    const day = et.getDay(); // 0=Sun, 6=Sat
    const hours = et.getHours();
    const minutes = et.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    // Mon-Fri, 9:30 AM (570 min) to 4:00 PM (960 min)
    this._marketOpenCached =
      day >= 1 && day <= 5 && totalMinutes >= 570 && totalMinutes < 960;
  }

  /** Effective interval: base interval × 5 if market is closed. */
  private _effectiveInterval(baseMs: number): number {
    return this.isMarketOpen ? baseMs : baseMs * 5;
  }

  /** Backoff delay added on top of the interval after consecutive errors. */
  private _backoffMs(errors: number): number {
    if (errors <= 0) return 0;
    // 30s, 60s, 120s, cap at 5min
    return Math.min(30_000 * Math.pow(2, errors - 1), 300_000);
  }

  /**
   * Subscribe a data stream for automatic polling.
   *
   * If the stream already exists (another component subscribed to the same key),
   * the subscriber count is incremented — no duplicate timers are created.
   *
   * @returns An unsubscribe function.
   */
  subscribe(
    key: string,
    fetchFn: FetchFn,
    intervalMs: number,
  ): () => void {
    const existing = this.streams.get(key);
    if (existing) {
      existing.subscriberCount++;
      // If stream was dormant (timer cleared), restart it
      if (!existing.timerId && this.isAppActive) {
        this._scheduleNext(key);
      }
      return () => this.unsubscribe(key);
    }

    const config: StreamConfig = {
      key,
      fetchFn,
      baseIntervalMs: intervalMs,
      subscriberCount: 1,
      timerId: null,
      abortController: null,
      lastFetchedAt: 0,
      consecutiveErrors: 0,
      isFetching: false,
    };
    this.streams.set(key, config);

    // Perform initial fetch immediately, then schedule recurring
    if (this.isAppActive) {
      this._doFetch(key);
    }

    return () => this.unsubscribe(key);
  }

  /** Decrement subscriber count; stop polling when no subscribers remain. */
  unsubscribe(key: string): void {
    const config = this.streams.get(key);
    if (!config) return;

    config.subscriberCount--;
    if (config.subscriberCount <= 0) {
      this._clearTimer(key);
      if (config.abortController) {
        config.abortController.abort();
        config.abortController = null;
      }
      this.streams.delete(key);
    }
  }

  /** Pause all polling (app backgrounded). */
  pause(): void {
    this.isAppActive = false;
    for (const [key, config] of this.streams) {
      this._clearTimer(key);
      if (config.abortController) {
        config.abortController.abort();
        config.abortController = null;
      }
    }
  }

  /** Resume all polling (app foregrounded). */
  resume(): void {
    this.isAppActive = true;
    this._refreshMarketStatus();
    for (const [key] of this.streams) {
      this._doFetch(key);
    }
  }

  /** Force-refresh a specific stream immediately. */
  async refresh(key: string): Promise<void> {
    const config = this.streams.get(key);
    if (!config) return;
    this._clearTimer(key);
    await this._doFetch(key);
  }

  /** Force-refresh all active streams (e.g. pull-to-refresh). */
  async refreshAll(): Promise<void> {
    const keys = Array.from(this.streams.keys());
    await Promise.all(keys.map((k) => this.refresh(k)));
  }

  /** Get timestamp of last successful fetch for a stream. */
  getLastFetchedAt(key: string): number {
    return this.streams.get(key)?.lastFetchedAt ?? 0;
  }

  /** Check if a stream's data is stale (older than its expected interval). */
  isStale(key: string): boolean {
    const config = this.streams.get(key);
    if (!config) return true;
    const interval = this._effectiveInterval(config.baseIntervalMs);
    return Date.now() - config.lastFetchedAt > interval * 1.5;
  }

  // ─── Internal ───

  private async _doFetch(key: string): Promise<void> {
    const config = this.streams.get(key);
    if (!config || config.isFetching) return;

    config.isFetching = true;
    config.abortController = new AbortController();

    try {
      await config.fetchFn(config.abortController.signal);
      config.lastFetchedAt = Date.now();
      config.consecutiveErrors = 0;
    } catch (err: any) {
      // Don't count aborted requests as errors
      if (err?.name !== 'AbortError') {
        config.consecutiveErrors++;
      }
    } finally {
      config.isFetching = false;
      config.abortController = null;
      // Schedule the next poll
      if (this.isAppActive && config.subscriberCount > 0) {
        this._scheduleNext(key);
      }
    }
  }

  private _scheduleNext(key: string): void {
    const config = this.streams.get(key);
    if (!config) return;

    this._clearTimer(key);
    const interval =
      this._effectiveInterval(config.baseIntervalMs) +
      this._backoffMs(config.consecutiveErrors);

    config.timerId = setTimeout(() => {
      this._doFetch(key);
    }, interval);
  }

  private _clearTimer(key: string): void {
    const config = this.streams.get(key);
    if (config?.timerId) {
      clearTimeout(config.timerId);
      config.timerId = null;
    }
  }

  /** Clean up everything (for tests or app teardown). */
  destroy(): void {
    for (const [key] of this.streams) {
      this._clearTimer(key);
      const config = this.streams.get(key);
      if (config?.abortController) {
        config.abortController.abort();
      }
    }
    this.streams.clear();
    if (this._marketCheckTimer) {
      clearInterval(this._marketCheckTimer);
      this._marketCheckTimer = null;
    }
  }
}

export const dataRefreshManager = new DataRefreshManager();
