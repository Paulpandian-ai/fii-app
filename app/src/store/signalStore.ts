import { create } from 'zustand';
import type { FullAnalysis, Signal } from '../types';

/** Lightweight signal summary — the minimum data every component needs. */
export interface SignalSummary {
  ticker: string;
  score: number;
  signal: Signal;
}

/** Cached enrichment data for FeedCard — persists across unmounts/remounts. */
export interface EnrichmentData {
  price: number | null;
  change: number;
  changePercent: number;
  marketCap: number;
  w52Low: number | null;
  w52High: number | null;
  sector: string | null;
  techScore: number | null;
  techTrend: string | null;
  rsi: number | null;
  healthGrade: string | null;
  peRatio: number | null;
  forwardPE: number | null;
  negativeEarnings: boolean;
  fairValueUpside: number | null;
  fairPriceDollars: number | null;
  fairPriceLabel: string | null;
  zScore: number | null;
  fScoreVal: number | null;
  dimensionScores: Record<string, number>;
  enrichedFactors: { name: string; score: number }[];
  enrichedInsight: string | null;
  aiHeadline: string | null;
  aiAction: string | null;
  cachedAt: number;
}

interface SignalStore {
  analyses: Record<string, FullAnalysis>;  // keyed by ticker
  /** Lightweight score/signal cache populated by any API response. */
  signals: Record<string, SignalSummary>;
  /** FeedCard enrichment cache — keyed by ticker, survives component unmounts. */
  enrichmentCache: Record<string, EnrichmentData>;
  isLoading: boolean;
  error: string | null;
  setAnalysis: (ticker: string, analysis: FullAnalysis) => void;
  getAnalysis: (ticker: string) => FullAnalysis | undefined;
  /** Upsert one or more signal summaries. Use from API response handlers. */
  upsertSignals: (items: SignalSummary[]) => void;
  /** Get the cached signal summary for a ticker. */
  getSignal: (ticker: string) => SignalSummary | undefined;
  /** Cache enrichment data for a ticker (called by FeedCard after API calls). */
  setEnrichment: (ticker: string, data: EnrichmentData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSignalStore = create<SignalStore>((set, get) => ({
  analyses: {},
  signals: {},
  enrichmentCache: {},
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

  setEnrichment: (ticker, data) =>
    set((state) => ({
      enrichmentCache: { ...state.enrichmentCache, [ticker]: data },
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),
}));
