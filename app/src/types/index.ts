// ─── Core Domain Types ───

export type Signal = 'BUY' | 'HOLD' | 'SELL';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type FeedItemType = 'signal' | 'educational';

export interface FactorScore {
  name: string;       // e.g. "Supply Chain", "Macro", "Performance"
  score: number;      // -2.0 to +2.0
}

export interface SubFactor {
  id: string;         // e.g. "A1"
  name: string;       // e.g. "Operational Disruption"
  score: number;      // -2.0 to +2.0
  reason: string;
}

export interface FactorCategory {
  id: string;         // e.g. "A"
  name: string;
  icon: string;       // Ionicons name
  avgScore: number;
  subFactors: SubFactor[];
}

export interface FeedItem {
  id: string;
  type?: FeedItemType;
  ticker: string;
  companyName: string;
  compositeScore: number;   // 1-10
  signal: Signal;
  confidence?: Confidence;
  insight: string;          // Claude-generated one-liner
  topFactors: FactorScore[];
  updatedAt: string;        // ISO timestamp
}

export interface EducationalCard {
  id: string;
  type: 'educational';
  title: string;
  body: string;
}

export type FeedEntry = FeedItem | EducationalCard;

export interface PriceData {
  ticker: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  marketCap: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  beta: number;
  forwardPE: number;
  trailingPE: number;
  sector: string;
  companyName: string;
}

export interface SearchResult {
  ticker: string;
  companyName: string;
  exchange: string;
  sector: string;
}

export interface Alternative {
  ticker: string;
  companyName: string;
  score: number;
  signal: Signal;
  reason: string;
  altType: string;
}

export interface FullAnalysis {
  ticker: string;
  companyName: string;
  compositeScore: number;
  signal: Signal;
  confidence: Confidence;
  insight: string;
  reasoning: string;
  topFactors: FactorScore[];
  factorDetails: Record<string, { score: number; reason: string }>;
  alternatives: Alternative[];
  analyzedAt: string;
  marketData?: Record<string, any>;
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
