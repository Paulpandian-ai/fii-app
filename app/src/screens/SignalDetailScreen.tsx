import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
  LayoutAnimation,
  UIManager,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ScoreRing } from '../components/ScoreRing';
import { FactorRadarChart } from '../components/FactorRadarChart';
import type { FactorPercentiles } from '../components/FactorRadarChart';
import { SignalBadge } from '../components/SignalBadge';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { StockChart } from '../components/StockChart';
import { FactorDetailCard } from '../components/FactorDetailCard';
import { FinancialStatsGrid } from '../components/FinancialStatsGrid';
import { StressTestCards } from '../components/StressTestCards';
import type { ChartData } from '../components/StockChart';
import type { StockEvent, SignalHistoryPoint } from '../types';
import type {
  FullAnalysis,
  PriceData,
  TechnicalAnalysis,
  FundamentalAnalysis,
  FactorAnalysis,
  FactorContribution,
  AlternativeData,
  FactorCategory,
  Confidence,
  ScoreLabel,
  Alternative,
} from '../types';
import { getScoreColor, getScoreLabel, SCORE_COLORS } from '../utils/scoreColors';
import {
  translateDriverDescription,
  translateFactorName,
  getDriverIcon,
} from '../utils/beginnerTranslations';
import {
  getSignalDetail,
  getPrice,
  getTechnicals,
  getFactorSummaries,
  getFactorDetail,
  getFundamentals,
  getFactors,
  getAltData,
  getChartData,
  getEventsForTicker,
  getSignalHistory,
  getStressTestAll,
  getScreener,
  getFinancials,
} from '../services/api';
import { DisclaimerFooter } from '../components/DisclaimerFooter';
import { AIContentDisclaimer } from '../components/AIContentDisclaimer';
import { useRecentStocks } from '../contexts/RecentStocksContext';
import { usePriceAlerts } from '../contexts/PriceAlertContext';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLLAPSE_ANIMATION = LayoutAnimation.create(
  250,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

const TAB_NAMES = ['Overview', 'Financials', 'Factor Scoring'] as const;

const FACTOR_NAMES: Record<string, string> = {
  A1: 'Operational Disruption', A2: 'Supplier Earnings Miss', A3: 'Lead Time Extensions',
  B1: 'CapEx Guidance Changes', B2: 'Contract Updates', B3: 'Customer Revenue Growth',
  C1: 'Physical Conflict', C2: 'Trade Barriers', C3: 'Logistics Disruption',
  D1: 'Fed Decisions', D2: 'CPI/Inflation', D3: '10Y Treasury Yield',
  E1: 'Sector Peers', E2: 'Commodity Link', E3: 'Risk Sentiment',
  F1: 'EPS Surprise', F2: 'Guidance Revision', F3: 'Beta/Volatility',
};

const CATEGORIES: { id: string; name: string; icon: string; factorIds: string[] }[] = [
  { id: 'A', name: 'Upstream Suppliers', icon: 'cube-outline', factorIds: ['A1', 'A2', 'A3'] },
  { id: 'B', name: 'Downstream Customers', icon: 'people-outline', factorIds: ['B1', 'B2', 'B3'] },
  { id: 'C', name: 'Geopolitics', icon: 'globe-outline', factorIds: ['C1', 'C2', 'C3'] },
  { id: 'D', name: 'Monetary Policy', icon: 'cash-outline', factorIds: ['D1', 'D2', 'D3'] },
  { id: 'E', name: 'Correlations', icon: 'git-compare-outline', factorIds: ['E1', 'E2', 'E3'] },
  { id: 'F', name: 'Risk & Performance', icon: 'trending-up-outline', factorIds: ['F1', 'F2', 'F3'] },
];

const FACTOR_GAUGE_AXES = [
  { key: 'supply_chain_upstream', dimKey: 'supply_chain_upstream', label: 'Supply Chain (Upstream)', matchKey: 'upstream', icon: 'cube-outline',
    tooltip: 'How healthy are this company\'s key suppliers? Disruptions can directly affect production.' },
  { key: 'supply_chain_downstream', dimKey: 'supply_chain_downstream', label: 'Supply Chain (Downstream)', matchKey: 'downstream', icon: 'people-outline',
    tooltip: 'How strong is demand from this company\'s major customers?' },
  { key: 'geopolitical', dimKey: 'geopolitical', label: 'Geopolitical', matchKey: 'geopolitical', icon: 'globe-outline',
    tooltip: 'How exposed is this company to trade barriers, conflicts, or political instability?' },
  { key: 'monetary', dimKey: 'monetary', label: 'Monetary Policy', matchKey: 'monetary', icon: 'cash-outline',
    tooltip: 'How sensitive is this stock to interest rates, inflation, and Federal Reserve decisions?' },
  { key: 'correlations', dimKey: 'correlations', label: 'Correlations', matchKey: 'correlation', icon: 'git-compare-outline',
    tooltip: 'How does this stock move relative to its sector, commodities, and market sentiment?' },
  { key: 'performance', dimKey: 'risk_performance', label: 'Risk & Performance', matchKey: 'performance', icon: 'trending-up-outline',
    tooltip: 'How has this company performed on earnings, guidance, and overall volatility?' },
];

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: '#4A90D9',
  MEDIUM: '#8E8E93',
  LOW: '#F5A623',
};

// ── Financial Metrics: Human-readable names ──
const METRIC_LABELS: Record<string, string> = {
  // Valuation
  trailing_pe: 'P/E (TTM)', forward_pe: 'P/E (Forward)', peg_ratio: 'PEG Ratio',
  price_to_sales: 'P/S Ratio', price_to_book: 'P/B Ratio', ev_to_ebitda: 'EV/EBITDA',
  ev_to_revenue: 'EV/Revenue', market_cap: 'Market Cap', enterprise_value: 'Enterprise Value',
  // Profitability
  gross_margin: 'Gross Margin', operating_margin: 'Operating Margin', net_margin: 'Net Margin',
  roe: 'Return on Equity', roa: 'Return on Assets', roic: 'Return on Invested Capital',
  ebitda: 'EBITDA', ebitda_margin: 'EBITDA Margin', free_cash_flow_margin: 'FCF Margin',
  // Growth
  revenue_growth_yoy: 'Revenue Growth (YoY)', eps_growth_yoy: 'EPS Growth (YoY)',
  revenue_growth_qoq: 'Revenue Growth (QoQ)', eps_growth_qoq: 'EPS Growth (QoQ)',
  revenue_cagr_3y: 'Revenue CAGR (3Y)', eps_cagr_3y: 'EPS CAGR (3Y)',
  free_cash_flow_growth: 'FCF Growth', book_value_growth: 'Book Value Growth',
  // Financial Health
  current_ratio: 'Current Ratio', quick_ratio: 'Quick Ratio', debt_to_equity: 'Debt/Equity',
  debt_to_assets: 'Debt/Assets', interest_coverage: 'Interest Coverage',
  total_debt: 'Total Debt', total_cash: 'Total Cash', net_debt: 'Net Debt',
  altman_z_score: 'Altman Z-Score',
  // Dividends
  dividend_yield: 'Dividend Yield', payout_ratio: 'Payout Ratio',
  dividend_per_share: 'Dividend/Share', dividend_growth_5y: 'Dividend Growth (5Y)',
  ex_dividend_date: 'Ex-Dividend Date', years_of_growth: 'Years of Growth',
  // Analyst Estimates
  target_price: 'Price Target', target_upside: 'Target Upside',
  analyst_rating: 'Analyst Rating', num_analysts: 'Analysts Covering',
  eps_estimate_current: 'EPS Est. (Current Q)', eps_estimate_next: 'EPS Est. (Next Q)',
  revenue_estimate_current: 'Rev Est. (Current Q)', revenue_estimate_next: 'Rev Est. (Next Q)',
  // Momentum & Technicals
  beta: 'Beta', fifty_two_week_high: '52-Week High', fifty_two_week_low: '52-Week Low',
  fifty_day_ma: '50-Day MA', two_hundred_day_ma: '200-Day MA',
  relative_strength_index: 'RSI (14)', avg_volume: 'Avg Volume',
  price_to_52w_high: 'Price vs 52W High', short_interest: 'Short Interest',
  // Ownership
  insider_ownership: 'Insider Ownership', institutional_ownership: 'Institutional Ownership',
  insider_transactions: 'Insider Transactions', shares_outstanding: 'Shares Outstanding',
  float_shares: 'Float', shares_short: 'Shares Short',
};

// Keys that represent percentages
const PCT_METRICS = new Set([
  'gross_margin', 'operating_margin', 'net_margin', 'roe', 'roa', 'roic',
  'ebitda_margin', 'free_cash_flow_margin', 'revenue_growth_yoy', 'eps_growth_yoy',
  'revenue_growth_qoq', 'eps_growth_qoq', 'revenue_cagr_3y', 'eps_cagr_3y',
  'free_cash_flow_growth', 'book_value_growth', 'dividend_yield', 'payout_ratio',
  'dividend_growth_5y', 'target_upside', 'insider_ownership', 'institutional_ownership',
  'short_interest', 'price_to_52w_high',
]);

// Keys that represent large currency amounts
const CURRENCY_LARGE_METRICS = new Set([
  'market_cap', 'enterprise_value', 'ebitda', 'total_debt', 'total_cash', 'net_debt',
  'revenue_estimate_current', 'revenue_estimate_next',
]);

// Keys that represent per-share dollar values
const PER_SHARE_METRICS = new Set([
  'dividend_per_share', 'eps_estimate_current', 'eps_estimate_next', 'target_price',
  'fifty_two_week_high', 'fifty_two_week_low', 'fifty_day_ma', 'two_hundred_day_ma',
]);

const FINANCIAL_CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  valuation: { label: 'Valuation', icon: 'analytics-outline' },
  profitability: { label: 'Profitability', icon: 'trending-up-outline' },
  growth: { label: 'Growth', icon: 'rocket-outline' },
  financial_health: { label: 'Financial Health', icon: 'shield-checkmark-outline' },
  dividends: { label: 'Dividends', icon: 'cash-outline' },
  analyst_estimates: { label: 'Analyst Estimates', icon: 'people-outline' },
  momentum_technicals: { label: 'Momentum & Technicals', icon: 'pulse-outline' },
  ownership: { label: 'Ownership', icon: 'pie-chart-outline' },
};

const formatMetricValue = (key: string, value: unknown): string => {
  if (value == null) return 'N/A';
  if (typeof value === 'string') return value;
  const num = safeNum(value);
  if (!Number.isFinite(num)) return 'N/A';
  if (PCT_METRICS.has(key)) {
    // If value looks like a decimal (e.g. 0.25 for 25%), multiply by 100
    const pct = Math.abs(num) < 1 && Math.abs(num) > 0 ? num * 100 : num;
    return `${pct >= 0 ? '' : ''}${pct.toFixed(2)}%`;
  }
  if (CURRENCY_LARGE_METRICS.has(key)) {
    if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    return `$${num.toLocaleString()}`;
  }
  if (PER_SHARE_METRICS.has(key)) return `$${num.toFixed(2)}`;
  if (key === 'avg_volume' || key === 'shares_outstanding' || key === 'float_shares' || key === 'shares_short') {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
    return num.toLocaleString();
  }
  return num.toFixed(2);
};

const safeNum = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatLargeNumber = (n: unknown): string => {
  const v = safeNum(n);
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};

function _formatTimeAgo(ts: string): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════
// Risk Summary Template Builder
// ═══════════════════════════════════════════════════════════════

function buildRiskSummary(
  score: number,
  confidence: string,
  scoreDrivers: Array<{ factor: string; direction: string; description: string }>,
  stressData: any | null,
  factorPercentiles: FactorPercentiles | null,
): string {
  const lines: string[] = [];
  const topPositive = scoreDrivers.find(d => d.direction === 'positive' || d.direction === 'up');
  const topNegative = scoreDrivers.find(d => d.direction === 'negative' || d.direction === 'down');

  // Score-based template
  if (score >= 8) {
    const posText = topPositive ? topPositive.description : 'Multiple factors are aligned favorably';
    lines.push(`This stock shows strong factor positioning across multiple dimensions. ${posText}.`);
  } else if (score >= 5) {
    const posText = topPositive ? topPositive.description : 'Some factors are positive';
    const negText = topNegative ? topNegative.description.toLowerCase() : 'some headwinds exist';
    lines.push(`This stock has moderate factor exposure. ${posText}, but ${negText}.`);
  } else {
    const negText = topNegative ? topNegative.description : 'Several factors are misaligned';
    const secNeg = scoreDrivers.filter(d => d.direction === 'negative' || d.direction === 'down')[1];
    const secText = secNeg ? ` ${secNeg.description}.` : '';
    lines.push(`This stock faces significant factor headwinds. ${negText}.${secText}`);
  }

  // Stress test line — use new report format
  const scenarios = stressData?.scenarios;
  if (scenarios && scenarios.length > 0) {
    const severe = scenarios.find((s: any) => s.scenarioKey === 'severe') || scenarios[scenarios.length - 1];
    if (severe && severe.estimated_impact != null) {
      const impact = safeNum(severe.estimated_impact);
      if (impact < -50) {
        lines.push(`In a severe crisis, a $10,000 investment could drop to ~$${Math.max(0, Math.round(10000 * (1 + impact / 100))).toLocaleString()}.`);
      } else if (impact <= -20) {
        lines.push(`Stress testing suggests moderate vulnerability to downturns (est. ${impact}% in a severe crisis).`);
      } else {
        lines.push(`The stock shows relative resilience in stress test scenarios (est. ${impact}% in a severe crisis).`);
      }
    }
  } else {
    lines.push('Stress test data not yet available for this stock. Check back soon.');
  }

  // Confidence line
  if (confidence === 'LOW') {
    // Count available factor dimensions
    const availableDims = factorPercentiles
      ? Object.values(factorPercentiles).filter(v => v !== 50).length
      : 0;
    if (availableDims < 6) {
      lines.push(`Data coverage is limited \u2014 only ${Math.max(availableDims, 3)} of 6 factor dimensions have sufficient data, which lowers confidence in this score.`);
    } else {
      lines.push('Data coverage is limited, which lowers confidence in this score.');
    }
  }

  return lines.join(' ');
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

interface SignalDetailScreenProps {
  route: { params: { ticker: string; companyName?: string } };
  navigation: any;
}

export const SignalDetailScreen: React.FC<SignalDetailScreenProps> = ({ route, navigation }) => {
  const { ticker } = route.params;
  const { addRecent } = useRecentStocks();
  const { addAlert, checkAlerts, getAlertsForTicker } = usePriceAlerts();
  const pagerRef = useRef<PagerView>(null);
  const [activeTab, setActiveTab] = useState(0);

  // ── Price Alert State ──
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertDirection, setAlertDirection] = useState<'above' | 'below'>('above');
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [alertConfirmation, setAlertConfirmation] = useState<string | null>(null);

  // ── Peer Comparison State ──
  const [peerSortBy, setPeerSortBy] = useState<'score' | 'name'>('score');
  const [compareModalPeer, setCompareModalPeer] = useState<{ ticker: string; companyName: string; score: number; scoreLabel: string } | null>(null);

  // ── Data State ──
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [technicals, setTechnicals] = useState<TechnicalAnalysis | null>(null);
  const [fundamentals, setFundamentals] = useState<FundamentalAnalysis | null>(null);
  const [factors, setFactors] = useState<FactorAnalysis | null>(null);
  const [altData, setAltData] = useState<AlternativeData | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [chartRange, setChartRange] = useState('6M');
  const [chartLoading, setChartLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recentEvents, setRecentEvents] = useState<StockEvent[]>([]);
  const [signalHistory, setSignalHistory] = useState<SignalHistoryPoint[]>([]);
  const [stressData, setStressData] = useState<any | null>(null);
  const [factorPercentiles, setFactorPercentiles] = useState<FactorPercentiles | null>(null);
  const [factorSummaries, setFactorSummaries] = useState<Record<string, { summary: string; score: number; score_label: string; confidence: string }>>({});
  const [scoreDrivers, setScoreDrivers] = useState<Array<{ factor: string; direction: string; description: string }>>([]);
  const [percentileRank, setPercentileRank] = useState<number | null>(null);
  const [sectorPercentile, setSectorPercentile] = useState<number | null>(null);
  const [peerStocks, setPeerStocks] = useState<Array<{ ticker: string; companyName: string; score: number; scoreLabel: string }>>([]);
  const [financials, setFinancials] = useState<Record<string, Record<string, { value: any; source?: string; sector_median?: any; percentile?: number }>> | null>(null);

  // ── UI State ──
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showAllFactors, setShowAllFactors] = useState(false);
  const [expandedFactorBar, setExpandedFactorBar] = useState<string | null>('supply_chain_upstream');
  const [tooltipVisible, setTooltipVisible] = useState<string | null>(null);
  const [stressExpanded, setStressExpanded] = useState(false);
  const [factorDeepDiveExpanded, setFactorDeepDiveExpanded] = useState(true);
  const [factorDeepDiveMode, setFactorDeepDiveMode] = useState<'simple' | 'advanced'>('simple');
  const [expandedFinancialCats, setExpandedFinancialCats] = useState<Set<string>>(new Set(['valuation']));
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null);

  // ═══════════════════════════════════════════════════════════
  // Data Loading — phased for fast initial render
  // Phase 1: Signal + Price (renders Overview immediately)
  // Phase 2: Factor summaries, stress test, technicals, chart (parallel)
  // Phase 3: Financials (lazy — only when Deep Dive tab tapped)
  // ═══════════════════════════════════════════════════════════

  const [financialsLoaded, setFinancialsLoaded] = useState(false);

  // Helper: fetch with AbortController + 10s timeout
  const fetchWithTimeout = useCallback(<T,>(
    fetcher: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T | null> => {
    return new Promise<T | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 10_000);
      if (signal?.aborted) { clearTimeout(timeout); resolve(null); return; }
      signal?.addEventListener('abort', () => { clearTimeout(timeout); resolve(null); });
      fetcher()
        .then((result) => { clearTimeout(timeout); resolve(result); })
        .catch(() => { clearTimeout(timeout); resolve(null); });
    });
  }, []);

  useEffect(() => {
    addRecent(ticker);
  }, [ticker, addRecent]);

  // Check price alerts when price data loads
  useEffect(() => {
    if (priceData?.price) {
      const triggered = checkAlerts({ [ticker]: priceData.price });
      if (triggered.length > 0) {
        setAlertConfirmation(`Alert triggered: ${ticker} is now $${priceData.price.toFixed(2)}`);
        setTimeout(() => setAlertConfirmation(null), 4000);
      }
    }
  }, [priceData?.price, ticker, checkAlerts]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller);
    return () => controller.abort();
  }, [ticker]);

  // Lazy-load financials when Deep Dive tab is first tapped
  useEffect(() => {
    if (activeTab === 2 && !financialsLoaded && !financials) {
      setFinancialsLoaded(true);
      fetchWithTimeout(() => getFinancials(ticker))
        .then((d: any) => {
          if (d && typeof d === 'object') {
            setFinancials(d.categories || d);
          }
        });
    }
  }, [activeTab, financialsLoaded, ticker]);

  const loadData = async (controller: AbortController) => {
    setLoading(true);
    setFinancialsLoaded(false);

    try {
      // ── Phase 1: Signal + Price (critical path for Overview) ──
      const [signalData, price] = await Promise.all([
        fetchWithTimeout(() => getSignalDetail(ticker), controller.signal),
        fetchWithTimeout(() => getPrice(ticker), controller.signal),
      ]);

      if (signalData) setAnalysis(signalData);
      if (price) setPriceData(price);

      // Extract data from signal response
      const sigRaw = signalData as any;

      // Extract factor_percentiles
      const fp = sigRaw?.factor_percentiles;
      if (fp && typeof fp === 'object') {
        setFactorPercentiles({
          supply_chain_upstream: Number(fp.supply_chain_upstream ?? 50),
          supply_chain_downstream: Number(fp.supply_chain_downstream ?? 50),
          geopolitical: Number(fp.geopolitical ?? 50),
          monetary: Number(fp.monetary ?? 50),
          correlations: Number(fp.correlations ?? 50),
          performance: Number(fp.risk_performance ?? fp.performance ?? 50),
        });
      }

      // Extract percentile ranks
      const pRank = sigRaw?.percentile_rank ?? sigRaw?.percentileRank;
      if (pRank != null) setPercentileRank(safeNum(pRank));
      const sRank = sigRaw?.sector_percentile ?? sigRaw?.sectorPercentile;
      if (sRank != null) setSectorPercentile(safeNum(sRank));

      // Extract score drivers
      const drivers = sigRaw?.score_drivers ?? sigRaw?.scoreDrivers;
      if (drivers) {
        try {
          const parsed = typeof drivers === 'string' ? JSON.parse(drivers) : drivers;
          if (Array.isArray(parsed)) {
            setScoreDrivers(parsed.map((d: any) => ({
              factor: d.factor || d.name || '',
              direction: d.direction || (d.score > 0 ? 'positive' : 'negative'),
              description: d.description || d.explanation || '',
            })));
          }
        } catch {}
      }

      // ── Render Overview now — mark loading done ──
      setLoading(false);

      // ── Phase 2: Secondary data in parallel (non-blocking) ──
      const phase2 = [
        fetchWithTimeout(() => getFactorSummaries(ticker), controller.signal)
          .then((d: any) => {
            if (d?.dimensions && typeof d.dimensions === 'object') {
              const summaries: Record<string, { summary: string; score: number; score_label: string; confidence: string }> = {};
              for (const [key, val] of Object.entries(d.dimensions) as any) {
                if (val && typeof val === 'object') {
                  summaries[key] = {
                    summary: val.summary || '',
                    score: val.score ?? 0,
                    score_label: val.score_label || '',
                    confidence: val.confidence || 'Medium',
                  };
                }
              }
              setFactorSummaries(summaries);
            }
          }),
        fetchWithTimeout(() => getStressTestAll(ticker), controller.signal)
          .then((d: any) => { if (d && d.scenarios) setStressData(d); }),
        fetchWithTimeout(() => getTechnicals(ticker), controller.signal)
          .then((techData: any) => { if (techData && techData.indicatorCount > 0) setTechnicals(techData); }),
        fetchWithTimeout(() => getFundamentals(ticker), controller.signal)
          .then((fundData: any) => { if (fundData && fundData.grade && fundData.grade !== 'N/A') setFundamentals(fundData); }),
        fetchWithTimeout(() => getFactors(ticker), controller.signal)
          .then((factorData: any) => {
            if (factorData && factorData.dimensionScores) setFactors(factorData);
            // Backfill factor_percentiles if not in signal response
            if (!fp && factorData?.factor_percentiles) {
              const fp2 = factorData.factor_percentiles;
              setFactorPercentiles({
                supply_chain_upstream: Number(fp2.supply_chain_upstream ?? 50),
                supply_chain_downstream: Number(fp2.supply_chain_downstream ?? 50),
                geopolitical: Number(fp2.geopolitical ?? 50),
                monetary: Number(fp2.monetary ?? 50),
                correlations: Number(fp2.correlations ?? 50),
                performance: Number(fp2.risk_performance ?? fp2.performance ?? 50),
              });
            }
          }),
        fetchWithTimeout(() => getAltData(ticker), controller.signal)
          .then((altResult: any) => { if (altResult && altResult.available && altResult.available.length > 0) setAltData(altResult); }),
        fetchWithTimeout(() => getChartData(ticker, 'D', '6M'), controller.signal)
          .then((chartResult: any) => { if (chartResult && chartResult.candles && chartResult.candles.length > 0) setChartData(chartResult); }),
        fetchWithTimeout(() => getEventsForTicker(ticker, { limit: '5' }), controller.signal)
          .then((d: any) => { if (d) setRecentEvents(d.events || []); }),
        fetchWithTimeout(() => getSignalHistory(ticker, 30), controller.signal)
          .then((d: any) => { if (d) setSignalHistory(d.history || []); }),
      ];

      // Load sector peers
      const sectorName = price?.sector;
      if (sectorName) {
        phase2.push(
          fetchWithTimeout(() => getScreener({ sector: sectorName, limit: '10', sort: 'score_desc' }), controller.signal)
            .then((d: any) => {
              if (!d) return;
              const results = (d.results || [])
                .filter((r: any) => r.ticker !== ticker)
                .slice(0, 5)
                .map((r: any) => ({
                  ticker: r.ticker,
                  companyName: r.companyName || r.company_name || '',
                  score: safeNum(r.aiScore ?? r.score ?? r.compositeScore ?? 5),
                  scoreLabel: r.scoreLabel || getScoreLabel(safeNum(r.aiScore ?? r.score ?? 5)),
                }));
              if (results.length > 0) setPeerStocks(results);
            }),
        );
      }

      // Fire all phase 2 in parallel — don't block UI
      Promise.all(phase2).catch(() => {});

    } catch {
      setLoading(false);
    }
  };

  const handleChartRangeChange = async (range: string) => {
    setChartRange(range);
    setChartLoading(true);
    try {
      const result = await getChartData(ticker, 'D', range);
      if (result && result.candles && result.candles.length > 0) {
        setChartData(result);
      }
    } catch {
      // keep existing data
    } finally {
      setChartLoading(false);
    }
  };

  const buildCategories = (): FactorCategory[] => {
    if (!analysis?.factorDetails) return [];
    return CATEGORIES.map((cat) => {
      const subFactors = cat.factorIds.map((fid) => ({
        id: fid,
        name: FACTOR_NAMES[fid] || fid,
        score: analysis.factorDetails[fid]?.score ?? 0,
        reason: analysis.factorDetails[fid]?.reason ?? 'No data available',
      }));
      const scores = subFactors.map((sf) => sf.score);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return { id: cat.id, name: cat.name, icon: cat.icon, avgScore: Math.round(avgScore * 10) / 10, subFactors };
    });
  };

  const handleTabPress = useCallback((index: number) => {
    setActiveTab(index);
    pagerRef.current?.setPage(index);
  }, []);

  // ═══════════════════════════════════════════════════════════
  // Loading State
  // ═══════════════════════════════════════════════════════════

  if (loading) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <Text style={styles.headerTicker}>{ticker}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Skeleton width={80} height={80} borderRadius={40} />
          <View style={{ height: 16 }} />
          <Skeleton width={100} height={24} borderRadius={8} />
          <View style={{ height: 8 }} />
          <Skeleton width={180} height={14} borderRadius={4} />
          <View style={{ height: 32 }} />
          <Skeleton width={'90%'} height={80} borderRadius={12} />
          <View style={{ height: 16 }} />
          <Skeleton width={'90%'} height={60} borderRadius={12} />
        </View>
      </LinearGradient>
    );
  }

  if (!analysis) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <Text style={styles.headerTicker}>{ticker}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ErrorState
          icon="warning"
          message={`No data available for ${ticker}`}
          subtitle="The analysis may not be ready yet. Try again later."
          onRetry={loadData}
          retryLabel="Retry"
        />
      </LinearGradient>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Derived values
  // ═══════════════════════════════════════════════════════════

  const compositeScore = safeNum(analysis.compositeScore);
  const scoreLabel = (analysis.scoreLabel as ScoreLabel) || getScoreLabel(compositeScore);
  const confidence = analysis.confidence || 'MEDIUM';
  const priceChange = safeNum(priceData?.change);
  const priceChangePct = safeNum(priceData?.changePercent);
  const priceValue = safeNum(priceData?.price);
  const hasPriceToShow = priceData != null && typeof priceData.price === 'number' && Number.isFinite(priceData.price);
  const isPositive = priceChange >= 0;
  const categories = buildCategories();
  const riskSummaryText = buildRiskSummary(compositeScore, confidence, scoreDrivers, stressData, factorPercentiles);

  // ═══════════════════════════════════════════════════════════
  // TAB 1: OVERVIEW
  // ═══════════════════════════════════════════════════════════

  const renderOverviewTab = () => (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* SECTION 1: HERO — Beginner-first redesign */}
      <View style={styles.heroSection}>
        <View style={styles.heroRow}>
          {/* Left: Score Ring */}
          <View style={styles.heroLeft}>
            <ScoreRing score={compositeScore} size={80} />
            <View style={styles.heroLabelRow}>
              <Text style={[styles.heroScoreLabel, { color: getScoreColor(compositeScore) }]}>
                {scoreLabel}
              </Text>
              <View style={styles.heroConfidenceRow}>
                <Ionicons
                  name={confidence === 'HIGH' ? 'shield-checkmark' : confidence === 'MEDIUM' ? 'shield-half' : 'shield-outline'}
                  size={14}
                  color={confidence === 'HIGH' ? '#00C9A7' : confidence === 'MEDIUM' ? '#8E8E93' : '#F5A623'}
                />
                <Text style={[styles.heroConfidenceText, {
                  color: confidence === 'HIGH' ? '#00C9A7' : confidence === 'MEDIUM' ? '#8E8E93' : '#F5A623',
                }]}>
                  {confidence === 'HIGH' ? 'High' : confidence === 'MEDIUM' ? 'Medium' : 'Low'} Confidence
                </Text>
              </View>
            </View>
          </View>

          {/* Right: Price + Company */}
          <View style={styles.heroRight}>
            {hasPriceToShow && (
              <>
                <Text style={styles.heroPrice}>${priceValue.toFixed(2)}</Text>
                <Text style={[styles.heroPriceChange, { color: isPositive ? '#00C9A7' : '#F5A623' }]}>
                  {isPositive ? '\u25B2' : '\u25BC'} ${Math.abs(priceChange).toFixed(2)} ({isPositive ? '+' : ''}{priceChangePct.toFixed(1)}%) today
                </Text>
              </>
            )}
            <Text style={styles.heroCompanyName} numberOfLines={2}>
              {analysis.companyName}{priceData?.sector ? ` \u00B7 ${priceData.sector}` : ''}
            </Text>
          </View>
        </View>

        {/* Percentile sentence — beginner-friendly */}
        {percentileRank != null && (
          <Text style={styles.percentileSentence}>
            Better than {Math.round(percentileRank)}% of stocks we track
          </Text>
        )}

        {/* Set Price Alert button */}
        {hasPriceToShow && (
          <TouchableOpacity
            style={styles.alertButton}
            onPress={() => {
              setAlertTargetPrice('');
              setAlertDirection('above');
              setAlertModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={16} color="#60A5FA" />
            <Text style={styles.alertButtonText}>Set Price Alert</Text>
            {getAlertsForTicker(ticker).filter((a) => !a.triggered).length > 0 && (
              <View style={styles.alertCountBadge}>
                <Text style={styles.alertCountText}>
                  {getAlertsForTicker(ticker).filter((a) => !a.triggered).length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* SECTION 2: SCORE DRIVERS — Moved up so users see WHY before risk scenarios */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Score Drivers</Text>
        {(() => {
          const SOURCE_MAP: Record<string, string[]> = {
            supply_chain_upstream: ['SEC EDGAR', 'Finnhub Supply Chain'],
            supply_chain_downstream: ['SEC EDGAR', 'Finnhub Revenue'],
            geopolitical: ['GPR Index', 'SEC EDGAR Risk Factors'],
            monetary: ['FRED Fed Funds', 'FRED CPI', 'FRED Treasury'],
            correlations: ['Finnhub Prices', 'Calculated'],
            risk_performance: ['Finnhub Fundamentals', 'SEC EDGAR Earnings'],
          };
          const DIMENSION_ALIASES: Record<string, string> = {
            'supply chain (upstream)': 'supply_chain_upstream',
            'supply chain upstream': 'supply_chain_upstream',
            'upstream': 'supply_chain_upstream',
            'supply_chain_upstream': 'supply_chain_upstream',
            'supply chain (downstream)': 'supply_chain_downstream',
            'supply chain downstream': 'supply_chain_downstream',
            'downstream': 'supply_chain_downstream',
            'supply_chain_downstream': 'supply_chain_downstream',
            'geopolitical': 'geopolitical',
            'geopolitics': 'geopolitical',
            'monetary': 'monetary',
            'monetary policy': 'monetary',
            'monetary_policy': 'monetary',
            'correlations': 'correlations',
            'correlation': 'correlations',
            'risk_performance': 'risk_performance',
            'risk & performance': 'risk_performance',
            'risk performance': 'risk_performance',
            'performance': 'risk_performance',
          };

          return FACTOR_GAUGE_AXES.map((axis) => {
            const dimData = factorSummaries[axis.dimKey];
            const driverMatch = scoreDrivers.find(
              (d) => {
                const normalized = DIMENSION_ALIASES[d.factor.toLowerCase()] || d.factor;
                return normalized === axis.dimKey || d.factor.toLowerCase().includes(axis.matchKey);
              },
            );
            const score = dimData?.score ?? 5;
            const direction = driverMatch?.direction || (score >= 6 ? 'positive' : score >= 4 ? 'neutral' : 'negative');
            const directionIcon = direction === 'positive' || direction === 'up' ? 'ellipse' : direction === 'neutral' ? 'ellipse' : 'ellipse';
            const directionColor = direction === 'positive' || direction === 'up' ? '#00C9A7' : direction === 'neutral' ? '#F5A623' : '#FF6B6B';
            const summary = dimData?.summary && dimData.summary !== 'pending'
              ? dimData.summary
              : driverMatch?.description
              ? translateDriverDescription(driverMatch.description)
              : axis.tooltip;
            const sources = SOURCE_MAP[axis.dimKey] || ['Calculated'];

            return (
              <TouchableOpacity
                key={axis.key}
                style={styles.driverRow}
                onPress={() => setSelectedDimension(axis.dimKey)}
                activeOpacity={0.7}
              >
                <View style={[styles.driverDirectionDot, { backgroundColor: directionColor }]} />
                <View style={styles.driverContent}>
                  <View style={styles.driverHeaderRow}>
                    <Text style={styles.driverFactor}>{axis.label}</Text>
                    <Text style={[styles.driverScoreText, { color: directionColor }]}>{score}/10</Text>
                  </View>
                  <Text style={styles.driverDesc}>{summary}</Text>
                  <View style={styles.sourceTagRow}>
                    {sources.map(tag => (
                      <View key={tag} style={styles.sourceTag}>
                        <Text style={styles.sourceTagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </TouchableOpacity>
            );
          });
        })()}
        <Text style={styles.aiSectionDisclaimer}>AI-generated analysis for educational purposes</Text>
      </View>

      {/* SECTION 3: RESILIENCE ASSESSMENT (renamed from Risk Check) */}
      <View style={styles.riskCard}>
        <View style={styles.riskCardHeader}>
          <Ionicons name="shield-checkmark" size={18} color="#00C9A7" />
          <Text style={styles.riskCardTitle}>Resilience Assessment</Text>
        </View>

        {/* Resilience thermometer bar */}
        {(() => {
          const riskLevel = compositeScore >= 7 ? 'Low' : compositeScore >= 4 ? 'Moderate' : 'High';
          const riskPct = Math.max(10, Math.min(100, (10 - compositeScore) * 10 + 10));
          const riskColor = riskLevel === 'Low' ? '#00C9A7' : riskLevel === 'Moderate' ? '#F5A623' : '#FF6B6B';
          return (
            <View style={styles.riskThermometerRow}>
              <Text style={styles.riskThermometerLabel}>Overall Resilience:</Text>
              <View style={styles.riskThermometerTrack}>
                <View style={[styles.riskThermometerFill, { width: `${riskPct}%`, backgroundColor: riskColor }]} />
              </View>
              <Text style={[styles.riskThermometerLevel, { color: riskColor }]}>{riskLevel}</Text>
            </View>
          );
        })()}

        {/* Upside AND downside scenarios */}
        {stressData?.scenarios && stressData.scenarios.length > 0 && (() => {
          const moderate = stressData.scenarios.find((s: any) => s.scenarioKey === 'moderate' || s.scenarioKey === 'pullback') || stressData.scenarios[0];
          const severe = stressData.scenarios.find((s: any) => s.scenarioKey === 'severe') || stressData.scenarios[stressData.scenarios.length - 1];
          const moderateImpact = moderate ? Math.abs(safeNum(moderate.estimated_impact)) : 18;
          const upsideEst = Math.round(moderateImpact * 1.4);
          const upsideResult = Math.round(10000 * (1 + upsideEst / 100));
          const severeImpact = severe ? safeNum(severe.estimated_impact) : -50;
          const downResult = Math.max(0, Math.round(10000 * (1 + severeImpact / 100)));
          return (
            <View style={{ gap: 6, marginBottom: 12 }}>
              <View style={styles.riskCrashRow}>
                <Text style={[styles.riskCrashLabel, { color: '#00C9A7' }]}>In favorable conditions:</Text>
                <Text style={[styles.riskCrashValue, { color: '#00C9A7' }]}>
                  $10,000 {'\u2192'} ~${upsideResult.toLocaleString()} (+{upsideEst}%)
                </Text>
              </View>
              <View style={styles.riskCrashRow}>
                <Text style={styles.riskCrashLabel}>In a severe downturn:</Text>
                <Text style={styles.riskCrashValue}>
                  $10,000 {'\u2192'} ~${downResult.toLocaleString()} ({severeImpact > 0 ? '+' : ''}{severeImpact.toFixed(1)}%)
                </Text>
              </View>
            </View>
          );
        })()}

        {/* Concerns and Strengths with source citations */}
        {(() => {
          const negDrivers = scoreDrivers.filter(d => d.direction === 'negative' || d.direction === 'down');
          const posDrivers = scoreDrivers.filter(d => d.direction === 'positive' || d.direction === 'up');
          const concerns: string[] = [];
          const strengths: string[] = [];

          if (confidence === 'LOW') {
            const availDims = factorPercentiles
              ? Object.values(factorPercentiles).filter(v => v !== 50).length
              : 0;
            concerns.push(`Limited data coverage (${Math.max(availDims, 3)}/6 factors)`);
          }

          negDrivers.slice(0, 2).forEach(d => {
            concerns.push(translateDriverDescription(d.description));
          });
          posDrivers.slice(0, 2).forEach(d => {
            strengths.push(translateDriverDescription(d.description));
          });

          const sourceTags = ['SEC 10-K', 'FRED', 'Finnhub', 'GPR Index'];

          return (
            <>
              {concerns.length > 0 && (
                <View style={styles.riskListSection}>
                  <Text style={styles.riskListHeader}>Key Concerns:</Text>
                  {concerns.map((c, i) => (
                    <View key={`concern-${i}`}>
                      <View style={styles.riskListRow}>
                        <Ionicons name="alert-circle" size={14} color="#F5A623" />
                        <Text style={styles.riskListText}>{c}</Text>
                      </View>
                      <View style={styles.sourceTagRow}>
                        {sourceTags.slice(0, 2).map(tag => (
                          <View key={tag} style={styles.sourceTag}>
                            <Text style={styles.sourceTagText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {strengths.length > 0 && (
                <View style={styles.riskListSection}>
                  <Text style={styles.riskListHeader}>Key Strengths:</Text>
                  {strengths.map((s, i) => (
                    <View key={`strength-${i}`}>
                      <View style={styles.riskListRow}>
                        <Ionicons name="checkmark-circle" size={14} color="#00C9A7" />
                        <Text style={styles.riskListText}>{s}</Text>
                      </View>
                      <View style={styles.sourceTagRow}>
                        {sourceTags.slice(2, 4).map(tag => (
                          <View key={tag} style={styles.sourceTag}>
                            <Text style={styles.sourceTagText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          );
        })()}
        <Text style={styles.aiSectionDisclaimer}>AI-generated analysis for educational purposes</Text>
      </View>

      {/* SECTION 4: PEER COMPARISON — List format with sticky header + zebra rows */}
      {peerStocks.length > 0 && (() => {
        const sortedPeers = [...peerStocks].sort((a, b) => b.score - a.score);

        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Peer Comparison</Text>
            <View style={styles.peerListContainer}>
              <View style={styles.peerListHeaderRow}>
                <Text style={[styles.peerListHeaderCell, styles.peerListHeaderTicker]}>Ticker</Text>
                <Text style={[styles.peerListHeaderCell, styles.peerListHeaderName]}>Company</Text>
                <Text style={[styles.peerListHeaderCell, styles.peerListHeaderScore]}>Score</Text>
                <Text style={[styles.peerListHeaderCell, styles.peerListHeaderDiff]}>vs {ticker}</Text>
              </View>
              {sortedPeers.slice(0, 5).map((peer, idx) => {
                const diff = peer.score - compositeScore;
                const diffColor = diff > 0 ? '#00C9A7' : diff < 0 ? '#F5A623' : 'rgba(255,255,255,0.5)';
                const isAlt = idx % 2 === 1;
                return (
                  <TouchableOpacity
                    key={peer.ticker}
                    style={[styles.peerListRow, isAlt && styles.peerListRowAlt]}
                    onPress={() => navigation.push('SignalDetail', { ticker: peer.ticker, companyName: peer.companyName })}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.peerListTicker}>{peer.ticker}</Text>
                    <Text style={styles.peerListName} numberOfLines={1}>{peer.companyName}</Text>
                    <Text style={[styles.peerListScore, { color: getScoreColor(peer.score) }]}>
                      {peer.score.toFixed(1)}
                    </Text>
                    <Text style={[styles.peerListDiff, { color: diffColor }]}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })()}

      {/* SECTION 5: EDUCATIONAL DISCLAIMER */}
      <Text style={styles.eduDisclaimer}>
        Scores reflect factor analysis of publicly available data. For educational purposes only. Not investment advice.
      </Text>
    </ScrollView>
  );

  // ═══════════════════════════════════════════════════════════
  // TAB 2: FINANCIALS (renamed from Analysis)
  // ═══════════════════════════════════════════════════════════

  const renderFinancialsTab = () => (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* SECTION 1: FINANCIAL METRICS (primary content) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Financial Metrics</Text>
        <FinancialStatsGrid ticker={ticker} />
      </View>

      {/* SECTION 2: STRESS TEST SCENARIOS */}
      <View style={styles.section}>
        {stressData && stressData.scenarios && stressData.scenarios.length > 0 ? (
          <StressTestCards report={stressData} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Stress Test Scenarios</Text>
            <Text style={styles.emptyText}>
              Stress test analysis pending. Available after next scoring cycle.
            </Text>
          </>
        )}
      </View>

      <DisclaimerFooter />
    </ScrollView>
  );

  // ═══════════════════════════════════════════════════════════
  // TAB 3: FACTOR SCORING (renamed from Deep Dive)
  // ═══════════════════════════════════════════════════════════

  const renderFactorScoringTab = () => (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* SECTION 1: PARENT FACTORS — Collapsible card per factor with
          sub-factors FIRST and commentary BELOW. Replaces the old split of
          "All Sub-Factors" + "Factor Commentary". */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Factor Breakdown</Text>
        {categories.length > 0 ? (
          categories.map((cat) => {
            const factorAxisMap: Record<string, string> = { A: 'supply_chain_upstream', B: 'supply_chain_downstream', C: 'geopolitical', D: 'monetary', E: 'correlations', F: 'risk_performance' };
            const SOURCE_MAP: Record<string, string[]> = {
              supply_chain_upstream: ['SEC EDGAR', 'Finnhub Supply Chain'],
              supply_chain_downstream: ['SEC EDGAR', 'Finnhub Revenue'],
              geopolitical: ['GPR Index', 'SEC EDGAR Risk Factors'],
              monetary: ['FRED Fed Funds', 'FRED CPI', 'FRED Treasury'],
              correlations: ['Finnhub Prices', 'Calculated'],
              risk_performance: ['Finnhub Fundamentals', 'SEC EDGAR Earnings'],
            };

            const dimKey = factorAxisMap[cat.id] || '';
            const dimData = factorSummaries[dimKey];
            const axis = FACTOR_GAUGE_AXES.find((a) => a.dimKey === dimKey);
            const parentScore = dimData?.score ?? 5;
            const isExpanded = expandedCategory === cat.id;
            const hasSummary = dimData && dimData.summary && dimData.summary !== 'pending';
            const parentScoreColor = parentScore >= 6 ? '#00C9A7' : parentScore >= 4 ? '#F5A623' : '#FF6B6B';
            const parentLabel = dimData?.score_label || (parentScore >= 7 ? 'Strong' : parentScore >= 5 ? 'Moderate' : 'Weak');

            return (
              <View key={`fscore-${cat.id}`} style={styles.fsGroupCard}>
                {/* Parent factor header — now collapsible */}
                <TouchableOpacity
                  style={styles.fsGroupHeader}
                  onPress={() => {
                    LayoutAnimation.configureNext(COLLAPSE_ANIMATION);
                    setExpandedCategory(isExpanded ? null : cat.id);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                    size={14}
                    color="rgba(255,255,255,0.5)"
                  />
                  <Ionicons name={cat.icon as any} size={16} color="#60A5FA" />
                  <Text style={styles.fsGroupName}>{cat.name}</Text>
                  <Text style={[styles.fsGroupLabel, { color: parentScoreColor }]}>{parentLabel}</Text>
                  <Text style={[styles.fsGroupScore, { color: parentScoreColor }]}>
                    {parentScore}/10
                  </Text>
                </TouchableOpacity>

                {isExpanded && (
                  <>
                    {/* Sub-factors FIRST */}
                    {cat.subFactors.map((sf) => {
                      const sfVal = safeNum(sf.score);
                      const hasSubScore = sf.score !== 0 || (analysis?.factorDetails?.[sf.id]?.score != null);
                      const barPct = Math.max(0, Math.min(100, ((sfVal + 2) / 4) * 100));
                      const sfColor = sfVal > 0.5 ? '#00C9A7' : sfVal >= -0.5 ? '#F5A623' : '#FF6B6B';
                      const confLabel = Math.abs(sfVal) > 1 ? 'High' : Math.abs(sfVal) > 0.3 ? 'Med' : 'Low';
                      const dirLabel = sfVal > 0.5 ? 'Positive' : sfVal >= -0.5 ? 'Neutral' : 'Negative';

                      return (
                        <View key={sf.id} style={styles.fsSubRow}>
                          <View style={styles.fsSubHeader}>
                            <Text style={styles.fsSubId}>{sf.id}</Text>
                            <Text style={styles.fsSubName}>{sf.name}</Text>
                          </View>
                          <View style={styles.fsSubScoreRow}>
                            <Text style={[styles.fsSubScoreVal, { color: sfColor }]}>
                              {sfVal >= 0 ? '+' : ''}{sfVal.toFixed(2)}
                            </Text>
                            <View style={styles.fsBarTrack}>
                              <View style={[styles.fsBarFill, { width: `${barPct}%`, backgroundColor: sfColor }]} />
                            </View>
                            <Text style={[styles.fsSubLabel, { color: sfColor }]}>{dirLabel}</Text>
                            <Text style={styles.fsSubConf}>{confLabel}</Text>
                          </View>
                          {!hasSubScore && (
                            <Text style={styles.fsSubNote}>Based on overall factor assessment</Text>
                          )}
                        </View>
                      );
                    })}

                    {/* Commentary BELOW sub-factors */}
                    <View style={styles.fsCommentaryBody}>
                      <Text style={styles.fsCommentaryTitle}>Commentary:</Text>
                      {hasSummary ? (
                        <>
                          {dimData.summary.split('. ').filter(Boolean).slice(0, 3).map((finding: string, i: number) => (
                            <View key={i} style={styles.fsCommentaryFinding}>
                              <Text style={styles.fsCommentaryBullet}>{'\u2022'}</Text>
                              <Text style={styles.fsCommentaryText}>
                                {finding.endsWith('.') ? finding : `${finding}.`}
                              </Text>
                            </View>
                          ))}
                          <View style={styles.sourceTagRow}>
                            {(SOURCE_MAP[dimKey] || ['Calculated']).map((tag) => (
                              <View key={tag} style={styles.sourceTag}>
                                <Text style={styles.sourceTagText}>{tag}</Text>
                              </View>
                            ))}
                          </View>
                        </>
                      ) : (
                        <Text style={styles.fsCommentaryText}>
                          {axis?.tooltip || 'Detailed commentary is pending for this factor.'}
                        </Text>
                      )}
                      <View style={styles.fsCommentaryMeta}>
                        <Text style={styles.fsCommentaryConf}>
                          Confidence: {dimData?.confidence || 'Medium'}
                        </Text>
                        <Text style={styles.fsCommentaryDate}>Data as of: March 2026</Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyText}>Factor data loading...</Text>
        )}
      </View>

      {/* SECTION 3: ALTERNATIVE DATA INSIGHTS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Alternative Data</Text>
        {altData && (altData.available ?? []).length > 0 ? (
          <View style={styles.fsAltDataCard}>
            {(altData.available ?? []).includes('patents') && altData.patents && (
              <View style={styles.fsAltDataRow}>
                <Ionicons name="bulb-outline" size={16} color="#F59E0B" />
                <View style={styles.fsAltDataContent}>
                  <Text style={styles.fsAltDataLabel}>Patents: {altData.patents.total_filings ?? 'N/A'} filed, {altData.patents.velocity >= 0 ? '+' : ''}{safeNum(altData.patents.velocity).toFixed(0)}% YoY</Text>
                  {altData.patents.key_areas && (
                    <Text style={styles.fsAltDataSub}>Key areas: {altData.patents.key_areas.slice(0, 3).join(', ')}</Text>
                  )}
                </View>
              </View>
            )}
            {(altData.available ?? []).includes('contracts') && altData.contracts && (
              <View style={styles.fsAltDataRow}>
                <Ionicons name="business-outline" size={16} color="#60A5FA" />
                <View style={styles.fsAltDataContent}>
                  <Text style={styles.fsAltDataLabel}>Gov Contracts: {altData.contracts.awardGrowth >= 0 ? '+' : ''}{safeNum(altData.contracts.awardGrowth).toFixed(0)}% YoY</Text>
                </View>
              </View>
            )}
            {(altData.available ?? []).includes('fda') && altData.fda && (
              <View style={styles.fsAltDataRow}>
                <Ionicons name="medical-outline" size={16} color="#8B5CF6" />
                <View style={styles.fsAltDataContent}>
                  <Text style={styles.fsAltDataLabel}>FDA: {altData.fda.pdufaWithin90Days} PDUFA date{altData.fda.pdufaWithin90Days !== 1 ? 's' : ''} within 90 days</Text>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.fsAltDataCard}>
            <Text style={styles.fsAltDataPlaceholder}>Alternative data coming soon for {ticker}</Text>
          </View>
        )}
      </View>

      <DisclaimerFooter />
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  // ═══════════════════════════════════════════════════════════
  // Main Render
  // ═══════════════════════════════════════════════════════════

  return (
    <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
      {/* HEADER BAR: Back arrow + Ticker */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <Text style={styles.headerTicker}>{ticker}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* TAB BAR */}
      <View style={styles.tabBar}>
        {TAB_NAMES.map((name, index) => (
          <TouchableOpacity
            key={name}
            style={[styles.tab, activeTab === index && styles.tabActive]}
            onPress={() => handleTabPress(index)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === index && styles.tabTextActive]}>
              {name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* SWIPEABLE PAGER */}
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setActiveTab(e.nativeEvent.position)}
      >
        <View key="overview" style={styles.page}>
          {renderOverviewTab()}
        </View>
        <View key="financials" style={styles.page}>
          {renderFinancialsTab()}
        </View>
        <View key="factorscoring" style={styles.page}>
          {renderFactorScoringTab()}
        </View>
      </PagerView>

      {/* Factor Detail Bottom Sheet */}
      {selectedDimension && (
        <FactorDetailCard
          ticker={ticker}
          dimension={selectedDimension}
          onClose={() => setSelectedDimension(null)}
        />
      )}

      {/* Alert Confirmation Banner */}
      {alertConfirmation && (
        <View style={styles.alertBanner}>
          <Ionicons name="notifications" size={16} color="#60A5FA" />
          <Text style={styles.alertBannerText}>{alertConfirmation}</Text>
        </View>
      )}

      {/* Price Alert Modal */}
      <Modal
        visible={alertModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAlertModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.alertModalOverlay}>
          <TouchableOpacity style={styles.alertModalOverlay} activeOpacity={1} onPress={() => setAlertModalVisible(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.alertModalContent} onPress={() => {}}>
              <View style={styles.alertModalHandle} />
              <Text style={styles.alertModalTitle}>Set Price Alert for {ticker}</Text>

              {hasPriceToShow && (
                <Text style={styles.alertModalCurrentPrice}>
                  Current Price: ${priceValue.toFixed(2)}
                </Text>
              )}

              <Text style={styles.alertModalLabel}>Alert me when price goes:</Text>
              <View style={styles.alertDirectionRow}>
                <TouchableOpacity
                  style={[styles.alertDirectionBtn, alertDirection === 'above' && styles.alertDirectionBtnActive]}
                  onPress={() => setAlertDirection('above')}
                >
                  <Ionicons name="arrow-up" size={16} color={alertDirection === 'above' ? '#FFF' : 'rgba(255,255,255,0.5)'} />
                  <Text style={[styles.alertDirectionText, alertDirection === 'above' && styles.alertDirectionTextActive]}>
                    Above
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.alertDirectionBtn, alertDirection === 'below' && styles.alertDirectionBtnActive]}
                  onPress={() => setAlertDirection('below')}
                >
                  <Ionicons name="arrow-down" size={16} color={alertDirection === 'below' ? '#FFF' : 'rgba(255,255,255,0.5)'} />
                  <Text style={[styles.alertDirectionText, alertDirection === 'below' && styles.alertDirectionTextActive]}>
                    Below
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.alertModalLabel}>Target Price:</Text>
              <TextInput
                style={styles.alertPriceInput}
                value={alertTargetPrice}
                onChangeText={setAlertTargetPrice}
                placeholder="0.00"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="decimal-pad"
                returnKeyType="done"
              />

              {hasPriceToShow && (
                <View style={styles.alertQuickPicks}>
                  {[5, 10, -5, -10].map((pct) => (
                    <TouchableOpacity
                      key={pct}
                      style={styles.alertQuickPickBtn}
                      onPress={() => setAlertTargetPrice((priceValue * (1 + pct / 100)).toFixed(2))}
                    >
                      <Text style={styles.alertQuickPickText}>
                        {pct > 0 ? '+' : ''}{pct}%
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.alertSetButton,
                  (!alertTargetPrice || parseFloat(alertTargetPrice) === priceValue) && styles.alertSetButtonDisabled,
                ]}
                onPress={() => {
                  const target = parseFloat(alertTargetPrice);
                  if (!target || target === priceValue) return;
                  addAlert(ticker, analysis?.companyName || ticker, target, alertDirection);
                  setAlertModalVisible(false);
                  setAlertConfirmation(`Alert set: ${ticker} ${alertDirection} $${target.toFixed(2)}`);
                  setTimeout(() => setAlertConfirmation(null), 3000);
                }}
                disabled={!alertTargetPrice || parseFloat(alertTargetPrice) === priceValue}
              >
                <Ionicons name="notifications" size={18} color="#FFF" />
                <Text style={styles.alertSetButtonText}>Set Alert</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Peer Comparison Modal */}
      <Modal
        visible={compareModalPeer != null}
        transparent
        animationType="fade"
        onRequestClose={() => setCompareModalPeer(null)}
      >
        <TouchableOpacity style={styles.compareModalOverlay} activeOpacity={1} onPress={() => setCompareModalPeer(null)}>
          <View style={styles.compareModalContent}>
            <View style={styles.alertModalHandle} />
            <Text style={styles.compareModalTitle}>Compare</Text>
            {compareModalPeer && (
              <View style={styles.compareRow}>
                {/* Current Stock */}
                <View style={styles.compareCol}>
                  <ScoreRing score={compositeScore} size={56} />
                  <Text style={styles.compareTicker}>{ticker}</Text>
                  <Text style={[styles.compareScore, { color: getScoreColor(compositeScore) }]}>
                    {compositeScore.toFixed(1)}
                  </Text>
                  <Text style={[styles.compareLabel, { color: getScoreColor(compositeScore) }]}>
                    {scoreLabel}
                  </Text>
                </View>

                <Text style={styles.compareVs}>vs</Text>

                {/* Peer Stock */}
                <View style={styles.compareCol}>
                  <ScoreRing score={compareModalPeer.score} size={56} />
                  <Text style={styles.compareTicker}>{compareModalPeer.ticker}</Text>
                  <Text style={[styles.compareScore, { color: getScoreColor(compareModalPeer.score) }]}>
                    {compareModalPeer.score.toFixed(1)}
                  </Text>
                  <Text style={[styles.compareLabel, { color: getScoreColor(compareModalPeer.score) }]}>
                    {compareModalPeer.scoreLabel}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.compareActions}>
              <TouchableOpacity
                style={styles.compareViewBtn}
                onPress={() => {
                  setCompareModalPeer(null);
                  if (compareModalPeer) {
                    navigation.push('SignalDetail', { ticker: compareModalPeer.ticker, companyName: compareModalPeer.companyName });
                  }
                }}
              >
                <Text style={styles.compareViewBtnText}>View {compareModalPeer?.ticker} Details</Text>
                <Ionicons name="arrow-forward" size={16} color="#60A5FA" />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </LinearGradient>
  );
};

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Header Bar ──
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTicker: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // ── Tab Bar ──
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#00C9A7',
  },
  tabText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  // ── Pager ──
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  tabContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // ── Loading ──
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Hero Section (Overview) ──
  heroSection: {
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLeft: {
    alignItems: 'center',
    flex: 0.45,
  },
  heroRight: {
    flex: 0.55,
    alignItems: 'flex-end',
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  heroScoreLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  // confidenceDot/halfDot removed — replaced by heroConfidenceRow with Ionicons
  heroConfidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  heroConfidenceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  percentileSentence: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  heroPrice: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  heroPriceChange: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  heroCompanyName: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'right',
  },

  // ── Risk Summary Card ──
  riskCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    marginBottom: 16,
  },
  riskCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  riskCardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  riskCardText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 20,
  },
  riskThermometerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  riskThermometerLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '500',
  },
  riskThermometerTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  riskThermometerFill: {
    height: '100%',
    borderRadius: 4,
  },
  riskThermometerLevel: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 60,
    textAlign: 'right',
  },
  riskCrashRow: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  riskCrashLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  riskCrashValue: {
    color: '#F5A623',
    fontSize: 14,
    fontWeight: '700',
  },
  riskListSection: {
    marginTop: 4,
    marginBottom: 4,
  },
  riskListHeader: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  riskListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 4,
  },
  riskListText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },

  // ── Generic Section ──
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  // ── Score Drivers ──
  driverRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
  },
  driverArrow: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  driverContent: {
    flex: 1,
  },
  driverFactor: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  driverDesc: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },

  // ── Peers ──
  peerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  peerSortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  peerSortText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  peerScrollContent: {
    gap: 10,
    paddingRight: 16,
  },
  peerCard: {
    alignItems: 'center',
    width: 90,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
  },
  peerTicker: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  peerScore: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  peerLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  peerInsight: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12,
  },

  // ── Peer List (new list format) ──
  peerListContainer: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  peerListHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(96,165,250,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(96,165,250,0.18)',
  },
  peerListHeaderCell: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  peerListHeaderTicker: {
    width: 55,
  },
  peerListHeaderName: {
    flex: 1,
    marginRight: 8,
  },
  peerListHeaderScore: {
    width: 40,
    textAlign: 'right',
    marginRight: 10,
  },
  peerListHeaderDiff: {
    width: 60,
    textAlign: 'right',
  },
  peerListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  peerListRowAlt: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  peerListTicker: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    width: 55,
  },
  peerListName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  peerListScore: {
    fontSize: 14,
    fontWeight: '800',
    width: 40,
    textAlign: 'right',
    marginRight: 10,
  },
  peerListDiff: {
    fontSize: 12,
    fontWeight: '700',
    width: 60,
    textAlign: 'right',
  },

  // ── Source Citation Tags ──
  sourceTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
    marginLeft: 20,
  },
  sourceTag: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceTagText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    fontWeight: '600',
  },

  // ── Driver enhancements ──
  driverDirectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  driverHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  driverScoreText: {
    fontSize: 13,
    fontWeight: '800',
  },

  // ── Educational Disclaimer ──
  eduDisclaimer: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  aiSectionDisclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'right',
    marginTop: 8,
  },

  // ── Factor Gauges (Analysis tab) ──
  gaugeRow: {
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
  },
  gaugeRowExpanded: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  gaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  gaugeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  gaugeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gaugeName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  gaugeValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  gaugeTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 3,
  },
  factorSummaryCard: {
    marginTop: 10,
    backgroundColor: 'rgba(10, 15, 40, 0.6)',
    borderRadius: 8,
    padding: 12,
  },
  factorPreviewText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  factorSummaryText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  factorSummaryFallback: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  factorMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  factorScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  factorScoreBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  factorConfidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  factorConfidenceText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Stress Test (Analysis tab) ──
  stressGrid: {
    gap: 10,
  },
  stressCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  stressScenarioName: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  stressImpact: {
    fontSize: 22,
    fontWeight: '800',
  },
  stressLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 4,
  },

  // ── Technical Pills (Analysis tab) ──
  techPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  techPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  techPillText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  tapForMoreBtn: {
    marginTop: 10,
  },
  tapForMoreText: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Financial Health (Analysis tab) ──
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  healthGradeBadge: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  healthGradeText: {
    fontSize: 18,
    fontWeight: '800',
  },
  healthMetrics: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    flex: 1,
  },

  // ── Key Data (Analysis tab) ──
  keyDataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  keyDataCell: {
    width: (SCREEN_WIDTH - 32 - 1) / 2,
    backgroundColor: '#0D1B3E',
    padding: 12,
  },
  keyDataLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  keyDataValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Deep Dive: Collapsible Headers ──
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  collapsibleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsibleTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Deep Dive: Toggle ──
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    marginBottom: 12,
    padding: 2,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(96,165,250,0.2)',
  },
  toggleText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#60A5FA',
  },

  // ── Deep Dive: Sub-factor groups ──
  deepDiveGroup: {
    marginBottom: 16,
  },
  deepDiveGroupTitle: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  deepDiveSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  deepDiveSubName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '500',
    width: 100,
  },
  deepDiveSubTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  deepDiveSubFill: {
    height: '100%',
    borderRadius: 2,
  },
  deepDiveSubValue: {
    fontSize: 10,
    fontWeight: '700',
    width: 35,
    textAlign: 'right',
  },

  // ── Deep Dive: Data Table ──
  dataTable: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  dataLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
  },
  dataValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Factor Scoring Tab ──
  fsGroupCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  fsGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  fsGroupName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fsGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginRight: 4,
  },
  fsGroupScore: {
    fontSize: 14,
    fontWeight: '800',
  },
  fsSubRow: {
    marginBottom: 10,
    paddingLeft: 4,
  },
  fsSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  fsSubId: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '700',
    width: 22,
  },
  fsSubName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  fsSubScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 28,
  },
  fsSubScoreVal: {
    fontSize: 11,
    fontWeight: '700',
    width: 42,
    textAlign: 'right',
  },
  fsBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fsBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  fsSubLabel: {
    fontSize: 10,
    fontWeight: '600',
    width: 50,
    textAlign: 'center',
  },
  fsSubConf: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    fontWeight: '600',
    width: 26,
    textAlign: 'right',
  },
  fsSubNote: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 9,
    fontStyle: 'italic',
    paddingLeft: 28,
    marginTop: 2,
  },

  // ── Factor Commentary Cards ──
  fsCommentaryCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  fsCommentaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fsCommentaryName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  fsCommentaryScore: {
    fontSize: 13,
    fontWeight: '800',
  },
  fsCommentaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    width: 60,
    textAlign: 'right',
  },
  fsCommentaryBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  fsCommentaryTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  fsCommentaryFinding: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  fsCommentaryBullet: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    lineHeight: 18,
  },
  fsCommentaryText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  fsCommentaryMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  fsCommentaryConf: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '600',
  },
  fsCommentaryDate: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 10,
  },

  // ── Alt Data (Factor Scoring tab) ──
  fsAltDataCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  fsAltDataRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  fsAltDataContent: {
    flex: 1,
  },
  fsAltDataLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  fsAltDataSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },
  fsAltDataPlaceholder: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },

  // ── Deep Dive: Factor Categories ──
  categoryCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryScore: {
    fontSize: 14,
    fontWeight: '800',
  },
  subFactors: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 12,
  },
  subFactorRow: {
    marginBottom: 10,
  },
  subFactorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  subFactorId: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontWeight: '700',
    width: 20,
  },
  subFactorName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  subFactorScore: {
    fontSize: 13,
    fontWeight: '700',
  },
  subFactorReason: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginLeft: 26,
    lineHeight: 16,
  },

  // ── Community ──
  viewAllLink: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '600',
  },
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  communityContent: {
    flex: 1,
  },
  communityTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  communitySubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },

  // ── Financial Metrics ──
  finCategoryCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  finCategoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  finCategoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  finCategoryName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  finCategoryBadge: {
    backgroundColor: 'rgba(96,165,250,0.15)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  finCategoryBadgeText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '700',
  },
  finMetricsList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
  },
  finMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  finMetricName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  finMetricRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  finMetricValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  finSourceBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  finSourceText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  // ── Empty state ──
  emptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },

  // ── Price Alert Button ──
  alertButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
    alignSelf: 'center',
  },
  alertButtonText: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '600',
  },
  alertCountBadge: {
    backgroundColor: '#60A5FA',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  alertCountText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Alert Banner ──
  alertBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 80,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(96,165,250,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 100,
  },
  alertBannerText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // ── Alert Modal ──
  alertModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  alertModalContent: {
    backgroundColor: '#0D1B3E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  alertModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  alertModalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  alertModalCurrentPrice: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginBottom: 20,
  },
  alertModalLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  alertDirectionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  alertDirectionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  alertDirectionBtnActive: {
    backgroundColor: 'rgba(96,165,250,0.2)',
    borderColor: '#60A5FA',
  },
  alertDirectionText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
  alertDirectionTextActive: {
    color: '#FFF',
  },
  alertPriceInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  alertQuickPicks: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
  },
  alertQuickPickBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  alertQuickPickText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  alertSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#60A5FA',
    borderRadius: 14,
    paddingVertical: 14,
  },
  alertSetButtonDisabled: {
    opacity: 0.4,
  },
  alertSetButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Compare Modal ──
  compareModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  compareModalContent: {
    backgroundColor: '#0D1B3E',
    borderRadius: 20,
    padding: 24,
    width: SCREEN_WIDTH - 48,
    alignItems: 'center',
  },
  compareModalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 20,
  },
  compareCol: {
    alignItems: 'center',
    flex: 1,
  },
  compareTicker: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  compareScore: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  compareLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  compareVs: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 16,
    fontWeight: '700',
  },
  compareActions: {
    width: '100%',
  },
  compareViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(96,165,250,0.15)',
  },
  compareViewBtnText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
  },
});
