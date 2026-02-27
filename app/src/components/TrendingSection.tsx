import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getTrending } from '../services/api';
import { useWatchlistStore } from '../store/watchlistStore';
import type { TrendingItem, RootStackParamList, Signal } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

const SIGNAL_COLORS: Record<Signal, string> = {
  BUY: '#10B981',
  HOLD: '#F59E0B',
  SELL: '#EF4444',
};

const SIGNAL_ICONS: Record<Signal, string> = {
  BUY: 'arrow-up-circle',
  HOLD: 'pause-circle',
  SELL: 'arrow-down-circle',
};

function formatMarketCap(cap: string): string {
  return cap ? `$${cap}` : '—';
}

function format52WRange(low: number, high: number, current: number): number {
  if (high <= low || high === 0) return 50;
  return Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
}

export const TrendingSection: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { addTicker, isInAnyWatchlist, activeWatchlistId } = useWatchlistStore();
  const [items, setItems] = useState<TrendingItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const pan = useRef(new Animated.ValueXY()).current;

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

  const swipeCard = useCallback((direction: 'left' | 'right' | 'up') => {
    const card = items[currentIndex];

    if (direction === 'up') {
      Animated.timing(pan, {
        toValue: { x: 0, y: -600 },
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        pan.setValue({ x: 0, y: 0 });
        if (card) {
          navigation.navigate('SignalDetail', { ticker: card.ticker, feedItemId: card.ticker });
        }
      });
      return;
    }

    const toValue = direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;

    Animated.timing(pan, {
      toValue: { x: toValue, y: 0 },
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      if (direction === 'right' && card) {
        addTicker(activeWatchlistId, card.ticker, card.companyName);
      }
      pan.setValue({ x: 0, y: 0 });
      setCurrentIndex((prev) => prev + 1);
    });
  }, [items, currentIndex, pan, addTicker, activeWatchlistId, navigation]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 || Math.abs(gesture.dy) > 10,
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -SWIPE_THRESHOLD && Math.abs(gesture.dy) > Math.abs(gesture.dx)) {
          swipeCard('up');
        } else if (gesture.dx > SWIPE_THRESHOLD) {
          swipeCard('right');
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          swipeCard('left');
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (loading) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.titleRow}>
            <Ionicons name="trending-up" size={18} color="#F59E0B" />
            <Text style={styles.sectionTitle}>Trending Now</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#60A5FA" />
        </View>
      </View>
    );
  }

  if (items.length === 0) return null;

  const isFinished = currentIndex >= items.length;

  if (isFinished) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.titleRow}>
            <Ionicons name="trending-up" size={18} color="#F59E0B" />
            <Text style={styles.sectionTitle}>Trending Now</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Swipe to explore what's hot</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={40} color="rgba(245,158,11,0.4)" />
          <Text style={styles.emptyText}>You're all caught up!</Text>
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              setCurrentIndex(0);
              loadTrending();
            }}
          >
            <Ionicons name="refresh" size={14} color="#F59E0B" />
            <Text style={styles.resetText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const item = items[currentIndex];
  const nextItem = currentIndex + 1 < items.length ? items[currentIndex + 1] : null;
  const inWatchlist = isInAnyWatchlist(item.ticker);
  const signalColor = SIGNAL_COLORS[item.signal];
  const rangePercent = format52WRange(item.weekLow52, item.weekHigh52, item.price);

  const rotate = pan.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ['-12deg', '0deg', '12deg'],
  });

  const rightOpacity = pan.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const leftOpacity = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const upOpacity = pan.y.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.titleRow}>
          <Ionicons name="trending-up" size={18} color="#F59E0B" />
          <Text style={styles.sectionTitle}>Trending Now</Text>
        </View>
        <Text style={styles.sectionSubtitle}>
          {currentIndex + 1} of {items.length} · Swipe right to watchlist · Up for details
        </Text>
      </View>

      <View style={styles.cardContainer}>
        {/* Next card (behind) */}
        {nextItem && (
          <View style={[styles.cardWrap, styles.nextCard]}>
            <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.innerCard}>
              <Text style={styles.cardTicker}>{nextItem.ticker}</Text>
              <Text style={styles.cardCompany}>{nextItem.companyName}</Text>
            </LinearGradient>
          </View>
        )}

        {/* Current card */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.cardWrap,
            {
              transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }],
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={() => navigation.navigate('SignalDetail', { ticker: item.ticker, feedItemId: item.ticker })}
          >
            <LinearGradient
              colors={['#1E293B', '#0F172A']}
              style={styles.innerCard}
            >
              {/* Swipe overlays */}
              <Animated.View style={[styles.swipeOverlay, styles.swipeRight, { opacity: rightOpacity }]}>
                <Ionicons name="bookmark" size={28} color="#10B981" />
                <Text style={styles.swipeLabelRight}>Added to Watchlist</Text>
              </Animated.View>
              <Animated.View style={[styles.swipeOverlay, styles.swipeLeft, { opacity: leftOpacity }]}>
                <Ionicons name="close" size={28} color="#EF4444" />
                <Text style={styles.swipeLabelLeft}>Skip</Text>
              </Animated.View>
              <Animated.View style={[styles.swipeOverlay, styles.swipeUp, { opacity: upOpacity }]}>
                <Ionicons name="open-outline" size={28} color="#60A5FA" />
                <Text style={styles.swipeLabelUp}>View Details</Text>
              </Animated.View>

              {/* Header: Rank + Ticker + Signal */}
              <View style={styles.cardTop}>
                <View style={styles.cardTopLeft}>
                  <View style={styles.rankBadge}>
                    <Ionicons name="flame" size={10} color="#F59E0B" />
                    <Text style={styles.rankText}>#{item.rank}</Text>
                  </View>
                  <Text style={styles.cardTicker}>{item.ticker}</Text>
                  <Text style={styles.cardCompany} numberOfLines={1}>{item.companyName}</Text>
                  {item.sector ? (
                    <View style={styles.sectorBadge}>
                      <Text style={styles.sectorText}>{item.sector}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.cardTopRight}>
                  <Text style={styles.cardScoreNum}>{(item.score ?? 0).toFixed(1)}</Text>
                  <View style={[styles.signalPill, { backgroundColor: signalColor + '20' }]}>
                    <Ionicons name={SIGNAL_ICONS[item.signal] as any} size={12} color={signalColor} />
                    <Text style={[styles.signalText, { color: signalColor }]}>
                      {item.signal}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Why it's trending */}
              <View style={styles.reasonRow}>
                <Ionicons name="flash" size={12} color="#F59E0B" />
                <Text style={styles.reasonText}>{item.reason}</Text>
              </View>

              {/* AI Insight */}
              {item.insight ? (
                <Text style={styles.cardInsight} numberOfLines={3}>{item.insight}</Text>
              ) : null}

              {/* Price + Change + Volume row */}
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Price</Text>
                  <Text style={styles.statValueLarge}>
                    ${(item.price ?? 0).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Change</Text>
                  <Text style={[styles.statValueLarge, { color: (item.changePercent ?? 0) >= 0 ? '#10B981' : '#EF4444' }]}>
                    {(item.changePercent ?? 0) >= 0 ? '+' : ''}{(item.changePercent ?? 0).toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Volume</Text>
                  <Text style={styles.statValue}>{item.volume}</Text>
                </View>
              </View>

              {/* Market Cap + P/E row */}
              <View style={styles.metricsRow}>
                {item.marketCap ? (
                  <View style={styles.metricChip}>
                    <Text style={styles.metricLabel}>Mkt Cap</Text>
                    <Text style={styles.metricValue}>{formatMarketCap(item.marketCap)}</Text>
                  </View>
                ) : null}
                {item.peRatio > 0 ? (
                  <View style={styles.metricChip}>
                    <Text style={styles.metricLabel}>P/E</Text>
                    <Text style={styles.metricValue}>{item.peRatio.toFixed(1)}</Text>
                  </View>
                ) : null}
              </View>

              {/* 52-Week Range Bar */}
              {item.weekHigh52 > 0 && item.weekLow52 > 0 ? (
                <View style={styles.rangeContainer}>
                  <Text style={styles.rangeLabel}>52W Range</Text>
                  <View style={styles.rangeBarWrap}>
                    <Text style={styles.rangeLow}>${item.weekLow52.toFixed(0)}</Text>
                    <View style={styles.rangeBar}>
                      <View style={[styles.rangeFill, { width: `${rangePercent}%` }]} />
                      <View style={[styles.rangeMarker, { left: `${rangePercent}%` }]} />
                    </View>
                    <Text style={styles.rangeHigh}>${item.weekHigh52.toFixed(0)}</Text>
                  </View>
                </View>
              ) : null}

              {/* Top Factors */}
              {item.topFactors && item.topFactors.length > 0 ? (
                <View style={styles.factors}>
                  {item.topFactors.map((f) => (
                    <View key={f.name} style={[
                      styles.factorPill,
                      { backgroundColor: (f.score ?? 0) >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' },
                    ]}>
                      <Text style={[
                        styles.factorText,
                        { color: (f.score ?? 0) >= 0 ? '#10B981' : '#EF4444' },
                      ]}>
                        {f.name} {(f.score ?? 0) >= 0 ? '+' : ''}{(f.score ?? 0).toFixed(1)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {inWatchlist && (
                <View style={styles.alreadyBadge}>
                  <Ionicons name="bookmark" size={10} color="#60A5FA" />
                  <Text style={styles.alreadyText}>In watchlist</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => swipeCard('left')}>
          <Ionicons name="close" size={24} color="#EF4444" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtnInfo}
          onPress={() => navigation.navigate('SignalDetail', { ticker: item.ticker, feedItemId: item.ticker })}
        >
          <Ionicons name="information-circle-outline" size={22} color="#60A5FA" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionPrimary]}
          onPress={() => swipeCard('right')}
        >
          <Ionicons name="bookmark" size={24} color="#4ADE80" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  sectionSubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 },
  loadingContainer: { height: 200, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  resetBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  resetText: { color: '#F59E0B', fontSize: 13, fontWeight: '600' },
  cardContainer: {
    height: 420,
    marginHorizontal: 20,
    position: 'relative',
  },
  cardWrap: {
    position: 'absolute',
    width: CARD_WIDTH,
    top: 0,
  },
  nextCard: { opacity: 0.4, transform: [{ scale: 0.95 }] },
  innerCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    minHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  swipeOverlay: {
    position: 'absolute',
    top: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
  },
  swipeRight: { right: 16, borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)' },
  swipeLeft: { left: 16, borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)' },
  swipeUp: {
    top: 'auto' as any,
    bottom: 16,
    left: 16,
    right: 16,
    justifyContent: 'center',
    borderColor: '#60A5FA',
    backgroundColor: 'rgba(96,165,250,0.1)',
  },
  swipeLabelUp: { color: '#60A5FA', fontSize: 14, fontWeight: '800' },
  swipeLabelRight: { color: '#10B981', fontSize: 14, fontWeight: '800' },
  swipeLabelLeft: { color: '#EF4444', fontSize: 14, fontWeight: '800' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTopLeft: { flex: 1 },
  cardTopRight: { alignItems: 'flex-end' },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  rankText: { color: '#F59E0B', fontSize: 11, fontWeight: '700' },
  cardTicker: { color: '#FFF', fontSize: 28, fontWeight: '800', letterSpacing: 1 },
  cardCompany: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 2 },
  sectorBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  sectorText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '600' },
  cardScoreNum: { color: '#FFF', fontSize: 28, fontWeight: '800' },
  signalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  signalText: { fontSize: 11, fontWeight: '700' },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    backgroundColor: 'rgba(245,158,11,0.08)',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.12)',
  },
  reasonText: { color: '#F59E0B', fontSize: 13, fontWeight: '600', flex: 1 },
  cardInsight: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValueLarge: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  statValue: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  metricLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '600' },
  metricValue: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700' },
  rangeContainer: { marginTop: 10 },
  rangeLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  rangeBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rangeLow: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '600' },
  rangeHigh: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '600' },
  rangeBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    position: 'relative',
  },
  rangeFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 4,
    backgroundColor: 'rgba(96,165,250,0.4)',
    borderRadius: 2,
  },
  rangeMarker: {
    position: 'absolute',
    top: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#60A5FA',
    marginLeft: -5,
  },
  factors: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  factorPill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  factorText: { fontSize: 11, fontWeight: '600' },
  alreadyBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(96,165,250,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  alreadyText: { color: '#60A5FA', fontSize: 10, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 16,
  },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239,68,68,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  actionBtnInfo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(96,165,250,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)',
  },
  actionPrimary: {
    backgroundColor: 'rgba(74,222,128,0.2)',
    borderColor: 'rgba(74,222,128,0.3)',
  },
});
