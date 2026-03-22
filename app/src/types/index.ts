// ─── Core Domain Types ───

export type ScoreLabel = 'Strong' | 'Favorable' | 'Neutral' | 'Weak' | 'Caution';
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
  scoreLabel: ScoreLabel;
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
  scoreLabel: ScoreLabel | null;
}

export interface Alternative {
  ticker: string;
  companyName: string;
  score: number;
  scoreLabel: ScoreLabel;
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
  scoreLabel: ScoreLabel;
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
  biggestRisk: { ticker: string; scoreLabel: ScoreLabel; score: number } | null;
  cautionCount: number;
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
  scoreLabel: ScoreLabel;
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
  scoreLabel?: ScoreLabel;
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
  scoreLabel: ScoreLabel;
  reason: string;         // why it's trending
  changePercent: number;
  volume: string;         // e.g. "12.3M"
  rank: number;
  price: number;
  sector: string;
  insight: string;
  topFactors: FactorScore[];
  marketCap: string;      // e.g. "3.3T"
  peRatio: number;
  weekHigh52: number;
  weekLow52: number;
}

// ─── Discovery Types ───

export interface DiscoveryCard {
  ticker: string;
  companyName: string;
  score: number;
  scoreLabel: ScoreLabel;
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
  scoreLabel: ScoreLabel;
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
  scoreLabel: ScoreLabel;
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
  observation: string;
  insight: string;
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
  scoreLabel: ScoreLabel;
  score: number;
  signalStrength: string;
  actualReturn: number;
  correct: boolean;
  status: 'correct' | 'incorrect' | 'borderline';
  note: string | null;
}

export interface BacktestStats {
  hitRate: number;
  strongAccuracy: number;
  neutralAccuracy: number;
  cautionAccuracy: number;
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
  altData?: number;         // 0-10, optional 6th dimension
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
  hasAltData?: boolean;
  altDataTypes?: string[];  // ['patents', 'contracts', 'fda']
  scoringMethodology: ScoringMethodology;
  analyzedAt: string;
  source?: string;
  error?: string;
}

// ─── Alternative Data Types ───

export interface PatentData {
  ticker: string;
  score: number;            // 1-10
  totalLast12Mo: number;
  totalPrior12Mo: number;
  total5Yr: number;
  velocity: number;         // % YoY change
  velocityScore: number;
  avgCitations: number;
  qualityScore: number;
  distinctCpcSections: number;
  breadthScore: number;
  recencyRatio: number;
  recencyScore: number;
  recentPatents: Array<{
    patentId: string;
    title: string;
    date: string;
    category: string;
    citations: number;
  }>;
  techDistribution: Record<string, number>;
  quarterly: Array<{ quarter: string; count: number }>;
  assigneeName: string;
  dataSource: string;
  analyzedAt: string;
}

export interface ContractData {
  ticker: string;
  score: number;            // 1-10
  totalValueCurrent: number;
  totalValuePrior: number;
  awardGrowth: number;      // % YoY
  growthScore: number;
  activeContracts: number;
  pipelineScore: number;
  distinctAgencies: number;
  diversificationScore: number;
  majorAwardsCount: number;
  dealScore: number;
  recentAwards: Array<{
    awardId: string;
    agency: string;
    value: number;
    description: string;
  }>;
  agencyBreakdown: Array<{ agency: string; amount: number }>;
  quarterly: Array<{ quarter: string; value: number }>;
  recipientName: string;
  dataSource: string;
  analyzedAt: string;
}

export interface FDAData {
  ticker: string;
  score: number;            // 1-10
  totalActiveTrials: number;
  phaseCounts: Record<string, number>;
  pipelineFunnel: {
    phase1: number;
    phase2: number;
    phase3: number;
    phase4: number;
    approved: number;
  };
  pipelineScore: number;
  approvalScore: number;
  catalystScore: number;
  winsScore: number;
  upcomingPDUFA: Array<{
    trialId: string;
    drugName: string;
    indication: string;
    estimatedDate: string;
    daysAway: number;
    isWithin90Days: boolean;
  }>;
  pdufaWithin90Days: number;
  recentApprovals: Array<{
    brandName: string;
    genericName: string;
    applicationNumber: string;
    approvalDate: string;
    submissionType: string;
  }>;
  topTrials: Array<{
    nctId: string;
    title: string;
    phase: string;
    status: string;
    condition: string;
    intervention: string;
    completionDate: string;
  }>;
  sponsorName: string;
  dataSource: string;
  analyzedAt: string;
}

export interface AlternativeData {
  ticker: string;
  available: string[];      // ['patents', 'contracts', 'fda']
  patents?: PatentData;
  contracts?: ContractData;
  fda?: FDAData;
}

// ─── Screener Types ───

export interface ScreenerResult {
  ticker: string;
  companyName: string;
  price: number;
  change: number;
  changePercent: number;
  aiScore: number;
  scoreLabel: ScoreLabel;
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

export interface SectorData {
  sector: string;
  marketCap: number;
  changePercent: number;
  stockCount: number;
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

// ─── Learning Path Types ───

export interface LessonQuiz {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface Lesson {
  id: string;
  title: string;
  screens: string[];
  quiz: LessonQuiz[];
  xpReward: number;
}

export interface LearningPath {
  id: string;
  title: string;
  emoji: string;
  description: string;
  lessons: Lesson[];
  completedLessonIds: string[];
}

export interface LearningPathsData {
  paths: LearningPath[];
  totalXP: number;
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

// ─── Event & Alert Types ───

export type EventType = 'news' | 'filing' | 'macro';
export type EventImpact = 'high' | 'medium' | 'low' | 'none';
export type EventDirection = 'positive' | 'negative' | 'neutral';
export type AlertPriority = 'P0_CRITICAL' | 'P1_HIGH' | 'P2_MEDIUM' | 'P3_LOW';

export interface StockEvent {
  ticker: string;
  type: EventType;
  headline: string;
  summary: string;
  impact: EventImpact;
  direction: EventDirection;
  category: string;
  sourceUrl: string;
  formType: string;
  indicator: string;
  surpriseScore: number | null;
  sectorImpacts: Record<string, number>;
  factorsAffected: string[];
  timestamp: string;
}

export interface EventAlert {
  ticker: string;
  priority: AlertPriority;
  title: string;
  body: string;
  eventType: string;
  impact: string;
  direction: string;
  timestamp: string;
  read: boolean;
}

export interface SignalHistoryPoint {
  date: string;
  score: number;
  scoreLabel: ScoreLabel;
}

export interface NotificationPreferences {
  p0Critical: boolean;
  p1High: boolean;
  p2Medium: boolean;
  p3Low: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  watchedTickers: string[];
  mutedTickers: string[];
}

// ─── Earnings Calendar Types ───

export interface EarningsEntry {
  ticker: string;
  companyName: string;
  date: string;
  timeOfDay: 'BMO' | 'AMC' | 'TBD';
  estimatedEPS: number | null;
  actualEPS: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  surprise: number | null;
  surprisePercent: number | null;
  aiScore: number | null;
  scoreLabel: ScoreLabel | null;
  historicalSurprises: ('beat' | 'miss')[];
  beatStreak: number;
  quarter: number | null;
  year: number | null;
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
  scoreLabel: ScoreLabel | null;
  scoreChange?: number;
  prevScore?: number;
}

export interface MarketSummaryIndex {
  name: string;
  changePercent: number;
}

export interface MarketMoversData {
  gainers: MarketMover[];
  losers: MarketMover[];
  mostActive: MarketMover[];
  aiUpgrades: MarketMover[];
  aiDowngrades: MarketMover[];
  marketSummary: {
    sp500: MarketSummaryIndex;
    nasdaq: MarketSummaryIndex;
    dow: MarketSummaryIndex;
  };
  totalStocks: number;
}

// ─── Track Record Types ───

export interface SignalPerformance {
  count: number;
  avgReturn3M: number;
  hitRate: number;
}

export interface ScoreBand {
  count: number;
  avgReturn3M: number;
}

export interface TickerPerformance {
  ticker: string;
  companyName: string;
  totalSignals: number;
  strongSignals: number;
  avgReturn3M: number;
  hitRate: number;
}

export interface TrackRecordData {
  overallHitRate: number;
  totalSignals: number;
  signalPerformance: Record<string, SignalPerformance>;
  scoreBands: Record<string, ScoreBand>;
  tickerPerformance: TickerPerformance[];
  methodology: {
    version: string;
    factorModel: string;
    dimensions: string[];
    weights: Record<string, number>;
    dataSources: string[];
    scoringRange: string;
    signalThresholds: Record<string, string>;
    backtestPeriod: string;
    disclaimer: string;
  };
  disclaimer?: string;
  updatedAt: string;
}

// ─── Discussion Types ───

export interface DiscussionPost {
  postId: string;
  ticker: string;
  userId: string;
  displayName: string;
  content: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  bulls: number;
  bears: number;
  timestamp: string;
}

// ─── Profile Types ───

export interface UserProfile {
  userId: string;
  displayName: string;
  joinDate: string;
  riskProfile: string;
  badgeCount: number;
  postCount: number;
  disciplineScore: number;
  streakDays: number;
  level: string;
}

// ─── Leaderboard Types ───

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  disciplineScore: number;
  level: string;
  streakDays: number;
  badgeCount: number;
}

// ─── Chat Types ───

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ─── Navigation Types ───

export type RootTabParamList = {
  Feed: undefined;
  Portfolio: undefined;
  Radar: undefined;
  Screener: undefined;
  Strategy: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  SignalDetail: { ticker: string; feedItemId?: string; companyName?: string };
  FinancialHealth: { ticker: string };
  AlternativeData: { ticker: string };
  EventTimeline: { ticker: string };
  Discussion: { ticker: string };
  TrackRecord: undefined;
  ProfileScreen: undefined;
  Leaderboard: undefined;
  AIChat: { ticker?: string };
  Profile: undefined;
  WealthSimulator: undefined;
  WealthAdvisor: undefined;
  TaxStrategy: undefined;
  TaxPlaybook: undefined;
  PortfolioXRay: undefined;
  AIAdvisor: undefined;
  ReportCritique: undefined;
  AICoach: {
    mode?: 'holdings' | 'invest' | 'research' | 'tax' | 'events';
    ticker?: string;
    initialMessage?: string;
  } | undefined;
  Backtest: undefined;
  Settings: undefined;
  EarningsCalendar: undefined;
  MarketDashboard: undefined;
  BasketList: undefined;
  Paywall: { feature?: string };
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
};
