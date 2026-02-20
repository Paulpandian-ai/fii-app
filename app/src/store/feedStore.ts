import { create } from 'zustand';
import type { FeedItem } from '../types';

interface FeedStore {
  items: FeedItem[];
  currentIndex: number;
  isLoading: boolean;
  error: string | null;
  setItems: (items: FeedItem[]) => void;
  appendItems: (items: FeedItem[]) => void;
  setCurrentIndex: (index: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useFeedStore = create<FeedStore>((set) => ({
  items: [],
  currentIndex: 0,
  isLoading: false,
  error: null,

  setItems: (items) => set({ items, error: null }),

  appendItems: (newItems) =>
    set((state) => ({ items: [...state.items, ...(newItems ?? [])] })),

  setCurrentIndex: (currentIndex) => set({ currentIndex }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),
}));
