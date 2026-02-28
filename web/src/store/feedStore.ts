import { create } from 'zustand';
import type { FeedItem } from '@/types';

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
}

export const useFeedStore = create<FeedStore>((set) => ({
  items: [],
  currentIndex: 0,
  isLoading: false,
  error: null,
  lastUpdated: 0,
  setItems: (items) => set({ items, lastUpdated: Date.now(), error: null }),
  appendItems: (items) => set((s) => ({ items: [...s.items, ...items] })),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
}));
