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

// Attach auth token to every request
api.interceptors.request.use(async (config) => {
  const session = await getCurrentSession();
  if (session) {
    config.headers.Authorization = `Bearer ${session.idToken}`;
  }
  return config;
});

// ─── Feed ───

export const getFeed = async (cursor?: string) => {
  const params = cursor ? { cursor } : {};
  const { data } = await api.get('/feed', { params });
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
