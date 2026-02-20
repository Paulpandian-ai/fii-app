import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { getTrackRecord } from '../services/api';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import type {
  TrackRecordData,
  TickerPerformance,
  RootStackParamList,
} from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SIGNAL_COLORS: Record<string, string> = {
  BUY: '#10B981',
  HOLD: '#F59E0B',
  SELL: '#EF4444',
};

const SIGNAL_LABELS: Record<string, string> = {
  BUY: 'Buy',
  HOLD: 'Hold',
  SELL: 'Sell',
};

const SCORE_BAND_LABELS: Record<string, string> = {
  '1-3': '1 - 3',
  '3-5': '3 - 5',
  '5-7': '5 - 7',
  '7-10': '7 - 10',
};

const SCORE_BAND_COLORS: Record<string, string> = {
  '1-3': '#EF4444',
  '3-5': '#F59E0B',
  '5-7': '#60A5FA',
  '7-10': '#10B981',
};

export const TrackRecordScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();

  const [data, setData] = useState<TrackRecordData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [methodologyExpanded, setMethodologyExpanded] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const result = await getTrackRecord();
      setData(result);
    } catch {
      setError('Failed to load track record data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // ─── Header (shared across loading/error/loaded states) ───
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>
      <Text style={styles.title}>Our Track Record</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  // ─── Loading state ───
  if (loading) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <SafeAreaView style={styles.safe}>
          {renderHeader()}
          <View style={styles.skeletons}>
            <Skeleton width="100%" height={180} borderRadius={12} />
            <Skeleton width="100%" height={120} borderRadius={12} />
            <Skeleton width="100%" height={120} borderRadius={12} />
            <Skeleton width="100%" height={80} borderRadius={12} />
            <Skeleton width="100%" height={80} borderRadius={12} />
            <Skeleton width="100%" height={80} borderRadius={12} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ─── Error state ───
  if (error) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <SafeAreaView style={styles.safe}>
          {renderHeader()}
          <ErrorState
            icon="warning"
            message={error}
            onRetry={loadData}
            retryLabel="Try Again"
          />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ─── Helpers ───
  const hitRate = (data?.overallHitRate ?? 0);
  const hitRateColor =
    hitRate >= 60 ? '#10B981' : hitRate >= 45 ? '#F59E0B' : '#EF4444';

  const signalKeys = Object.keys(data?.signalPerformance ?? {});
  const scoreBandKeys = Object.keys(data?.scoreBands ?? {});
  const tickers: TickerPerformance[] = data?.tickerPerformance ?? [];
  const methodology = data?.methodology;

  // ─── Loaded state ───
  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        {renderHeader()}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#60A5FA"
            />
          }
        >
          {/* ── Section 1: Hero Hit Rate Gauge ── */}
          <View style={styles.section}>
            <View style={styles.gaugeContainer}>
              <View style={[styles.gaugeCircle, { borderColor: hitRateColor }]}>
                <Text style={[styles.gaugeValue, { color: hitRateColor }]}>
                  {Math.round(hitRate)}%
                </Text>
              </View>
              <Text style={styles.gaugeLabel}>
                of Buy signals profitable at 3 months
              </Text>
              <Text style={styles.gaugeSub}>
                Based on {data?.totalSignals ?? 0} total signals
              </Text>
            </View>
          </View>

          {/* ── Section 2: Signal Performance Bars ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Signal Performance</Text>
            <View style={styles.card}>
              {signalKeys.map((key) => {
                const perf = data!.signalPerformance[key];
                if (!perf) return null;
                const color = SIGNAL_COLORS[key] ?? '#60A5FA';
                const barWidth = Math.max(
                  Math.min(Math.abs((perf.hitRate ?? 0)), 100),
                  4
                );
                return (
                  <View key={key} style={styles.signalRow}>
                    <View style={styles.signalLabelRow}>
                      <View style={[styles.signalDot, { backgroundColor: color }]} />
                      <Text style={[styles.signalLabel, { color }]}>
                        {SIGNAL_LABELS[key] ?? key}
                      </Text>
                      <Text style={styles.signalCount}>
                        {perf.count ?? 0} signals
                      </Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${barWidth}%`, backgroundColor: color },
                        ]}
                      />
                    </View>
                    <View style={styles.signalStats}>
                      <Text style={styles.signalStatText}>
                        Avg Return:{' '}
                        <Text
                          style={{
                            color:
                              (perf.avgReturn3M ?? 0) >= 0 ? '#10B981' : '#EF4444',
                            fontWeight: '700',
                          }}
                        >
                          {(perf.avgReturn3M ?? 0) >= 0 ? '+' : ''}
                          {(perf.avgReturn3M ?? 0).toFixed(1)}%
                        </Text>
                      </Text>
                      <Text style={styles.signalStatText}>
                        Hit Rate:{' '}
                        <Text style={{ color, fontWeight: '700' }}>
                          {(perf.hitRate ?? 0).toFixed(1)}%
                        </Text>
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Section 3: Score Band Performance ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Score Band Performance</Text>
            <View style={styles.bandGrid}>
              {scoreBandKeys.map((key) => {
                const band = data!.scoreBands[key];
                if (!band) return null;
                const color = SCORE_BAND_COLORS[key] ?? '#60A5FA';
                const avgReturn = band.avgReturn3M ?? 0;
                return (
                  <View key={key} style={styles.bandCard}>
                    <Text style={[styles.bandLabel, { color }]}>
                      {SCORE_BAND_LABELS[key] ?? key}
                    </Text>
                    <Text
                      style={[
                        styles.bandReturn,
                        { color: avgReturn >= 0 ? '#10B981' : '#EF4444' },
                      ]}
                    >
                      {avgReturn >= 0 ? '+' : ''}
                      {(avgReturn ?? 0).toFixed(1)}%
                    </Text>
                    <Text style={styles.bandReturnLabel}>avg 3M return</Text>
                    <Text style={styles.bandCount}>
                      {band.count ?? 0} signals
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Section 4: Per-Stock Performance Table ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Per-Stock Performance</Text>
            <View style={styles.card}>
              {/* Table header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Ticker</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.7 }]}>Signals</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Hit Rate</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.9 }]}>Avg 3M</Text>
              </View>

              {/* Table rows */}
              {tickers.map((item: TickerPerformance) => {
                const returnColor =
                  (item.avgReturn3M ?? 0) >= 0 ? '#10B981' : '#EF4444';
                return (
                  <TouchableOpacity
                    key={item.ticker}
                    style={styles.tableRow}
                    activeOpacity={0.7}
                    onPress={() =>
                      navigation.navigate('SignalDetail', {
                        ticker: item.ticker,
                        feedItemId: item.ticker,
                      })
                    }
                  >
                    <View style={{ flex: 1.2 }}>
                      <Text style={styles.tableTicker}>{item.ticker}</Text>
                      <Text style={styles.tableCompany} numberOfLines={1}>
                        {item.companyName}
                      </Text>
                    </View>
                    <Text style={[styles.tableCell, { flex: 0.7 }]}>
                      {item.totalSignals ?? 0}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 0.8 }]}>
                      {(item.hitRate ?? 0).toFixed(1)}%
                    </Text>
                    <Text
                      style={[
                        styles.tableCell,
                        { flex: 0.9, color: returnColor, fontWeight: '700' },
                      ]}
                    >
                      {(item.avgReturn3M ?? 0) >= 0 ? '+' : ''}
                      {(item.avgReturn3M ?? 0).toFixed(1)}%
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {tickers.length === 0 && (
                <Text style={styles.emptyText}>
                  No per-stock performance data available yet.
                </Text>
              )}
            </View>
          </View>

          {/* ── Section 5: Methodology ── */}
          {methodology && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.methodologyHeader}
                activeOpacity={0.7}
                onPress={() => setMethodologyExpanded(!methodologyExpanded)}
              >
                <Text style={styles.sectionTitle}>Methodology</Text>
                <Ionicons
                  name={methodologyExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="rgba(255,255,255,0.5)"
                />
              </TouchableOpacity>

              {methodologyExpanded && (
                <View style={styles.card}>
                  {/* Version */}
                  <View style={styles.methodRow}>
                    <Text style={styles.methodLabel}>Version</Text>
                    <Text style={styles.methodValue}>
                      {methodology.version ?? 'N/A'}
                    </Text>
                  </View>

                  {/* Factor Model */}
                  <View style={styles.methodRow}>
                    <Text style={styles.methodLabel}>Factor Model</Text>
                    <Text style={styles.methodValue}>
                      {methodology.factorModel ?? 'N/A'}
                    </Text>
                  </View>

                  {/* Dimensions */}
                  <View style={styles.methodRow}>
                    <Text style={styles.methodLabel}>Dimensions</Text>
                    <Text style={styles.methodValue}>
                      {(methodology.dimensions ?? []).join(', ') || 'N/A'}
                    </Text>
                  </View>

                  {/* Data Sources */}
                  <View style={styles.methodRow}>
                    <Text style={styles.methodLabel}>Data Sources</Text>
                    <Text style={styles.methodValue}>
                      {(methodology.dataSources ?? []).join(', ') || 'N/A'}
                    </Text>
                  </View>

                  {/* Signal Thresholds */}
                  <View style={styles.methodRow}>
                    <Text style={styles.methodLabel}>Signal Thresholds</Text>
                    <View style={styles.thresholds}>
                      {Object.entries(methodology.signalThresholds ?? {}).map(
                        ([signal, threshold]) => (
                          <View key={signal} style={styles.thresholdRow}>
                            <View
                              style={[
                                styles.thresholdDot,
                                {
                                  backgroundColor:
                                    SIGNAL_COLORS[signal] ?? '#60A5FA',
                                },
                              ]}
                            />
                            <Text style={styles.thresholdSignal}>{signal}</Text>
                            <Text style={styles.thresholdValue}>
                              {threshold}
                            </Text>
                          </View>
                        )
                      )}
                    </View>
                  </View>

                  {/* Backtest Period */}
                  {methodology.backtestPeriod && (
                    <View style={styles.methodRow}>
                      <Text style={styles.methodLabel}>Backtest Period</Text>
                      <Text style={styles.methodValue}>
                        {methodology.backtestPeriod}
                      </Text>
                    </View>
                  )}

                  {/* Scoring Range */}
                  {methodology.scoringRange && (
                    <View style={styles.methodRow}>
                      <Text style={styles.methodLabel}>Scoring Range</Text>
                      <Text style={styles.methodValue}>
                        {methodology.scoringRange}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* ── Section 6: Disclaimer ── */}
          <View style={styles.section}>
            <View style={styles.card}>
              <Text style={styles.disclaimerBold}>
                Past performance does not guarantee future results. Backtested
                using historical data.
              </Text>
              {data?.methodology?.disclaimer ? (
                <Text style={styles.disclaimerText}>
                  {data.methodology.disclaimer}
                </Text>
              ) : null}
            </View>
          </View>

          <DisclaimerBanner />
          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  skeletons: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },

  // ─── Section ───
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
  },

  // ─── Hero Gauge ───
  gaugeContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  gaugeCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  gaugeValue: {
    fontSize: 44,
    fontWeight: '800',
  },
  gaugeLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 14,
    textAlign: 'center',
  },
  gaugeSub: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    marginTop: 4,
  },

  // ─── Signal Performance Bars ───
  signalRow: {
    marginBottom: 16,
  },
  signalLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  signalLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  signalCount: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginLeft: 'auto',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  signalStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signalStatText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },

  // ─── Score Bands ───
  bandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bandCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
  },
  bandLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  bandReturn: {
    fontSize: 22,
    fontWeight: '800',
  },
  bandReturnLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },
  bandCount: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    marginTop: 6,
  },

  // ─── Table ───
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
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
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  tableTicker: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  tableCompany: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 1,
  },
  tableCell: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },

  // ─── Methodology ───
  methodologyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  methodRow: {
    marginBottom: 14,
  },
  methodLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  methodValue: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 19,
  },
  thresholds: {
    marginTop: 4,
    gap: 6,
  },
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thresholdDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  thresholdSignal: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 40,
  },
  thresholdValue: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },

  // ─── Disclaimer ───
  disclaimerBold: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  disclaimerText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
});
