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
  marketData?: Record<string, any>;
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
  weight?: number;          // portfolio weight 0–1
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

export interface CSVPreviewRow {
  ticker: string;
  companyName: string;
  shares: number;
  avgCost: number;
}

// ─── Basket Types ───

export interface BasketStock {
  ticker: string;
  companyName: string;
  weight: number;       // 0–1 allocation
  score: number;        // FII composite score
  signal: Signal;
  reason: string;       // why this stock is in the basket
}

export interface Basket {
  id: string;
  name: string;          // e.g. "AI Dominators"
  emoji: string;         // e.g. "🤖"
  description: string;
  stocks: BasketStock[];
  returnYTD: number;     // percentage
  riskLevel: 'Low' | 'Medium' | 'High';
  updatedAt: string;
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
  score: number;        // 0–100
  description: string;
}

export interface PortfolioHealth {
  overallScore: number;  // 0–100
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
  reason: string;         // why it's trending
  changePercent: number;
  volume: string;         // e.g. "12.3M"
  rank: number;
}

// ─── Discovery Types ───

export interface DiscoveryCard {
  ticker: string;
  companyName: string;
  score: number;
  signal: Signal;
  insight: string;
  sector: string;
  price: number;
  changePercent: number;
  topFactors: FactorScore[];
}

// ─── Strategy Types ───

export interface OptimizationResult {
  weights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
}

export interface FrontierPoint {
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
}

export interface BenchmarkPoint {
  label: string;
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
}

export interface AllocationItem {
  ticker: string;
  companyName: string;
  weight: number;
  score: number;
  signal: Signal;
}

export interface PortfolioMetrics {
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
  weights: Record<string, number>;
}

export interface FullOptimizationResult {
  optimized: OptimizationResult;
  currentPortfolio: PortfolioMetrics;
  efficientFrontier: FrontierPoint[];
  benchmarks: BenchmarkPoint[];
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
  finalStats: {
    best: number;
    likely: number;
    worst: number;
    lossProbability: number;
  };
  annualReturn: number;
  annualVolatility: number;
  simulationCount: number;
  updatedAt: string;
}

export interface TickerImpact {
  ticker: string;
  companyName: string;
  impact: number;
  sector: string;
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
  bestPerformer: TickerImpact | null;
  worstPerformer: TickerImpact | null;
  tickerImpacts: TickerImpact[];
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

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
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

// ─── Diversification / X-Ray Types ───

export interface SectorExposure {
  sector: string;
  weight: number;
  color: string;
  warning: boolean;
}

export interface GeographicSplit {
  region: string;
  weight: number;
}

export interface CorrelationPair {
  ticker1: string;
  ticker2: string;
  correlation: number;
}

export interface RiskRadarAxis {
  axis: string;
  value: number;
}

export interface DiversificationResult {
  sectors: SectorExposure[];
  geographic: GeographicSplit[];
  correlations: CorrelationPair[];
  riskRadar: RiskRadarAxis[];
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
  replacements: Array<{
    ticker: string;
    companyName: string;
    sector: string;
  }>;
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

export interface ReportCardGrade {
  category: string;
  grade: string;
  score: number;
  comment: string;
}

export interface ReportCard {
  overall: string;
  overallScore: number;
  grades: ReportCardGrade[];
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

export interface BacktestStats {
  hitRate: number;
  buyAccuracy: number;
  holdAccuracy: number;
  sellAccuracy: number;
  totalSignals: number;
  totalCorrect: number;
  totalBorderline: number;
}

export interface PortfolioBacktest {
  estimatedReturn: number;
  sp500Return: number;
  fiiAdvantage: number;
  isSimulated: boolean;
}

export interface BacktestResponse {
  results: BacktestResult[];
  stats: BacktestStats;
  portfolioBacktest: PortfolioBacktest;
  hasPortfolio: boolean;
  updatedAt: string;
}

// ─── Fundamental Analysis Types ───

export interface ZScoreResult {
  value: number;
  zone: 'safe' | 'gray' | 'distress';
  components: {
    workingCapitalToAssets: number;
    retainedEarningsToAssets: number;
    ebitToAssets: number;
    marketCapToLiabilities: number;
    revenueToAssets: number;
  };
}

export interface FScoreCriterion {
  name: string;
  earned: boolean;
  detail: string;
}

export interface FScoreResult {
  value: number;
  maxScore: number;
  interpretation: 'strong' | 'moderate' | 'weak';
  criteria: FScoreCriterion[];
}

export interface MScoreResult {
  value: number;
  threshold: number;
  interpretation: 'likely_manipulator' | 'unlikely_manipulator';
  components: Record<string, number>;
}

export interface DCFSensitivityRow {
  wacc: number;
  values: (number | null)[];
}

export interface DCFResult {
  fairValue: number;
  currentPrice: number | null;
  upside: number | null;
  growthRate: number;
  discountRate: number;
  terminalGrowth: number;
  sensitivity: DCFSensitivityRow[];
  terminalGrowthScenarios: number[];
}

export interface FinancialRatios {
  currentRatio?: number;
  debtToEquity?: number;
  roe?: number;
  roa?: number;
  netProfitMargin?: number;
  operatingMargin?: number;
  assetTurnover?: number;
  peRatio?: number;
  priceToBook?: number;
  evToEbitda?: number;
}

export interface FundamentalAnalysis {
  ticker: string;
  grade: string;
  gradeScore: number;
  zScore: ZScoreResult | null;
  fScore: FScoreResult | null;
  mScore: MScoreResult | null;
  dcf: DCFResult | null;
  ratios: FinancialRatios;
  years: number[];
  analyzedAt: string;
  source?: string;
  error?: string;
}

// ─── Factor Engine Types ───

export interface FactorContribution {
  factorId: string;
  factorName: string;
  dimension: string;
  rawValue: number;
  normalizedScore: number;  // -2 to +2
  weight: number;
  contribution: number;     // weight * score
  direction: 'positive' | 'negative' | 'neutral';
  dataSource: string;
  explanation: string;
}

export interface DimensionScores {
  supplyChain: number;      // 0-10
  macroGeo: number;
  technical: number;
  fundamental: number;
  sentiment: number;
}

export interface ScoringMethodology {
  version: string;
  factorCount: number;
  dimensions: number;
  lastUpdated: string;
}

export interface FactorAnalysis {
  ticker: string;
  dimensionScores: DimensionScores;
  compositeScore: number;   // 1-10
  factorContributions: FactorContribution[];
  topPositive: FactorContribution[];
  topNegative: FactorContribution[];
  factorCount: number;
  scoringMethodology: ScoringMethodology;
  analyzedAt: string;
  source?: string;
  error?: string;
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

// ─── Coach Types ───

export interface DailyBriefingData {
  date: string;
  greeting: string;
  summary: string;
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
  FinancialHealth: { ticker: string };
  Profile: undefined;
  WealthSimulator: undefined;
  TaxStrategy: undefined;
  PortfolioXRay: undefined;
  AIAdvisor: undefined;
  Backtest: undefined;
  Settings: undefined;
};
