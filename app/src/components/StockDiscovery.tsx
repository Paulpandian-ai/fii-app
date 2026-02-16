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
import { getDiscoveryCards } from '../services/api';
import { useWatchlistStore } from '../store/watchlistStore';
import type { DiscoveryCard, RootStackParamList, Signal } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

const SIGNAL_COLORS: Record<Signal, string> = {
  BUY: '#10B981',
  HOLD: '#F59E0B',
  SELL: '#EF4444',
};

interface StockDiscoveryProps {
  onBookmark?: (ticker: string, companyName: string) => void;
}

export const StockDiscovery: React.FC<StockDiscoveryProps> = ({ onBookmark }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { addTicker, isInAnyWatchlist, activeWatchlistId } = useWatchlistStore();
  const [cards, setCards] = useState<DiscoveryCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const pan = useRef(new Animated.ValueXY()).current;

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      const data = await getDiscoveryCards();
      setCards(data.cards || []);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  const swipeCard = useCallback((direction: 'left' | 'right') => {
    const toValue = direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
    const card = cards[currentIndex];

    Animated.timing(pan, {
      toValue: { x: toValue, y: 0 },
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      if (direction === 'right' && card) {
        addTicker(activeWatchlistId, card.ticker, card.companyName);
        onBookmark?.(card.ticker, card.companyName);
      }
      pan.setValue({ x: 0, y: 0 });
      setCurrentIndex((prev) => prev + 1);
    });
  }, [cards, currentIndex, pan, addTicker, activeWatchlistId, onBookmark]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10,
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
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
          <Text style={styles.sectionTitle}>Discover</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#60A5FA" />
        </View>
      </View>
    );
  }

  if (cards.length === 0) return null;

  const isFinished = currentIndex >= cards.length;

  if (isFinished) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Discover</Text>
          <Text style={styles.sectionSubtitle}>Swipe to explore</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={40} color="rgba(96,165,250,0.4)" />
          <Text style={styles.emptyText}>You've seen all stocks!</Text>
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => setCurrentIndex(0)}
          >
            <Text style={styles.resetText}>Start Over</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const card = cards[currentIndex];
  const nextCard = currentIndex + 1 < cards.length ? cards[currentIndex + 1] : null;
  const inWatchlist = isInAnyWatchlist(card.ticker);

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

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Discover</Text>
        <Text style={styles.sectionSubtitle}>
          Swipe right to watchlist · {cards.length - currentIndex} left
        </Text>
      </View>

      <View style={styles.cardContainer}>
        {/* Next card (behind) */}
        {nextCard && (
          <View style={[styles.cardWrap, styles.nextCard]}>
            <LinearGradient colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)']} style={styles.innerCard}>
              <Text style={styles.cardTicker}>{nextCard.ticker}</Text>
              <Text style={styles.cardCompany}>{nextCard.companyName}</Text>
            </LinearGradient>
          </View>
        )}

        {/* Current card */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.cardWrap,
            {
              transform: [{ translateX: pan.x }, { rotate }],
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={() => navigation.navigate('SignalDetail', { ticker: card.ticker, feedItemId: card.ticker })}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)']}
              style={styles.innerCard}
            >
              {/* Swipe overlays */}
              <Animated.View style={[styles.swipeOverlay, styles.swipeRight, { opacity: rightOpacity }]}>
                <Ionicons name="bookmark" size={28} color="#10B981" />
                <Text style={styles.swipeLabel}>WATCHLIST</Text>
              </Animated.View>
              <Animated.View style={[styles.swipeOverlay, styles.swipeLeft, { opacity: leftOpacity }]}>
                <Ionicons name="close" size={28} color="#EF4444" />
                <Text style={[styles.swipeLabel, { color: '#EF4444' }]}>SKIP</Text>
              </Animated.View>

              {/* Card content */}
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.cardTicker}>{card.ticker}</Text>
                  <Text style={styles.cardCompany}>{card.companyName}</Text>
                  <Text style={styles.cardSector}>{card.sector}</Text>
                </View>
                <View style={styles.cardScoreWrap}>
                  <Text style={styles.cardScoreNum}>{card.score.toFixed(1)}</Text>
                  <View style={[styles.signalPill, { backgroundColor: SIGNAL_COLORS[card.signal] + '20' }]}>
                    <Text style={[styles.signalText, { color: SIGNAL_COLORS[card.signal] }]}>
                      {card.signal}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.cardInsight}>{card.insight}</Text>

              <View style={styles.cardStats}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Price</Text>
                  <Text style={styles.statValue}>${card.price.toFixed(2)}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Change</Text>
                  <Text style={[styles.statValue, { color: card.changePercent >= 0 ? '#10B981' : '#EF4444' }]}>
                    {card.changePercent >= 0 ? '+' : ''}{card.changePercent.toFixed(1)}%
                  </Text>
                </View>
              </View>

              {card.topFactors && card.topFactors.length > 0 && (
                <View style={styles.factors}>
                  {card.topFactors.map((f) => (
                    <View key={f.name} style={styles.factorPill}>
                      <Text style={[styles.factorText, { color: f.score >= 0 ? '#10B981' : '#EF4444' }]}>
                        {f.name} {f.score >= 0 ? '+' : ''}{f.score.toFixed(1)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

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
          style={[styles.actionBtn, styles.actionPrimary]}
          onPress={() => swipeCard('right')}
        >
          <Ionicons name="bookmark" size={24} color="#10B981" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  sectionSubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 },
  loadingContainer: { height: 200, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  resetBtn: { marginTop: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(96,165,250,0.15)' },
  resetText: { color: '#60A5FA', fontSize: 13, fontWeight: '600' },
  cardContainer: {
    height: 280,
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
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 260,
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
  swipeLabel: { color: '#10B981', fontSize: 14, fontWeight: '800' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTicker: { color: '#FFF', fontSize: 24, fontWeight: '800', letterSpacing: 1 },
  cardCompany: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 },
  cardSector: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 2 },
  cardScoreWrap: { alignItems: 'flex-end' },
  cardScoreNum: { color: '#FFF', fontSize: 28, fontWeight: '800' },
  signalPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  signalText: { fontSize: 11, fontWeight: '700' },
  cardInsight: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 19, marginTop: 16 },
  cardStats: { flexDirection: 'row', gap: 24, marginTop: 16 },
  stat: {},
  statLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  statValue: { color: '#FFF', fontSize: 16, fontWeight: '700', marginTop: 2 },
  factors: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  factorPill: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
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
    gap: 24,
    marginTop: 16,
  },
  actionBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionPrimary: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' },
});
