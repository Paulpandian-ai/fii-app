import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

import { runBacktest } from '../services/api';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import type { BacktestResult, BacktestStats, PortfolioBacktest } from '../types';

const STATUS_COLORS: Record<string, string> = {
  correct: '#10B981',
  incorrect: '#EF4444',
  borderline: '#F59E0B',
};

const STATUS_ICONS: Record<string, string> = {
  correct: '\u2705',
  incorrect: '\u274C',
  borderline: '\u26A0\uFE0F',
};

interface AccuracyGaugeProps {
  value: number;
  size?: number;
  label: string;
}

const AccuracyGauge: React.FC<AccuracyGaugeProps> = ({ value, size = 140, label }) => {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (Math.min(value, 100) / 100) * circumference;
  const center = size / 2;

  const color =
    value >= 65 ? '#10B981' : value >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${progress} ${circumference - progress}`}
            strokeDashoffset={circumference / 4}
            strokeLinecap="round"
            rotation={-90}
            origin={`${center}, ${center}`}
          />
        </Svg>
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          <Text style={[styles.gaugeValue, { color, fontSize: size * 0.28 }]}>
            {value.toFixed(0)}%
          </Text>
          <Text style={styles.gaugeLabel}>{label}</Text>
        </View>
      </View>
    </View>
  );
};

export const BacktestScreen: React.FC = () => {
  const navigation = useNavigation();

  const [results, setResults] = useState<BacktestResult[]>([]);
  const [stats, setStats] = useState<BacktestStats | null>(null);
  const [portfolioBacktest, setPortfolioBacktest] = useState<PortfolioBacktest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBacktest = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await runBacktest();
      setResults(data.results || []);
      setStats(data.stats || null);
      setPortfolioBacktest(data.portfolioBacktest || null);
    } catch {
      setError('Failed to load backtest data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBacktest();
  }, [loadBacktest]);

  const getRowBg = (status: string) => {
    if (status === 'correct') return 'rgba(16,185,129,0.08)';
    if (status === 'incorrect') return 'rgba(239,68,68,0.08)';
    return 'rgba(245,158,11,0.08)';
  };

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Signal Backtester</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#60A5FA" size="large" />
          <Text style={styles.loadingText}>Backtesting signals...</Text>
          <Text style={styles.loadingSubtext}>
            Comparing FII signals against actual stock performance
          </Text>
        </View>
      ) : error ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle" size={48} color="#EF4444" />
          <Text style={[styles.loadingText, { color: '#EF4444' }]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadBacktest}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Section 1: How Accurate Are FII Signals? */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How Accurate Are FII Signals?</Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>
                We tested FII&apos;s signals against actual stock performance over the past 12 months
              </Text>
            </View>

            {stats && (
              <>
                <AccuracyGauge value={stats.hitRate} label="Signal Accuracy" />

                <View style={styles.breakdownContainer}>
                  <View style={styles.breakdownRow}>
                    <View style={[styles.breakdownDot, { backgroundColor: '#10B981' }]} />
                    <Text style={styles.breakdownLabel}>BUY signals:</Text>
                    <Text style={styles.breakdownValue}>
                      {stats.buyAccuracy.toFixed(0)}% resulted in positive returns over 3 months
                    </Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <View style={[styles.breakdownDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={styles.breakdownLabel}>HOLD signals:</Text>
                    <Text style={styles.breakdownValue}>
                      {stats.holdAccuracy.toFixed(0)}% stayed within ±5% range over 3 months
                    </Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <View style={[styles.breakdownDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.breakdownLabel}>SELL signals:</Text>
                    <Text style={styles.breakdownValue}>
                      {stats.sellAccuracy.toFixed(0)}% resulted in negative returns over 3 months
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>

          {/* Section 2: Signal Track Record */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Signal Track Record</Text>

            {/* Table header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Ticker</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Date</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Signal</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.7 }]}>Score</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>3M Return</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.5 }]} />
            </View>

            {/* Table rows */}
            {results.map((r) => (
              <View
                key={r.ticker}
                style={[styles.tableRow, { backgroundColor: getRowBg(r.status) }]}
              >
                <Text style={[styles.tableCell, styles.tableTicker, { flex: 1.2 }]}>
                  {r.ticker}
                </Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{r.signalDate}</Text>
                <Text
                  style={[
                    styles.tableCell,
                    styles.tableSignal,
                    {
                      flex: 0.8,
                      color:
                        r.signal === 'BUY'
                          ? '#10B981'
                          : r.signal === 'SELL'
                            ? '#EF4444'
                            : '#F59E0B',
                    },
                  ]}
                >
                  {r.signal}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.7 }]}>{r.score.toFixed(1)}</Text>
                <Text
                  style={[
                    styles.tableCell,
                    {
                      flex: 1,
                      color: r.actualReturn >= 0 ? '#10B981' : '#EF4444',
                      fontWeight: '600',
                    },
                  ]}
                >
                  {r.actualReturn >= 0 ? '+' : ''}
                  {r.actualReturn.toFixed(1)}%
                </Text>
                <Text style={[styles.tableCell, { flex: 0.5, textAlign: 'center' }]}>
                  {STATUS_ICONS[r.status] || ''}
                </Text>
              </View>
            ))}
          </View>

          {/* Section 3: Backtest Your Portfolio */}
          {portfolioBacktest && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Backtest Your Portfolio</Text>

              {portfolioBacktest.isSimulated && (
                <View style={styles.simulatedBadge}>
                  <Ionicons name="flask" size={12} color="#F59E0B" />
                  <Text style={styles.simulatedText}>
                    Estimated based on signal dates
                  </Text>
                </View>
              )}

              <View style={styles.portfolioBacktestCard}>
                <Text style={styles.portfolioBacktestLabel}>
                  If you followed FII signals for your portfolio:
                </Text>

                <View style={styles.comparisonRow}>
                  <View style={styles.comparisonBlock}>
                    <Text style={styles.comparisonLabel}>FII Signals Return</Text>
                    <Text
                      style={[
                        styles.comparisonValue,
                        {
                          color:
                            portfolioBacktest.estimatedReturn >= 0 ? '#10B981' : '#EF4444',
                        },
                      ]}
                    >
                      {portfolioBacktest.estimatedReturn >= 0 ? '+' : ''}
                      {portfolioBacktest.estimatedReturn.toFixed(1)}%
                    </Text>
                  </View>

                  <View style={styles.comparisonDivider} />

                  <View style={styles.comparisonBlock}>
                    <Text style={styles.comparisonLabel}>S&P 500 Return</Text>
                    <Text
                      style={[
                        styles.comparisonValue,
                        {
                          color:
                            portfolioBacktest.sp500Return >= 0 ? '#10B981' : '#EF4444',
                        },
                      ]}
                    >
                      {portfolioBacktest.sp500Return >= 0 ? '+' : ''}
                      {portfolioBacktest.sp500Return.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.advantageBadge,
                    {
                      backgroundColor:
                        portfolioBacktest.fiiAdvantage >= 0
                          ? 'rgba(16,185,129,0.15)'
                          : 'rgba(239,68,68,0.15)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.advantageText,
                      {
                        color:
                          portfolioBacktest.fiiAdvantage >= 0 ? '#10B981' : '#EF4444',
                      },
                    ]}
                  >
                    FII {portfolioBacktest.fiiAdvantage >= 0 ? 'advantage' : 'disadvantage'}:{' '}
                    {portfolioBacktest.fiiAdvantage >= 0 ? '+' : ''}
                    {portfolioBacktest.fiiAdvantage.toFixed(1)}%
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Section 4: Methodology */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Methodology</Text>
            <View style={styles.methodologyCard}>
              <Text style={styles.methodologyText}>
                FII generates signals by analyzing 18 factors from SEC filings, Federal Reserve
                data, and AI assessment. Signals are backtested against actual stock performance
                to measure accuracy.
              </Text>
              <Text style={[styles.methodologyText, { marginTop: 12 }]}>
                Accuracy is measured over 3-month forward periods from signal generation date.
              </Text>
              <Text style={[styles.methodologyText, { marginTop: 12, fontStyle: 'italic' }]}>
                Past performance does not guarantee future results.
              </Text>
            </View>
          </View>

          <DisclaimerBanner />
        </ScrollView>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    color: '#60A5FA',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
  },
  loadingSubtext: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  summaryText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 20,
  },
  gaugeValue: {
    fontWeight: '800',
  },
  gaugeLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  breakdownContainer: {
    marginTop: 20,
    gap: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  breakdownLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    minWidth: 90,
  },
  breakdownValue: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    flex: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 4,
  },
  tableHeaderCell: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 2,
    alignItems: 'center',
  },
  tableCell: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  tableTicker: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tableSignal: {
    fontWeight: '700',
    fontSize: 11,
  },
  simulatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  simulatedText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '600',
  },
  portfolioBacktestCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 20,
  },
  portfolioBacktestLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginBottom: 16,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  comparisonBlock: {
    flex: 1,
    alignItems: 'center',
  },
  comparisonLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  comparisonValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  comparisonDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  advantageBadge: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  advantageText: {
    fontSize: 14,
    fontWeight: '700',
  },
  methodologyCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 20,
  },
  methodologyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    lineHeight: 20,
  },
});
