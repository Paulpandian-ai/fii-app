import axios from 'axios';
import { getCurrentSession } from './auth';
import { useSignalStore } from '../store/signalStore';
import type { Signal } from '../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.fii.app';

// ─── Request deduplication & response cache ───
// If the same GET endpoint is called within the TTL window,
// return the cached response or deduplicate in-flight requests.
const DEFAULT_CACHE_TTL = 30_000; // 30s
const PRICE_CACHE_TTL = 15_000;   // 15s for price data
const LONG_CACHE_TTL = 300_000;   // 5 min for slow-changing data

interface CacheEntry { data: any; cachedAt: number; ttl: number }

const _responseCache = new Map<string, CacheEntry>();
const _inflightRequests = new Map<string, Promise<any>>();

function _getTtl(path: string): number {
  if (path.startsWith('/price') || path.startsWith('/prices')) return PRICE_CACHE_TTL;
  if (path.startsWith('/feed') || path.startsWith('/screener')) return DEFAULT_CACHE_TTL;
  if (path.startsWith('/baskets') || path.startsWith('/earnings') || path.startsWith('/track-record')) return LONG_CACHE_TTL;
  if (path.startsWith('/coach/') || path.startsWith('/insights/')) return LONG_CACHE_TTL;
  return DEFAULT_CACHE_TTL;
}

function _cacheKey(path: string, params?: Record<string, any>): string {
  return params ? `${path}:${JSON.stringify(params)}` : path;
}

/** Deduplicated GET: returns cached data if fresh, or deduplicates in-flight requests. */
async function _deduplicatedGet<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  const key = _cacheKey(path, params);
  const ttl = _getTtl(path);

  // 1. Check response cache
  const cached = _responseCache.get(key);
  if (cached && (Date.now() - cached.cachedAt) < cached.ttl) {
    return cached.data;
  }

  // 2. Deduplicate in-flight request
  const inflight = _inflightRequests.get(key);
  if (inflight) return inflight;

  // 3. Make the actual request
  const promise = api.get(path, { params }).then(({ data }) => {
    _responseCache.set(key, { data, cachedAt: Date.now(), ttl });
    _inflightRequests.delete(key);
    return data;
  }).catch((err) => {
    _inflightRequests.delete(key);
    throw err;
  });

  _inflightRequests.set(key, promise);
  return promise;
}

// Evict stale cache entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _responseCache) {
    if (now - entry.cachedAt > entry.ttl * 2) {
      _responseCache.delete(key);
    }
  }
}, 60_000);

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

// Retry interceptor: automatic retry with exponential backoff for 503 responses
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config || config._retryCount >= 3) {
      return Promise.reject(error);
    }
    const status = error.response?.status;
    if (status === 503 || status === 429) {
      config._retryCount = (config._retryCount || 0) + 1;
      const delay = config._retryCount * 2000; // 2s, 4s, 6s
      await new Promise((r) => setTimeout(r, delay));
      return api.request(config);
    }
    return Promise.reject(error);
  },
);

// ─── Feed ───

export const getFeed = async (cursor?: string) => {
  const params = cursor ? { cursor } : undefined;
  const data = await _deduplicatedGet('/feed', params);
  _cacheSignals(data.items || []);
  return data;
};

// ─── Price ───

export const getPrice = async (ticker: string) => {
  return _deduplicatedGet(`/price/${ticker}`);
};

export const getBatchPrices = async (tickers: string[]) => {
  if (tickers.length === 0) return { prices: {} };
  return _deduplicatedGet('/prices/batch', { tickers: tickers.join(',') });
};

// ─── Technicals ───

export const getTechnicals = async (ticker: string) => {
  return _deduplicatedGet(`/technicals/${ticker}`);
};

// ─── Fundamentals ───

export const getFundamentals = async (ticker: string) => {
  return _deduplicatedGet(`/fundamentals/${ticker}`);
};

// ─── Factors ───

export const getFactors = async (ticker: string) => {
  return _deduplicatedGet(`/factors/${ticker}`);
};

export const getAltData = async (ticker: string) => {
  return _deduplicatedGet(`/altdata/${ticker}`);
};

export const getFairPrice = async (ticker: string) => {
  return _deduplicatedGet(`/fair-price/${ticker}`);
};

// ─── Charts ───

export const getChartData = async (ticker: string, resolution: string = 'D', range: string = '6M') => {
  return _deduplicatedGet(`/charts/${ticker}`, { resolution, range });
};

// ─── Screener ───

export const getScreener = async (params: Record<string, string> = {}) => {
  const data = await _deduplicatedGet('/screener', params);
  _cacheSignals(data.results || []);
  return data;
};

export const getScreenerTemplates = async () => {
  return _deduplicatedGet('/screener/templates');
};

// ─── Search ───

export const searchTickers = async (query: string) => {
  const data = await _deduplicatedGet('/search', { q: query });
  _cacheSignals(data.results || []);
  return data;
};

// ─── Signals ───

export const getSignalDetail = async (ticker: string) => {
  const data = await _deduplicatedGet(`/signals/${ticker}`);
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
  const data = await _deduplicatedGet('/signals/batch', { tickers: tickers.join(',') });
  _cacheSignals(data.signals || []);
  return data;
};

export const refreshAllSignals = async () => {
  const { data } = await api.post('/signals/refresh-all');
  return data;
};

// ─── Portfolio ───

export const getPortfolio = async () => {
  return _deduplicatedGet('/portfolio');
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
  return _deduplicatedGet('/portfolio/summary');
};

// ─── Baskets ───

export const getBaskets = async () => {
  const data = await _deduplicatedGet('/baskets');
  const allStocks = (data.baskets || []).flatMap((b: any) => b.stocks || []);
  _cacheSignals(allStocks);
  return data;
};

export const getBasketDetail = async (id: string) => {
  const data = await _deduplicatedGet(`/baskets/${id}`);
  _cacheSignals(data.stocks || []);
  return data;
};

// ─── Trending ───

export const getTrending = async () => {
  const data = await _deduplicatedGet('/trending');
  _cacheSignals(data.items || []);
  return data;
};

// ─── Discovery ───

export const getDiscoveryCards = async () => {
  const data = await _deduplicatedGet('/discovery');
  _cacheSignals(data.cards || []);
  return data;
};

// ─── Watchlist ───

export const getWatchlists = async () => {
  return _deduplicatedGet('/watchlist');
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
  return _deduplicatedGet('/portfolio/health');
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
  return _deduplicatedGet('/strategy/achievements');
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
  return _deduplicatedGet('/strategy/correlation');
};

export const getAdvice = async () => {
  const { data } = await api.post('/strategy/advice', {});
  return data;
};

export const getReportCard = async () => {
  return _deduplicatedGet('/strategy/report-card');
};

// ─── Stress Test ───

export const getStressTest = async (ticker: string, scenario: string = 'severely_adverse') => {
  return _deduplicatedGet(`/stock/${ticker}/stress-test`, { scenario });
};

export const getStressTestAll = async (ticker: string) => {
  return _deduplicatedGet(`/stock/${ticker}/stress-test/all`);
};

// ─── AI Insights ───

export const getInsightsFeed = async (limit: number = 20) => {
  return _deduplicatedGet('/insights/feed', { limit: String(limit) });
};

export const getInsightsAlerts = async (limit: number = 10) => {
  return _deduplicatedGet('/insights/alerts', { limit: String(limit) });
};

export const getInsightsForTicker = async (ticker: string, limit: number = 5) => {
  return _deduplicatedGet(`/insights/${ticker}`, { limit: String(limit) });
};

// ─── Coach ───

export const getCoachDaily = async () => {
  return _deduplicatedGet('/coach/daily');
};

export const getCoachScore = async () => {
  return _deduplicatedGet('/coach/score');
};

export const getCoachAchievements = async () => {
  return _deduplicatedGet('/coach/achievements');
};

export const postCoachEvent = async (event: string, amount?: number) => {
  const { data } = await api.post('/coach/event', { event, amount });
  return data;
};

export const getCoachWeekly = async () => {
  return _deduplicatedGet('/coach/weekly');
};

// ─── Earnings Calendar ───

export const getEarningsCalendar = async () => {
  return _deduplicatedGet('/earnings/calendar');
};

// ─── Market Movers ───

export const getMarketMovers = async () => {
  const data = await _deduplicatedGet('/market/movers');
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
  return _deduplicatedGet('/track-record');
};

export const getTrackRecordTicker = async (ticker: string) => {
  return _deduplicatedGet(`/track-record/${ticker}`);
};

// ─── Discussion ───

export const getDiscussion = async (ticker: string, limit: number = 20) => {
  return _deduplicatedGet(`/discuss/${ticker}`, { limit: String(limit) });
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
  return _deduplicatedGet('/profile/me');
};

export const updateMyProfile = async (updates: Record<string, string>) => {
  const { data } = await api.put('/profile/me', updates);
  return data;
};

export const getPublicProfile = async (userId: string) => {
  return _deduplicatedGet(`/profile/${userId}`);
};

// ─── Leaderboard ───

export const getLeaderboard = async () => {
  return _deduplicatedGet('/leaderboard');
};

// ─── AI Chat ───

export const sendChatMessage = async (message: string, context?: { currentTicker?: string; sessionId?: string }) => {
  const { data } = await api.post('/chat', { message, context });
  return data;
};

// ─── Events ───

export const getEventsForTicker = async (ticker: string, params: Record<string, string> = {}) => {
  return _deduplicatedGet(`/events/${ticker}`, params);
};

export const getEventsFeed = async (limit: number = 50) => {
  return _deduplicatedGet('/events/feed', { limit: String(limit) });
};

export const getSignalHistory = async (ticker: string, days: number = 30) => {
  return _deduplicatedGet(`/events/signal-history/${ticker}`, { days: String(days) });
};

export const getAlerts = async (limit: number = 20) => {
  return _deduplicatedGet('/alerts', { limit: String(limit) });
};

// ─── Notifications ───

export const getNotificationPreferences = async () => {
  return _deduplicatedGet('/notifications/preferences');
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
  return _deduplicatedGet('/subscription/status');
};

export const getSubscriptionUsage = async () => {
  return _deduplicatedGet('/subscription/usage');
};

// ─── Affiliates ───

export const getAffiliateBrokers = async (ticker?: string) => {
  const params = ticker ? { ticker } : undefined;
  return _deduplicatedGet('/affiliate/brokers', params);
};

export const getAffiliateLink = async (broker: string, ticker: string) => {
  return _deduplicatedGet('/affiliate/link', { broker, ticker });
};

// ─── Admin: Agent Control ───

export const getAdminAgents = async () => {
  return _deduplicatedGet('/admin/agents');
};

export const runAdminAgent = async (agentId: string) => {
  const { data } = await api.post(`/admin/agents/${agentId}/run`);
  return data;
};

export const getAdminAgentHistory = async (agentId: string, limit: number = 10) => {
  return _deduplicatedGet(`/admin/agents/${agentId}/history`, { limit: String(limit) });
};

export const getAdminAgentConfig = async (agentId: string) => {
  return _deduplicatedGet(`/admin/agents/${agentId}/config`);
};

export const updateAdminAgentConfig = async (agentId: string, config: { enabled?: boolean; customSchedule?: string | null }) => {
  const { data } = await api.put(`/admin/agents/${agentId}/config`, config);
  return data;
};

// ─── User Data Sync (/user/*) ───

export const getUserPreferences = async () => {
  return _deduplicatedGet('/user/preferences');
};

export const updateUserPreferences = async (prefs: Record<string, any>) => {
  const { data } = await api.put('/user/preferences', prefs);
  return data;
};

export const getUserPortfolio = async () => {
  return _deduplicatedGet('/user/portfolio');
};

export const putUserPortfolioTicker = async (ticker: string, holding: { shares: number; avgCost: number; companyName?: string }) => {
  const { data } = await api.put(`/user/portfolio/${ticker}`, holding);
  return data;
};

export const deleteUserPortfolioTicker = async (ticker: string) => {
  const { data } = await api.delete(`/user/portfolio/${ticker}`);
  return data;
};

export const getUserWatchlists = async () => {
  return _deduplicatedGet('/user/watchlists');
};

export const createUserWatchlist = async (watchlist: { id?: string; name: string; tickers?: string[]; items?: any[] }) => {
  const { data } = await api.post('/user/watchlists', watchlist);
  return data;
};

export const updateUserWatchlist = async (id: string, updates: { name?: string; items?: any[]; tickers?: string[] }) => {
  const { data } = await api.put(`/user/watchlists/${id}`, updates);
  return data;
};

export const deleteUserWatchlist = async (id: string) => {
  const { data } = await api.delete(`/user/watchlists/${id}`);
  return data;
};

export const getUserCoachProgress = async () => {
  return _deduplicatedGet('/user/coach/progress');
};

export const updateUserCoachProgress = async (progress: Record<string, any>) => {
  const { data } = await api.put('/user/coach/progress', progress);
  return data;
};

export const updateUserCoachPath = async (pathId: string, progress: Record<string, any>) => {
  const { data } = await api.put(`/user/coach/path/${pathId}`, progress);
  return data;
};

export const getUserChatHistory = async (context: string = 'coach', limit: number = 20) => {
  return _deduplicatedGet('/user/chat', { context, limit: String(limit) });
};

export const saveUserChat = async (messages: any[], context: string = 'coach') => {
  const { data } = await api.post('/user/chat', { messages, context });
  return data;
};

export const getUserSyncStatus = async () => {
  return _deduplicatedGet('/user/sync-status');
};

export default api;
