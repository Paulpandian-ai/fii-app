type FetchFn = (signal?: AbortSignal) => Promise<void>;

interface Stream {
  key: string;
  fetchFn: FetchFn;
  intervalMs: number;
  timerId: ReturnType<typeof setInterval> | null;
  controller: AbortController | null;
  lastFetch: number;
  errorCount: number;
}

class DataRefreshManager {
  private streams = new Map<string, Stream>();
  private paused = false;

  get isMarketOpen(): boolean {
    const now = new Date();
    const day = now.getUTCDay();
    if (day === 0 || day === 6) return false;
    const etHour = (now.getUTCHours() - 5 + 24) % 24;
    const etMin = now.getUTCMinutes();
    const totalMin = etHour * 60 + etMin;
    return totalMin >= 570 && totalMin <= 960; // 9:30 AM - 4:00 PM ET
  }

  private getEffectiveInterval(baseMs: number): number {
    return this.isMarketOpen ? baseMs : baseMs * 5;
  }

  subscribe(key: string, fetchFn: FetchFn, intervalMs: number): () => void {
    this.unsubscribe(key);

    const stream: Stream = {
      key,
      fetchFn,
      intervalMs,
      timerId: null,
      controller: null,
      lastFetch: 0,
      errorCount: 0,
    };

    this.streams.set(key, stream);

    // Initial fetch
    this.executeFetch(stream);

    // Start polling
    if (!this.paused) {
      this.startPolling(stream);
    }

    return () => this.unsubscribe(key);
  }

  unsubscribe(key: string): void {
    const stream = this.streams.get(key);
    if (stream) {
      if (stream.timerId) clearInterval(stream.timerId);
      if (stream.controller) stream.controller.abort();
      this.streams.delete(key);
    }
  }

  private startPolling(stream: Stream): void {
    if (stream.timerId) clearInterval(stream.timerId);
    const interval = this.getEffectiveInterval(stream.intervalMs);
    stream.timerId = setInterval(() => this.executeFetch(stream), interval);
  }

  private async executeFetch(stream: Stream): Promise<void> {
    if (stream.controller) stream.controller.abort();
    stream.controller = new AbortController();

    try {
      await stream.fetchFn(stream.controller.signal);
      stream.lastFetch = Date.now();
      stream.errorCount = 0;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      stream.errorCount++;
    }
  }

  pause(): void {
    this.paused = true;
    for (const stream of this.streams.values()) {
      if (stream.timerId) {
        clearInterval(stream.timerId);
        stream.timerId = null;
      }
    }
  }

  resume(): void {
    this.paused = false;
    for (const stream of this.streams.values()) {
      this.startPolling(stream);
      // Re-fetch if stale
      if (Date.now() - stream.lastFetch > stream.intervalMs) {
        this.executeFetch(stream);
      }
    }
  }

  async refresh(key: string): Promise<void> {
    const stream = this.streams.get(key);
    if (stream) await this.executeFetch(stream);
  }

  async refreshAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.streams.values()).map((s) => this.executeFetch(s)),
    );
  }

  destroy(): void {
    for (const key of this.streams.keys()) {
      this.unsubscribe(key);
    }
  }
}

export const dataRefreshManager = new DataRefreshManager();
