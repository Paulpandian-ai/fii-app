import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { getMarketMovers, getEarningsCalendar } from '../services/api';
import type { MarketMoversData, MarketMover, EarningsEntry, RootStackParamList, Signal } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SIGNAL_COLORS: Record<Signal, string> = {
  BUY: '#10B981',
  HOLD: '#F59E0B',
  SELL: '#EF4444',
};

export const MarketDashboardScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const [movers, setMovers] = useState<MarketMoversData | null>(null);
  const [upcomingEarnings, setUpcomingEarnings] = useState<EarningsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [moversData, earningsData] = await Promise.all([
        getMarketMovers(),
        getEarningsCalendar().catch(() => ({ earnings: [] })),
      ]);
      setMovers(moversData);
      setUpcomingEarnings((earningsData.earnings || []).slice(0, 3));
    } catch (e: any) {
      setError(e.message || 'Failed to load market data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const renderIndexBar = (name: string, pct: number) => {
    const isPositive = pct >= 0;
    const barWidth = Math.min(Math.abs(pct) * 20, 100);
    return (
      <View style={styles.indexRow} key={name}>
        <Text style={styles.indexName}>{name}</Text>
        <View style={styles.indexBarTrack}>
          <View
            style={[
              styles.indexBarFill,
              {
                width: `${barWidth}%`,
                backgroundColor: isPositive ? '#10B981' : '#EF4444',
                alignSelf: isPositive ? 'flex-start' : 'flex-end',
              },
            ]}
          />
        </View>
        <Text style={[styles.indexPct, { color: isPositive ? '#10B981' : '#EF4444' }]}>
          {isPositive ? '+' : ''}{(pct ?? 0).toFixed(2)}%
        </Text>
      </View>
    );
  };

  const renderMoverCard = (item: MarketMover, index: number) => {
    const isPositive = (item.changePercent ?? 0) >= 0;
    return (
      <TouchableOpacity
        key={`${item.ticker}-${index}`}
        style={styles.moverCard}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('SignalDetail', { ticker: item.ticker, feedItemId: `mover-${item.ticker}` })}
      >
        <Text style={styles.moverTicker}>{item.ticker}</Text>
        <Text style={styles.moverPrice}>${(item.price ?? 0).toFixed(2)}</Text>
        <View style={[styles.moverPctBadge, { backgroundColor: isPositive ? '#10B98120' : '#EF444420' }]}>
          <Text style={[styles.moverPctText, { color: isPositive ? '#10B981' : '#EF4444' }]}>
            {isPositive ? '+' : ''}{(item.changePercent ?? 0).toFixed(2)}%
          </Text>
        </View>
        {item.signal && (
          <View style={[styles.moverSignal, { backgroundColor: SIGNAL_COLORS[item.signal] + '20' }]}>
            <Text style={[styles.moverSignalText, { color: SIGNAL_COLORS[item.signal] }]}>{item.signal}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderAIChangeCard = (item: MarketMover, index: number) => {
    const isUpgrade = (item.scoreChange ?? 0) > 0;
    return (
      <View key={`ai-${item.ticker}-${index}`} style={styles.aiChangeRow}>
        <View style={styles.aiChangeLeft}>
          <Text style={styles.aiChangeTicker}>{item.ticker}</Text>
          <Text style={styles.aiChangeName} numberOfLines={1}>{item.companyName}</Text>
        </View>
        <View style={styles.aiChangeRight}>
          <Ionicons
            name={isUpgrade ? 'arrow-up-circle' : 'arrow-down-circle'}
            size={18}
            color={isUpgrade ? '#10B981' : '#EF4444'}
          />
          <Text style={[styles.aiChangeScore, { color: isUpgrade ? '#10B981' : '#EF4444' }]}>
            {isUpgrade ? '+' : ''}{(item.scoreChange ?? 0).toFixed(1)}
          </Text>
          <Text style={styles.aiChangeNow}>{(item.aiScore ?? 0).toFixed(1)}</Text>
        </View>
      </View>
    );
  };

  const renderEarningsPreview = (item: EarningsEntry, index: number) => (
    <View key={`earn-${item.ticker}-${index}`} style={styles.earningsPreviewRow}>
      <View style={styles.earningsPreviewLeft}>
        <Text style={styles.earningsPreviewTicker}>{item.ticker}</Text>
        <Text style={styles.earningsPreviewDate}>{item.date}</Text>
      </View>
      <View style={[styles.timeBadge, { backgroundColor: item.timeOfDay === 'BMO' ? '#3B82F620' : '#8B5CF620' }]}>
        <Text style={[styles.timeBadgeText, { color: item.timeOfDay === 'BMO' ? '#3B82F6' : '#8B5CF6' }]}>
          {item.timeOfDay}
        </Text>
      </View>
    </View>
  );

  // Sector heatmap from movers data
  const renderSectorHeatmap = () => {
    if (!movers) return null;
    const sectorMap: Record<string, { total: number; count: number }> = {};
    const allStocks = [...movers.gainers, ...movers.losers, ...movers.mostActive];
    const seen = new Set<string>();
    for (const s of allStocks) {
      if (seen.has(s.ticker) || !s.sector) continue;
      seen.add(s.ticker);
      if (!sectorMap[s.sector]) sectorMap[s.sector] = { total: 0, count: 0 };
      sectorMap[s.sector].total += s.changePercent;
      sectorMap[s.sector].count += 1;
    }
    const sectors = Object.entries(sectorMap)
      .map(([name, data]) => ({ name, avg: data.total / data.count }))
      .sort((a, b) => b.avg - a.avg);

    if (sectors.length === 0) return null;

    return (
      <View style={styles.sectorHeatmap}>
        {sectors.map((s) => {
          const isPos = s.avg >= 0;
          return (
            <View
              key={s.name}
              style={[styles.sectorCell, { backgroundColor: isPos ? '#10B98120' : '#EF444420' }]}
            >
              <Text style={styles.sectorName} numberOfLines={1}>{s.name}</Text>
              <Text style={[styles.sectorPct, { color: isPos ? '#10B981' : '#EF4444' }]}>
                {isPos ? '+' : ''}{(s.avg ?? 0).toFixed(1)}%
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Market Dashboard</Text>
            <View style={{ width: 36 }} />
          </View>
          <View style={styles.skeletons}>
            <Skeleton width="100%" height={80} borderRadius={12} />
            <Skeleton width="100%" height={120} borderRadius={12} />
            <Skeleton width="100%" height={160} borderRadius={12} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Market Dashboard</Text>
            <View style={{ width: 36 }} />
          </View>
          <ErrorState icon="warning" message={error} onRetry={loadData} retryLabel="Try Again" />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const summary = movers?.marketSummary;

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Market Dashboard</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#60A5FA" />
          }
          contentContainerStyle={styles.scrollContent}
        >
          {/* Market Summary */}
          {summary && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Market Summary</Text>
              <View style={styles.indexContainer}>
                {renderIndexBar(summary.sp500.name, summary.sp500.changePercent)}
                {renderIndexBar(summary.nasdaq.name, summary.nasdaq.changePercent)}
                {renderIndexBar(summary.dow.name, summary.dow.changePercent)}
              </View>
            </View>
          )}

          {/* Sector Heatmap */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sector Performance</Text>
            {renderSectorHeatmap()}
          </View>

          {/* Top Gainers */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top Gainers</Text>
              <Ionicons name="trending-up" size={18} color="#10B981" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moverScroll}>
              {(movers?.gainers || []).slice(0, 5).map((m, i) => renderMoverCard(m, i))}
            </ScrollView>
          </View>

          {/* Top Losers */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top Losers</Text>
              <Ionicons name="trending-down" size={18} color="#EF4444" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moverScroll}>
              {(movers?.losers || []).slice(0, 5).map((m, i) => renderMoverCard(m, i))}
            </ScrollView>
          </View>

          {/* AI Signal Changes */}
          {((movers?.aiUpgrades || []).length > 0 || (movers?.aiDowngrades || []).length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>AI Signal Changes</Text>
              <View style={styles.aiChangeContainer}>
                {(movers?.aiUpgrades || []).map((m, i) => renderAIChangeCard(m, i))}
                {(movers?.aiDowngrades || []).map((m, i) => renderAIChangeCard(m, i))}
                {(movers?.aiUpgrades || []).length === 0 && (movers?.aiDowngrades || []).length === 0 && (
                  <Text style={styles.noChanges}>No significant AI score changes today</Text>
                )}
              </View>
            </View>
          )}

          {/* Upcoming Earnings */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Earnings</Text>
              <TouchableOpacity onPress={() => navigation.navigate('EarningsCalendar')}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.earningsPreviewContainer}>
              {upcomingEarnings.map((e, i) => renderEarningsPreview(e, i))}
              {upcomingEarnings.length === 0 && (
                <Text style={styles.noChanges}>No upcoming earnings this week</Text>
              )}
            </View>
          </View>

          {/* Macro Calendar Placeholder */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Macro Calendar</Text>
            <View style={styles.macroContainer}>
              {[
                { event: 'FOMC Meeting', date: 'Mar 18-19', icon: 'business-outline' as const },
                { event: 'CPI Release', date: 'Mar 12', icon: 'bar-chart-outline' as const },
                { event: 'Jobs Report', date: 'Mar 7', icon: 'people-outline' as const },
              ].map((m) => (
                <View key={m.event} style={styles.macroRow}>
                  <Ionicons name={m.icon} size={18} color="#60A5FA" />
                  <View style={styles.macroInfo}>
                    <Text style={styles.macroEvent}>{m.event}</Text>
                    <Text style={styles.macroDate}>{m.date}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <DisclaimerBanner />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  skeletons: { padding: 16, gap: 12 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { color: '#FFF', fontSize: 17, fontWeight: '700', marginBottom: 10 },
  seeAll: { color: '#60A5FA', fontSize: 13, fontWeight: '600' },

  // Market summary
  indexContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  indexRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  indexName: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', width: 70 },
  indexBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  indexBarFill: { height: 8, borderRadius: 4 },
  indexPct: { fontSize: 13, fontWeight: '700', width: 60, textAlign: 'right' },

  // Sector heatmap
  sectorHeatmap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectorCell: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
  },
  sectorName: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600' },
  sectorPct: { fontSize: 14, fontWeight: '700', marginTop: 2 },

  // Mover cards
  moverScroll: { gap: 10, paddingRight: 16 },
  moverCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    width: 120,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  moverTicker: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  moverPrice: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginTop: 4 },
  moverPctBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 6 },
  moverPctText: { fontSize: 12, fontWeight: '700' },
  moverSignal: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  moverSignalText: { fontSize: 9, fontWeight: '700' },

  // AI changes
  aiChangeContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  aiChangeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiChangeLeft: { flex: 1 },
  aiChangeTicker: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  aiChangeName: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  aiChangeRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiChangeScore: { fontSize: 13, fontWeight: '700' },
  aiChangeNow: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  noChanges: { color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', paddingVertical: 8 },

  // Earnings preview
  earningsPreviewContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  earningsPreviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  earningsPreviewLeft: { flex: 1 },
  earningsPreviewTicker: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  earningsPreviewDate: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  timeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  timeBadgeText: { fontSize: 10, fontWeight: '700' },

  // Macro calendar
  macroContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  macroInfo: { flex: 1 },
  macroEvent: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  macroDate: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
});
