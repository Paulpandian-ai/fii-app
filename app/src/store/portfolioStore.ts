import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Holding, PortfolioSummary } from '../types';
import { getPortfolio, savePortfolio, getPortfolioSummary } from '../services/api';

const PORTFOLIO_CACHE_KEY = '@fii_portfolio_cache';

/** Price update payload from batch price polling. */
export interface PriceUpdate {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

interface PortfolioStore {
  holdings: Holding[];
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  dailyChange: number;
  dailyChangePercent: number;
  summary: PortfolioSummary | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number;

  loadPortfolio: () => Promise<void>;
  loadSummary: () => Promise<void>;
  addHolding: (holding: Omit<Holding, 'id'>) => Promise<void>;
  removeHolding: (holdingId: string) => Promise<void>;
  updateHolding: (holdingId: string, updates: Partial<Holding>) => Promise<void>;
  importHoldings: (newHoldings: Omit<Holding, 'id'>[]) => Promise<void>;
  getPortfolioTickers: () => string[];
  getSharesForTicker: (ticker: string) => number;
  /** Incrementally update holding prices without full API reload. */
  updatePrices: (prices: Record<string, PriceUpdate>) => void;
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
  isLoading: false,
  error: null,
  lastUpdated: 0,

  loadPortfolio: async () => {
    set({ isLoading: true, error: null });

    // Load from local cache first for instant display
    try {
      const cached = await AsyncStorage.getItem(PORTFOLIO_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.holdings?.length > 0) {
          set({
            holdings: parsed.holdings,
            totalValue: parsed.totalValue ?? 0,
            totalCost: parsed.totalCost ?? 0,
            totalGainLoss: parsed.totalGainLoss ?? 0,
            totalGainLossPercent: parsed.totalGainLossPercent ?? 0,
            dailyChange: parsed.dailyChange ?? 0,
            dailyChangePercent: parsed.dailyChangePercent ?? 0,
          });
        }
      }
    } catch {}

    // Then fetch from API (source of truth)
    try {
      const data = await getPortfolio();
      const state = {
        holdings: data?.holdings ?? [],
        totalValue: data?.totalValue ?? 0,
        totalCost: data?.totalCost ?? 0,
        totalGainLoss: data?.totalGainLoss ?? 0,
        totalGainLossPercent: data?.totalGainLossPercent ?? 0,
        dailyChange: data?.dailyChange ?? 0,
        dailyChangePercent: data?.dailyChangePercent ?? 0,
        isLoading: false,
        lastUpdated: Date.now(),
      };
      set(state);
      // Cache for offline access
      AsyncStorage.setItem(PORTFOLIO_CACHE_KEY, JSON.stringify(state)).catch(() => {});
    } catch (error) {
      console.error('[PortfolioStore] loadPortfolio failed:', error);
      set({ isLoading: false, error: 'Failed to load portfolio' });
    }
  },

  loadSummary: async () => {
    try {
      const data = await getPortfolioSummary();
      set({ summary: data ?? null });
    } catch (error) {
      console.error('[PortfolioStore] loadSummary failed:', error);
      // Silent fail — summary is optional
    }
  },

  addHolding: async (holding) => {
    const { holdings } = get();
    const existing = holdings.find((h) => h.ticker === holding.ticker);
    let updated: Holding[];

    if (existing) {
      const totalShares = existing.shares + holding.shares;
      const weightedCost =
        (existing.shares * existing.avgCost + holding.shares * holding.avgCost) / totalShares;
      updated = holdings.map((h) =>
        h.ticker === holding.ticker
          ? { ...h, shares: totalShares, avgCost: Math.round(weightedCost * 100) / 100 }
          : h
      );
    } else {
      const newHolding: Holding = {
        ...holding,
        id: holding.ticker,
        dateAdded: new Date().toISOString(),
      };
      updated = [...holdings, newHolding];
    }

    set({ holdings: updated });
    // Cache optimistic state for offline access
    AsyncStorage.setItem(PORTFOLIO_CACHE_KEY, JSON.stringify({ holdings: updated })).catch(() => {});
    try {
      await savePortfolio(updated);
      await get().loadPortfolio();
    } catch (error) {
      console.error('[PortfolioStore] addHolding failed:', error);
      set({ error: 'Failed to save portfolio' });
    }
  },

  removeHolding: async (holdingId) => {
    const { holdings } = get();
    const updated = holdings.filter((h) => h.id !== holdingId);
    set({ holdings: updated });
    AsyncStorage.setItem(PORTFOLIO_CACHE_KEY, JSON.stringify({ holdings: updated })).catch(() => {});
    try {
      await savePortfolio(updated);
      await get().loadPortfolio();
    } catch (error) {
      console.error('[PortfolioStore] removeHolding failed:', error);
      set({ error: 'Failed to save portfolio' });
    }
  },

  updateHolding: async (holdingId, updates) => {
    const { holdings } = get();
    const updated = holdings.map((h) => (h.id === holdingId ? { ...h, ...updates } : h));
    set({ holdings: updated });
    AsyncStorage.setItem(PORTFOLIO_CACHE_KEY, JSON.stringify({ holdings: updated })).catch(() => {});
    try {
      await savePortfolio(updated);
      await get().loadPortfolio();
    } catch (error) {
      console.error('[PortfolioStore] updateHolding failed:', error);
      set({ error: 'Failed to save portfolio' });
    }
  },

  importHoldings: async (newHoldings) => {
    const { holdings } = get();
    const merged = [...holdings];
    for (const nh of newHoldings) {
      const idx = merged.findIndex((h) => h.ticker === nh.ticker);
      if (idx >= 0) {
        const existing = merged[idx];
        const totalShares = existing.shares + nh.shares;
        const weightedCost =
          (existing.shares * existing.avgCost + nh.shares * nh.avgCost) / totalShares;
        merged[idx] = { ...existing, shares: totalShares, avgCost: Math.round(weightedCost * 100) / 100 };
      } else {
        merged.push({ ...nh, id: nh.ticker, dateAdded: new Date().toISOString() });
      }
    }
    set({ holdings: merged });
    AsyncStorage.setItem(PORTFOLIO_CACHE_KEY, JSON.stringify({ holdings: merged })).catch(() => {});
    try {
      await savePortfolio(merged);
      await get().loadPortfolio();
    } catch (error) {
      console.error('[PortfolioStore] importHoldings failed:', error);
      set({ error: 'Failed to save portfolio' });
    }
  },

  getPortfolioTickers: () => get().holdings.map((h) => h.ticker),

  getSharesForTicker: (ticker) => {
    const holding = get().holdings.find((h) => h.ticker === ticker);
    return holding?.shares || 0;
  },

  updatePrices: (prices) => {
    const { holdings } = get();
    let newTotalValue = 0;
    let newDailyChange = 0;

    const updated = holdings.map((h) => {
      const p = prices[h.ticker];
      if (p) {
        const currentPrice = p.price;
        const totalValue = currentPrice * h.shares;
        const gainLoss = totalValue - h.avgCost * h.shares;
        const gainLossPct = h.avgCost > 0 ? (gainLoss / (h.avgCost * h.shares)) * 100 : 0;
        const dailyHoldingChange = p.change * h.shares;
        newTotalValue += totalValue;
        newDailyChange += dailyHoldingChange;
        return {
          ...h,
          currentPrice,
          change: p.change,
          changePercent: p.changePercent,
          totalValue,
          gainLoss,
          gainLossPercent: Math.round(gainLossPct * 100) / 100,
        };
      }
      newTotalValue += h.totalValue || 0;
      newDailyChange += (h.change || 0) * h.shares;
      return h;
    });

    const totalCost = get().totalCost;
    const totalGainLoss = newTotalValue - totalCost;
    const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
    const dailyChangePct = (newTotalValue - newDailyChange) > 0
      ? (newDailyChange / (newTotalValue - newDailyChange)) * 100
      : 0;

    set({
      holdings: updated,
      totalValue: Math.round(newTotalValue * 100) / 100,
      totalGainLoss: Math.round(totalGainLoss * 100) / 100,
      totalGainLossPercent: Math.round(totalGainLossPct * 100) / 100,
      dailyChange: Math.round(newDailyChange * 100) / 100,
      dailyChangePercent: Math.round(dailyChangePct * 100) / 100,
      lastUpdated: Date.now(),
    });
  },
}));
