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

const CACHE_KEY = '@fii_watchlists_cache';

/** Cache watchlist state locally for instant display and offline access. */
const _cache = (watchlists: Watchlist[]) => {
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(watchlists)).catch(() => {});
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

    // Load from local cache first for instant display
    let hasCached = false;
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          set({ watchlists: parsed });
          hasCached = true;
        }
      }
    } catch {}

    // Then sync from API (DynamoDB — source of truth)
    try {
      const data = await getWatchlists();
      const wls = data.watchlists || [];
      if (wls.length === 0) {
        wls.push({ id: 'default', name: 'My Watchlist', items: [], createdAt: '', updatedAt: '' });
      }
      set({ watchlists: wls, isLoading: false });
      _cache(wls);
    } catch {
      // If we have cached data, silently continue (offline mode)
      set({ isLoading: false, error: hasCached ? null : 'Failed to load watchlists' });
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
      _cache(wls);
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
      _cache(wls);
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
    _cache(updated);

    try {
      const data = await addToWatchlist(watchlistId, ticker, companyName);
      const wls = data.watchlists || updated;
      set({ watchlists: wls });
      _cache(wls);
    } catch {
      set({ watchlists, error: 'Failed to add to watchlist' });
      _cache(watchlists);
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
    _cache(updated);

    try {
      const data = await removeFromWatchlist(watchlistId, ticker);
      const wls = data.watchlists || updated;
      set({ watchlists: wls });
      _cache(wls);
    } catch {
      set({ watchlists, error: 'Failed to remove from watchlist' });
      _cache(watchlists);
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
