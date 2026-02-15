import { create } from 'zustand';
import type { FullAnalysis } from '../types';

interface SignalStore {
  analyses: Record<string, FullAnalysis>;  // keyed by ticker
  isLoading: boolean;
  error: string | null;
  setAnalysis: (ticker: string, analysis: FullAnalysis) => void;
  getAnalysis: (ticker: string) => FullAnalysis | undefined;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSignalStore = create<SignalStore>((set, get) => ({
  analyses: {},
  isLoading: false,
  error: null,

  setAnalysis: (ticker, analysis) =>
    set((state) => ({
      analyses: { ...state.analyses, [ticker]: analysis },
      error: null,
    })),

  getAnalysis: (ticker) => get().analyses[ticker],

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),
}));
