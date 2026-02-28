import { create } from 'zustand';
import type { Holding, PortfolioSummary, PortfolioHealth } from '@/types';
import * as api from '@/lib/api';

interface PortfolioStore {
  holdings: Holding[];
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  dailyChange: number;
  dailyChangePercent: number;
  summary: PortfolioSummary | null;
  health: PortfolioHealth | null;
  isLoading: boolean;
  error: string | null;
  loadPortfolio: () => Promise<void>;
  loadSummary: () => Promise<void>;
  loadHealth: () => Promise<void>;
  getPortfolioTickers: () => string[];
}

export const usePortfolioStore = create<PortfolioStore>((set, get) => ({
  holdings: [],
  totalValue: 0,
  totalCost: 0,
  totalGainLoss: 0,
  totalGainLossPercent: 0,
  dailyChange: 0,
  dailyChangePercent: 0,
  summary: null,
  health: null,
  isLoading: false,
  error: null,

  loadPortfolio: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.getPortfolio() as Record<string, unknown>;
      set({
        holdings: (data.holdings as Holding[]) || [],
        totalValue: (data.totalValue as number) || 0,
        totalCost: (data.totalCost as number) || 0,
        totalGainLoss: (data.totalGainLoss as number) || 0,
        totalGainLossPercent: (data.totalGainLossPercent as number) || 0,
        dailyChange: (data.dailyChange as number) || 0,
        dailyChangePercent: (data.dailyChangePercent as number) || 0,
        isLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  loadSummary: async () => {
    try {
      const data = await api.getPortfolioSummary() as PortfolioSummary;
      set({ summary: data });
    } catch { /* ignore */ }
  },

  loadHealth: async () => {
    try {
      const data = await api.getPortfolioHealth() as PortfolioHealth;
      set({ health: data });
    } catch { /* ignore */ }
  },

  getPortfolioTickers: () => get().holdings.map((h) => h.ticker),
}));
