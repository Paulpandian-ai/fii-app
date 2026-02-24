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
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { ViewToken } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FeedCard } from '../components/FeedCard';
import { StockMiniCard } from '../components/StockMiniCard';
import { SearchOverlay } from '../components/SearchOverlay';
import { SwipeHint } from '../components/SwipeHint';
import { Skeleton } from '../components/Skeleton';
import { useFeedStore } from '../store/feedStore';
import { usePortfolioStore } from '../store/portfolioStore';
import { useEventStore } from '../store/eventStore';
import { getFeed, getMarketMovers, getScreener, batchSignals } from '../services/api';
import type { FeedItem, FeedEntry, EducationalCard, RootStackParamList, Signal, MarketMover } from '../types';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

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

// ─── Section Header Component ───

const SectionHeader: React.FC<{
  title: string;
  icon: string;
  iconColor?: string;
  onSeeAll?: () => void;
}> = React.memo(({ title, icon, iconColor = '#60A5FA', onSeeAll }) => (
  <View style={styles.sectionHeader}>
    <View style={styles.sectionHeaderLeft}>
      <Ionicons name={icon as any} size={18} color={iconColor} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {onSeeAll && (
      <TouchableOpacity onPress={onSeeAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.seeAll}>See All</Text>
      </TouchableOpacity>
    )}
  </View>
));

// ─── Horizontal Stock Row ───

const HorizontalStockRow: React.FC<{
  data: MarketMover[];
  onPress: (ticker: string) => void;
}> = React.memo(({ data, onPress }) => (
  <FlatList
    horizontal
    data={data}
    keyExtractor={(item) => item.ticker}
    renderItem={({ item }) => (
      <StockMiniCard
        ticker={item.ticker}
        companyName={item.companyName}
        price={item.price}
        changePercent={item.changePercent}
        signal={item.signal}
        aiScore={item.aiScore}
        onPress={() => onPress(item.ticker)}
      />
    )}
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.horizontalList}
  />
));

// ─── Main FeedScreen ───

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

  // Section data
  const [moversGainers, setMoversGainers] = useState<MarketMover[]>([]);
  const [moversLosers, setMoversLosers] = useState<MarketMover[]>([]);
  const [buySignals, setBuySignals] = useState<MarketMover[]>([]);
  const [sellSignals, setSellSignals] = useState<MarketMover[]>([]);
  const [portfolioAlerts, setPortfolioAlerts] = useState<MarketMover[]>([]);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);

  // ─── Mode: 'sections' = scrollable sections, 'cards' = full-screen pager ───
  const [viewMode, setViewMode] = useState<'sections' | 'cards'>('sections');

  useEffect(() => {
    loadFeed();
    loadEventsFeed();
    loadSections();
  }, []);

  // Re-fetch portfolio alerts when portfolio changes
  useEffect(() => {
    if (portfolioTickers.length > 0 && sectionsLoaded) {
      loadPortfolioAlerts();
    }
  }, [portfolioTickers.length, sectionsLoaded]);

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

  const loadSections = async () => {
    // Fetch movers first (highest priority), then screener sections
    try {
      const movers = await getMarketMovers();
      setMoversGainers((movers.gainers || []).slice(0, 5));
      setMoversLosers((movers.losers || []).slice(0, 5));
    } catch {
      // Movers unavailable — leave empty
    }

    // Fetch BUY and SELL signals from screener in parallel
    try {
      const [buyData, sellData] = await Promise.all([
        getScreener({ signal: 'BUY', sortBy: 'aiScore', sortDir: 'desc', limit: '10' }),
        getScreener({ signal: 'SELL', sortBy: 'aiScore', sortDir: 'asc', limit: '5' }),
      ]);
      setBuySignals(
        (buyData.results || []).map((r: any) => ({
          ticker: r.ticker,
          companyName: r.companyName,
          price: r.price,
          change: r.change,
          changePercent: r.changePercent,
          marketCap: r.marketCap,
          sector: r.sector,
          aiScore: r.aiScore,
          signal: r.signal,
        })),
      );
      setSellSignals(
        (sellData.results || []).map((r: any) => ({
          ticker: r.ticker,
          companyName: r.companyName,
          price: r.price,
          change: r.change,
          changePercent: r.changePercent,
          marketCap: r.marketCap,
          sector: r.sector,
          aiScore: r.aiScore,
          signal: r.signal,
        })),
      );
    } catch {
      // Screener unavailable
    }

    setSectionsLoaded(true);
  };

  const loadPortfolioAlerts = async () => {
    if (portfolioTickers.length === 0) return;
    try {
      const data = await batchSignals(portfolioTickers.slice(0, 20));
      const signals = data.signals || [];
      setPortfolioAlerts(
        signals.map((s: any) => ({
          ticker: s.ticker,
          companyName: s.companyName || s.ticker,
          price: s.price || 0,
          change: s.change || 0,
          changePercent: s.changePercent || 0,
          marketCap: 0,
          sector: '',
          aiScore: s.compositeScore || s.score || null,
          signal: s.signal || null,
        })),
      );
    } catch {
      // Portfolio signals unavailable
    }
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

  const handleStockPress = useCallback((ticker: string) => {
    navigation.navigate('SignalDetail', { ticker, feedItemId: ticker });
  }, [navigation]);

  const handleSearchSelect = useCallback((ticker: string) => {
    setSearchVisible(false);
    navigation.navigate('SignalDetail', { ticker, feedItemId: ticker });
  }, [navigation]);

  const handleSeeAllScreener = useCallback((filters: Record<string, string>) => {
    // Navigate to screener tab — the Screener tab index is 2
    navigation.getParent()?.navigate('Screener');
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
    await Promise.all([loadFeed(), loadSections()]);
    setRefreshing(false);
  }, []);

  if (isLoading && feed.length === 0 && !sectionsLoaded) {
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

  // ─── Sections View (default) ───
  if (viewMode === 'sections') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Top bar */}
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>FII</Text>
          <View style={styles.topBarActions}>
            <TouchableOpacity style={styles.topBarBtn} onPress={() => setViewMode('cards')} accessibilityLabel="Switch to card view">
              <Ionicons name="layers-outline" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.topBarBtn} onPress={() => setSearchVisible(true)} accessibilityLabel="Search stocks">
              <Ionicons name="search" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.topBarBtn} onPress={() => navigation.navigate('MarketDashboard')} accessibilityLabel="Open market dashboard">
              <Ionicons name="stats-chart" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.topBarBtn} onPress={() => navigation.navigate('Settings')} accessibilityLabel="Open settings">
              <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        </View>

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
              accessibilityRole="button"
              accessibilityLabel={`View ${liveBannerEvent.ticker} signal alert`}
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
              <TouchableOpacity onPress={dismissLiveBanner} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Dismiss live banner">
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </TouchableOpacity>
          </Animated.View>
        )}

        <ScrollView
          style={styles.sectionsScroll}
          contentContainerStyle={styles.sectionsContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60A5FA" />
          }
        >
          {/* Today's Movers — Gainers */}
          {moversGainers.length > 0 && (
            <View style={styles.section}>
              <SectionHeader
                title="Top Gainers"
                icon="trending-up"
                iconColor="#10B981"
                onSeeAll={() => navigation.navigate('MarketDashboard')}
              />
              <HorizontalStockRow data={moversGainers} onPress={handleStockPress} />
            </View>
          )}

          {/* Today's Movers — Losers */}
          {moversLosers.length > 0 && (
            <View style={styles.section}>
              <SectionHeader
                title="Top Losers"
                icon="trending-down"
                iconColor="#EF4444"
                onSeeAll={() => navigation.navigate('MarketDashboard')}
              />
              <HorizontalStockRow data={moversLosers} onPress={handleStockPress} />
            </View>
          )}

          {/* New BUY Signals */}
          {buySignals.length > 0 && (
            <View style={styles.section}>
              <SectionHeader
                title="BUY Signals"
                icon="arrow-up-circle"
                iconColor="#10B981"
                onSeeAll={() => handleSeeAllScreener({ signal: 'BUY' })}
              />
              <HorizontalStockRow data={buySignals} onPress={handleStockPress} />
            </View>
          )}

          {/* Stocks to Watch (SELL) */}
          {sellSignals.length > 0 && (
            <View style={styles.section}>
              <SectionHeader
                title="Stocks to Watch"
                icon="warning"
                iconColor="#EF4444"
                onSeeAll={() => handleSeeAllScreener({ signal: 'SELL' })}
              />
              <HorizontalStockRow data={sellSignals} onPress={handleStockPress} />
            </View>
          )}

          {/* Portfolio Alerts */}
          {portfolioAlerts.length > 0 && (
            <View style={styles.section}>
              <SectionHeader
                title="Your Portfolio"
                icon="briefcase"
                iconColor="#F59E0B"
              />
              <HorizontalStockRow data={portfolioAlerts} onPress={handleStockPress} />
            </View>
          )}

          {/* Signal Feed — show feed items as compact rows */}
          {feed.length > 0 && (
            <View style={styles.section}>
              <SectionHeader
                title="Signal Feed"
                icon="pulse"
                onSeeAll={() => setViewMode('cards')}
              />
              {feed
                .filter((e): e is FeedItem => !isEducationalCard(e))
                .slice(0, 15)
                .map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.feedRow}
                    onPress={() => handleCardPress(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.feedRowLeft}>
                      <Text style={styles.feedRowTicker}>{item.ticker}</Text>
                      <Text style={styles.feedRowCompany} numberOfLines={1}>
                        {item.companyName}
                      </Text>
                    </View>
                    <View style={styles.feedRowCenter}>
                      <Text style={styles.feedRowScore}>
                        {item.compositeScore.toFixed(1)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.feedRowSignal,
                        {
                          backgroundColor:
                            item.signal === 'BUY'
                              ? '#10B981'
                              : item.signal === 'SELL'
                              ? '#EF4444'
                              : '#F59E0B',
                        },
                      ]}
                    >
                      <Text style={[
                        styles.feedRowSignalText,
                        { color: item.signal === 'HOLD' ? '#000' : '#FFF' },
                      ]}>
                        {item.signal}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
            </View>
          )}

          {/* Spacer for tab bar */}
          <View style={{ height: 100 }} />
        </ScrollView>

        <SearchOverlay
          visible={searchVisible}
          onClose={() => setSearchVisible(false)}
          onSelectTicker={handleSearchSelect}
        />

        {/* Floating AI Chat Bubble */}
        <TouchableOpacity
          style={styles.chatFab}
          onPress={() => navigation.navigate('AIChat', {})}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open AI chat"
        >
          <Ionicons name="sparkles" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Cards View (original full-screen pager) ───
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Top bar with back-to-sections button */}
      <TouchableOpacity style={styles.backToSections} onPress={() => setViewMode('sections')} accessibilityLabel="Back to sections view">
        <Ionicons name="grid-outline" size={20} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* Settings gear */}
      <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')} accessibilityRole="button" accessibilityLabel="Open settings">
        <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* Market Dashboard button */}
      <TouchableOpacity style={styles.dashboardBtn} onPress={() => navigation.navigate('MarketDashboard')} accessibilityRole="button" accessibilityLabel="Open market dashboard">
        <Ionicons name="stats-chart" size={22} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* Search button */}
      <TouchableOpacity style={styles.searchBtn} onPress={() => setSearchVisible(true)} accessibilityRole="button" accessibilityLabel="Search stocks">
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
            accessibilityRole="button"
            accessibilityLabel={`View ${liveBannerEvent.ticker} signal alert`}
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
            <TouchableOpacity onPress={dismissLiveBanner} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Dismiss live banner">
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      )}

      <FlatList
        ref={flatListRef}
        data={feed}
        renderItem={renderItem}
        keyExtractor={(item, index) => item.id ?? (item as any).postId ?? (item as any).ticker ?? 'item-' + index}
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

      {/* Floating AI Chat Bubble */}
      <TouchableOpacity
        style={styles.chatFab}
        onPress={() => navigation.navigate('AIChat', {})}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Open AI chat"
      >
        <Ionicons name="sparkles" size={22} color="#FFFFFF" />
      </TouchableOpacity>
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

  // ─── Top Bar (sections mode) ───
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBarTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 6,
  },
  topBarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ─── Sections scroll ───
  sectionsScroll: {
    flex: 1,
  },
  sectionsContent: {
    paddingTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  seeAll: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '600',
  },
  horizontalList: {
    paddingHorizontal: 16,
  },

  // ─── Feed rows (compact list in sections view) ───
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  feedRowLeft: {
    flex: 1,
    marginRight: 12,
  },
  feedRowTicker: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  feedRowCompany: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  feedRowCenter: {
    marginRight: 12,
  },
  feedRowScore: {
    color: '#60A5FA',
    fontSize: 16,
    fontWeight: '800',
  },
  feedRowSignal: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  feedRowSignalText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ─── Cards mode buttons ───
  backToSections: {
    position: 'absolute',
    top: 54,
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
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
  chatFab: {
    position: 'absolute', bottom: 24, right: 20, zIndex: 100,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#60A5FA',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#60A5FA', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
});
