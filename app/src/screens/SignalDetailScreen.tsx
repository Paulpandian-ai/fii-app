import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ScoreRing } from '../components/ScoreRing';
import { RadarScore } from '../components/RadarScore';
import { FactorRadarChart } from '../components/FactorRadarChart';
import type { FactorPercentiles } from '../components/FactorRadarChart';
import { SignalBadge } from '../components/SignalBadge';
import { FactorBar } from '../components/FactorBar';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { TradeButton } from '../components/TradeButton';
import { getSignalDetail, getPrice, getTechnicals, getFundamentals, getFactors, getAltData, getChartData, getEventsForTicker, getSignalHistory, getStressTestAll, getScreener } from '../services/api';
import { StockChart } from '../components/StockChart';
import type { ChartData } from '../components/StockChart';
import type { StockEvent, SignalHistoryPoint } from '../types';
import type {
  FullAnalysis,
  PriceData,
  TechnicalAnalysis,
  FundamentalAnalysis,
  FactorAnalysis,
  FactorContribution,
  DimensionScores,
  AlternativeData,
  FactorCategory,
  Confidence,
  ScoreLabel,
  Alternative,
} from '../types';
import { ScoreInfoTooltip } from '../components/ScoreInfoTooltip';
import { getScoreColor, getScoreLabel } from '../utils/scoreColors';

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
  {
    key: 'supply_chain_upstream',
    label: 'Supply Chain (Upstream)',
    matchKey: 'upstream',
    icon: 'cube-outline',
    tooltip: 'Measures the health and risk of this company\'s key suppliers. Disruptions can directly affect production and revenue.',
  },
  {
    key: 'supply_chain_downstream',
    label: 'Supply Chain (Downstream)',
    matchKey: 'downstream',
    icon: 'people-outline',
    tooltip: 'Tracks the financial health and spending patterns of key customers. Weak customers mean future revenue risk.',
  },
  {
    key: 'geopolitical',
    label: 'Geopolitical',
    matchKey: 'geopolitical',
    icon: 'globe-outline',
    tooltip: 'Assesses exposure to trade barriers, conflicts, and logistics disruptions that could affect operations or markets.',
  },
  {
    key: 'monetary',
    label: 'Monetary Policy',
    matchKey: 'monetary',
    icon: 'cash-outline',
    tooltip: 'Evaluates sensitivity to interest rates, inflation, and central bank decisions that impact cost of capital and demand.',
  },
  {
    key: 'correlations',
    label: 'Correlations',
    matchKey: 'correlation',
    icon: 'git-compare-outline',
    tooltip: 'Measures how this stock moves relative to sector peers, commodities, and broader risk sentiment.',
  },
  {
    key: 'performance',
    label: 'Risk & Performance',
    matchKey: 'performance',
    icon: 'trending-up-outline',
    tooltip: 'Combines earnings surprises, guidance revisions, and volatility metrics to assess near-term risk/reward.',
  },
];

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  HIGH: '#4A90D9',
  MEDIUM: '#8E8E93',
  LOW: '#F5A623',
};

/** Safe number: coerce anything to a finite number or 0. */
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

interface SignalDetailScreenProps {
  route: { params: { ticker: string } };
  navigation: any;
}

export const SignalDetailScreen: React.FC<SignalDetailScreenProps> = ({ route, navigation }) => {
  const { ticker } = route.params;
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [technicals, setTechnicals] = useState<TechnicalAnalysis | null>(null);
  const [fundamentals, setFundamentals] = useState<FundamentalAnalysis | null>(null);
  const [factors, setFactors] = useState<FactorAnalysis | null>(null);
  const [altData, setAltData] = useState<AlternativeData | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [chartRange, setChartRange] = useState('6M');
  const [chartLoading, setChartLoading] = useState(false);
  const [showAllFactors, setShowAllFactors] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<StockEvent[]>([]);
  const [signalHistory, setSignalHistory] = useState<SignalHistoryPoint[]>([]);
  const [stressData, setStressData] = useState<any[] | null>(null);
  const [stressExpanded, setStressExpanded] = useState(false);
  const [factorPercentiles, setFactorPercentiles] = useState<FactorPercentiles | null>(null);
  const [scoreDrivers, setScoreDrivers] = useState<Array<{ factor: string; direction: string; description: string }>>([]);
  const [percentileRank, setPercentileRank] = useState<number | null>(null);
  const [sectorPercentile, setSectorPercentile] = useState<number | null>(null);
  const [peerStocks, setPeerStocks] = useState<Array<{ ticker: string; companyName: string; score: number; scoreLabel: string; factorPercentiles: FactorPercentiles }>>([]);
  const [factorDeepDiveExpanded, setFactorDeepDiveExpanded] = useState(false);
  const [factorDeepDiveMode, setFactorDeepDiveMode] = useState<'simple' | 'advanced'>('simple');
  const [expandedFactorBar, setExpandedFactorBar] = useState<string | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [ticker]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [signalData, price, techData, fundData, factorData, altResult, chartResult] = await Promise.all([
        getSignalDetail(ticker).catch(() => null),
        getPrice(ticker).catch(() => null),
        getTechnicals(ticker).catch(() => null),
        getFundamentals(ticker).catch(() => null),
        getFactors(ticker).catch(() => null),
        getAltData(ticker).catch(() => null),
        getChartData(ticker, 'D', '6M').catch(() => null),
      ]);
      if (signalData) setAnalysis(signalData);
      if (price) setPriceData(price);
      if (techData && techData.indicatorCount > 0) setTechnicals(techData);
      if (fundData && fundData.grade && fundData.grade !== 'N/A') setFundamentals(fundData);
      if (factorData && factorData.dimensionScores) setFactors(factorData);
      if (altResult && altResult.available && altResult.available.length > 0) setAltData(altResult);
      if (chartResult && chartResult.candles && chartResult.candles.length > 0) setChartData(chartResult);

      // Extract factor_percentiles from signal data
      const sigRaw = signalData as any;
      const fp = sigRaw?.factor_percentiles ?? factorData?.factor_percentiles;
      if (fp && typeof fp === 'object') {
        setFactorPercentiles({
          supply_chain_upstream: Number(fp.supply_chain_upstream ?? 50),
          supply_chain_downstream: Number(fp.supply_chain_downstream ?? 50),
          geopolitical: Number(fp.geopolitical ?? 50),
          monetary: Number(fp.monetary ?? 50),
          correlations: Number(fp.correlations ?? 50),
          performance: Number(fp.performance ?? 50),
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

      // Load events, signal history, and stress test (non-blocking)
      getEventsForTicker(ticker, { limit: '5' })
        .then((d) => setRecentEvents(d.events || []))
        .catch(() => {});
      getSignalHistory(ticker, 30)
        .then((d) => setSignalHistory(d.history || []))
        .catch(() => {});
      getStressTestAll(ticker)
        .then((d) => setStressData(d.scenarios || []))
        .catch(() => {});

      // Load sector peers for comparison
      const sectorName = price?.sector;
      if (sectorName) {
        getScreener({ sector: sectorName, limit: '5', sort: 'score_desc' })
          .then((d) => {
            const results = (d.results || [])
              .filter((r: any) => r.ticker !== ticker)
              .slice(0, 3)
              .map((r: any) => ({
                ticker: r.ticker,
                companyName: r.companyName || r.company_name || '',
                score: safeNum(r.aiScore ?? r.score ?? r.compositeScore ?? 5),
                scoreLabel: r.scoreLabel || getScoreLabel(safeNum(r.aiScore ?? r.score ?? 5)),
                factorPercentiles: r.factor_percentiles ?? {
                  supply_chain_upstream: 50, supply_chain_downstream: 50,
                  geopolitical: 50, monetary: 50, correlations: 50, performance: 50,
                },
              }));
            if (results.length > 0) setPeerStocks(results);
          })
          .catch(() => {});
      }
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={styles.content}>
          <View style={{ alignItems: 'center' }}>
            <Skeleton width={100} height={100} borderRadius={50} />
            <View style={{ height: 16 }} />
            <Skeleton width={100} height={30} borderRadius={8} />
            <View style={{ height: 8 }} />
            <Skeleton width={180} height={14} borderRadius={4} />
          </View>
          <View style={{ height: 32 }} />
          <Skeleton width={'100%'} height={80} borderRadius={12} />
          <View style={{ height: 20 }} />
          <Skeleton width={'100%'} height={60} borderRadius={12} />
          <View style={{ height: 12 }} />
          <Skeleton width={'100%'} height={60} borderRadius={12} />
          <View style={{ height: 12 }} />
          <Skeleton width={'100%'} height={60} borderRadius={12} />
        </View>
      </LinearGradient>
    );
  }

  if (!analysis) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
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

  const categories = buildCategories();
  const priceChange = safeNum(priceData?.change);
  const priceChangePct = safeNum(priceData?.changePercent);
  const priceValue = safeNum(priceData?.price);
  const hasPriceToShow = priceData != null && typeof priceData.price === 'number' && Number.isFinite(priceData.price);
  const isPositive = priceChange >= 0;
  const confidence = analysis.confidence || 'MEDIUM';
  const showAlternatives =
    analysis.alternatives?.length > 0 &&
    safeNum(analysis.compositeScore) <= 4;

  return (
    <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
      <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Close score detail">
        <Ionicons name="close" size={28} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Section 1: HERO with Full Radar Chart */}
        <View style={styles.header}>
          <FactorRadarChart
            factorPercentiles={factorPercentiles ?? {
              supply_chain_upstream: 50,
              supply_chain_downstream: 50,
              geopolitical: 50,
              monetary: 50,
              correlations: 50,
              performance: 50,
            }}
            compositeScore={safeNum(analysis.compositeScore)}
            scoreLabel={(analysis.scoreLabel as string) || getScoreLabel(safeNum(analysis.compositeScore))}
            size="full"
            showBenchmark
            scoreDrivers={scoreDrivers}
          />
          <Text style={styles.ticker}>{analysis.ticker}</Text>
          <Text style={styles.companyName}>{analysis.companyName}</Text>
          {hasPriceToShow && (
            <View style={styles.priceRow}>
              <Text style={styles.price}>${priceValue.toFixed(2)}</Text>
              <Text style={[styles.priceChange, { color: isPositive ? '#00C9A7' : '#F5A623' }]}>
                {isPositive ? '+' : ''}${priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePct.toFixed(1)}%)
              </Text>
            </View>
          )}
          {/* Score label + percentile + confidence */}
          <View style={styles.badgeRow}>
            <SignalBadge scoreLabel={analysis.scoreLabel as ScoreLabel} score={safeNum(analysis.compositeScore)} />
            <ScoreInfoTooltip />
            {percentileRank != null && (
              <Text style={styles.percentileRankText}>Top {Math.round(100 - percentileRank)}th</Text>
            )}
            <View style={[styles.confidencePill, { backgroundColor: CONFIDENCE_COLORS[confidence] + '30' }]}>
              <View style={[styles.confidenceDot, { backgroundColor: CONFIDENCE_COLORS[confidence] }]} />
              <Text style={[styles.confidenceText, { color: CONFIDENCE_COLORS[confidence] }]}>
                {confidence}
              </Text>
            </View>
          </View>

          {/* Trade Button */}
          <TradeButton ticker={analysis.ticker} />
        </View>

        {/* Section 2: AI Analysis */}
        <View style={styles.section}>
          <View style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <Ionicons name="sparkles" size={16} color="#60A5FA" />
              <Text style={styles.aiHeaderText}>AI Analysis</Text>
            </View>
            <Text style={styles.reasoningText}>
              {analysis.reasoning || analysis.insight}
            </Text>
            <Text style={styles.aiTimestamp}>
              Based on {(analysis as any).dataSources?.length || 4} data sources
            </Text>
          </View>
        </View>

        {/* Section 2: Factor Breakdown (6 horizontal gauge bars) */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Factor Breakdown</Text>
          </View>
          {FACTOR_GAUGE_AXES.map((axis) => {
            const val = factorPercentiles?.[axis.key as keyof FactorPercentiles] ?? 50;
            const barColor = val >= 90 ? '#00C9A7' : val >= 70 ? '#4A90D9' : val >= 40 ? '#8E8E93' : val >= 20 ? '#F5A623' : '#5856D6';
            const driverMatch = scoreDrivers.find(
              (d) => d.factor.toLowerCase().includes(axis.matchKey),
            );
            const isExpanded = expandedFactorBar === axis.key;
            return (
              <TouchableOpacity
                key={axis.key}
                style={styles.gaugeRow}
                onPress={() => setExpandedFactorBar(isExpanded ? null : axis.key)}
                activeOpacity={0.7}
              >
                <View style={styles.gaugeHeader}>
                  <View style={styles.gaugeLeft}>
                    <Ionicons name={axis.icon as any} size={14} color={barColor} />
                    <Text style={styles.gaugeName}>{axis.label}</Text>
                    <TouchableOpacity
                      onPress={() => setTooltipVisible(tooltipVisible === axis.key ? null : axis.key)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.25)" />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.gaugeValue, { color: barColor }]}>{Math.round(val)}th</Text>
                </View>
                {tooltipVisible === axis.key && (
                  <View style={styles.eduTooltip}>
                    <Text style={styles.eduTooltipText}>{axis.tooltip}</Text>
                  </View>
                )}
                <View style={styles.gaugeTrack}>
                  <View style={[styles.gaugeFill, { width: `${Math.min(100, Math.max(2, val))}%`, backgroundColor: barColor }]} />
                </View>
                {isExpanded && driverMatch && (
                  <Text style={styles.gaugeDriverText}>{driverMatch.description}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Section 3: Score Drivers (top 3) */}
        {scoreDrivers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Score Drivers</Text>
            {scoreDrivers.slice(0, 3).map((driver, idx) => {
              const isUp = driver.direction === 'positive' || driver.direction === 'up';
              const arrowColor = isUp ? '#00C9A7' : '#F5A623';
              return (
                <View key={`driver-${idx}`} style={styles.driverCard}>
                  <Text style={[styles.driverArrow, { color: arrowColor }]}>
                    {isUp ? '\u2191' : '\u2193'}
                  </Text>
                  <View style={styles.driverContent}>
                    <Text style={styles.driverFactor}>{driver.factor}</Text>
                    <Text style={styles.driverDesc}>{driver.description}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Section 2.5: What Drove This Score (Alpha Signals) */}
        {factors && (factors.topPositive?.length > 0 || factors.topNegative?.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What Drove This Score</Text>
            {/* Top Positive */}
            {(factors.topPositive || []).map((f: FactorContribution, i: number) => (
              <View key={`pos-${f.factorId}-${i}`} style={styles.alphaCard}>
                <View style={[styles.alphaAccent, { backgroundColor: '#00C9A7' }]} />
                <View style={styles.alphaContent}>
                  <View style={styles.alphaRow}>
                    <Text style={styles.alphaName}>{f.factorName}</Text>
                    <Text style={[styles.alphaScore, { color: '#00C9A7' }]}>
                      +{safeNum(f.normalizedScore).toFixed(1)}
                    </Text>
                  </View>
                  <Text style={styles.alphaExplain}>{f.explanation}</Text>
                  <Text style={styles.alphaSource}>{f.dataSource}</Text>
                </View>
              </View>
            ))}
            {/* Top Negative */}
            {(factors.topNegative || []).map((f: FactorContribution, i: number) => (
              <View key={`neg-${f.factorId}-${i}`} style={styles.alphaCard}>
                <View style={[styles.alphaAccent, { backgroundColor: '#F5A623' }]} />
                <View style={styles.alphaContent}>
                  <View style={styles.alphaRow}>
                    <Text style={styles.alphaName}>{f.factorName}</Text>
                    <Text style={[styles.alphaScore, { color: '#F5A623' }]}>
                      {safeNum(f.normalizedScore).toFixed(1)}
                    </Text>
                  </View>
                  <Text style={styles.alphaExplain}>{f.explanation}</Text>
                  <Text style={styles.alphaSource}>{f.dataSource}</Text>
                </View>
              </View>
            ))}

            {/* Expandable all factors */}
            <TouchableOpacity
              style={styles.seeAllBtn}
              onPress={() => setShowAllFactors(!showAllFactors)}
            >
              <Text style={styles.seeAllText}>
                {showAllFactors ? 'Hide All Factors' : `See All ${factors.factorCount || 25} Factors`}
              </Text>
              <Ionicons
                name={showAllFactors ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#60A5FA"
              />
            </TouchableOpacity>

            {showAllFactors && (
              <View style={styles.allFactorsList}>
                {(factors.factorContributions || []).map((f: FactorContribution, i: number) => {
                  const barWidth = Math.abs(safeNum(f.normalizedScore)) / 2 * 100;
                  const isPos = f.normalizedScore >= 0;
                  return (
                    <View key={`all-${f.factorId}-${i}`} style={styles.factorBarRow}>
                      <View style={styles.factorBarNameCol}>
                        <Text style={styles.factorBarName} numberOfLines={1}>
                          {f.factorName}
                        </Text>
                        {f.dataSource && (
                          <Text style={styles.factorBarSource} numberOfLines={1}>
                            {f.dataSource}
                          </Text>
                        )}
                      </View>
                      <View style={styles.factorBarTrack}>
                        <View style={[
                          styles.factorBarFill,
                          {
                            width: `${Math.min(100, barWidth)}%`,
                            backgroundColor: isPos ? '#00C9A7' : '#F5A623',
                            alignSelf: isPos ? 'flex-start' : 'flex-end',
                          },
                        ]} />
                      </View>
                      <Text style={[styles.factorBarValue, {
                        color: isPos ? '#00C9A7' : f.normalizedScore < 0 ? '#F5A623' : 'rgba(255,255,255,0.5)',
                      }]}>
                        {isPos ? '+' : ''}{safeNum(f.normalizedScore).toFixed(1)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Section 2.8: Interactive Chart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Chart</Text>
          <StockChart
            ticker={ticker}
            chartData={chartData}
            loading={chartLoading}
            onRangeChange={handleChartRangeChange}
          />
        </View>

        {/* Section 3: Factor Breakdown */}
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
                      <FactorBar factor={{ name: cat.name, score: cat.avgScore }} compact />
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

        {/* Section 4: Technical Analysis */}
        {technicals && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Technical Analysis</Text>
            <View style={styles.techScoreRow}>
              <View style={styles.techScoreBadge}>
                <Text style={styles.techScoreValue}>{safeNum(technicals.technicalScore).toFixed(1)}</Text>
                <Text style={styles.techScoreLabel}>Tech Score</Text>
              </View>
              <View style={styles.techSignals}>
                {technicals.signals?.trend && (
                  <View style={[styles.techPill, { backgroundColor: technicals.signals.trend.includes('bullish') ? 'rgba(74,144,217,0.15)' : technicals.signals.trend.includes('bearish') ? 'rgba(245,166,35,0.15)' : 'rgba(255,255,255,0.08)' }]}>
                    <Ionicons name="trending-up-outline" size={12} color={technicals.signals.trend.includes('bullish') ? '#4A90D9' : technicals.signals.trend.includes('bearish') ? '#F5A623' : '#94A3B8'} />
                    <Text style={[styles.techPillText, { color: technicals.signals.trend.includes('bullish') ? '#4A90D9' : technicals.signals.trend.includes('bearish') ? '#F5A623' : '#94A3B8' }]}>
                      {technicals.signals.trend}
                    </Text>
                  </View>
                )}
                {technicals.signals?.momentum && (
                  <View style={[styles.techPill, { backgroundColor: technicals.signals.momentum === 'oversold' ? 'rgba(74,144,217,0.15)' : technicals.signals.momentum === 'overbought' ? 'rgba(245,166,35,0.15)' : 'rgba(255,255,255,0.08)' }]}>
                    <Ionicons name="speedometer-outline" size={12} color={technicals.signals.momentum === 'oversold' ? '#4A90D9' : technicals.signals.momentum === 'overbought' ? '#F5A623' : '#94A3B8'} />
                    <Text style={[styles.techPillText, { color: technicals.signals.momentum === 'oversold' ? '#4A90D9' : technicals.signals.momentum === 'overbought' ? '#F5A623' : '#94A3B8' }]}>
                      {technicals.signals.momentum}
                    </Text>
                  </View>
                )}
                {technicals.signals?.volatility && (
                  <View style={[styles.techPill, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                    <Ionicons name="pulse-outline" size={12} color="#94A3B8" />
                    <Text style={[styles.techPillText, { color: '#94A3B8' }]}>
                      Vol: {technicals.signals.volatility}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.dataTable}>
              {[
                { label: 'RSI (14)', value: technicals.rsi != null ? safeNum(technicals.rsi).toFixed(1) : 'N/A' },
                { label: 'MACD', value: technicals.macd?.value != null ? safeNum(technicals.macd.value).toFixed(2) : 'N/A' },
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

        {/* Section 5: Financial Health */}
        {fundamentals && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.healthCard}
              onPress={() => navigation.push('FinancialHealth', { ticker })}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`View financial health for ${ticker}`}
            >
              <View style={styles.healthCardLeft}>
                <View style={[styles.healthGradeBadge, {
                  borderColor: fundamentals.grade.startsWith('A') || fundamentals.grade.startsWith('B')
                    ? '#00C9A7' : fundamentals.grade.startsWith('C') ? '#8E8E93' : '#F5A623',
                }]}>
                  <Text style={[styles.healthGradeText, {
                    color: fundamentals.grade.startsWith('A') || fundamentals.grade.startsWith('B')
                      ? '#00C9A7' : fundamentals.grade.startsWith('C') ? '#8E8E93' : '#F5A623',
                  }]}>
                    {fundamentals.grade}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.healthTitle}>Financial Health</Text>
                  {fundamentals.dcf && fundamentals.dcf.fairValue > 0 && (
                    <Text style={[styles.healthDcf, {
                      color: (fundamentals.dcf.upside ?? 0) >= 0 ? '#00C9A7' : '#F5A623',
                    }]}>
                      Fair Value: ${safeNum(fundamentals.dcf.fairValue).toFixed(0)}
                      {fundamentals.dcf.upside != null
                        ? ` (${(fundamentals.dcf.upside ?? 0) >= 0 ? '+' : ''}${safeNum(fundamentals.dcf.upside).toFixed(1)}%)`
                        : ''}
                    </Text>
                  )}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          </View>
        )}

        {/* Section 5b: Alternative Data Insights */}
        {altData && (altData.available ?? []).length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.altDataCard}
              onPress={() => navigation.push('AlternativeData', { ticker })}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`View alternative data insights for ${ticker}`}
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

        {/* Section 5c: Macro Stress Test */}
        {stressData && stressData.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.stressHeader}
              onPress={() => setStressExpanded(!stressExpanded)}
              activeOpacity={0.7}
            >
              <View style={styles.stressHeaderLeft}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#F59E0B" />
                <Text style={styles.stressTitle}>Macro Stress Test</Text>
              </View>
              <Ionicons
                name={stressExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="rgba(255,255,255,0.4)"
              />
            </TouchableOpacity>
            {!stressExpanded && stressData.length > 0 && (() => {
              const severe = stressData.find((s: any) => s.scenarioKey === 'severely_adverse') || stressData[stressData.length - 1];
              return (
                <View style={styles.stressPreview}>
                  <Text style={styles.stressPreviewLabel}>Severely Adverse</Text>
                  <View style={styles.stressPreviewRow}>
                    <Text style={[styles.stressPreviewImpact, { color: '#F5A623' }]}>
                      {severe.priceImpact > 0 ? '+' : ''}{severe.priceImpact}%
                    </Text>
                    <View style={[styles.stressResilienceBadge, {
                      backgroundColor: severe.resilienceScore >= 7
                        ? 'rgba(0,201,167,0.15)'
                        : severe.resilienceScore >= 5
                        ? 'rgba(245,158,11,0.15)'
                        : 'rgba(239,68,80,0.15)',
                    }]}>
                      <Text style={[styles.stressResilienceText, {
                        color: severe.resilienceScore >= 7
                          ? '#00C9A7'
                          : severe.resilienceScore >= 5
                          ? '#8E8E93'
                          : '#F5A623',
                      }]}>
                        {severe.resilienceScore.toFixed(1)} / 10
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.stressPreviewRec}>{severe.recommendation}</Text>
                </View>
              );
            })()}
            {stressExpanded && stressData.map((scenario: any, idx: number) => (
              <View key={scenario.scenarioKey || idx} style={styles.stressScenarioCard}>
                <View style={styles.stressScenarioHeader}>
                  <Text style={styles.stressScenarioName}>{scenario.scenario}</Text>
                  <View style={[styles.stressResilienceBadge, {
                    backgroundColor: scenario.resilienceScore >= 7
                      ? 'rgba(0,201,167,0.15)'
                      : scenario.resilienceScore >= 5
                      ? 'rgba(142,142,147,0.15)'
                      : 'rgba(245,166,35,0.15)',
                  }]}>
                    <Text style={[styles.stressResilienceText, {
                      color: scenario.resilienceScore >= 7
                        ? '#00C9A7'
                        : scenario.resilienceScore >= 5
                        ? '#8E8E93'
                        : '#F5A623',
                    }]}>
                      {scenario.resilienceScore.toFixed(1)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.stressScenarioDesc}>{scenario.scenarioDescription}</Text>
                <View style={styles.stressPriceRow}>
                  <View style={styles.stressPriceCol}>
                    <Text style={styles.stressPriceLabel}>Current</Text>
                    <Text style={styles.stressPriceValue}>${scenario.currentPrice}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.3)" />
                  <View style={styles.stressPriceCol}>
                    <Text style={styles.stressPriceLabel}>Stressed</Text>
                    <Text style={[styles.stressPriceValue, { color: '#F5A623' }]}>
                      ${scenario.stressedPrice}
                    </Text>
                  </View>
                  <View style={[styles.stressImpactPill, {
                    backgroundColor: scenario.priceImpact > -10
                      ? 'rgba(0,201,167,0.15)'
                      : scenario.priceImpact > -30
                      ? 'rgba(142,142,147,0.15)'
                      : 'rgba(245,166,35,0.15)',
                  }]}>
                    <Text style={[styles.stressImpactText, {
                      color: scenario.priceImpact > -10
                        ? '#00C9A7'
                        : scenario.priceImpact > -30
                        ? '#8E8E93'
                        : '#F5A623',
                    }]}>
                      {scenario.priceImpact > 0 ? '+' : ''}{scenario.priceImpact}%
                    </Text>
                  </View>
                </View>
                {scenario.breakdown && (
                  <View style={styles.stressBreakdown}>
                    <View style={styles.stressBreakdownRow}>
                      <Text style={styles.stressBreakdownLabel}>Equity Impact</Text>
                      <Text style={styles.stressBreakdownValue}>{scenario.breakdown.equityImpact}%</Text>
                    </View>
                    <View style={styles.stressBreakdownRow}>
                      <Text style={styles.stressBreakdownLabel}>Sector Mult.</Text>
                      <Text style={styles.stressBreakdownValue}>{scenario.breakdown.sectorMultiplier}x</Text>
                    </View>
                    <View style={styles.stressBreakdownRow}>
                      <Text style={styles.stressBreakdownLabel}>Health Mult.</Text>
                      <Text style={styles.stressBreakdownValue}>{scenario.breakdown.healthMultiplier}x</Text>
                    </View>
                    <View style={styles.stressBreakdownRow}>
                      <Text style={styles.stressBreakdownLabel}>Rate Impact</Text>
                      <Text style={styles.stressBreakdownValue}>{scenario.breakdown.rateImpact}%</Text>
                    </View>
                    <View style={styles.stressBreakdownRow}>
                      <Text style={styles.stressBreakdownLabel}>Spread Impact</Text>
                      <Text style={styles.stressBreakdownValue}>{scenario.breakdown.spreadImpact}%</Text>
                    </View>
                  </View>
                )}
                <Text style={styles.stressRec}>{scenario.recommendation}</Text>
              </View>
            ))}
            {stressExpanded && (
              <Text style={styles.stressDisclaimer}>
                Based on Fed 2026 DFAST scenarios. For educational purposes only.
              </Text>
            )}
          </View>
        )}

        {/* Section 6: Alternatives */}
        {showAlternatives && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alternatives</Text>
            {analysis.alternatives.map((alt: Alternative, i: number) => (
              <TouchableOpacity
                key={`${alt.ticker}-${i}`}
                style={styles.altCard}
                onPress={() => navigation.push('SignalDetail', { ticker: alt.ticker })}
              >
                <View style={styles.altHeader}>
                  <Text style={styles.altTicker}>{alt.ticker}</Text>
                  <SignalBadge scoreLabel={alt.scoreLabel as ScoreLabel} score={alt.score} />
                </View>
                <Text style={styles.altName}>{alt.companyName}</Text>
                <Text style={styles.altReason}>{alt.reason}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Section 6: Key Data */}
        {priceData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Data</Text>
            <View style={styles.dataTable}>
              {[
                { label: 'Market Cap', value: formatLargeNumber(priceData.marketCap) },
                { label: 'Forward PE', value: priceData.forwardPE ? safeNum(priceData.forwardPE).toFixed(1) : 'N/A' },
                { label: 'Trailing PE', value: priceData.trailingPE ? safeNum(priceData.trailingPE).toFixed(1) : 'N/A' },
                { label: 'Beta', value: priceData.beta != null ? safeNum(priceData.beta).toFixed(2) : 'N/A' },
                { label: '52W Low', value: priceData.fiftyTwoWeekLow != null ? `$${safeNum(priceData.fiftyTwoWeekLow).toFixed(2)}` : 'N/A' },
                { label: '52W High', value: priceData.fiftyTwoWeekHigh != null ? `$${safeNum(priceData.fiftyTwoWeekHigh).toFixed(2)}` : 'N/A' },
                { label: 'Sector', value: priceData.sector || 'N/A' },
              ].map((row) => (
                <View key={row.label} style={styles.dataRow}>
                  <Text style={styles.dataLabel}>{row.label}</Text>
                  <Text style={styles.dataValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Signal History */}
        {signalHistory.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Score History (30 Days)</Text>
            <View style={styles.historyCard}>
              <View style={styles.historyDots}>
                {signalHistory.map((point, idx) => {
                  const scoreNorm = Math.max(0, Math.min(1, ((point.score ?? 0) - 1) / 9));
                  const color = getScoreColor(point.score ?? 0);
                  return (
                    <View key={`${point.date}-${idx}`} style={styles.historyDotCol}>
                      <View style={[styles.historyDot, { backgroundColor: color, bottom: scoreNorm * 40 }]} />
                      {idx % Math.ceil(signalHistory.length / 5) === 0 && (
                        <Text style={styles.historyDate}>{point.date.slice(5)}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
              <View style={styles.historyLegend}>
                <Text style={styles.historyLegendText}>Score range: 1-10</Text>
                <Text style={styles.historyLegendText}>
                  Latest: {(signalHistory[signalHistory.length - 1]?.score ?? 0).toFixed(1)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Recent Events */}
        {recentEvents.length > 0 && (
          <View style={styles.section}>
            <View style={styles.recentEventsHeader}>
              <Text style={styles.sectionTitle}>Recent Events</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('EventTimeline', { ticker })}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="View all events"
              >
                <Text style={styles.viewAllLink}>View All</Text>
              </TouchableOpacity>
            </View>
            {recentEvents.slice(0, 5).map((event, idx) => {
              const impactColor = event.impact === 'high' ? '#F5A623' : event.impact === 'medium' ? '#8E8E93' : '#6B7280';
              const dirIcon = event.direction === 'positive' ? 'trending-up' : event.direction === 'negative' ? 'trending-down' : 'remove';
              const dirColor = event.direction === 'positive' ? '#4A90D9' : event.direction === 'negative' ? '#F5A623' : '#9CA3AF';
              return (
                <TouchableOpacity
                  key={`${event.timestamp}-${idx}`}
                  style={styles.recentEventRow}
                  onPress={() => navigation.navigate('EventTimeline', { ticker })}
                  activeOpacity={0.7}
                >
                  <View style={[styles.recentEventDot, { backgroundColor: impactColor }]} />
                  <View style={styles.recentEventContent}>
                    <Text style={styles.recentEventSummary} numberOfLines={2}>
                      {event.summary || event.headline}
                    </Text>
                    <View style={styles.recentEventMeta}>
                      <Text style={styles.recentEventType}>{event.type}</Text>
                      <Ionicons name={dirIcon as any} size={12} color={dirColor} />
                      <Text style={styles.recentEventTime}>
                        {_formatTimeAgo(event.timestamp)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Section: Peer Comparison */}
        {priceData?.sector && (
          <View style={styles.peerSection}>
            <Text style={styles.sectionTitle}>Sector Peers</Text>
            <View style={styles.peerRow}>
              {peerStocks.length > 0 ? (
                peerStocks.slice(0, 3).map((peer) => (
                  <TouchableOpacity
                    key={peer.ticker}
                    style={styles.peerCard}
                    onPress={() => navigation.push('SignalDetail', { ticker: peer.ticker })}
                    activeOpacity={0.7}
                  >
                    <FactorRadarChart
                      factorPercentiles={peer.factorPercentiles}
                      compositeScore={peer.score}
                      scoreLabel={peer.scoreLabel}
                      size="thumbnail"
                    />
                    <Text style={styles.peerTicker}>{peer.ticker}</Text>
                    <Text style={[styles.peerScore, { color: getScoreColor(peer.score) }]}>
                      {peer.score.toFixed(1)}
                    </Text>
                    <Text style={styles.peerCompanyName} numberOfLines={1}>{peer.companyName}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                // Placeholder peers with neutral radars
                [1, 2, 3].map((i) => (
                  <View key={`placeholder-${i}`} style={styles.peerCard}>
                    <FactorRadarChart
                      factorPercentiles={{
                        supply_chain_upstream: 50, supply_chain_downstream: 50,
                        geopolitical: 50, monetary: 50, correlations: 50, performance: 50,
                      }}
                      compositeScore={5}
                      scoreLabel="Neutral"
                      size="thumbnail"
                    />
                    <Skeleton width={40} height={14} borderRadius={4} />
                    <View style={{ height: 4 }} />
                    <Skeleton width={60} height={10} borderRadius={4} />
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {/* Section: Factor Deep Dive (collapsed by default) */}
        {categories.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.deepDiveHeader}
              onPress={() => setFactorDeepDiveExpanded(!factorDeepDiveExpanded)}
              activeOpacity={0.7}
            >
              <View style={styles.deepDiveHeaderLeft}>
                <Ionicons name="layers-outline" size={20} color="#60A5FA" />
                <Text style={styles.deepDiveTitle}>Factor Deep Dive</Text>
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
                <View style={styles.deepDiveToggle}>
                  <TouchableOpacity
                    style={[
                      styles.deepDiveToggleBtn,
                      factorDeepDiveMode === 'simple' && styles.deepDiveToggleBtnActive,
                    ]}
                    onPress={() => setFactorDeepDiveMode('simple')}
                  >
                    <Text style={[
                      styles.deepDiveToggleText,
                      factorDeepDiveMode === 'simple' && styles.deepDiveToggleTextActive,
                    ]}>Simple</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.deepDiveToggleBtn,
                      factorDeepDiveMode === 'advanced' && styles.deepDiveToggleBtnActive,
                    ]}
                    onPress={() => setFactorDeepDiveMode('advanced')}
                  >
                    <Text style={[
                      styles.deepDiveToggleText,
                      factorDeepDiveMode === 'advanced' && styles.deepDiveToggleTextActive,
                    ]}>Advanced</Text>
                  </TouchableOpacity>
                </View>

                {/* Sub-factor groups */}
                {categories.map((cat) => (
                  <View key={`deep-${cat.id}`} style={styles.deepDiveGroup}>
                    <Text style={styles.deepDiveGroupTitle}>
                      {cat.id}. {cat.name}
                    </Text>
                    {cat.subFactors.map((sf) => {
                      const sfVal = safeNum(sf.score);
                      // Map -2..+2 to 0..100 for bar
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
                          {factorDeepDiveMode === 'advanced' && (
                            <Text style={styles.deepDiveSubWeight}>
                              w: {(1 / (categories.length * 3)).toFixed(2)}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Discussion / Community */}
        <View style={styles.section}>
          <View style={styles.recentEventsHeader}>
            <Text style={styles.sectionTitle}>Community</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Discussion', { ticker })}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="View all discussions"
            >
              <Text style={styles.viewAllLink}>View All</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.discussionCard}
            onPress={() => navigation.navigate('Discussion', { ticker })}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Join the ${ticker} discussion`}
          >
            <Ionicons name="chatbubbles-outline" size={20} color="#60A5FA" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>
                Join the {ticker} Discussion
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>
                Share your thesis, see community sentiment
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
          </TouchableOpacity>
        </View>

        {/* Last updated */}
        {analysis?.analyzedAt && (
          <Text style={styles.lastUpdatedText}>
            Last updated: {_formatTimeAgo(analysis.analyzedAt)}
          </Text>
        )}

        {/* Disclaimer */}
        <DisclaimerBanner />
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Floating AI Chat Bubble */}
      <TouchableOpacity
        style={styles.chatFab}
        onPress={() => navigation.navigate('AIChat', { ticker })}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Open AI chat about ${ticker}`}
      >
        <Ionicons name="sparkles" size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 60 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginTop: 16 },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  backBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#60A5FA', borderRadius: 8 },
  backBtnText: { color: '#FFF', fontWeight: '700' },
  header: { alignItems: 'center', marginBottom: 32 },
  ticker: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', letterSpacing: 2, marginTop: 16 },
  companyName: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8, gap: 8 },
  price: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  priceChange: { fontSize: 14, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 },
  confidencePill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  confidenceText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  section: { marginBottom: 28 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  reasoningCard: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden' },
  reasoningAccent: { width: 4, backgroundColor: '#60A5FA' },
  reasoningText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 22, padding: 16, flex: 1 },
  categoryCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  categoryRight: { flexDirection: 'row', alignItems: 'center' },
  subFactors: { paddingHorizontal: 14, paddingBottom: 14 },
  subFactorRow: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 12, marginTop: 6 },
  subFactorHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  subFactorId: {
    color: '#60A5FA', fontSize: 11, fontWeight: '800', marginRight: 8,
    backgroundColor: 'rgba(96,165,250,0.15)', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, overflow: 'hidden',
  },
  subFactorName: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500', flex: 1 },
  subFactorScore: { fontSize: 13, fontWeight: '800' },
  subFactorReason: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 17 },
  altCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14, marginBottom: 8 },
  altHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  altTicker: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  altName: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },
  altReason: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 8, lineHeight: 18 },
  dataTable: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden' },
  dataRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dataLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  dataValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  techScoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 16 },
  techScoreBadge: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(96,165,250,0.15)',
    borderWidth: 2, borderColor: 'rgba(96,165,250,0.3)', justifyContent: 'center', alignItems: 'center',
  },
  techScoreValue: { color: '#60A5FA', fontSize: 22, fontWeight: '800' },
  techScoreLabel: { color: 'rgba(96,165,250,0.7)', fontSize: 10, fontWeight: '600', marginTop: 2 },
  techSignals: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  techPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 4 },
  techPillText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  healthCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  healthCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  healthGradeBadge: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)',
  },
  healthGradeText: { fontSize: 18, fontWeight: '900' },
  healthTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  healthDcf: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  disclaimer: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  disclaimerText: { color: 'rgba(255,255,255,0.3)', fontSize: 11, flex: 1 },
  // AI Card
  aiCard: {
    backgroundColor: 'rgba(96,165,250,0.06)', borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: 'rgba(96,165,250,0.15)',
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiHeaderText: { color: '#60A5FA', fontSize: 13, fontWeight: '700' },
  aiTimestamp: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 8 },
  // Alpha Signals
  alphaCard: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10, overflow: 'hidden', marginBottom: 8,
  },
  alphaAccent: { width: 4 },
  alphaContent: { flex: 1, padding: 12 },
  alphaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alphaName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', flex: 1 },
  alphaScore: { fontSize: 15, fontWeight: '800', marginLeft: 8 },
  alphaExplain: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4, lineHeight: 17 },
  alphaSource: { color: 'rgba(96,165,250,0.6)', fontSize: 10, fontWeight: '600', marginTop: 4 },
  seeAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10,
  },
  seeAllText: { color: '#60A5FA', fontSize: 13, fontWeight: '700' },
  // All factors bar list
  allFactorsList: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12, marginTop: 4,
  },
  factorBarRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8,
  },
  factorBarNameCol: { width: 100 },
  factorBarName: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  factorBarSource: { color: 'rgba(96,165,250,0.45)', fontSize: 9, marginTop: 1 },
  factorBarTrack: {
    flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  factorBarFill: { height: 6, borderRadius: 3 },
  factorBarValue: { fontSize: 11, fontWeight: '800', width: 36, textAlign: 'right' },
  // Alt Data Card
  altDataCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(139,92,246,0.06)', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
  },
  altDataLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  altDataIcons: { flexDirection: 'row', gap: 4 },
  altDataTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  altDataInsight: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },

  // Signal History
  historyCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16,
  },
  historyDots: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    height: 60, marginBottom: 8,
  },
  historyDotCol: { alignItems: 'center', flex: 1 },
  historyDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute' },
  historyDate: { color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 50 },
  historyLegend: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 4,
  },
  historyLegendText: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },

  // Recent Events
  recentEventsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  viewAllLink: { color: '#60A5FA', fontSize: 14, fontWeight: '600' },
  recentEventRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    padding: 12, marginBottom: 8,
  },
  recentEventDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  recentEventContent: { flex: 1 },
  recentEventSummary: { color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 18 },
  recentEventMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  recentEventType: {
    color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase',
  },
  recentEventTime: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },
  lastUpdatedText: {
    color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center',
    marginTop: 8, marginBottom: 12,
  },
  discussionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(96,165,250,0.06)', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: 'rgba(96,165,250,0.12)',
  },
  chatFab: {
    position: 'absolute', bottom: 24, right: 20, zIndex: 100,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#60A5FA',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#60A5FA', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },

  // Stress Test
  stressHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(245,158,11,0.06)', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)',
  },
  stressHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stressTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  stressPreview: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
    padding: 12, marginTop: 8,
  },
  stressPreviewLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  stressPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  stressPreviewImpact: { fontSize: 22, fontWeight: '800' },
  stressPreviewRec: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 6 },
  stressResilienceBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  stressResilienceText: { fontSize: 13, fontWeight: '800' },
  stressScenarioCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    padding: 14, marginTop: 8,
  },
  stressScenarioHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  stressScenarioName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', flex: 1 },
  stressScenarioDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  stressPriceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10,
  },
  stressPriceCol: { alignItems: 'center' },
  stressPriceLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  stressPriceValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginTop: 2 },
  stressImpactPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginLeft: 'auto' },
  stressImpactText: { fontSize: 14, fontWeight: '800' },
  stressBreakdown: { marginTop: 10 },
  stressBreakdownRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  stressBreakdownLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  stressBreakdownValue: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  stressRec: {
    color: '#F59E0B', fontSize: 12, fontWeight: '700', marginTop: 10,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  stressDisclaimer: {
    color: 'rgba(255,255,255,0.25)', fontSize: 10, textAlign: 'center',
    marginTop: 8, fontStyle: 'italic',
  },

  // Percentile rank
  percentileRankText: {
    color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600',
  },
  confidenceDot: {
    width: 6, height: 6, borderRadius: 3, marginRight: 4,
  },

  // Section title row with info icon
  sectionTitleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
  },

  // Factor gauge bars
  gaugeRow: {
    marginBottom: 10,
  },
  gaugeHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4,
  },
  gaugeLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  gaugeName: {
    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600',
  },
  gaugeValue: {
    fontSize: 13, fontWeight: '800',
  },
  gaugeTrack: {
    height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  gaugeFill: {
    height: 6, borderRadius: 3,
  },
  gaugeDriverText: {
    color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 4, lineHeight: 15,
  },

  // Educational tooltips
  eduTooltip: {
    backgroundColor: 'rgba(15,25,55,0.95)', borderRadius: 8,
    padding: 10, marginBottom: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  eduTooltipText: {
    color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 16,
  },

  // Score drivers section
  driverCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
    padding: 12, marginBottom: 8, gap: 10,
  },
  driverArrow: {
    fontSize: 20, fontWeight: '800', marginTop: -2,
  },
  driverContent: {
    flex: 1,
  },
  driverFactor: {
    color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginBottom: 2,
  },
  driverDesc: {
    color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 17,
  },

  // Peer comparison section
  peerSection: {
    marginBottom: 28,
  },
  peerRow: {
    flexDirection: 'row', justifyContent: 'space-around', gap: 12,
  },
  peerCard: {
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, padding: 12, flex: 1,
  },
  peerTicker: {
    color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 1, marginTop: 6,
  },
  peerScore: {
    fontSize: 13, fontWeight: '700', marginTop: 2,
  },
  peerCompanyName: {
    color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2, textAlign: 'center',
  },

  // Factor deep dive
  deepDiveHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  deepDiveHeaderLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  deepDiveTitle: {
    color: '#FFFFFF', fontSize: 15, fontWeight: '700',
  },
  deepDiveToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8,
    padding: 4, marginTop: 12, alignSelf: 'flex-start',
  },
  deepDiveToggleBtn: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6,
  },
  deepDiveToggleBtnActive: {
    backgroundColor: 'rgba(96,165,250,0.2)',
  },
  deepDiveToggleText: {
    color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600',
  },
  deepDiveToggleTextActive: {
    color: '#60A5FA',
  },
  deepDiveGroup: {
    marginTop: 12,
  },
  deepDiveGroupTitle: {
    color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  deepDiveSubRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8,
  },
  deepDiveSubName: {
    color: 'rgba(255,255,255,0.65)', fontSize: 12, width: 110,
  },
  deepDiveSubTrack: {
    flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  deepDiveSubFill: {
    height: 4, borderRadius: 2,
  },
  deepDiveSubValue: {
    fontSize: 11, fontWeight: '700', width: 32, textAlign: 'right',
    color: 'rgba(255,255,255,0.6)',
  },
  deepDiveSubWeight: {
    fontSize: 10, fontWeight: '600', width: 28, textAlign: 'right',
    color: 'rgba(255,255,255,0.35)',
  },
});
