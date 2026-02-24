import axios from 'axios';
import { getCurrentSession } from './auth';
import { useSignalStore } from '../store/signalStore';
import type { Signal } from '../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.fii.app';

/** Helper: extract signal summaries from any API response and cache them. */
const _cacheSignals = (
  items: Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number }>,
) => {
  const summaries = items
    .filter((i) => i.ticker && (i.score != null || i.compositeScore != null) && i.signal)
    .map((i) => ({
      ticker: i.ticker!,
      score: i.score ?? i.compositeScore ?? 0,
      signal: (i.signal as Signal) || 'HOLD',
    }));
  if (summaries.length > 0) {
    useSignalStore.getState().upsertSignals(summaries);
  }
};

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
  // Cache signal data from feed items
  _cacheSignals(data.items || []);
  return data;
};

// ─── Price ───

export const getPrice = async (ticker: string) => {
  const { data } = await api.get(`/price/${ticker}`);
  return data;
};

// ─── Technicals ───

export const getTechnicals = async (ticker: string) => {
  const { data } = await api.get(`/technicals/${ticker}`);
  return data;
};

// ─── Fundamentals ───

export const getFundamentals = async (ticker: string) => {
  const { data } = await api.get(`/fundamentals/${ticker}`);
  return data;
};

// ─── Factors ───

export const getFactors = async (ticker: string) => {
  const { data } = await api.get(`/factors/${ticker}`);
  return data;
};

export const getAltData = async (ticker: string) => {
  const { data } = await api.get(`/altdata/${ticker}`);
  return data;
};

// ─── Charts ───

export const getChartData = async (ticker: string, resolution: string = 'D', range: string = '6M') => {
  const { data } = await api.get(`/charts/${ticker}`, { params: { resolution, range } });
  return data;
};

// ─── Screener ───

export const getScreener = async (params: Record<string, string> = {}) => {
  const { data } = await api.get('/screener', { params });
  _cacheSignals(data.results || []);
  return data;
};

export const getScreenerTemplates = async () => {
  const { data } = await api.get('/screener/templates');
  return data;
};

// ─── Search ───

export const searchTickers = async (query: string) => {
  const { data } = await api.get('/search', { params: { q: query } });
  _cacheSignals(data.results || []);
  return data;
};

// ─── Signals ───

export const getSignalDetail = async (ticker: string) => {
  const { data } = await api.get(`/signals/${ticker}`);
  if (data.ticker) {
    _cacheSignals([data]);
  }
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
  _cacheSignals(data.signals || []);
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
  // Cache signal data from all basket stocks
  const allStocks = (data.baskets || []).flatMap((b: any) => b.stocks || []);
  _cacheSignals(allStocks);
  return data;
};

export const getBasketDetail = async (id: string) => {
  const { data } = await api.get(`/baskets/${id}`);
  _cacheSignals(data.stocks || []);
  return data;
};

// ─── Trending ───

export const getTrending = async () => {
  const { data } = await api.get('/trending');
  _cacheSignals(data.items || []);
  return data;
};

// ─── Discovery ───

export const getDiscoveryCards = async () => {
  const { data } = await api.get('/discovery');
  _cacheSignals(data.cards || []);
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

export const runBacktest = async (tickers?: string[], period?: string) => {
  const { data } = await api.post('/strategy/backtest', { tickers, period: period || '3m' });
  return data;
};

// ─── Strategy: Diversification / Tax / Advice / Report Card ───

export const runDiversification = async () => {
  const { data } = await api.post('/strategy/diversification', {});
  return data;
};

export const runTaxHarvest = async (bracket: number) => {
  const { data } = await api.post('/strategy/tax-harvest', { bracket });
  return data;
};

export const getCorrelation = async () => {
  const { data } = await api.get('/strategy/correlation');
  return data;
};

export const getAdvice = async () => {
  const { data } = await api.post('/strategy/advice', {});
  return data;
};

export const getReportCard = async () => {
  const { data } = await api.get('/strategy/report-card');
  return data;
};

// ─── Stress Test ───

export const getStressTest = async (ticker: string, scenario: string = 'severely_adverse') => {
  const { data } = await api.get(`/stock/${ticker}/stress-test`, { params: { scenario } });
  return data;
};

export const getStressTestAll = async (ticker: string) => {
  const { data } = await api.get(`/stock/${ticker}/stress-test/all`);
  return data;
};

// ─── Coach ───

export const getCoachDaily = async () => {
  const { data } = await api.get('/coach/daily');
  return data;
};

export const getCoachScore = async () => {
  const { data } = await api.get('/coach/score');
  return data;
};

export const getCoachAchievements = async () => {
  const { data } = await api.get('/coach/achievements');
  return data;
};

export const postCoachEvent = async (event: string, amount?: number) => {
  const { data } = await api.post('/coach/event', { event, amount });
  return data;
};

export const getCoachWeekly = async () => {
  const { data } = await api.get('/coach/weekly');
  return data;
};

// ─── Earnings Calendar ───

export const getEarningsCalendar = async () => {
  const { data } = await api.get('/earnings/calendar');
  return data;
};

// ─── Market Movers ───

export const getMarketMovers = async () => {
  const { data } = await api.get('/market/movers');
  _cacheSignals([
    ...(data.gainers || []),
    ...(data.losers || []),
    ...(data.mostActive || []),
    ...(data.aiUpgrades || []),
    ...(data.aiDowngrades || []),
  ]);
  return data;
};

// ─── Track Record ───

export const getTrackRecord = async () => {
  const { data } = await api.get('/track-record');
  return data;
};

export const getTrackRecordTicker = async (ticker: string) => {
  const { data } = await api.get(`/track-record/${ticker}`);
  return data;
};

// ─── Discussion ───

export const getDiscussion = async (ticker: string, limit: number = 20) => {
  const { data } = await api.get(`/discuss/${ticker}`, { params: { limit: String(limit) } });
  return data;
};

export const createPost = async (ticker: string, content: string, sentiment: string, displayName?: string) => {
  const { data } = await api.post(`/discuss/${ticker}`, { content, sentiment, displayName });
  return data;
};

export const reactToPost = async (ticker: string, postId: string, reaction: string) => {
  const { data } = await api.post(`/discuss/${ticker}/${postId}/react`, { reaction });
  return data;
};

// ─── Profile ───

export const getMyProfile = async () => {
  const { data } = await api.get('/profile/me');
  return data;
};

export const updateMyProfile = async (updates: Record<string, string>) => {
  const { data } = await api.put('/profile/me', updates);
  return data;
};

export const getPublicProfile = async (userId: string) => {
  const { data } = await api.get(`/profile/${userId}`);
  return data;
};

// ─── Leaderboard ───

export const getLeaderboard = async () => {
  const { data } = await api.get('/leaderboard');
  return data;
};

// ─── AI Chat ───

export const sendChatMessage = async (message: string, context?: { currentTicker?: string; sessionId?: string }) => {
  const { data } = await api.post('/chat', { message, context });
  return data;
};

// ─── Events ───

export const getEventsForTicker = async (ticker: string, params: Record<string, string> = {}) => {
  const { data } = await api.get(`/events/${ticker}`, { params });
  return data;
};

export const getEventsFeed = async (limit: number = 50) => {
  const { data } = await api.get('/events/feed', { params: { limit: String(limit) } });
  return data;
};

export const getSignalHistory = async (ticker: string, days: number = 30) => {
  const { data } = await api.get(`/events/signal-history/${ticker}`, { params: { days: String(days) } });
  return data;
};

export const getAlerts = async (limit: number = 20) => {
  const { data } = await api.get('/alerts', { params: { limit: String(limit) } });
  return data;
};

// ─── Notifications ───

export const getNotificationPreferences = async () => {
  const { data } = await api.get('/notifications/preferences');
  return data;
};

export const saveNotificationPreferences = async (prefs: Record<string, any>) => {
  const { data } = await api.post('/notifications/preferences', prefs);
  return data;
};

export const registerDeviceToken = async (token: string, platform: string = 'expo') => {
  const { data } = await api.post('/notifications/register', { token, platform });
  return data;
};

// ─── Subscription ───

export const getSubscriptionStatus = async () => {
  const { data } = await api.get('/subscription/status');
  return data;
};

export const getSubscriptionUsage = async () => {
  const { data } = await api.get('/subscription/usage');
  return data;
};

// ─── Affiliates ───

export const getAffiliateBrokers = async (ticker?: string) => {
  const params = ticker ? { ticker } : {};
  const { data } = await api.get('/affiliate/brokers', { params });
  return data;
};

export const getAffiliateLink = async (broker: string, ticker: string) => {
  const { data } = await api.get('/affiliate/link', { params: { broker, ticker } });
  return data;
};

export default api;
