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
import { getBaskets } from '../services/api';
import type { Basket, BasketStock, RootStackParamList, Signal } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SIGNAL_COLORS: Record<Signal, string> = {
  BUY: '#10B981',
  HOLD: '#F59E0B',
  SELL: '#EF4444',
};

const RISK_COLORS: Record<string, string> = {
  Low: '#10B981',
  Medium: '#F59E0B',
  High: '#EF4444',
};

export const BasketListScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const data = await getBaskets();
      setBaskets(data.baskets || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load baskets');
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

  const computeAvgScore = (stocks: BasketStock[]): number => {
    if (stocks.length === 0) return 0;
    const sum = stocks.reduce((acc, s) => acc + (s.score ?? 0), 0);
    return sum / stocks.length;
  };

  const renderStock = (stock: BasketStock, index: number) => (
    <TouchableOpacity
      key={stock.ticker}
      style={styles.stockRow}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('SignalDetail', { ticker: stock.ticker, feedItemId: `basket-${stock.ticker}` })}
    >
      <Text style={styles.stockRank}>{index + 1}</Text>
      <View style={styles.stockInfo}>
        <Text style={styles.stockTicker}>{stock.ticker}</Text>
        <Text style={styles.stockName} numberOfLines={1}>{stock.companyName}</Text>
      </View>
      <Text style={styles.stockWeight}>{((stock.weight ?? 0) * 100).toFixed(0)}%</Text>
      <View style={[styles.signalBadge, { backgroundColor: SIGNAL_COLORS[stock.signal] + '20' }]}>
        <Text style={[styles.signalText, { color: SIGNAL_COLORS[stock.signal] }]}>{stock.signal}</Text>
      </View>
      <Text style={styles.stockScore}>{(stock.score ?? 0).toFixed(1)}</Text>
    </TouchableOpacity>
  );

  const renderBasketCard = ({ item }: { item: Basket }) => {
    const isExpanded = expandedId === item.id;
    const avgScore = computeAvgScore(item.stocks);
    const riskColor = RISK_COLORS[item.riskLevel] || '#F59E0B';

    return (
      <TouchableOpacity
        style={styles.basketCard}
        activeOpacity={0.9}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>{item.emoji}</Text>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardDesc} numberOfLines={isExpanded ? 5 : 2}>{item.description}</Text>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Stocks</Text>
            <Text style={styles.metaValue}>{item.stocks.length}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Avg Score</Text>
            <Text style={styles.metaValue}>{(avgScore ?? 0).toFixed(1)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Risk</Text>
            <Text style={[styles.metaValue, { color: riskColor }]}>{item.riskLevel}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>YTD</Text>
            <Text style={[styles.metaValue, { color: (item.returnYTD ?? 0) >= 0 ? '#10B981' : '#EF4444' }]}>
              {(item.returnYTD ?? 0) >= 0 ? '+' : ''}{(item.returnYTD ?? 0).toFixed(1)}%
            </Text>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.stockList}>
            {item.stocks.map((s, i) => renderStock(s, i))}
          </View>
        )}

        <View style={styles.expandHint}>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.3)" />
        </View>
      </TouchableOpacity>
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
            <Text style={styles.title}>All Baskets</Text>
            <View style={{ width: 36 }} />
          </View>
          <View style={styles.skeletons}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={130} borderRadius={12} />
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
            <Text style={styles.title}>All Baskets</Text>
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
          <Text style={styles.title}>All Baskets</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>{baskets.length} thematic baskets</Text>
        </View>

        <FlatList
          data={baskets}
          keyExtractor={(item, index) => item.id ?? item.postId ?? item.ticker ?? 'item-' + index}
          renderItem={renderBasketCard}
          contentContainerStyle={baskets.length === 0 ? { flexGrow: 1 } : styles.listContent}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#60A5FA" />
          }
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 32 }}>
              <Ionicons name="layers-outline" size={48} color="rgba(255,255,255,0.2)" />
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 16 }}>
                No baskets available
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
  skeletons: { padding: 16, gap: 12 },
  summaryRow: { paddingHorizontal: 20, paddingBottom: 8 },
  summaryText: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  basketCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardEmoji: { fontSize: 32 },
  cardHeaderText: { flex: 1 },
  cardName: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  cardDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4, lineHeight: 17 },
  cardMeta: { flexDirection: 'row', marginTop: 14, gap: 16 },
  metaItem: {},
  metaLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { color: '#FFF', fontSize: 15, fontWeight: '700', marginTop: 2 },
  stockList: { marginTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 10 },
  stockRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  stockRank: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '600', width: 16 },
  stockInfo: { flex: 1 },
  stockTicker: { color: '#FFF', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  stockName: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  stockWeight: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600', width: 32, textAlign: 'right' },
  signalBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  signalText: { fontSize: 9, fontWeight: '700' },
  stockScore: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', width: 28, textAlign: 'right' },
  expandHint: { alignItems: 'center', marginTop: 8 },
});
