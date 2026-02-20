import { create } from 'zustand';
import type { FullAnalysis, Signal } from '../types';

/** Lightweight signal summary — the minimum data every component needs. */
export interface SignalSummary {
  ticker: string;
  score: number;
  signal: Signal;
}

interface SignalStore {
  analyses: Record<string, FullAnalysis>;  // keyed by ticker
  /** Lightweight score/signal cache populated by any API response. */
  signals: Record<string, SignalSummary>;
  isLoading: boolean;
  error: string | null;
  setAnalysis: (ticker: string, analysis: FullAnalysis) => void;
  getAnalysis: (ticker: string) => FullAnalysis | undefined;
  /** Upsert one or more signal summaries. Use from API response handlers. */
  upsertSignals: (items: SignalSummary[]) => void;
  /** Get the cached signal summary for a ticker. */
  getSignal: (ticker: string) => SignalSummary | undefined;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSignalStore = create<SignalStore>((set, get) => ({
  analyses: {},
  signals: {},
  isLoading: false,
  error: null,

  setAnalysis: (ticker, analysis) =>
    set((state) => ({
      analyses: { ...state.analyses, [ticker]: analysis },
      error: null,
    })),

  getAnalysis: (ticker) => get().analyses[ticker],

  upsertSignals: (items) =>
    set((state) => {
      const updated = { ...state.signals };
      for (const item of items ?? []) {
        if (item?.ticker && item.score != null && item.signal) {
          updated[item.ticker] = item;
        }
      }
      return { signals: updated };
    }),

  getSignal: (ticker) => get().signals[ticker],

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),
}));
