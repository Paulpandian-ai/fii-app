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

export const updatePortfolio = async (holdings: any[]) => {
  const { data } = await api.put('/portfolio', { holdings });
  return data;
};

export const uploadPortfolioCsv = async (csvContent: string) => {
  const { data } = await api.post('/portfolio/csv', { csv: csvContent });
  return data;
};

// ─── Strategy ───

export const runOptimization = async (portfolioId: string) => {
  const { data } = await api.post('/strategy/optimize', { portfolioId });
  return data;
};

export const runMonteCarlo = async (
  portfolioId: string,
  simulations: number = 10000
) => {
  const { data } = await api.post('/strategy/montecarlo', {
    portfolioId,
    simulations,
  });
  return data;
};

// ─── Coach ───

export const getCoachInsights = async () => {
  const { data } = await api.get('/coach/insights');
  return data;
};

export default api;
