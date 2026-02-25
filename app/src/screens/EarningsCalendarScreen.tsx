import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { getEarningsCalendar } from '../services/api';
import type { EarningsEntry, RootStackParamList, Signal } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SIGNAL_COLORS: Record<Signal, string> = {
  BUY: '#10B981',
  HOLD: '#F59E0B',
  SELL: '#EF4444',
};

const BEAT_COLORS = {
  beat: '#10B981',
  miss: '#EF4444',
};

export const EarningsCalendarScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const [earnings, setEarnings] = useState<EarningsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const data = await getEarningsCalendar();
      setEarnings(data.earnings || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load earnings calendar');
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

  // Group earnings by date
  const groupedByDate = earnings.reduce<Record<string, EarningsEntry[]>>((acc, e) => {
    const d = e.date || 'Unknown';
    if (!acc[d]) acc[d] = [];
    acc[d].push(e);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedByDate).sort();

  // Calendar month data
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const earningDates = new Set(earnings.map((e) => e.date));

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const isToday = (dateStr: string) => {
    return dateStr === today.toISOString().split('T')[0];
  };

  const renderCalendarView = () => {
    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = Array(firstDayOfWeek).fill(null);

    for (let d = 1; d <= daysInMonth; d++) {
      currentWeek.push(d);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    const monthStr = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return (
      <View style={styles.calendarContainer}>
        <Text style={styles.calendarMonth}>{monthStr}</Text>
        <View style={styles.calendarHeader}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <Text key={d} style={styles.calendarDayLabel}>{d}</Text>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={`week-${wi}`} style={styles.calendarRow}>
            {week.map((day, di) => {
              if (day === null) return <View key={`empty-${wi}-${di}`} style={styles.calendarCell} />;
              const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasEarnings = earningDates.has(dateStr);
              const isTodayDate = day === today.getDate();
              return (
                <View
                  key={`day-${day}`}
                  style={[
                    styles.calendarCell,
                    isTodayDate && styles.calendarCellToday,
                    hasEarnings && styles.calendarCellEarnings,
                  ]}
                >
                  <Text style={[styles.calendarDayNum, isTodayDate && styles.calendarDayNumToday]}>
                    {day}
                  </Text>
                  {hasEarnings && <View style={styles.calendarDot} />}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  const renderEarningsCard = ({ item }: { item: EarningsEntry }) => {
    const isExpanded = expandedTicker === item.ticker;
    const hasReported = item.actualEPS != null;
    const beatColor = item.beatStreak >= 3 ? '#10B981' : item.beatStreak >= 1 ? '#F59E0B' : '#EF4444';

    return (
      <TouchableOpacity
        style={styles.earningsCard}
        activeOpacity={0.8}
        onPress={() => setExpandedTicker(isExpanded ? null : item.ticker)}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <Text style={styles.cardTicker}>{item.ticker}</Text>
            <Text style={styles.cardName} numberOfLines={1}>{item.companyName}</Text>
          </View>
          <View style={styles.cardRight}>
            <View style={[styles.timeBadge, { backgroundColor: item.timeOfDay === 'BMO' ? '#3B82F620' : '#8B5CF620' }]}>
              <Text style={[styles.timeBadgeText, { color: item.timeOfDay === 'BMO' ? '#3B82F6' : '#8B5CF6' }]}>
                {item.timeOfDay}
              </Text>
            </View>
            {item.signal && (
              <View style={[styles.signalBadge, { backgroundColor: SIGNAL_COLORS[item.signal] + '20' }]}>
                <Text style={[styles.signalText, { color: SIGNAL_COLORS[item.signal] }]}>
                  {item.signal}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Est. EPS</Text>
            <Text style={styles.metaValue}>
              {item.estimatedEPS != null ? `$${(item.estimatedEPS ?? 0).toFixed(2)}` : '--'}
            </Text>
          </View>
          {hasReported && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Actual</Text>
              <Text style={[styles.metaValue, { color: (item.surprise ?? 0) >= 0 ? '#10B981' : '#EF4444' }]}>
                ${(item.actualEPS ?? 0).toFixed(2)}
              </Text>
            </View>
          )}
          {item.aiScore != null && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>AI Score</Text>
              <Text style={styles.metaValue}>{(item.aiScore ?? 0).toFixed(1)}</Text>
            </View>
          )}
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Beat Streak</Text>
            <Text style={[styles.metaValue, { color: beatColor }]}>{item.beatStreak}Q</Text>
          </View>
        </View>

        {hasReported && item.surprisePercent != null && (
          <View style={[styles.surpriseBanner, { backgroundColor: (item.surprisePercent ?? 0) >= 0 ? '#10B98115' : '#EF444415' }]}>
            <Ionicons
              name={(item.surprisePercent ?? 0) >= 0 ? 'trending-up' : 'trending-down'}
              size={16}
              color={(item.surprisePercent ?? 0) >= 0 ? '#10B981' : '#EF4444'}
            />
            <Text style={[styles.surpriseText, { color: (item.surprisePercent ?? 0) >= 0 ? '#10B981' : '#EF4444' }]}>
              {(item.surprisePercent ?? 0) >= 0 ? '+' : ''}{(item.surprisePercent ?? 0).toFixed(1)}% surprise
            </Text>
          </View>
        )}

        {isExpanded && (
          <View style={styles.expandedSection}>
            <Text style={styles.expandedLabel}>Historical Earnings Pattern</Text>
            <View style={styles.historyRow}>
              {item.historicalSurprises.map((h, i) => (
                <View key={`hist-${i}`} style={[styles.historyDot, { backgroundColor: BEAT_COLORS[h] }]}>
                  <Text style={styles.historyDotText}>{h === 'beat' ? 'B' : 'M'}</Text>
                </View>
              ))}
              {item.historicalSurprises.length === 0 && (
                <Text style={styles.noData}>No historical data</Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.viewDetailBtn}
              onPress={() => navigation.navigate('SignalDetail', { ticker: item.ticker, feedItemId: `earnings-${item.ticker}` })}
            >
              <Text style={styles.viewDetailText}>View Full Analysis</Text>
              <Ionicons name="arrow-forward" size={14} color="#60A5FA" />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderDateGroup = (date: string) => (
    <View style={styles.dateGroup}>
      <View style={[styles.dateBadge, isToday(date) && styles.dateBadgeToday]}>
        <Text style={[styles.dateText, isToday(date) && styles.dateTextToday]}>
          {isToday(date) ? 'Today' : formatDate(date)}
        </Text>
      </View>
    </View>
  );

  // Flatten grouped data for FlatList
  const flatData: Array<{ type: 'date'; date: string } | { type: 'earnings'; item: EarningsEntry }> = [];
  for (const date of sortedDates) {
    flatData.push({ type: 'date', date });
    for (const item of groupedByDate[date]) {
      flatData.push({ type: 'earnings', item });
    }
  }

  if (loading) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Earnings Calendar</Text>
            <View style={{ width: 36 }} />
          </View>
          <View style={styles.skeletons}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={100} borderRadius={12} />
            ))}
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
            <Text style={styles.title}>Earnings Calendar</Text>
            <View style={{ width: 36 }} />
          </View>
          <ErrorState icon="warning" message={error} onRetry={loadData} retryLabel="Try Again" />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Earnings Calendar</Text>
          <TouchableOpacity
            onPress={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
            style={styles.toggleBtn}
          >
            <Ionicons name={viewMode === 'list' ? 'calendar-outline' : 'list-outline'} size={22} color="#60A5FA" />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNum}>{earnings.length}</Text>
            <Text style={styles.summaryLabel}>Upcoming</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNum}>{earnings.filter((e) => e.actualEPS != null).length}</Text>
            <Text style={styles.summaryLabel}>Reported</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNum}>
              {earnings.filter((e) => e.timeOfDay === 'BMO').length}
            </Text>
            <Text style={styles.summaryLabel}>Pre-Market</Text>
          </View>
        </View>

        {viewMode === 'calendar' && renderCalendarView()}

        <FlatList
          data={flatData}
          keyExtractor={(item, i) => item.type === 'date' ? `date-${item.date}` : `earn-${(item as any).item?.ticker ?? 'item'}-${i}`}
          renderItem={({ item }) => {
            if (item.type === 'date') return renderDateGroup(item.date);
            return renderEarningsCard({ item: item.item });
          }}
          contentContainerStyle={flatData.length === 0 ? { flexGrow: 1 } : styles.listContent}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#60A5FA" />
          }
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 32 }}>
              <Ionicons name="calendar-outline" size={48} color="rgba(255,255,255,0.2)" />
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 16 }}>
                No upcoming earnings
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', marginTop: 6 }}>
                Pull to refresh or check back later
              </Text>
            </View>
          }
          ListFooterComponent={<DisclaimerBanner />}
        />
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
  toggleBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'flex-end' },
  skeletons: { padding: 16, gap: 12 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  summaryItem: { alignItems: 'center' },
  summaryNum: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  summaryLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  calendarContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
  },
  calendarMonth: { color: '#FFF', fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  calendarDayLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '600', width: 36, textAlign: 'center' },
  calendarRow: { flexDirection: 'row', justifyContent: 'space-around' },
  calendarCell: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  calendarCellToday: { backgroundColor: 'rgba(96,165,250,0.2)' },
  calendarCellEarnings: { backgroundColor: 'rgba(16,185,129,0.15)' },
  calendarDayNum: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  calendarDayNumToday: { color: '#60A5FA', fontWeight: '700' },
  calendarDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#10B981', marginTop: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  dateGroup: { marginTop: 16, marginBottom: 8 },
  dateBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  dateBadgeToday: { backgroundColor: 'rgba(96,165,250,0.2)' },
  dateText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },
  dateTextToday: { color: '#60A5FA' },
  earningsCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLeft: { flex: 1 },
  cardTicker: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  cardName: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  cardRight: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  timeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  timeBadgeText: { fontSize: 10, fontWeight: '700' },
  signalBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  signalText: { fontSize: 10, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', marginTop: 12, gap: 16 },
  metaItem: {},
  metaLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  metaValue: { color: '#FFF', fontSize: 14, fontWeight: '700', marginTop: 2 },
  surpriseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  surpriseText: { fontSize: 12, fontWeight: '700' },
  expandedSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 10 },
  expandedLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6 },
  historyRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  historyDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  historyDotText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  noData: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  viewDetailBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  viewDetailText: { color: '#60A5FA', fontSize: 13, fontWeight: '600' },
});
