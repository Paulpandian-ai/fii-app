import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getBaskets } from '../services/api';
import type { Basket, BasketStock, Signal } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.72;
const CARD_GAP = 12;

const SIGNAL_COLORS: Record<Signal, string> = {
  BUY: '#10B981',
  HOLD: '#F59E0B',
  SELL: '#EF4444',
};

interface BasketCarouselProps {
  onSelectBasket?: (basket: Basket) => void;
}

export const BasketCarousel: React.FC<BasketCarouselProps> = ({ onSelectBasket }) => {
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadBaskets();
  }, []);

  const loadBaskets = async () => {
    try {
      const data = await getBaskets();
      setBaskets(data.baskets || []);
    } catch {
      setBaskets([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#60A5FA" />
      </View>
    );
  }

  if (baskets.length === 0) return null;

  const renderStock = (stock: BasketStock, index: number) => (
    <View key={stock.ticker} style={styles.stockRow}>
      <Text style={styles.stockRank}>{index + 1}</Text>
      <View style={styles.stockInfo}>
        <Text style={styles.stockTicker}>{stock.ticker}</Text>
        <Text style={styles.stockWeight}>{((stock.weight ?? 0) * 100).toFixed(0)}%</Text>
      </View>
      <View style={[styles.stockSignal, { backgroundColor: SIGNAL_COLORS[stock.signal] + '20' }]}>
        <Text style={[styles.stockSignalText, { color: SIGNAL_COLORS[stock.signal] }]}>
          {stock.signal}
        </Text>
      </View>
      <Text style={styles.stockScore}>{(stock.score ?? 0).toFixed(1)}</Text>
    </View>
  );

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>AI Baskets</Text>
        <Text style={styles.sectionSubtitle}>Curated by FII signals</Text>
      </View>

      <ScrollView
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_GAP}
      >
        {baskets.map((basket) => {
          const isExpanded = expandedId === basket.id;
          return (
            <TouchableOpacity
              key={basket.id}
              style={styles.card}
              activeOpacity={0.9}
              onPress={() => {
                if (isExpanded) {
                  onSelectBasket?.(basket);
                } else {
                  setExpandedId(basket.id);
                }
              }}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardEmoji}>{basket.emoji}</Text>
                <View style={styles.cardHeaderText}>
                  <Text style={styles.cardName}>{basket.name}</Text>
                  <Text style={styles.cardDesc} numberOfLines={2}>{basket.description}</Text>
                </View>
              </View>

              <View style={styles.cardMeta}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>YTD</Text>
                  <Text style={[styles.metaValue, { color: basket.returnYTD >= 0 ? '#10B981' : '#EF4444' }]}>
                    {(basket.returnYTD ?? 0) >= 0 ? '+' : ''}{(basket.returnYTD ?? 0).toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Risk</Text>
                  <Text style={styles.metaValue}>{basket.riskLevel}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Stocks</Text>
                  <Text style={styles.metaValue}>{basket.stocks.length}</Text>
                </View>
              </View>

              {isExpanded && (
                <View style={styles.stockList}>
                  {basket.stocks.map((s, i) => renderStock(s, i))}
                  <TouchableOpacity
                    style={styles.viewFullBtn}
                    onPress={() => onSelectBasket?.(basket)}
                  >
                    <Text style={styles.viewFullText}>View Full Basket</Text>
                    <Ionicons name="arrow-forward" size={14} color="#60A5FA" />
                  </TouchableOpacity>
                </View>
              )}

              {!isExpanded && (
                <View style={styles.tapHint}>
                  <Text style={styles.tapHintText}>Tap to see stocks</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: 8 },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  sectionSubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 },
  loadingContainer: { height: 160, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 20, gap: CARD_GAP },
  card: {
    width: CARD_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
  stockInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockTicker: { color: '#FFF', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  stockWeight: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  stockSignal: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  stockSignalText: { fontSize: 9, fontWeight: '700' },
  stockScore: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', width: 28, textAlign: 'right' },
  viewFullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10, paddingVertical: 8 },
  viewFullText: { color: '#60A5FA', fontSize: 13, fontWeight: '600' },
  tapHint: { alignItems: 'center', marginTop: 12 },
  tapHintText: { color: 'rgba(255,255,255,0.25)', fontSize: 11 },
});
