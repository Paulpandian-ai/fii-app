import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Watchlist, WatchlistItem } from '../types';
import {
  getWatchlists,
  saveWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  deleteWatchlist,
} from '../services/api';

const STORAGE_KEY = 'fii_watchlists';

/** Persist watchlist state to AsyncStorage for offline access. */
const _persist = (watchlists: Watchlist[]) => {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(watchlists)).catch(() => {});
};

interface WatchlistStore {
  watchlists: Watchlist[];
  activeWatchlistId: string;
  isLoading: boolean;
  error: string | null;

  loadWatchlists: () => Promise<void>;
  setActiveWatchlist: (id: string) => void;
  createWatchlist: (name: string) => Promise<void>;
  removeWatchlist: (id: string) => Promise<void>;
  addTicker: (watchlistId: string, ticker: string, companyName: string) => Promise<void>;
  removeTicker: (watchlistId: string, ticker: string) => Promise<void>;
  isInWatchlist: (ticker: string, watchlistId?: string) => boolean;
  isInAnyWatchlist: (ticker: string) => boolean;
  getActiveWatchlist: () => Watchlist | undefined;
  getAllWatchlistTickers: () => string[];
}

export const useWatchlistStore = create<WatchlistStore>((set, get) => ({
  watchlists: [{ id: 'default', name: 'My Watchlist', items: [], createdAt: '', updatedAt: '' }],
  activeWatchlistId: 'default',
  isLoading: false,
  error: null,

  loadWatchlists: async () => {
    set({ isLoading: true, error: null });

    // Load from AsyncStorage first for instant display
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          set({ watchlists: parsed });
        }
      }
    } catch {}

    // Then sync from API
    try {
      const data = await getWatchlists();
      const wls = data.watchlists || [];
      if (wls.length === 0) {
        wls.push({ id: 'default', name: 'My Watchlist', items: [], createdAt: '', updatedAt: '' });
      }
      set({ watchlists: wls, isLoading: false });
      _persist(wls);
    } catch {
      set({ isLoading: false, error: 'Failed to load watchlists' });
    }
  },

  setActiveWatchlist: (id) => set({ activeWatchlistId: id }),

  createWatchlist: async (name) => {
    if (!name) return;
    const id = (name ?? '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    try {
      const data = await saveWatchlist({ id, name, items: [] });
      const wls = data.watchlists || get().watchlists;
      set({ watchlists: wls });
      _persist(wls);
    } catch {
      set({ error: 'Failed to create watchlist' });
    }
  },

  removeWatchlist: async (id) => {
    try {
      const data = await deleteWatchlist(id);
      const wls = data.watchlists || get().watchlists.filter((w) => w.id !== id);
      if (wls.length === 0) {
        wls.push({ id: 'default', name: 'My Watchlist', items: [], createdAt: '', updatedAt: '' });
      }
      set({ watchlists: wls, activeWatchlistId: wls[0].id });
      _persist(wls);
    } catch {
      set({ error: 'Failed to delete watchlist' });
    }
  },

  addTicker: async (watchlistId, ticker, companyName) => {
    // Optimistic update
    const { watchlists } = get();
    const updated = watchlists.map((wl) => {
      if (wl.id === watchlistId && !wl.items.some((i) => i.ticker === ticker)) {
        return {
          ...wl,
          items: [...wl.items, { ticker, companyName, addedAt: new Date().toISOString() }],
        };
      }
      return wl;
    });
    set({ watchlists: updated });
    _persist(updated);

    try {
      const data = await addToWatchlist(watchlistId, ticker, companyName);
      const wls = data.watchlists || updated;
      set({ watchlists: wls });
      _persist(wls);
    } catch {
      set({ watchlists, error: 'Failed to add to watchlist' });
      _persist(watchlists);
    }
  },

  removeTicker: async (watchlistId, ticker) => {
    const { watchlists } = get();
    const updated = watchlists.map((wl) => {
      if (wl.id === watchlistId) {
        return { ...wl, items: wl.items.filter((i) => i.ticker !== ticker) };
      }
      return wl;
    });
    set({ watchlists: updated });
    _persist(updated);

    try {
      const data = await removeFromWatchlist(watchlistId, ticker);
      const wls = data.watchlists || updated;
      set({ watchlists: wls });
      _persist(wls);
    } catch {
      set({ watchlists, error: 'Failed to remove from watchlist' });
      _persist(watchlists);
    }
  },

  isInWatchlist: (ticker, watchlistId) => {
    const { watchlists, activeWatchlistId } = get();
    const id = watchlistId || activeWatchlistId;
    const wl = watchlists.find((w) => w.id === id);
    return wl ? wl.items.some((i) => i.ticker === ticker) : false;
  },

  isInAnyWatchlist: (ticker) => {
    return get().watchlists.some((wl) => wl.items.some((i) => i.ticker === ticker));
  },

  getActiveWatchlist: () => {
    const { watchlists, activeWatchlistId } = get();
    return watchlists.find((w) => w.id === activeWatchlistId);
  },

  getAllWatchlistTickers: () => {
    const tickers = new Set<string>();
    for (const wl of get().watchlists) {
      for (const item of wl.items) {
        tickers.add(item.ticker);
      }
    }
    return Array.from(tickers);
  },
}));
