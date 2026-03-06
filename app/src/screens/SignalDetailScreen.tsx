import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
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

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TAB_NAMES = ['Overview', 'Analysis', 'Deep Dive'] as const;

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
  stressData: any[] | null,
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

  // Stress test line
  if (stressData && stressData.length > 0) {
    const severe = stressData.find((s: any) => s.scenarioKey === 'severely_adverse') || stressData[stressData.length - 1];
    if (severe && severe.priceImpact != null) {
      const impact = safeNum(severe.priceImpact);
      if (impact < -50) {
        lines.push(`In a severe recession scenario, the model estimates a potential ${impact}% impact.`);
      } else if (impact <= -20) {
        lines.push(`Stress testing suggests moderate vulnerability to economic downturns (${impact}%).`);
      } else {
        lines.push(`The stock shows relative resilience in stress test scenarios (${impact}%).`);
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
  const pagerRef = useRef<PagerView>(null);
  const [activeTab, setActiveTab] = useState(0);

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
  const [stressData, setStressData] = useState<any[] | null>(null);
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
          .then((d: any) => { if (d) setStressData(d.scenarios || []); }),
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
          fetchWithTimeout(() => getScreener({ sector: sectorName, limit: '5', sort: 'score_desc' }), controller.signal)
            .then((d: any) => {
              if (!d) return;
              const results = (d.results || [])
                .filter((r: any) => r.ticker !== ticker)
                .slice(0, 3)
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
      </View>

      {/* SECTION 2: RISK CHECK CARD — Emotional design with thermometer */}
      <View style={styles.riskCard}>
        <View style={styles.riskCardHeader}>
          <Ionicons name="shield-checkmark" size={18} color="#00C9A7" />
          <Text style={styles.riskCardTitle}>Risk Check</Text>
        </View>

        {/* Risk thermometer bar */}
        {(() => {
          const riskLevel = compositeScore >= 7 ? 'Low' : compositeScore >= 4 ? 'Moderate' : 'High';
          const riskPct = Math.max(10, Math.min(100, (10 - compositeScore) * 10 + 10));
          const riskColor = riskLevel === 'Low' ? '#00C9A7' : riskLevel === 'Moderate' ? '#F5A623' : '#FF6B6B';
          return (
            <View style={styles.riskThermometerRow}>
              <Text style={styles.riskThermometerLabel}>Overall Risk:</Text>
              <View style={styles.riskThermometerTrack}>
                <View style={[styles.riskThermometerFill, { width: `${riskPct}%`, backgroundColor: riskColor }]} />
              </View>
              <Text style={[styles.riskThermometerLevel, { color: riskColor }]}>{riskLevel}</Text>
            </View>
          );
        })()}

        {/* Dollar-based crash estimate */}
        {stressData && stressData.length > 0 && (() => {
          const severe = stressData.find((s: any) => s.scenarioKey === 'severely_adverse') || stressData[stressData.length - 1];
          if (severe && severe.priceImpact != null) {
            const impact = safeNum(severe.priceImpact);
            const dollarResult = Math.max(0, Math.round(1000 * (1 + impact / 100)));
            return (
              <View style={styles.riskCrashRow}>
                <Text style={styles.riskCrashLabel}>If markets crashed 50%:</Text>
                <Text style={styles.riskCrashValue}>
                  Your $1,000 {'\u2192'} ~${dollarResult.toLocaleString()} (est. {impact > 0 ? '+' : ''}{impact}%)
                </Text>
              </View>
            );
          }
          return null;
        })()}

        {/* Concerns (from negative drivers) */}
        {(() => {
          const negDrivers = scoreDrivers.filter(d => d.direction === 'negative' || d.direction === 'down');
          const posDrivers = scoreDrivers.filter(d => d.direction === 'positive' || d.direction === 'up');
          const concerns: string[] = [];
          const strengths: string[] = [];

          // Data coverage concern
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

          return (
            <>
              {concerns.length > 0 && (
                <View style={styles.riskListSection}>
                  <Text style={styles.riskListHeader}>Key concerns:</Text>
                  {concerns.map((c, i) => (
                    <View key={`concern-${i}`} style={styles.riskListRow}>
                      <Ionicons name="alert-circle" size={14} color="#F5A623" />
                      <Text style={styles.riskListText}>{c}</Text>
                    </View>
                  ))}
                </View>
              )}
              {strengths.length > 0 && (
                <View style={styles.riskListSection}>
                  <Text style={styles.riskListHeader}>Strengths:</Text>
                  {strengths.map((s, i) => (
                    <View key={`strength-${i}`} style={styles.riskListRow}>
                      <Ionicons name="checkmark-circle" size={14} color="#00C9A7" />
                      <Text style={styles.riskListText}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          );
        })()}
      </View>

      {/* SECTION 3: WHAT'S DRIVING THIS SCORE — Beginner-friendly translations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What's Driving This Score</Text>
        {scoreDrivers.length > 0 ? (
          scoreDrivers.slice(0, 3).map((driver, idx) => {
            const driverIcon = getDriverIcon(driver.direction);
            const factorDisplayName: Record<string, string> = {
              supply_chain_upstream: 'Supply Chain (Upstream)',
              supply_chain_downstream: 'Supply Chain (Downstream)',
              geopolitical: 'Geopolitical',
              monetary: 'Monetary Policy',
              correlations: 'Correlations',
              risk_performance: 'Risk & Performance',
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
            const normalizedDimension = DIMENSION_ALIASES[driver.factor.toLowerCase()] || driver.factor;
            const rawLabel = factorDisplayName[normalizedDimension] || driver.factor;
            // Beginner-friendly factor name
            const factorLabel = translateFactorName(rawLabel);
            // Beginner-friendly description
            const beginnerDesc = translateDriverDescription(driver.description);
            return (
              <TouchableOpacity
                key={`driver-${idx}`}
                style={styles.driverRow}
                onPress={() => setSelectedDimension(normalizedDimension)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={driverIcon.name as any}
                  size={20}
                  color={driverIcon.type === 'positive' ? '#00C9A7' : '#F5A623'}
                />
                <View style={styles.driverContent}>
                  <Text style={styles.driverFactor}>{factorLabel}</Text>
                  <Text style={styles.driverDesc}>{beginnerDesc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.2)" />
              </TouchableOpacity>
            );
          })
        ) : (
          <Text style={styles.emptyText}>Score drivers will appear after the next analysis cycle.</Text>
        )}
      </View>

      {/* SECTION 4: HOW IT COMPARES — Color-coded peers */}
      {peerStocks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            How {ticker} compares to similar companies
          </Text>
          <View style={styles.peerRow}>
            {peerStocks.slice(0, 3).map((peer) => {
              const peerColor = getScoreColor(peer.score);
              return (
                <TouchableOpacity
                  key={peer.ticker}
                  style={[styles.peerCard, { borderWidth: 1, borderColor: peerColor + '40' }]}
                  onPress={() => navigation.push('SignalDetail', { ticker: peer.ticker, companyName: peer.companyName })}
                  activeOpacity={0.7}
                >
                  <ScoreRing score={peer.score} size={48} />
                  <Text style={styles.peerTicker}>{peer.ticker}</Text>
                  <Text style={[styles.peerScore, { color: peerColor }]}>
                    {peer.score.toFixed(1)}
                  </Text>
                  <Text style={[styles.peerLabel, { color: peerColor }]}>
                    {peer.scoreLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* SECTION 5: EDUCATIONAL DISCLAIMER */}
      <Text style={styles.eduDisclaimer}>
        Scores reflect factor analysis of publicly available data. For educational purposes only. Not investment advice.
      </Text>
    </ScrollView>
  );

  // ═══════════════════════════════════════════════════════════
  // TAB 2: ANALYSIS
  // ═══════════════════════════════════════════════════════════

  const renderAnalysisTab = () => (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* SECTION 1: PRICE CHART */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Price Chart</Text>
        <StockChart
          ticker={ticker}
          chartData={chartData}
          loading={chartLoading}
          onRangeChange={handleChartRangeChange}
        />
      </View>

      {/* SECTION 2: FACTOR BREAKDOWN */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Factor Breakdown</Text>
        {FACTOR_GAUGE_AXES.map((axis) => {
          const val = factorPercentiles?.[axis.key as keyof FactorPercentiles] ?? 50;
          const barColor = val >= 90 ? '#00C9A7' : val >= 70 ? '#4A90D9' : val >= 40 ? '#8E8E93' : val >= 20 ? '#F5A623' : '#5856D6';
          const driverMatch = scoreDrivers.find(
            (d) => d.factor.toLowerCase().includes(axis.matchKey),
          );
          const isExpanded = expandedFactorBar === axis.key;
          const dimData = factorSummaries[axis.dimKey];
          const hasSummary = dimData && dimData.summary && dimData.summary !== 'pending';
          return (
            <TouchableOpacity
              key={axis.key}
              style={[styles.gaugeRow, isExpanded && styles.gaugeRowExpanded]}
              onPress={() => setSelectedDimension(axis.dimKey)}
              onLongPress={() => setExpandedFactorBar(isExpanded ? null : axis.key)}
              activeOpacity={0.7}
            >
              <View style={styles.gaugeHeader}>
                <View style={styles.gaugeLeft}>
                  <Ionicons name={axis.icon as any} size={14} color={barColor} />
                  <Text style={styles.gaugeName}>{axis.label}</Text>
                </View>
                <View style={styles.gaugeRight}>
                  <Text style={[styles.gaugeValue, { color: barColor }]}>{Math.round(val)}th</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color="rgba(255,255,255,0.3)"
                  />
                </View>
              </View>
              <View style={styles.gaugeTrack}>
                <View style={[styles.gaugeFill, { width: `${Math.min(100, Math.max(2, val))}%`, backgroundColor: barColor }]} />
              </View>
              {!isExpanded && hasSummary && (
                <Text style={styles.factorPreviewText} numberOfLines={1}>
                  {dimData.summary.length > 80 ? dimData.summary.substring(0, 80) + '...' : dimData.summary}
                </Text>
              )}
              {isExpanded && (
                <View style={styles.factorSummaryCard}>
                  {hasSummary ? (
                    <>
                      <Text style={styles.factorSummaryText}>{dimData.summary}</Text>
                      <View style={styles.factorMetaRow}>
                        <View style={[styles.factorScoreBadge, { backgroundColor: barColor + '20', borderColor: barColor + '40' }]}>
                          <Text style={[styles.factorScoreBadgeText, { color: barColor }]}>
                            {dimData.score}/10 {dimData.score_label}
                          </Text>
                        </View>
                        <View style={[styles.factorConfidenceBadge, {
                          backgroundColor: (CONFIDENCE_COLORS[dimData.confidence.toUpperCase()] || '#8E8E93') + '20',
                        }]}>
                          <Ionicons
                            name="shield-checkmark-outline"
                            size={11}
                            color={CONFIDENCE_COLORS[dimData.confidence.toUpperCase()] || '#8E8E93'}
                          />
                          <Text style={[styles.factorConfidenceText, {
                            color: CONFIDENCE_COLORS[dimData.confidence.toUpperCase()] || '#8E8E93',
                          }]}>
                            {dimData.confidence} confidence
                          </Text>
                        </View>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.factorSummaryFallback}>
                      {driverMatch?.description || axis.tooltip}
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
        {!factorPercentiles && (
          <Text style={styles.emptyText}>Factor percentiles calculating...</Text>
        )}
      </View>

      {/* SECTION 3: STRESS TEST */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stress Test</Text>
        {stressData && stressData.length > 0 ? (
          <View style={styles.stressGrid}>
            {stressData.slice(0, 3).map((scenario: any, idx: number) => {
              const key = scenario.scenarioKey || `s-${idx}`;
              const isSevere = scenario.scenarioKey === 'severely_adverse';
              const isAdverse = scenario.scenarioKey === 'adverse';
              const bgColor = isSevere ? 'rgba(88,86,214,0.12)' : isAdverse ? 'rgba(245,166,35,0.12)' : 'rgba(142,142,147,0.12)';
              const labelColor = isSevere ? '#5856D6' : isAdverse ? '#F5A623' : '#8E8E93';
              return (
                <View key={key} style={[styles.stressCard, { backgroundColor: bgColor, borderColor: labelColor + '30' }]}>
                  <Text style={[styles.stressScenarioName, { color: labelColor }]}>{scenario.scenario}</Text>
                  <Text style={[styles.stressImpact, { color: labelColor }]}>
                    {scenario.priceImpact > 0 ? '+' : ''}{scenario.priceImpact}%
                  </Text>
                  <Text style={styles.stressLabel}>
                    {scenario.resilienceScore != null ? `Resilience: ${safeNum(scenario.resilienceScore).toFixed(1)}/10` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyText}>
            Stress test analysis pending. Available after next scoring cycle.
          </Text>
        )}
      </View>

      {/* SECTION 4: TECHNICAL SNAPSHOT */}
      {technicals && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Technical Snapshot</Text>
          <View style={styles.techPillsRow}>
            {technicals.signals?.trend && (() => {
              const isBullish = technicals.signals.trend.includes('bullish');
              const isBearish = technicals.signals.trend.includes('bearish');
              const color = isBullish ? '#4A90D9' : isBearish ? '#F5A623' : '#8E8E93';
              return (
                <View style={[styles.techPill, { backgroundColor: color + '20' }]}>
                  <Text style={[styles.techPillText, { color }]}>Trend: {technicals.signals.trend}</Text>
                </View>
              );
            })()}
            {technicals.signals?.momentum && (() => {
              const isOB = technicals.signals.momentum === 'overbought';
              const isOS = technicals.signals.momentum === 'oversold';
              const color = isOB ? '#F5A623' : isOS ? '#4A90D9' : '#8E8E93';
              return (
                <View style={[styles.techPill, { backgroundColor: color + '20' }]}>
                  <Text style={[styles.techPillText, { color }]}>{technicals.signals.momentum}</Text>
                </View>
              );
            })()}
            {technicals.signals?.volatility && (
              <View style={[styles.techPill, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                <Text style={[styles.techPillText, { color: '#8E8E93' }]}>Vol: {technicals.signals.volatility}</Text>
              </View>
            )}
            {technicals.rsi != null && (
              <View style={[styles.techPill, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                <Text style={[styles.techPillText, { color: '#FFFFFF' }]}>RSI {safeNum(technicals.rsi).toFixed(0)}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.tapForMoreBtn}
            onPress={() => handleTabPress(2)}
            activeOpacity={0.7}
          >
            <Text style={styles.tapForMoreText}>Tap for full technical data →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SECTION 5: FINANCIAL STATISTICS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Financial Statistics</Text>
        <FinancialStatsGrid ticker={ticker} />
      </View>
    </ScrollView>
  );

  // ═══════════════════════════════════════════════════════════
  // TAB 3: DEEP DIVE
  // ═══════════════════════════════════════════════════════════

  const renderDeepDiveTab = () => (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* SECTION 1: ALL SUB-FACTORS */}
      {categories.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => setFactorDeepDiveExpanded(!factorDeepDiveExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.collapsibleHeaderLeft}>
              <Ionicons name="layers-outline" size={20} color="#60A5FA" />
              <Text style={styles.collapsibleTitle}>All Sub-Factors</Text>
            </View>
            <Ionicons
              name={factorDeepDiveExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="rgba(255,255,255,0.4)"
            />
          </TouchableOpacity>

          {factorDeepDiveExpanded && (
            <View>
              {/* Simple / Advanced toggle */}
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, factorDeepDiveMode === 'simple' && styles.toggleBtnActive]}
                  onPress={() => setFactorDeepDiveMode('simple')}
                >
                  <Text style={[styles.toggleText, factorDeepDiveMode === 'simple' && styles.toggleTextActive]}>
                    Simple
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, factorDeepDiveMode === 'advanced' && styles.toggleBtnActive]}
                  onPress={() => setFactorDeepDiveMode('advanced')}
                >
                  <Text style={[styles.toggleText, factorDeepDiveMode === 'advanced' && styles.toggleTextActive]}>
                    Advanced
                  </Text>
                </TouchableOpacity>
              </View>

              {categories.map((cat) => (
                <View key={`deep-${cat.id}`} style={styles.deepDiveGroup}>
                  <Text style={styles.deepDiveGroupTitle}>
                    {cat.id}. {cat.name}
                  </Text>
                  {cat.subFactors.map((sf) => {
                    const sfVal = safeNum(sf.score);
                    const barPct = Math.max(0, Math.min(100, ((sfVal + 2) / 4) * 100));
                    const sfColor = sfVal >= 1 ? '#00C9A7' : sfVal >= 0 ? '#4A90D9' : sfVal >= -1 ? '#8E8E93' : '#F5A623';
                    return (
                      <View key={sf.id} style={styles.deepDiveSubRow}>
                        <Text style={styles.deepDiveSubName} numberOfLines={1}>
                          {sf.id} {sf.name}
                        </Text>
                        <View style={styles.deepDiveSubTrack}>
                          <View style={[styles.deepDiveSubFill, { width: `${barPct}%`, backgroundColor: sfColor }]} />
                        </View>
                        <Text style={[styles.deepDiveSubValue, { color: sfColor }]}>
                          {factorDeepDiveMode === 'advanced'
                            ? sfVal.toFixed(2)
                            : `${Math.round(barPct)}%`}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* SECTION 2: FULL TECHNICAL DATA */}
      {technicals && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Full Technical Data</Text>
          <View style={styles.dataTable}>
            {[
              { label: 'RSI (14)', value: technicals.rsi != null ? safeNum(technicals.rsi).toFixed(1) : 'N/A' },
              { label: 'MACD', value: technicals.macd?.value != null ? safeNum(technicals.macd.value).toFixed(2) : 'N/A' },
              { label: 'MACD Signal', value: technicals.macd?.signal != null ? safeNum(technicals.macd.signal).toFixed(2) : 'N/A' },
              { label: 'SMA 20', value: technicals.sma20 != null ? `$${safeNum(technicals.sma20).toFixed(2)}` : 'N/A' },
              { label: 'SMA 50', value: technicals.sma50 != null ? `$${safeNum(technicals.sma50).toFixed(2)}` : 'N/A' },
              { label: 'SMA 200', value: technicals.sma200 != null ? `$${safeNum(technicals.sma200).toFixed(2)}` : 'N/A' },
              { label: 'ATR (14)', value: technicals.atr != null ? safeNum(technicals.atr).toFixed(2) : 'N/A' },
              { label: 'Bollinger Upper', value: technicals.bollingerBands?.upper != null ? `$${safeNum(technicals.bollingerBands.upper).toFixed(2)}` : 'N/A' },
              { label: 'Bollinger Lower', value: technicals.bollingerBands?.lower != null ? `$${safeNum(technicals.bollingerBands.lower).toFixed(2)}` : 'N/A' },
            ].map((row) => (
              <View key={row.label} style={styles.dataRow}>
                <Text style={styles.dataLabel}>{row.label}</Text>
                <Text style={styles.dataValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* SECTION 3: ALTERNATIVE DATA INSIGHTS */}
      {altData && (altData.available ?? []).length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.altDataCard}
            onPress={() => navigation.push('AlternativeData', { ticker })}
            activeOpacity={0.7}
          >
            <View style={styles.altDataLeft}>
              <View style={styles.altDataIcons}>
                {(altData.available ?? []).includes('patents') && (
                  <Ionicons name="bulb-outline" size={16} color="#F59E0B" />
                )}
                {(altData.available ?? []).includes('contracts') && (
                  <Ionicons name="business-outline" size={16} color="#60A5FA" />
                )}
                {(altData.available ?? []).includes('fda') && (
                  <Ionicons name="medical-outline" size={16} color="#8B5CF6" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.altDataTitle}>Alternative Data Insights</Text>
                <Text style={styles.altDataInsight} numberOfLines={1}>
                  {altData.patents && altData.patents.score > 0
                    ? `Patent filings ${altData.patents.velocity >= 0 ? 'up' : 'down'} ${Math.abs(safeNum(altData.patents.velocity)).toFixed(0)}% YoY`
                    : altData.fda && altData.fda.score > 0
                    ? `${altData.fda.pdufaWithin90Days} PDUFA date${altData.fda.pdufaWithin90Days !== 1 ? 's' : ''} within 90 days`
                    : altData.contracts && altData.contracts.score > 0
                    ? `Gov contracts ${altData.contracts.awardGrowth >= 0 ? 'up' : 'down'} ${Math.abs(safeNum(altData.contracts.awardGrowth)).toFixed(0)}% YoY`
                    : `${altData.available.length} alt data source${altData.available.length > 1 ? 's' : ''} available`}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </View>
      )}

      {/* SECTION 4: FACTOR DEEP DIVE ACCORDIONS */}
      {categories.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Factor Breakdown</Text>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              activeOpacity={0.8}
              onPress={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
            >
              <View style={styles.categoryCard}>
                <View style={styles.categoryHeader}>
                  <View style={styles.categoryLeft}>
                    <Ionicons name={cat.icon as any} size={20} color="#60A5FA" />
                    <Text style={styles.categoryName}>{cat.name}</Text>
                  </View>
                  <View style={styles.categoryRight}>
                    <Text style={[styles.categoryScore, {
                      color: cat.avgScore >= 0 ? '#00C9A7' : '#F5A623',
                    }]}>
                      {cat.avgScore >= 0 ? '+' : ''}{cat.avgScore.toFixed(1)}
                    </Text>
                    <Ionicons
                      name={expandedCategory === cat.id ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="rgba(255,255,255,0.4)"
                      style={{ marginLeft: 8 }}
                    />
                  </View>
                </View>
                {expandedCategory === cat.id && (
                  <View style={styles.subFactors}>
                    {cat.subFactors.map((sf) => {
                      const sfScore = safeNum(sf.score);
                      const sfColor = sfScore >= 0 ? '#00C9A7' : '#F5A623';
                      const sign = sfScore >= 0 ? '+' : '';
                      return (
                        <View key={sf.id} style={styles.subFactorRow}>
                          <View style={styles.subFactorHeader}>
                            <Text style={styles.subFactorId}>{sf.id}</Text>
                            <Text style={styles.subFactorName}>{sf.name}</Text>
                            <Text style={[styles.subFactorScore, { color: sfColor }]}>
                              {sign}{sfScore.toFixed(1)}
                            </Text>
                          </View>
                          <Text style={styles.subFactorReason}>{sf.reason}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* SECTION 5: FINANCIAL METRICS */}
      {financials && Object.keys(financials).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Metrics</Text>
          {Object.entries(FINANCIAL_CATEGORY_LABELS).map(([catKey, catMeta]) => {
            const catData = financials[catKey];
            if (!catData || typeof catData !== 'object') return null;
            // Filter out null values
            const metrics = Object.entries(catData).filter(
              ([, m]) => m && m.value != null,
            );
            if (metrics.length === 0) return null;
            const isExpanded = expandedFinancialCats.has(catKey);
            return (
              <TouchableOpacity
                key={catKey}
                activeOpacity={0.8}
                onPress={() => {
                  setExpandedFinancialCats((prev) => {
                    const next = new Set(prev);
                    if (next.has(catKey)) next.delete(catKey);
                    else next.add(catKey);
                    return next;
                  });
                }}
              >
                <View style={styles.finCategoryCard}>
                  <View style={styles.finCategoryHeader}>
                    <View style={styles.finCategoryLeft}>
                      <Ionicons name={catMeta.icon as any} size={18} color="#60A5FA" />
                      <Text style={styles.finCategoryName}>{catMeta.label}</Text>
                      <View style={styles.finCategoryBadge}>
                        <Text style={styles.finCategoryBadgeText}>{metrics.length}</Text>
                      </View>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="rgba(255,255,255,0.4)"
                    />
                  </View>
                  {isExpanded && (
                    <View style={styles.finMetricsList}>
                      {metrics.map(([metricKey, metric]) => (
                        <View key={metricKey} style={styles.finMetricRow}>
                          <Text style={styles.finMetricName} numberOfLines={1}>
                            {METRIC_LABELS[metricKey] || metricKey.replace(/_/g, ' ')}
                          </Text>
                          <View style={styles.finMetricRight}>
                            <Text style={styles.finMetricValue}>
                              {formatMetricValue(metricKey, metric.value)}
                            </Text>
                            {metric.source ? (
                              <View style={styles.finSourceBadge}>
                                <Text style={styles.finSourceText}>{metric.source}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* SECTION 6: COMMUNITY */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Community</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Discussion', { ticker })}
            activeOpacity={0.7}
          >
            <Text style={styles.viewAllLink}>View All</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.communityCard}
          onPress={() => navigation.navigate('Discussion', { ticker })}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubbles-outline" size={24} color="#60A5FA" />
          <View style={styles.communityContent}>
            <Text style={styles.communityTitle}>Join the Discussion</Text>
            <Text style={styles.communitySubtitle}>
              Share your analysis and see what others think about {ticker}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
        </TouchableOpacity>
      </View>

      {/* Bottom padding */}
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
        <View key="analysis" style={styles.page}>
          {renderAnalysisTab()}
        </View>
        <View key="deepdive" style={styles.page}>
          {renderDeepDiveTab()}
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
  peerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  peerCard: {
    alignItems: 'center',
    flex: 1,
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

  // ── Deep Dive: Alt Data Card ──
  altDataCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
  },
  altDataLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  altDataIcons: {
    flexDirection: 'row',
    gap: 4,
  },
  altDataTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  altDataInsight: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    marginTop: 2,
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
});
