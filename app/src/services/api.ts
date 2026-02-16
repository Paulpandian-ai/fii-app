import axios from 'axios';
import { getCurrentSession } from './auth';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.fii.app';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach auth token to requests when available (non-blocking — read-only
// endpoints work without auth, so we must not reject if session is missing)
api.interceptors.request.use(async (config) => {
  try {
    const session = await getCurrentSession();
    if (session?.idToken) {
      config.headers.Authorization = `Bearer ${session.idToken}`;
    }
  } catch {
    // No auth session — continue without Authorization header.
    // Public endpoints (feed, signals, price, search) work without it.
  }
  return config;
});

// ─── Feed ───

export const getFeed = async (cursor?: string) => {
  const params = cursor ? { cursor } : {};
  const { data } = await api.get('/feed', { params });
  return data;
};

// ─── Price ───

export const getPrice = async (ticker: string) => {
  const { data } = await api.get(`/price/${ticker}`);
  return data;
};

// ─── Search ───

export const searchTickers = async (query: string) => {
  const { data } = await api.get('/search', { params: { q: query } });
  return data;
};

// ─── Signals ───

export const getSignalDetail = async (ticker: string) => {
  const { data } = await api.get(`/signals/${ticker}`);
  return data;
};

export const generateSignal = async (ticker: string) => {
  const { data } = await api.post(`/signals/generate/${ticker}`);
  return data;
};

export const batchSignals = async (tickers: string[]) => {
  const { data } = await api.get('/signals/batch', {
    params: { tickers: tickers.join(',') },
  });
  return data;
};

export const refreshAllSignals = async () => {
  const { data } = await api.post('/signals/refresh-all');
  return data;
};

// ─── Portfolio ───

export const getPortfolio = async () => {
  const { data } = await api.get('/portfolio');
  return data;
};

export const savePortfolio = async (holdings: any[]) => {
  const { data } = await api.post('/portfolio', { holdings });
  return data;
};

export const parsePortfolioCsv = async (csvContent: string) => {
  const { data } = await api.post('/portfolio/parse-csv', { csv: csvContent });
  return data;
};

export const getPortfolioSummary = async () => {
  const { data } = await api.get('/portfolio/summary');
  return data;
};

// ─── Baskets ───

export const getBaskets = async () => {
  const { data } = await api.get('/baskets');
  return data;
};

export const getBasketDetail = async (id: string) => {
  const { data } = await api.get(`/baskets/${id}`);
  return data;
};

// ─── Trending ───

export const getTrending = async () => {
  const { data } = await api.get('/trending');
  return data;
};

// ─── Discovery ───

export const getDiscoveryCards = async () => {
  const { data } = await api.get('/discovery');
  return data;
};

// ─── Watchlist ───

export const getWatchlists = async () => {
  const { data } = await api.get('/watchlist');
  return data;
};

export const saveWatchlist = async (watchlist: { id?: string; name: string; items: any[] }) => {
  const { data } = await api.post('/watchlist', watchlist);
  return data;
};

export const addToWatchlist = async (watchlistId: string, ticker: string, companyName: string) => {
  const { data } = await api.post('/watchlist/add', { watchlistId, ticker, companyName });
  return data;
};

export const removeFromWatchlist = async (watchlistId: string, ticker: string) => {
  const { data } = await api.post('/watchlist/remove', { watchlistId, ticker });
  return data;
};

export const deleteWatchlist = async (name: string) => {
  const { data } = await api.delete(`/watchlist/${name}`);
  return data;
};

// ─── Portfolio Health ───

export const getPortfolioHealth = async () => {
  const { data } = await api.get('/portfolio/health');
  return data;
};

// ─── Strategy ───

export const runOptimization = async (portfolioValue?: number) => {
  const { data } = await api.post('/strategy/optimize', { portfolioValue: portfolioValue || 50000 });
  return data;
};

export const runProjection = async (years: number, portfolioValue?: number) => {
  const { data } = await api.post('/strategy/project', {
    years,
    portfolioValue: portfolioValue || 50000,
  });
  return data;
};

export const runScenarios = async () => {
  const { data } = await api.post('/strategy/scenarios', {});
  return data;
};

export const runRebalance = async () => {
  const { data } = await api.post('/strategy/rebalance', {});
  return data;
};

export const getAchievements = async () => {
  const { data } = await api.get('/strategy/achievements');
  return data;
};

// ─── Coach ───

export const getCoachInsights = async () => {
  const { data } = await api.get('/coach/insights');
  return data;
};

export default api;
