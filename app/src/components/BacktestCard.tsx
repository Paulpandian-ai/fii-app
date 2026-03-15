import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Svg, { Line, Polyline, Circle, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { getPrecomputedBacktests, runAdvisorBacktest } from '../services/api';

const TEAL = '#00C9A7';
const GRAY = '#6B7280';
const CARD_BG = 'rgba(255,255,255,0.04)';
const BORDER = 'rgba(255,255,255,0.06)';

const STRATEGY_CHIPS = [
  { id: 'top_20', label: 'Top 20', strategy: 'top_n', params: { top_n: 20 } },
  { id: 'score_7_plus', label: 'Score 7+', strategy: 'score_threshold', params: { min_score: 7.0 } },
  { id: 'score_5_plus', label: 'Score 5+', strategy: 'score_threshold', params: { min_score: 5.0 } },
  { id: 'user_portfolio', label: 'Mine', strategy: 'user_portfolio', params: {} },
];

interface BacktestResult {
  strategy: string;
  strategy_id: string;
  period: string;
  initial_capital: number;
  final_value: number;
  total_return_pct: number;
  annualized_return: number;
  benchmark_return: number;
  alpha: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_months: number;
  lose_months: number;
  stocks_held: string[];
  stocks_count: number;
  monthly_returns: Array<{ month: string; portfolio: number; benchmark: number }>;
  portfolio_series: Array<{ date: string; value: number }>;
  benchmark_series: Array<{ date: string; value: number }>;
  disclaimer: string;
}

// ─── Mini Line Chart ───
const CHART_W = Dimensions.get('window').width - 80;
const CHART_H = 140;
const CHART_PAD = { top: 16, right: 12, bottom: 24, left: 42 };

const MiniChart: React.FC<{
  portfolioSeries: Array<{ date: string; value: number }>;
  benchmarkSeries: Array<{ date: string; value: number }>;
  initialCapital: number;
}> = ({ portfolioSeries, benchmarkSeries, initialCapital }) => {
  const plotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const plotH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

  // Sample data to reduce points
  const sample = (series: Array<{ date: string; value: number }>, maxPts: number) => {
    if (series.length <= maxPts) return series;
    const step = Math.ceil(series.length / maxPts);
    const result = series.filter((_, i) => i % step === 0);
    if (result[result.length - 1] !== series[series.length - 1]) {
      result.push(series[series.length - 1]);
    }
    return result;
  };

  const pSampled = sample(portfolioSeries, 30);
  const bSampled = sample(benchmarkSeries, 30);

  // Compute min/max across both series
  const allValues = [
    ...pSampled.map((p) => p.value),
    ...bSampled.map((p) => p.value),
    initialCapital,
  ];
  const minVal = Math.min(...allValues) * 0.98;
  const maxVal = Math.max(...allValues) * 1.02;
  const range = maxVal - minVal || 1;

  const toPoints = (series: Array<{ date: string; value: number }>) => {
    if (!series.length) return '';
    return series
      .map((p, i) => {
        const x = CHART_PAD.left + (i / Math.max(series.length - 1, 1)) * plotW;
        const y = CHART_PAD.top + plotH - ((p.value - minVal) / range) * plotH;
        return `${x},${y}`;
      })
      .join(' ');
  };

  // Y-axis labels
  const yLabels = [minVal, minVal + range / 2, maxVal].map((v) => ({
    value: `$${(v / 1000).toFixed(1)}K`,
    y: CHART_PAD.top + plotH - ((v - minVal) / range) * plotH,
  }));

  // X-axis: first and last month
  const firstMonth = pSampled[0]?.date?.slice(0, 7) || '';
  const lastMonth = pSampled[pSampled.length - 1]?.date?.slice(0, 7) || '';

  const pPoints = toPoints(pSampled);
  const bPoints = toPoints(bSampled);

  // End values for labels
  const pEnd = pSampled[pSampled.length - 1];
  const bEnd = bSampled[bSampled.length - 1];

  return (
    <Svg width={CHART_W} height={CHART_H}>
      {/* Grid lines */}
      {yLabels.map((yl, i) => (
        <React.Fragment key={i}>
          <Line
            x1={CHART_PAD.left}
            y1={yl.y}
            x2={CHART_W - CHART_PAD.right}
            y2={yl.y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
          <SvgText x={CHART_PAD.left - 4} y={yl.y + 4} fill="rgba(255,255,255,0.3)" fontSize={9} textAnchor="end">
            {yl.value}
          </SvgText>
        </React.Fragment>
      ))}

      {/* X-axis labels */}
      <SvgText x={CHART_PAD.left} y={CHART_H - 4} fill="rgba(255,255,255,0.3)" fontSize={9}>
        {firstMonth}
      </SvgText>
      <SvgText
        x={CHART_W - CHART_PAD.right}
        y={CHART_H - 4}
        fill="rgba(255,255,255,0.3)"
        fontSize={9}
        textAnchor="end"
      >
        {lastMonth}
      </SvgText>

      {/* Benchmark line */}
      {bPoints && (
        <Polyline points={bPoints} fill="none" stroke={GRAY} strokeWidth={1.5} strokeOpacity={0.5} />
      )}

      {/* Portfolio line */}
      {pPoints && <Polyline points={pPoints} fill="none" stroke={TEAL} strokeWidth={2} />}

      {/* End dots */}
      {pEnd && (
        <Circle
          cx={CHART_PAD.left + plotW}
          cy={CHART_PAD.top + plotH - ((pEnd.value - minVal) / range) * plotH}
          r={3}
          fill={TEAL}
        />
      )}
      {bEnd && (
        <Circle
          cx={CHART_PAD.left + plotW}
          cy={CHART_PAD.top + plotH - ((bEnd.value - minVal) / range) * plotH}
          r={3}
          fill={GRAY}
        />
      )}
    </Svg>
  );
};

// ─── BacktestCard ───
export const BacktestCard: React.FC = () => {
  const [results, setResults] = useState<Record<string, BacktestResult>>({});
  const [activeStrategy, setActiveStrategy] = useState('top_20');
  const [loading, setLoading] = useState(true);
  const [loadingCustom, setLoadingCustom] = useState(false);

  // Load precomputed results on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await getPrecomputedBacktests();
        const strategies = data?.strategies || [];
        const map: Record<string, BacktestResult> = {};
        for (const s of strategies) {
          const id = s.strategy_id || s.SK || '';
          if (id) map[id] = s;
        }
        setResults(map);
      } catch (err) {
        // Precomputed not available
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleStrategySelect = useCallback(
    async (chipId: string) => {
      setActiveStrategy(chipId);

      // If already loaded, just switch
      if (results[chipId]) return;

      // Run on-demand backtest
      const chip = STRATEGY_CHIPS.find((c) => c.id === chipId);
      if (!chip) return;

      setLoadingCustom(true);
      try {
        const result = await runAdvisorBacktest({
          strategy: chip.strategy,
          ...chip.params,
          initial_capital: 10000,
        });
        setResults((prev) => ({ ...prev, [chipId]: result }));
      } catch {
        // Failed to load
      } finally {
        setLoadingCustom(false);
      }
    },
    [results],
  );

  const active = results[activeStrategy];

  const totalReturnColor = (active?.total_return_pct ?? 0) >= 0 ? TEAL : '#EF4444';
  const alphaColor = (active?.alpha ?? 0) >= 0 ? TEAL : '#EF4444';

  return (
    <View style={styles.card}>
      <View style={[styles.cardAccent, { backgroundColor: TEAL }]} />
      <View style={styles.cardContent}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="trending-up-outline" size={18} color={TEAL} />
          <Text style={styles.title}>Score Backtester</Text>
        </View>
        <Text style={styles.subtitle}>"What if you followed FII scores?"</Text>

        {/* Strategy Selector Chips */}
        <View style={styles.chipRow}>
          {STRATEGY_CHIPS.map((chip) => (
            <TouchableOpacity
              key={chip.id}
              style={[styles.chip, activeStrategy === chip.id && styles.chipActive]}
              onPress={() => handleStrategySelect(chip.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, activeStrategy === chip.id && styles.chipTextActive]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {loading || loadingCustom ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={TEAL} />
            <Text style={styles.loadingText}>Running backtest...</Text>
          </View>
        ) : active ? (
          <>
            {/* Strategy Label & Period */}
            <Text style={styles.strategyLabel}>{active.strategy} (1yr)</Text>

            {/* Chart */}
            {active.portfolio_series?.length > 0 && (
              <View style={styles.chartContainer}>
                <MiniChart
                  portfolioSeries={active.portfolio_series}
                  benchmarkSeries={active.benchmark_series || []}
                  initialCapital={active.initial_capital}
                />
                {/* Legend */}
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: TEAL }]} />
                    <Text style={styles.legendText}>
                      Portfolio{' '}
                      <Text style={{ color: totalReturnColor, fontWeight: '700' }}>
                        {active.total_return_pct >= 0 ? '+' : ''}
                        {active.total_return_pct}%
                      </Text>
                    </Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: GRAY }]} />
                    <Text style={styles.legendText}>
                      S&P 500{' '}
                      <Text style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {active.benchmark_return >= 0 ? '+' : ''}
                        {active.benchmark_return}%
                      </Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Key Metrics */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Alpha</Text>
                <Text style={[styles.metricValue, { color: alphaColor }]}>
                  {active.alpha >= 0 ? '+' : ''}
                  {active.alpha}%
                </Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Sharpe</Text>
                <Text style={styles.metricValue}>{active.sharpe_ratio}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Max Drawdown</Text>
                <Text style={[styles.metricValue, { color: '#EF4444' }]}>{active.max_drawdown}%</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Win Rate</Text>
                <Text style={styles.metricValue}>
                  {active.win_months + active.lose_months > 0
                    ? Math.round((active.win_months / (active.win_months + active.lose_months)) * 100)
                    : 0}
                  %
                </Text>
              </View>
            </View>

            {/* Final Value */}
            <View style={styles.finalValueRow}>
              <Text style={styles.finalValueLabel}>
                ${active.initial_capital?.toLocaleString()} invested
              </Text>
              <Text style={styles.finalValueAmount}>
                ${active.final_value?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </Text>
            </View>

            {/* Stocks count */}
            {active.stocks_count > 0 && (
              <Text style={styles.stocksCount}>
                {active.stocks_count} stocks held · {active.win_months}W / {active.lose_months}L months
              </Text>
            )}
          </>
        ) : (
          <View style={styles.loadingContainer}>
            <Ionicons name="analytics-outline" size={24} color="rgba(255,255,255,0.2)" />
            <Text style={styles.loadingText}>Select a strategy to see results</Text>
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimerRow}>
          <Ionicons name="warning-outline" size={12} color="rgba(255,255,255,0.2)" />
          <Text style={styles.disclaimerText}>
            Past performance is not indicative of future results. Scores applied retrospectively for
            educational purposes.
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 14,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cardAccent: {
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 12,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipActive: {
    backgroundColor: 'rgba(0,201,167,0.15)',
    borderColor: 'rgba(0,201,167,0.4)',
  },
  chipText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: TEAL,
  },

  // Strategy
  strategyLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },

  // Chart
  chartContainer: {
    marginBottom: 12,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 3,
    borderRadius: 1.5,
  },
  legendText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
  },

  // Metrics
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 10,
  },
  metricItem: {
    width: '48%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Final value
  finalValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,201,167,0.06)',
    borderRadius: 8,
    marginBottom: 6,
  },
  finalValueLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  finalValueAmount: {
    color: TEAL,
    fontSize: 16,
    fontWeight: '800',
  },

  stocksCount: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 8,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },

  // Disclaimer
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  disclaimerText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    flex: 1,
    lineHeight: 14,
    fontStyle: 'italic',
  },
});
