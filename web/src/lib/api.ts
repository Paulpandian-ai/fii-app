import { getCurrentSession } from './auth';
import type { Signal } from '@/types';
import { useSignalStore } from '@/store/signalStore';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.fii.app';

const _cacheSignals = (
  items: Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number; aiScore?: number }>,
) => {
  const summaries = items
    .filter((i) => i.ticker && (i.score != null || i.compositeScore != null || i.aiScore != null) && i.signal)
    .map((i) => ({
      ticker: i.ticker!,
      score: i.score ?? i.compositeScore ?? i.aiScore ?? 0,
      signal: (i.signal as Signal) || 'HOLD',
    }));
  if (summaries.length > 0) {
    useSignalStore.getState().upsertSignals(summaries);
  }
};

async function request<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  retryCount = 0,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const session = await getCurrentSession();
    if (session?.idToken) {
      headers['Authorization'] = `Bearer ${session.idToken}`;
    }
  } catch {
    // No auth session — continue without auth
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    signal: options.signal,
  });

  if ((res.status === 503 || res.status === 429) && retryCount < 3) {
    const delay = (retryCount + 1) * 2000;
    await new Promise((r) => setTimeout(r, delay));
    return request<T>(endpoint, options, retryCount + 1);
  }

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function get<T = unknown>(endpoint: string, params?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = params ? `${endpoint}?${new URLSearchParams(params).toString()}` : endpoint;
  return request<T>(url, { method: 'GET', signal });
}

function post<T = unknown>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined, signal });
}

function put<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
  return request<T>(endpoint, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
}

function del<T = unknown>(endpoint: string): Promise<T> {
  return request<T>(endpoint, { method: 'DELETE' });
}

// ─── Feed ───

export const getFeed = async (cursor?: string) => {
  const params = cursor ? { cursor } : undefined;
  const data = await get<{ items: unknown[] }>('/feed', params);
  _cacheSignals((data.items || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number }>);
  return data;
};

export const getTrending = async () => {
  const data = await get<{ items: unknown[] }>('/trending');
  _cacheSignals((data.items || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number }>);
  return data;
};

export const getDiscoveryCards = async () => {
  const data = await get<{ cards: unknown[] }>('/discovery');
  _cacheSignals((data.cards || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number }>);
  return data;
};

// ─── Price ───

export const getPrice = async (ticker: string) => {
  return get(`/price/${ticker}`);
};

export const getBatchPrices = async (tickers: string[]) => {
  if (tickers.length === 0) return { prices: {} };
  return get('/prices/batch', { tickers: tickers.join(',') });
};

// ─── Analysis ───

export const getSignalDetail = async (ticker: string) => {
  const data = await get<{ ticker?: string; signal?: string; score?: number; compositeScore?: number }>(`/signals/${ticker}`);
  if (data.ticker) _cacheSignals([data]);
  return data;
};

export const getTechnicals = async (ticker: string) => get(`/technicals/${ticker}`);
export const getFundamentals = async (ticker: string) => get(`/fundamentals/${ticker}`);
export const getFactors = async (ticker: string) => get(`/factors/${ticker}`);
export const getAltData = async (ticker: string) => get(`/altdata/${ticker}`);
export const getChartData = async (ticker: string, resolution = 'D', range = '6M') =>
  get(`/charts/${ticker}`, { resolution, range });

export const generateSignal = async (ticker: string) => post(`/signals/generate/${ticker}`);

export const batchSignals = async (tickers: string[]) => {
  const data = await get<{ signals: unknown[] }>('/signals/batch', { tickers: tickers.join(',') });
  _cacheSignals((data.signals || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number }>);
  return data;
};

// ─── Screener ───

export const getScreener = async (params: Record<string, string> = {}) => {
  const data = await get<{ results: unknown[] }>('/screener', params);
  _cacheSignals((data.results || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number; aiScore?: number }>);
  return data;
};

export const getScreenerTemplates = async () => get('/screener/templates');

// ─── Search ───

export const searchTickers = async (query: string) => {
  const data = await get<{ results: unknown[] }>('/search', { q: query });
  _cacheSignals((data.results || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number }>);
  return data;
};

// ─── Portfolio ───

export const getPortfolio = async () => get('/portfolio');
export const savePortfolio = async (holdings: unknown[]) => post('/portfolio', { holdings });
export const parsePortfolioCsv = async (csvContent: string) => post('/portfolio/parse-csv', { csv: csvContent });
export const getPortfolioSummary = async () => get('/portfolio/summary');
export const getPortfolioHealth = async () => get('/portfolio/health');

// ─── Watchlists ───

export const getWatchlists = async () => get('/watchlist');
export const saveWatchlist = async (watchlist: { id?: string; name: string; items: unknown[] }) => post('/watchlist', watchlist);
export const addToWatchlist = async (watchlistId: string, ticker: string, companyName: string) =>
  post('/watchlist/add', { watchlistId, ticker, companyName });
export const removeFromWatchlist = async (watchlistId: string, ticker: string) =>
  post('/watchlist/remove', { watchlistId, ticker });
export const deleteWatchlist = async (name: string) => del(`/watchlist/${name}`);

// ─── Baskets ───

export const getBaskets = async () => {
  const data = await get<{ baskets: Array<{ stocks?: unknown[] }> }>('/baskets');
  const allStocks = (data.baskets || []).flatMap((b) => (b.stocks || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number }>);
  _cacheSignals(allStocks);
  return data;
};

export const getBasketDetail = async (id: string) => {
  const data = await get<{ stocks?: unknown[] }>(`/baskets/${id}`);
  _cacheSignals((data.stocks || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number }>);
  return data;
};

// ─── Strategy ───

export const runOptimization = async (portfolioValue = 50000) =>
  post('/strategy/optimize', { portfolioValue });
export const runProjection = async (years: number, portfolioValue = 50000) =>
  post('/strategy/project', { years, portfolioValue });
export const runScenarios = async () => post('/strategy/scenarios', {});
export const runRebalance = async () => post('/strategy/rebalance', {});
export const runDiversification = async () => post('/strategy/diversification', {});
export const runTaxHarvest = async (bracket: number) => post('/strategy/tax-harvest', { bracket });
export const getCorrelation = async () => get('/strategy/correlation');
export const getAdvice = async () => post('/strategy/advice', {});
export const getReportCard = async () => get('/strategy/report-card');
export const getAchievements = async () => get('/strategy/achievements');
export const runBacktest = async (tickers?: string[], period = '3m') =>
  post('/strategy/backtest', { tickers, period });
export const getStressTest = async (ticker: string, scenario = 'severely_adverse') =>
  get(`/stock/${ticker}/stress-test`, { scenario });
export const getStressTestAll = async (ticker: string) =>
  get(`/stock/${ticker}/stress-test/all`);

// ─── Coach ───

export const getCoachDaily = async () => get('/coach/daily');
export const getCoachScore = async () => get('/coach/score');
export const getCoachAchievements = async () => get('/coach/achievements');
export const getCoachWeekly = async () => get('/coach/weekly');
export const postCoachEvent = async (event: string, amount?: number) =>
  post('/coach/event', { event, amount });

// ─── Insights & Events ───

export const getInsightsFeed = async (limit = 20) =>
  get('/insights/feed', { limit: String(limit) });
export const getInsightsAlerts = async (limit = 10) =>
  get('/insights/alerts', { limit: String(limit) });
export const getInsightsForTicker = async (ticker: string, limit = 5) =>
  get(`/insights/${ticker}`, { limit: String(limit) });
export const getEventsForTicker = async (ticker: string) =>
  get(`/events/${ticker}`);
export const getEventsFeed = async (limit = 50) =>
  get('/events/feed', { limit: String(limit) });
export const getSignalHistory = async (ticker: string, days = 30) =>
  get(`/events/signal-history/${ticker}`, { days: String(days) });
export const getAlerts = async (limit = 20) =>
  get('/alerts', { limit: String(limit) });

// ─── Market ───

export const getMarketMovers = async () => {
  const data = await get<Record<string, unknown[]>>('/market/movers');
  _cacheSignals([
    ...((data.gainers || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number; aiScore?: number }>),
    ...((data.losers || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number; aiScore?: number }>),
    ...((data.mostActive || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number; aiScore?: number }>),
    ...((data.aiUpgrades || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number; aiScore?: number }>),
    ...((data.aiDowngrades || []) as Array<{ ticker?: string; score?: number; signal?: string; compositeScore?: number; aiScore?: number }>),
  ]);
  return data;
};

export const getEarningsCalendar = async () => get('/earnings/calendar');

// ─── Community ───

export const getDiscussion = async (ticker: string, limit = 20) =>
  get(`/discuss/${ticker}`, { limit: String(limit) });
export const createPost = async (ticker: string, content: string, sentiment: string) =>
  post(`/discuss/${ticker}`, { content, sentiment });
export const getTrackRecord = async () => get('/track-record');
export const getLeaderboard = async () => get('/leaderboard');

// ─── Profile ───

export const getMyProfile = async () => get('/profile/me');
export const updateMyProfile = async (updates: Record<string, string>) => put('/profile/me', updates);

// ─── Chat ───

export const sendChatMessage = async (message: string, context?: { currentTicker?: string; sessionId?: string }) =>
  post('/chat', { message, context });

// ─── Subscription ───

export const getSubscriptionStatus = async () => get('/subscription/status');
export const getSubscriptionUsage = async () => get('/subscription/usage');

// ─── User Data Sync ───

export const getUserPreferences = async () => get('/user/preferences');
export const updateUserPreferences = async (prefs: Record<string, unknown>) => put('/user/preferences', prefs);
export const getUserChatHistory = async (context = 'coach', limit = 20) =>
  get('/user/chat', { context, limit: String(limit) });
export const saveUserChat = async (messages: unknown[], context = 'coach') =>
  post('/user/chat', { messages, context });
