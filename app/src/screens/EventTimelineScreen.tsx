import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Linking,
  RefreshControl,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types';
import type { StockEvent, EventType } from '../types';
import { useEventStore } from '../store/eventStore';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { DisclaimerBanner } from '../components/DisclaimerBanner';

type FilterTab = 'all' | EventType | 'insider';

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'news', label: 'News' },
  { id: 'filing', label: 'Filings' },
  { id: 'macro', label: 'Macro' },
];

const IMPACT_COLORS: Record<string, string> = {
  high: '#EF4444',
  medium: '#FBBF24',
  low: '#6B7280',
  none: '#374151',
};

const DIRECTION_COLORS: Record<string, string> = {
  positive: '#34D399',
  negative: '#EF4444',
  neutral: '#9CA3AF',
};

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  news: 'newspaper-outline',
  filing: 'document-text-outline',
  macro: 'globe-outline',
};

export const EventTimelineScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'EventTimeline'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { ticker } = route.params;

  const tickerEvents = useEventStore((s) => s.tickerEvents[ticker] || []);
  const isLoading = useEventStore((s) => s.isLoadingEvents);
  const loadEvents = useEventStore((s) => s.loadEventsForTicker);

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      await loadEvents(ticker);
    } catch {
      setError('Failed to load events');
    }
  }, [ticker, loadEvents]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filteredEvents = activeFilter === 'all'
    ? tickerEvents
    : tickerEvents.filter((e) => e.type === activeFilter);

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHrs = Math.floor(diffMin / 60);
      if (diffHrs < 24) return `${diffHrs}h ago`;
      const diffDays = Math.floor(diffHrs / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const renderEventCard = ({ item, index }: { item: StockEvent; index: number }) => {
    const impactColor = IMPACT_COLORS[item.impact] || IMPACT_COLORS.low;
    const dirColor = DIRECTION_COLORS[item.direction] || DIRECTION_COLORS.neutral;
    const typeIcon = TYPE_ICONS[item.type] || 'alert-circle-outline';

    return (
      <View style={styles.timelineRow}>
        {/* Left: timestamp + impact dot */}
        <View style={styles.timelineLeft}>
          <Text style={styles.timelineTime}>{formatTimestamp(item.timestamp)}</Text>
          <View style={[styles.impactDot, { backgroundColor: impactColor }]} />
          {index < filteredEvents.length - 1 && <View style={styles.timelineLine} />}
        </View>

        {/* Right: event card */}
        <TouchableOpacity
          style={[styles.eventCard, { borderLeftColor: impactColor }]}
          onPress={() => {
            if (item.sourceUrl) {
              Linking.openURL(item.sourceUrl).catch(() => {});
            }
          }}
          activeOpacity={0.8}
        >
          <View style={styles.eventHeader}>
            <View style={[styles.typeBadge, { backgroundColor: `${impactColor}20` }]}>
              <Ionicons name={typeIcon} size={14} color={impactColor} />
              <Text style={[styles.typeBadgeText, { color: impactColor }]}>
                {item.type.toUpperCase()}
              </Text>
            </View>
            <View style={[styles.directionBadge, { backgroundColor: `${dirColor}20` }]}>
              <Ionicons
                name={item.direction === 'positive' ? 'trending-up' : item.direction === 'negative' ? 'trending-down' : 'remove'}
                size={12}
                color={dirColor}
              />
              <Text style={[styles.directionText, { color: dirColor }]}>
                {item.direction}
              </Text>
            </View>
          </View>

          <Text style={styles.eventSummary} numberOfLines={3}>
            {item.summary || item.headline}
          </Text>

          {item.factorsAffected && item.factorsAffected.length > 0 && (
            <View style={styles.factorsRow}>
              {item.factorsAffected.slice(0, 3).map((f) => (
                <View key={f} style={styles.factorChip}>
                  <Text style={styles.factorChipText}>{f}</Text>
                </View>
              ))}
            </View>
          )}

          {item.category && (
            <Text style={styles.eventCategory}>
              {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
              {item.sourceUrl ? ' · Tap to read' : ''}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (error && tickerEvents.length === 0) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{ticker} Events</Text>
          <View style={{ width: 36 }} />
        </View>
        <ErrorState message={error} onRetry={loadData} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{ticker} Events</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.filterTab, activeFilter === tab.id && styles.filterTabActive]}
            onPress={() => setActiveFilter(tab.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, activeFilter === tab.id && styles.filterTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Loading skeleton */}
      {isLoading && tickerEvents.length === 0 ? (
        <View style={styles.skeletonContainer}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width="100%" height={100} style={{ marginBottom: 12, borderRadius: 12 }} />
          ))}
        </View>
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={(item, idx) => `${item.timestamp}-${item.type}-${idx}`}
          renderItem={renderEventCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60A5FA" />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>No events in the last 30 days</Text>
              <Text style={styles.emptySubtext}>
                Events will appear here when news, SEC filings, or macro releases affect {ticker}
              </Text>
            </View>
          }
          ListFooterComponent={<DisclaimerBanner />}
        />
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterTabActive: {
    borderColor: 'rgba(96,165,250,0.4)',
    backgroundColor: 'rgba(96,165,250,0.1)',
  },
  filterTabText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  filterTabTextActive: { color: '#60A5FA' },

  listContent: { paddingHorizontal: 16, paddingBottom: 40 },

  timelineRow: { flexDirection: 'row', marginBottom: 4 },
  timelineLeft: { width: 60, alignItems: 'center', paddingTop: 4 },
  timelineTime: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '500', marginBottom: 6 },
  impactDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLine: {
    width: 2, flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 4,
  },

  eventCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
  eventHeader: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  directionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  directionText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },

  eventSummary: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500', lineHeight: 20 },

  factorsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  factorChip: {
    backgroundColor: 'rgba(96,165,250,0.1)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  factorChipText: { color: '#60A5FA', fontSize: 10, fontWeight: '600' },

  eventCategory: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 8 },

  skeletonContainer: { paddingHorizontal: 16, paddingTop: 12 },

  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '600', marginTop: 16 },
  emptySubtext: { color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 8, paddingHorizontal: 40 },
});
