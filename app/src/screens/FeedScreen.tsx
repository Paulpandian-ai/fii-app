import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
  Animated,
} from 'react-native';
import type { ViewToken } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FeedCard } from '../components/FeedCard';
import { SearchOverlay } from '../components/SearchOverlay';
import { SwipeHint } from '../components/SwipeHint';
import { Skeleton } from '../components/Skeleton';
import { useFeedStore } from '../store/feedStore';
import { usePortfolioStore } from '../store/portfolioStore';
import { useEventStore } from '../store/eventStore';
import { getFeed } from '../services/api';
import type { FeedItem, FeedEntry, EducationalCard, RootStackParamList, Signal } from '../types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const isEducationalCard = (entry: FeedEntry): entry is EducationalCard => {
  return entry.type === 'educational';
};

// ─── Placeholder feed shown when API is unavailable or returns empty ───
const PLACEHOLDER_FEED: FeedItem[] = [
  {
    id: 'p-NVDA', type: 'signal', ticker: 'NVDA', companyName: 'NVIDIA Corporation',
    compositeScore: 8.4, signal: 'BUY' as Signal, confidence: 'HIGH',
    insight: 'Strong AI/datacenter demand and supply-chain dominance drive bullish outlook.',
    topFactors: [{ name: 'Supply Chain', score: 1.8 }, { name: 'Performance', score: 1.6 }, { name: 'Macro', score: 0.9 }],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'p-AAPL', type: 'signal', ticker: 'AAPL', companyName: 'Apple Inc.',
    compositeScore: 7.1, signal: 'BUY' as Signal, confidence: 'MEDIUM',
    insight: 'Services revenue growth and iPhone cycle support moderate bullish stance.',
    topFactors: [{ name: 'Customers', score: 1.4 }, { name: 'Performance', score: 1.1 }, { name: 'Correlations', score: 0.8 }],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'p-TSLA', type: 'signal', ticker: 'TSLA', companyName: 'Tesla, Inc.',
    compositeScore: 5.2, signal: 'HOLD' as Signal, confidence: 'LOW',
    insight: 'Margin compression offsets delivery growth; geopolitical risk adds uncertainty.',
    topFactors: [{ name: 'Geopolitics', score: -0.9 }, { name: 'Performance', score: 0.7 }, { name: 'Macro', score: -0.4 }],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'p-MSFT', type: 'signal', ticker: 'MSFT', companyName: 'Microsoft Corporation',
    compositeScore: 7.8, signal: 'BUY' as Signal, confidence: 'HIGH',
    insight: 'Azure cloud growth and AI integration across Office suite lift outlook.',
    topFactors: [{ name: 'Performance', score: 1.5 }, { name: 'Customers', score: 1.3 }, { name: 'Supply Chain', score: 0.6 }],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'p-AMZN', type: 'signal', ticker: 'AMZN', companyName: 'Amazon.com, Inc.',
    compositeScore: 7.3, signal: 'BUY' as Signal, confidence: 'MEDIUM',
    insight: 'AWS momentum and advertising growth underpin positive signal.',
    topFactors: [{ name: 'Customers', score: 1.3 }, { name: 'Performance', score: 1.2 }, { name: 'Macro', score: 0.5 }],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'p-META', type: 'signal', ticker: 'META', companyName: 'Meta Platforms, Inc.',
    compositeScore: 6.5, signal: 'HOLD' as Signal, confidence: 'MEDIUM',
    insight: 'Ad revenue rebound tempered by heavy Reality Labs spending.',
    topFactors: [{ name: 'Performance', score: 1.0 }, { name: 'Risk', score: -0.5 }, { name: 'Correlations', score: 0.7 }],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'p-GOOGL', type: 'signal', ticker: 'GOOGL', companyName: 'Alphabet Inc.',
    compositeScore: 7.0, signal: 'BUY' as Signal, confidence: 'MEDIUM',
    insight: 'Search dominance and Cloud growth offset regulatory headwinds.',
    topFactors: [{ name: 'Customers', score: 1.2 }, { name: 'Performance', score: 1.1 }, { name: 'Geopolitics', score: -0.3 }],
    updatedAt: new Date().toISOString(),
  },
];

export const FeedScreen: React.FC = () => {
  const { setItems, setCurrentIndex, isLoading, setLoading, setError } = useFeedStore();
  const portfolioTickers = usePortfolioStore((s) => s.getPortfolioTickers)();
  const liveBannerEvent = useEventStore((s) => s.liveBannerEvent);
  const showLiveBanner = useEventStore((s) => s.showLiveBanner);
  const dismissLiveBanner = useEventStore((s) => s.dismissLiveBanner);
  const loadEventsFeed = useEventStore((s) => s.loadEventsFeed);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const bannerAnim = useRef(new Animated.Value(-80)).current;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    loadFeed();
    loadEventsFeed();
  }, []);

  // Animate live event banner
  useEffect(() => {
    if (showLiveBanner && liveBannerEvent) {
      Animated.spring(bannerAnim, { toValue: 0, useNativeDriver: true }).start();
      const timer = setTimeout(() => {
        Animated.timing(bannerAnim, { toValue: -80, duration: 300, useNativeDriver: true }).start(() => {
          dismissLiveBanner();
        });
      }, 10000);
      return () => clearTimeout(timer);
    } else {
      bannerAnim.setValue(-80);
    }
  }, [showLiveBanner, liveBannerEvent, bannerAnim, dismissLiveBanner]);

  const usePlaceholder = () => {
    setItems(PLACEHOLDER_FEED);
    setFeed(PLACEHOLDER_FEED);
  };

  // Sort portfolio stocks to the top of the feed
  const prioritizePortfolioStocks = (entries: FeedEntry[]): FeedEntry[] => {
    if (portfolioTickers.length === 0) return entries;
    const ptSet = new Set(portfolioTickers);
    const owned: FeedEntry[] = [];
    const rest: FeedEntry[] = [];
    for (const e of entries) {
      if (!isEducationalCard(e) && ptSet.has(e.ticker)) {
        owned.push(e);
      } else {
        rest.push(e);
      }
    }
    return [...owned, ...rest];
  };

  const loadFeed = async () => {
    setLoading(true);
    try {
      const data = await getFeed();
      const raw = data?.items || data?.feed || [];

      if (raw.length === 0) {
        usePlaceholder();
        return;
      }

      const feedItems: FeedItem[] = [];
      const allEntries: FeedEntry[] = [];

      for (const entry of raw) {
        if (entry.type === 'educational') {
          allEntries.push(entry as EducationalCard);
        } else {
          const feedItem: FeedItem = {
            id: entry.id || entry.ticker,
            type: 'signal',
            ticker: entry.ticker,
            companyName: entry.companyName || entry.company_name || '',
            compositeScore: entry.compositeScore || entry.composite_score || 5,
            signal: entry.signal || 'HOLD',
            confidence: entry.confidence,
            insight: entry.insight || '',
            topFactors: entry.topFactors || entry.top_factors || [],
            updatedAt: entry.updatedAt || entry.updated_at || new Date().toISOString(),
          };
          feedItems.push(feedItem);
          allEntries.push(feedItem);
        }
      }

      const sorted = prioritizePortfolioStocks(allEntries);
      setItems(feedItems);
      setFeed(sorted);
    } catch {
      // API unavailable — fall back to placeholder data so screen is never blank
      usePlaceholder();
    } finally {
      setLoading(false);
    }
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    [setCurrentIndex]
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const handleCardPress = useCallback((item: FeedEntry) => {
    if (!isEducationalCard(item)) {
      navigation.navigate('SignalDetail', { ticker: item.ticker, feedItemId: item.id });
    }
  }, [navigation]);

  const handleSearchSelect = useCallback((ticker: string) => {
    setSearchVisible(false);
    navigation.navigate('SignalDetail', { ticker, feedItemId: ticker });
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: FeedEntry }) => {
      if (isEducationalCard(item)) {
        return (
          <View style={styles.cardWrapper}>
            <LinearGradient
              colors={['#1a237e', '#4a148c']}
              style={styles.eduCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.eduIcon}>
                <Ionicons name="school-outline" size={32} color="#B39DDB" />
              </View>
              <Text style={styles.eduLabel}>Did You Know?</Text>
              <Text style={styles.eduTitle}>{item.title}</Text>
              <Text style={styles.eduBody}>{item.body}</Text>
              <View style={styles.eduHint}>
                <SwipeHint />
              </View>
            </LinearGradient>
          </View>
        );
      }
      return (
        <FeedCard
          item={item}
          onPress={() => handleCardPress(item)}
        />
      );
    },
    [handleCardPress]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: SCREEN_HEIGHT,
      offset: SCREEN_HEIGHT * index,
      index,
    }),
    []
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  }, []);

  if (isLoading && feed.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <Skeleton width={130} height={130} borderRadius={65} />
          <View style={{ height: 20 }} />
          <Skeleton width={120} height={36} borderRadius={8} />
          <View style={{ height: 8 }} />
          <Skeleton width={200} height={16} borderRadius={4} />
          <View style={{ height: 24 }} />
          <Skeleton width={80} height={32} borderRadius={16} />
          <View style={{ height: 20 }} />
          <Skeleton width={260} height={14} borderRadius={4} />
          <View style={{ height: 8 }} />
          <Skeleton width={200} height={14} borderRadius={4} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Settings gear */}
      <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
        <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* Market Dashboard button */}
      <TouchableOpacity style={styles.dashboardBtn} onPress={() => navigation.navigate('MarketDashboard')}>
        <Ionicons name="stats-chart" size={22} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* Search button */}
      <TouchableOpacity style={styles.searchBtn} onPress={() => setSearchVisible(true)}>
        <Ionicons name="search" size={22} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* Live event banner */}
      {showLiveBanner && liveBannerEvent && (
        <Animated.View style={[styles.liveBanner, { transform: [{ translateY: bannerAnim }] }]}>
          <TouchableOpacity
            style={styles.liveBannerInner}
            onPress={() => {
              dismissLiveBanner();
              navigation.navigate('SignalDetail', {
                ticker: liveBannerEvent.ticker,
                feedItemId: liveBannerEvent.ticker,
              });
            }}
            activeOpacity={0.85}
          >
            <View style={styles.liveBannerDot} />
            <View style={styles.liveBannerContent}>
              <Text style={styles.liveBannerTitle} numberOfLines={1}>
                {liveBannerEvent.ticker} Signal Alert
              </Text>
              <Text style={styles.liveBannerText} numberOfLines={1}>
                {liveBannerEvent.summary}
              </Text>
            </View>
            <TouchableOpacity onPress={dismissLiveBanner} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      )}

      <FlatList
        ref={flatListRef}
        data={feed}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled={true}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        windowSize={5}
        maxToRenderPerBatch={3}
        initialNumToRender={2}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#60A5FA"
          />
        }
      />

      <SearchOverlay
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        onSelectTicker={handleSearchSelect}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1B3E',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsBtn: {
    position: 'absolute',
    top: 54,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dashboardBtn: {
    position: 'absolute',
    top: 54,
    right: 60,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtn: {
    position: 'absolute',
    top: 54,
    right: 104,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardWrapper: {
    height: SCREEN_HEIGHT,
    width: '100%',
  },
  eduCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  eduIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(179,157,219,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  eduLabel: {
    color: '#B39DDB',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  eduTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 32,
  },
  eduBody: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  eduHint: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
  liveBanner: {
    position: 'absolute',
    top: 100,
    left: 12,
    right: 12,
    zIndex: 20,
  },
  liveBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  liveBannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  liveBannerContent: { flex: 1 },
  liveBannerTitle: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
  liveBannerText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
});
