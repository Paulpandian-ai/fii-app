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
import { SignalBadge } from '../components/SignalBadge';
import { FactorBar } from '../components/FactorBar';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { TradeButton } from '../components/TradeButton';
import { getSignalDetail, getPrice, getTechnicals, getFundamentals, getFactors, getAltData, getChartData, getEventsForTicker, getSignalHistory } from '../services/api';
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
  Signal,
  Alternative,
} from '../types';

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

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  HIGH: '#10B981',
  MEDIUM: '#F59E0B',
  LOW: '#EF4444',
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

      // Load events and signal history (non-blocking)
      getEventsForTicker(ticker, { limit: '5' })
        .then((d) => setRecentEvents(d.events || []))
        .catch(() => {});
      getSignalHistory(ticker, 30)
        .then((d) => setSignalHistory(d.history || []))
        .catch(() => {});
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
    (analysis.signal === 'SELL' || (analysis.signal === 'HOLD' && safeNum(analysis.compositeScore) <= 4));

  return (
    <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
      <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={28} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Section 1: Header with Radar Chart */}
        <View style={styles.header}>
          {factors?.dimensionScores ? (
            <RadarScore
              scores={factors.dimensionScores}
              size={200}
              signal={analysis.signal as 'BUY' | 'HOLD' | 'SELL'}
            />
          ) : (
            <ScoreRing score={safeNum(analysis.compositeScore)} size={100} />
          )}
          <Text style={styles.ticker}>{analysis.ticker}</Text>
          <Text style={styles.companyName}>{analysis.companyName}</Text>
          {hasPriceToShow && (
            <View style={styles.priceRow}>
              <Text style={styles.price}>${priceValue.toFixed(2)}</Text>
              <Text style={[styles.priceChange, { color: isPositive ? '#10B981' : '#EF4444' }]}>
                {isPositive ? '+' : ''}${priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePct.toFixed(1)}%)
              </Text>
            </View>
          )}
          <View style={styles.badgeRow}>
            <SignalBadge signal={analysis.signal as Signal} />
            <View style={[styles.confidencePill, { backgroundColor: CONFIDENCE_COLORS[confidence] + '30' }]}>
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

        {/* Section 2.5: What Drove This Score (Alpha Signals) */}
        {factors && (factors.topPositive?.length > 0 || factors.topNegative?.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What Drove This Score</Text>
            {/* Top Positive */}
            {(factors.topPositive || []).map((f: FactorContribution, i: number) => (
              <View key={`pos-${f.factorId}-${i}`} style={styles.alphaCard}>
                <View style={[styles.alphaAccent, { backgroundColor: '#10B981' }]} />
                <View style={styles.alphaContent}>
                  <View style={styles.alphaRow}>
                    <Text style={styles.alphaName}>{f.factorName}</Text>
                    <Text style={[styles.alphaScore, { color: '#10B981' }]}>
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
                <View style={[styles.alphaAccent, { backgroundColor: '#EF4444' }]} />
                <View style={styles.alphaContent}>
                  <View style={styles.alphaRow}>
                    <Text style={styles.alphaName}>{f.factorName}</Text>
                    <Text style={[styles.alphaScore, { color: '#EF4444' }]}>
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
                            backgroundColor: isPos ? '#10B981' : '#EF4444',
                            alignSelf: isPos ? 'flex-start' : 'flex-end',
                          },
                        ]} />
                      </View>
                      <Text style={[styles.factorBarValue, {
                        color: isPos ? '#10B981' : f.normalizedScore < 0 ? '#EF4444' : 'rgba(255,255,255,0.5)',
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
                        const sfColor = sfScore >= 0 ? '#10B981' : '#EF4444';
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
                  <View style={[styles.techPill, { backgroundColor: technicals.signals.trend.includes('bullish') ? 'rgba(16,185,129,0.15)' : technicals.signals.trend.includes('bearish') ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)' }]}>
                    <Ionicons name="trending-up-outline" size={12} color={technicals.signals.trend.includes('bullish') ? '#10B981' : technicals.signals.trend.includes('bearish') ? '#EF4444' : '#94A3B8'} />
                    <Text style={[styles.techPillText, { color: technicals.signals.trend.includes('bullish') ? '#10B981' : technicals.signals.trend.includes('bearish') ? '#EF4444' : '#94A3B8' }]}>
                      {technicals.signals.trend}
                    </Text>
                  </View>
                )}
                {technicals.signals?.momentum && (
                  <View style={[styles.techPill, { backgroundColor: technicals.signals.momentum === 'oversold' ? 'rgba(16,185,129,0.15)' : technicals.signals.momentum === 'overbought' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)' }]}>
                    <Ionicons name="speedometer-outline" size={12} color={technicals.signals.momentum === 'oversold' ? '#10B981' : technicals.signals.momentum === 'overbought' ? '#EF4444' : '#94A3B8'} />
                    <Text style={[styles.techPillText, { color: technicals.signals.momentum === 'oversold' ? '#10B981' : technicals.signals.momentum === 'overbought' ? '#EF4444' : '#94A3B8' }]}>
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
            >
              <View style={styles.healthCardLeft}>
                <View style={[styles.healthGradeBadge, {
                  borderColor: fundamentals.grade.startsWith('A') || fundamentals.grade.startsWith('B')
                    ? '#10B981' : fundamentals.grade.startsWith('C') ? '#F59E0B' : '#EF4444',
                }]}>
                  <Text style={[styles.healthGradeText, {
                    color: fundamentals.grade.startsWith('A') || fundamentals.grade.startsWith('B')
                      ? '#10B981' : fundamentals.grade.startsWith('C') ? '#F59E0B' : '#EF4444',
                  }]}>
                    {fundamentals.grade}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.healthTitle}>Financial Health</Text>
                  {fundamentals.dcf && fundamentals.dcf.fairValue > 0 && (
                    <Text style={[styles.healthDcf, {
                      color: (fundamentals.dcf.upside ?? 0) >= 0 ? '#10B981' : '#EF4444',
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
        {altData && altData.available.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.altDataCard}
              onPress={() => navigation.push('AlternativeData', { ticker })}
              activeOpacity={0.7}
            >
              <View style={styles.altDataLeft}>
                <View style={styles.altDataIcons}>
                  {altData.available.includes('patents') && (
                    <Ionicons name="bulb-outline" size={16} color="#F59E0B" />
                  )}
                  {altData.available.includes('contracts') && (
                    <Ionicons name="business-outline" size={16} color="#60A5FA" />
                  )}
                  {altData.available.includes('fda') && (
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
                  <SignalBadge signal={alt.signal as Signal} />
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
            <Text style={styles.sectionTitle}>Signal History (30 Days)</Text>
            <View style={styles.historyCard}>
              <View style={styles.historyDots}>
                {signalHistory.map((point, idx) => {
                  const scoreNorm = Math.max(0, Math.min(1, ((point.score ?? 0) - 1) / 9));
                  const color = (point.score ?? 0) >= 7 ? '#34D399' : (point.score ?? 0) <= 3.5 ? '#EF4444' : '#FBBF24';
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
              >
                <Text style={styles.viewAllLink}>View All</Text>
              </TouchableOpacity>
            </View>
            {recentEvents.slice(0, 5).map((event, idx) => {
              const impactColor = event.impact === 'high' ? '#EF4444' : event.impact === 'medium' ? '#FBBF24' : '#6B7280';
              const dirIcon = event.direction === 'positive' ? 'trending-up' : event.direction === 'negative' ? 'trending-down' : 'remove';
              const dirColor = event.direction === 'positive' ? '#34D399' : event.direction === 'negative' ? '#EF4444' : '#9CA3AF';
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

        {/* Discussion / Community */}
        <View style={styles.section}>
          <View style={styles.recentEventsHeader}>
            <Text style={styles.sectionTitle}>Community</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Discussion', { ticker })}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllLink}>View All</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.discussionCard}
            onPress={() => navigation.navigate('Discussion', { ticker })}
            activeOpacity={0.7}
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
});
