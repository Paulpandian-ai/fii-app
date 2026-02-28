import { create } from 'zustand';
import type { FullAnalysis, SignalSummary } from '@/types';

interface SignalStore {
  analyses: Record<string, FullAnalysis>;
  signals: Record<string, SignalSummary>;
  setAnalysis: (ticker: string, analysis: FullAnalysis) => void;
  getAnalysis: (ticker: string) => FullAnalysis | undefined;
  upsertSignals: (items: SignalSummary[]) => void;
  getSignal: (ticker: string) => SignalSummary | undefined;
}

export const useSignalStore = create<SignalStore>((set, get) => ({
  analyses: {},
  signals: {},
  setAnalysis: (ticker, analysis) =>
    set((s) => ({ analyses: { ...s.analyses, [ticker]: analysis } })),
  getAnalysis: (ticker) => get().analyses[ticker],
  upsertSignals: (items) =>
    set((s) => {
      const updated = { ...s.signals };
      for (const item of items) {
        updated[item.ticker] = item;
      }
      return { signals: updated };
    }),
  getSignal: (ticker) => get().signals[ticker],
}));
