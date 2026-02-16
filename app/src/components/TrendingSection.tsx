import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getTrending } from '../services/api';
import type { TrendingItem, RootStackParamList, Signal } from '../types';

const SIGNAL_COLORS: Record<Signal, string> = {
  BUY: '#10B981',
  HOLD: '#F59E0B',
  SELL: '#EF4444',
};

export const TrendingSection: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<TrendingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrending();
  }, []);

  const loadTrending = async () => {
    try {
      const data = await getTrending();
      setItems(data.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trending</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#60A5FA" />
        </View>
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.titleRow}>
          <Ionicons name="trending-up" size={18} color="#F59E0B" />
          <Text style={styles.sectionTitle}>Trending Now</Text>
        </View>
        <Text style={styles.sectionSubtitle}>What FII users are watching</Text>
      </View>

      <ScrollView
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item) => (
          <TouchableOpacity
            key={item.ticker}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('SignalDetail', { ticker: item.ticker, feedItemId: item.ticker })}
          >
            <View style={styles.cardTop}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>#{item.rank}</Text>
              </View>
              <View style={[styles.signalDot, { backgroundColor: SIGNAL_COLORS[item.signal] }]} />
            </View>

            <Text style={styles.cardTicker}>{item.ticker}</Text>
            <Text style={styles.cardName} numberOfLines={1}>{item.companyName}</Text>

            <Text style={[styles.cardChange, { color: (item.changePercent ?? 0) >= 0 ? '#10B981' : '#EF4444' }]}>
              {(item.changePercent ?? 0) >= 0 ? '+' : ''}{(item.changePercent ?? 0).toFixed(1)}%
            </Text>

            <Text style={styles.cardReason} numberOfLines={2}>{item.reason}</Text>

            <View style={styles.cardBottom}>
              <Text style={styles.volumeText}>Vol: {item.volume}</Text>
              <Text style={styles.scoreText}>FII: {(item.score ?? 0).toFixed(1)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  sectionSubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 },
  loadingContainer: { height: 140, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 20, gap: 10 },
  card: {
    width: 160,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rankBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rankText: { color: '#F59E0B', fontSize: 10, fontWeight: '700' },
  signalDot: { width: 8, height: 8, borderRadius: 4 },
  cardTicker: { color: '#FFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  cardName: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  cardChange: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  cardReason: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 6, lineHeight: 15 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  volumeText: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '500' },
  scoreText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '600' },
});
