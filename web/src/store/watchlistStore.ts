import { create } from 'zustand';
import type { Watchlist } from '@/types';
import * as api from '@/lib/api';

interface WatchlistStore {
  watchlists: Watchlist[];
  activeWatchlistId: string;
  isLoading: boolean;
  loadWatchlists: () => Promise<void>;
  setActiveWatchlist: (id: string) => void;
  createWatchlist: (name: string) => Promise<void>;
  removeWatchlist: (id: string) => Promise<void>;
  addTicker: (watchlistId: string, ticker: string, companyName: string) => Promise<void>;
  removeTicker: (watchlistId: string, ticker: string) => Promise<void>;
  isInAnyWatchlist: (ticker: string) => boolean;
  getActiveWatchlist: () => Watchlist | undefined;
}

export const useWatchlistStore = create<WatchlistStore>((set, get) => ({
  watchlists: [],
  activeWatchlistId: '',
  isLoading: false,

  loadWatchlists: async () => {
    set({ isLoading: true });
    try {
      const data = await api.getWatchlists() as { watchlists: Watchlist[] };
      const lists = data.watchlists || [];
      set({
        watchlists: lists,
        activeWatchlistId: get().activeWatchlistId || lists[0]?.id || '',
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setActiveWatchlist: (id) => set({ activeWatchlistId: id }),

  createWatchlist: async (name) => {
    await api.saveWatchlist({ name, items: [] });
    await get().loadWatchlists();
  },

  removeWatchlist: async (id) => {
    const wl = get().watchlists.find((w) => w.id === id);
    if (wl) {
      await api.deleteWatchlist(wl.name);
      await get().loadWatchlists();
    }
  },

  addTicker: async (watchlistId, ticker, companyName) => {
    await api.addToWatchlist(watchlistId, ticker, companyName);
    await get().loadWatchlists();
  },

  removeTicker: async (watchlistId, ticker) => {
    await api.removeFromWatchlist(watchlistId, ticker);
    await get().loadWatchlists();
  },

  isInAnyWatchlist: (ticker) =>
    get().watchlists.some((wl) => wl.items.some((i) => i.ticker === ticker)),

  getActiveWatchlist: () =>
    get().watchlists.find((wl) => wl.id === get().activeWatchlistId),
}));
