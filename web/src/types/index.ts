// ─── Core Domain Types ───

export type Signal = 'BUY' | 'HOLD' | 'SELL';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type FeedItemType = 'signal' | 'educational';

export interface FactorScore {
  name: string;
  score: number;
}

export interface SubFactor {
  id: string;
  name: string;
  score: number;
  reason: string;
}

export interface FactorCategory {
  id: string;
  name: string;
  icon: string;
  avgScore: number;
  subFactors: SubFactor[];
}

export interface FeedItem {
  id: string;
  type?: FeedItemType;
  ticker: string;
  companyName: string;
  compositeScore: number;
  signal: Signal;
  confidence?: Confidence;
  insight: string;
  topFactors: FactorScore[];
  updatedAt: string;
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
  score: number | null;
  signal: Signal | null;
}

export interface Alternative {
  ticker: string;
  companyName: string;
  score: number;
  signal: Signal;
  reason: string;
  altType: string;
}

export interface TechnicalAnalysis {
  technicalScore: number;
  rsi: number | null;
  macd: { value: number | null; signal: number | null; histogram: number | null };
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  bollingerBands: { upper: number | null; middle: number | null; lower: number | null };
  atr: number | null;
  signals: { trend?: string; momentum?: string; volatility?: string };
  indicatorCount: number;
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
  marketData?: Record<string, unknown>;
  technicalAnalysis?: TechnicalAnalysis;
}

// ─── Portfolio Types ───

export interface Holding {
  id: string;
  ticker: string;
  companyName: string;
  shares: number;
  avgCost: number;
  currentPrice?: number;
  change?: number;
  changePercent?: number;
  totalValue?: number;
  gainLoss?: number;
  gainLossPercent?: number;
  weight?: number;
  dateAdded?: string;
}

export interface Portfolio {
  id: string;
  name: string;
  holdings: Holding[];
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  dailyChange: number;
  dailyChangePercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  dailyChange: number;
  dailyChangePercent: number;
  biggestWinner: { ticker: string; gainLossPercent: number } | null;
  biggestRisk: { ticker: string; signal: Signal; score: number } | null;
  sellCount: number;
  holdingsCount: number;
}

// ─── Watchlist Types ───

export interface WatchlistItem {
  ticker: string;
  companyName: string;
  addedAt: string;
  score?: number;
  signal?: Signal;
  price?: number;
  changePercent?: number;
}

export interface Watchlist {
  id: string;
  name: string;
  items: WatchlistItem[];
  createdAt: string;
  updatedAt: string;
}

// ─── Health Score Types ───

export interface HealthSubScore {
  label: string;
  score: number;
  description: string;
}

export interface PortfolioHealth {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  diversification: HealthSubScore;
  riskBalance: HealthSubScore;
  signalAlignment: HealthSubScore;
  concentration: HealthSubScore;
  suggestions: string[];
  updatedAt: string;
}

// ─── Trending Types ───

export interface TrendingItem {
  ticker: string;
  companyName: string;
  score: number;
  signal: Signal;
  reason: string;
  changePercent: number;
  volume: string;
  rank: number;
  price: number;
  sector: string;
  insight: string;
  topFactors: FactorScore[];
  marketCap: string;
  peRatio: number;
  weekHigh52: number;
  weekLow52: number;
}

// ─── Screener Types ───

export interface ScreenerResult {
  ticker: string;
  companyName: string;
  price: number;
  change: number;
  changePercent: number;
  aiScore: number;
  signal: Signal;
  confidence: string;
  technicalScore: number | null;
  fundamentalGrade: string;
  rsi: number | null;
  sector: string;
  marketCap: number;
  marketCapLabel: string;
  peRatio: number | null;
}

export interface ScreenerTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  filters: Record<string, string>;
}

// ─── Strategy Types ───

export interface OptimizationResult {
  weights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
}

export interface AllocationItem {
  ticker: string;
  companyName: string;
  weight: number;
  score: number;
  signal: Signal;
}

export interface FullOptimizationResult {
  optimized: OptimizationResult;
  currentPortfolio: {
    expectedReturn: number;
    expectedVolatility: number;
    sharpeRatio: number;
    weights: Record<string, number>;
  };
  efficientFrontier: Array<{ expectedReturn: number; volatility: number; sharpeRatio: number }>;
  benchmarks: Array<{ label: string; expectedReturn: number; volatility: number; sharpeRatio: number }>;
  allocation: AllocationItem[];
  moneyLeftOnTable: number;
  portfolioValue: number;
  tickerCount: number;
  simulationCount: number;
  updatedAt: string;
}

export interface ProjectionPoint {
  month: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface ProjectionResult {
  years: number;
  initialValue: number;
  projection: ProjectionPoint[];
  finalStats: { best: number; likely: number; worst: number; lossProbability: number };
  annualReturn: number;
  annualVolatility: number;
  simulationCount: number;
  updatedAt: string;
}

export interface ScenarioCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  portfolioImpact: number;
  sp500Impact: number;
  verdict: string;
  verdictColor?: string;
  bestPerformer: { ticker: string; companyName: string; impact: number; sector: string } | null;
  worstPerformer: { ticker: string; companyName: string; impact: number; sector: string } | null;
  tickerImpacts: Array<{ ticker: string; companyName: string; impact: number; sector: string }>;
}

export interface RebalanceMove {
  ticker: string;
  companyName: string;
  currentWeight: number;
  optimalWeight: number;
  direction: 'increase' | 'decrease';
  reason: string;
  signal: Signal;
  score: number;
}

// ─── Diversification / X-Ray Types ───

export interface SectorExposure {
  sector: string;
  weight: number;
  color: string;
  warning: boolean;
}

export interface DiversificationResult {
  sectors: SectorExposure[];
  geographic: Array<{ region: string; weight: number }>;
  correlations: Array<{ ticker1: string; ticker2: string; correlation: number }>;
  riskRadar: Array<{ axis: string; value: number }>;
  diversificationScore: number;
  grade: string;
  updatedAt: string;
}

// ─── Tax Doctor Types ───

export interface TaxLoss {
  ticker: string;
  companyName: string;
  shares: number;
  costBasis: number;
  currentValue: number;
  unrealizedLoss: number;
  taxSavings: number;
  replacements: Array<{ ticker: string; companyName: string; sector: string }>;
}

export interface TaxHarvestResult {
  losses: TaxLoss[];
  totalUnrealizedLoss: number;
  totalTaxSavings: number;
  bracket: number;
  updatedAt: string;
}

// ─── AI Advice Types ───

export interface Prescription {
  id: string;
  title: string;
  diagnosis: string;
  prescription: string;
  impact: string;
  icon: string;
  severity: 'low' | 'medium' | 'high';
}

// ─── Report Card Types ───

export interface ReportCard {
  overall: string;
  overallScore: number;
  grades: Array<{ category: string; grade: string; score: number; comment: string }>;
  updatedAt: string;
}

// ─── Backtest Types ───

export interface BacktestResult {
  ticker: string;
  companyName: string;
  signalDate: string;
  signal: Signal;
  score: number;
  signalStrength: string;
  actualReturn: number;
  correct: boolean;
  status: 'correct' | 'incorrect' | 'borderline';
  note: string | null;
}

export interface BacktestResponse {
  results: BacktestResult[];
  stats: {
    hitRate: number;
    buyAccuracy: number;
    holdAccuracy: number;
    sellAccuracy: number;
    totalSignals: number;
    totalCorrect: number;
    totalBorderline: number;
  };
  portfolioBacktest: {
    estimatedReturn: number;
    sp500Return: number;
    fiiAdvantage: number;
    isSimulated: boolean;
  };
  hasPortfolio: boolean;
  updatedAt: string;
}

// ─── Fundamental Analysis Types ───

export interface FundamentalAnalysis {
  ticker: string;
  grade: string;
  gradeScore: number;
  zScore: {
    value: number;
    zone: 'safe' | 'gray' | 'distress';
    components: Record<string, number>;
  } | null;
  fScore: {
    value: number;
    maxScore: number;
    interpretation: 'strong' | 'moderate' | 'weak';
    criteria: Array<{ name: string; earned: boolean; detail: string }>;
  } | null;
  mScore: {
    value: number;
    threshold: number;
    interpretation: 'likely_manipulator' | 'unlikely_manipulator';
    components: Record<string, number>;
  } | null;
  dcf: {
    fairValue: number;
    currentPrice: number | null;
    upside: number | null;
    growthRate: number;
    discountRate: number;
  } | null;
  ratios: Record<string, number | undefined>;
  analyzedAt: string;
  source?: string;
}

// ─── Factor Engine Types ───

export interface FactorContribution {
  factorId: string;
  factorName: string;
  dimension: string;
  rawValue: number;
  normalizedScore: number;
  weight: number;
  contribution: number;
  direction: 'positive' | 'negative' | 'neutral';
  dataSource: string;
  explanation: string;
}

export interface DimensionScores {
  supplyChain: number;
  macroGeo: number;
  technical: number;
  fundamental: number;
  sentiment: number;
  altData?: number;
}

export interface FactorAnalysis {
  ticker: string;
  dimensionScores: DimensionScores;
  compositeScore: number;
  factorContributions: FactorContribution[];
  topPositive: FactorContribution[];
  topNegative: FactorContribution[];
  factorCount: number;
  hasAltData?: boolean;
  analyzedAt: string;
  source?: string;
}

// ─── Coach Types ───

export interface DailyBriefingData {
  date: string;
  greeting: string;
  summary: string;
  insightOfTheDay: string;
  fullBriefing: string;
  stats: {
    portfolioChange: number;
    portfolioChangePct: number;
    signalsChanged: number;
    streak: number;
  };
  updatedAt: string;
}

export interface DisciplineScoreData {
  score: number;
  level: string;
  levelColor: string;
  nextThreshold: number;
  stats: {
    panicSurvived: number;
    worstAvoided: number;
    streak: number;
    signalAlignment: number;
  };
  updatedAt: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  earnedAt: string | null;
}

export interface AchievementsData {
  badges: Badge[];
  totalEarned: number;
  totalAvailable: number;
  updatedAt: string;
}

export interface WeeklyRecapData {
  weeklyChange: number;
  weeklyChangePct: number;
  signalsChanged: number;
  signalChangesText: string;
  score: number;
  scoreChange: number;
  claudeLine: string;
  updatedAt: string;
}

export interface LearningPath {
  id: string;
  title: string;
  emoji: string;
  description: string;
  lessons: Array<{
    id: string;
    title: string;
    screens: string[];
    quiz: Array<{ question: string; options: string[]; correctIndex: number }>;
    xpReward: number;
  }>;
  completedLessonIds: string[];
}

// ─── Event & Alert Types ───

export type EventType = 'news' | 'filing' | 'macro';
export type EventImpact = 'high' | 'medium' | 'low' | 'none';
export type EventDirection = 'positive' | 'negative' | 'neutral';

export interface StockEvent {
  ticker: string;
  type: EventType;
  headline: string;
  summary: string;
  impact: EventImpact;
  direction: EventDirection;
  category: string;
  timestamp: string;
}

export interface EventAlert {
  ticker: string;
  priority: string;
  title: string;
  body: string;
  eventType: string;
  impact: string;
  direction: string;
  timestamp: string;
  read: boolean;
}

// ─── Chat Types ───

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ─── Earnings Calendar Types ───

export interface EarningsEntry {
  ticker: string;
  companyName: string;
  date: string;
  timeOfDay: 'BMO' | 'AMC' | 'TBD';
  estimatedEPS: number | null;
  actualEPS: number | null;
  surprise: number | null;
  aiScore: number | null;
  signal: Signal | null;
}

// ─── Market Movers Types ───

export interface MarketMover {
  ticker: string;
  companyName: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number;
  sector: string;
  aiScore: number | null;
  signal: Signal | null;
}

export interface MarketMoversData {
  gainers: MarketMover[];
  losers: MarketMover[];
  mostActive: MarketMover[];
  aiUpgrades: MarketMover[];
  aiDowngrades: MarketMover[];
  marketSummary: {
    sp500: { name: string; changePercent: number };
    nasdaq: { name: string; changePercent: number };
    dow: { name: string; changePercent: number };
  };
  totalStocks: number;
}

// ─── Auth Types (Web) ───

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ─── Signal Summary (for caching) ───

export interface SignalSummary {
  ticker: string;
  score: number;
  signal: Signal;
}
