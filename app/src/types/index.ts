// ─── Core Domain Types ───

export type Signal = 'BUY' | 'HOLD' | 'SELL';

export interface FactorScore {
  name: string;       // e.g. "Supply Chain", "Macro", "Performance"
  score: number;      // -2.0 to +2.0
}

export interface FeedItem {
  id: string;
  ticker: string;
  companyName: string;
  compositeScore: number;   // 1–10
  signal: Signal;
  insight: string;          // Claude-generated one-liner
  topFactors: FactorScore[];
  updatedAt: string;        // ISO timestamp
}

export interface FullAnalysis {
  id: string;
  ticker: string;
  companyName: string;
  compositeScore: number;
  signal: Signal;
  insight: string;
  factors: FactorScore[];   // all 6 factors
  summary: string;          // Claude long-form analysis
  generatedAt: string;
}

// ─── Portfolio Types ───

export interface Holding {
  id: string;
  ticker: string;
  companyName: string;
  shares: number;
  avgCost: number;
  currentPrice?: number;
  weight?: number;          // portfolio weight 0–1
}

export interface Portfolio {
  id: string;
  name: string;
  holdings: Holding[];
  totalValue: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Strategy Types ───

export interface OptimizationResult {
  weights: Record<string, number>;  // ticker → weight
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
}

export interface MonteCarloPoint {
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  weights: Record<string, number>;
}

export interface StrategyResult {
  optimized: OptimizationResult;
  efficientFrontier: MonteCarloPoint[];
  currentPortfolioMetrics: {
    expectedReturn: number;
    volatility: number;
    sharpeRatio: number;
  };
}

// ─── Auth Types ───

export interface User {
  id: string;
  email: string;
  name: string;
  provider: 'apple' | 'google' | 'email';
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ─── Navigation Types ───

export type RootTabParamList = {
  Feed: undefined;
  Portfolio: undefined;
  Strategy: undefined;
  Coach: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  SignalDetail: { ticker: string; feedItemId: string };
  Profile: undefined;
};
