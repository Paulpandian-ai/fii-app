import { create } from 'zustand';
import type { FeedItem } from '../types';

/** Price update payload from batch price polling. */
export interface PriceUpdate {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

interface FeedStore {
  items: FeedItem[];
  currentIndex: number;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number;
  setItems: (items: FeedItem[]) => void;
  appendItems: (items: FeedItem[]) => void;
  setCurrentIndex: (index: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  /** Incrementally update prices for feed items without full reload. */
  updatePrices: (prices: Record<string, PriceUpdate>) => void;
}

export const useFeedStore = create<FeedStore>((set) => ({
  items: [],
  currentIndex: 0,
  isLoading: false,
  error: null,
  lastUpdated: 0,

  setItems: (items) => set({ items, error: null, lastUpdated: Date.now() }),

  appendItems: (newItems) =>
    set((state) => ({ items: [...state.items, ...(newItems ?? [])] })),

  setCurrentIndex: (currentIndex) => set({ currentIndex }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  updatePrices: (prices) =>
    set((state) => ({
      lastUpdated: Date.now(),
    })),
}));
