import { create } from 'zustand';
import type { Portfolio, Holding } from '../types';

interface PortfolioStore {
  portfolio: Portfolio | null;
  isLoading: boolean;
  error: string | null;
  setPortfolio: (portfolio: Portfolio) => void;
  addHolding: (holding: Holding) => void;
  removeHolding: (holdingId: string) => void;
  updateHolding: (holdingId: string, updates: Partial<Holding>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const usePortfolioStore = create<PortfolioStore>((set) => ({
  portfolio: null,
  isLoading: false,
  error: null,

  setPortfolio: (portfolio) => set({ portfolio, error: null }),

  addHolding: (holding) =>
    set((state) => {
      if (!state.portfolio) return state;
      return {
        portfolio: {
          ...state.portfolio,
          holdings: [...state.portfolio.holdings, holding],
          updatedAt: new Date().toISOString(),
        },
      };
    }),

  removeHolding: (holdingId) =>
    set((state) => {
      if (!state.portfolio) return state;
      return {
        portfolio: {
          ...state.portfolio,
          holdings: state.portfolio.holdings.filter((h) => h.id !== holdingId),
          updatedAt: new Date().toISOString(),
        },
      };
    }),

  updateHolding: (holdingId, updates) =>
    set((state) => {
      if (!state.portfolio) return state;
      return {
        portfolio: {
          ...state.portfolio,
          holdings: state.portfolio.holdings.map((h) =>
            h.id === holdingId ? { ...h, ...updates } : h
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),
}));
