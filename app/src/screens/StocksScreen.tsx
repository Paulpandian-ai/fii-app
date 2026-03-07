import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { getScreener } from '../services/api';
import { useRecentStocks } from '../contexts/RecentStocksContext';
import { usePriceAlerts, type PriceAlert } from '../contexts/PriceAlertContext';
import { ScoreRing } from '../components/ScoreRing';
import { SCORE_COLORS, getScoreColor, getScoreLabel } from '../utils/scoreColors';
import type { ScreenerResult, RootStackParamList, ScoreLabel } from '../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const DEBOUNCE_MS = 300;
const MAX_SEARCH_RESULTS = 20;

const SECTOR_LIST = [
  'Technology',
  'Healthcare',
  'Financials',
  'Energy',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Industrials',
  'Communication Services',
  'Utilities',
  'Real Estate',
  'Basic Materials',
];

// ─── Main Screen ───

export const StocksScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { recentStocks, addRecent } = useRecentStocks();
  const { alerts, removeAlert } = usePriceAlerts();

  const activeAlerts = useMemo(() => alerts.filter((a) => !a.triggered), [alerts]);
  const triggeredAlerts = useMemo(() => alerts.filter((a) => a.triggered), [alerts]);
  const tickersWithAlerts = useMemo(() => new Set(activeAlerts.map((a) => a.ticker)), [activeAlerts]);

  // All stocks cache
  const [allStocks, setAllStocks] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(true);

  // Search state
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sector expansion
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  // Fetch all stocks on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getScreener({});
        if (mounted && data?.results) {
          setAllStocks(data.results);
        }
      } catch {}
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // Debounce search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, DEBOUNCE_MS);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query]);

  // Search results
  const searchResults = useMemo(() => {
    if (!debouncedQuery) return [];
    const q = debouncedQuery.toLowerCase();
    return allStocks
      .filter(
        (s) =>
          s.ticker.toLowerCase().includes(q) ||
          s.companyName.toLowerCase().includes(q),
      )
      .slice(0, MAX_SEARCH_RESULTS);
  }, [debouncedQuery, allStocks]);

  const isSearching = debouncedQuery.length > 0;

  // Derived data
  const topScored = useMemo(
    () => [...allStocks].sort((a, b) => b.aiScore - a.aiScore).slice(0, 5),
    [allStocks],
  );

  const biggestMovers = useMemo(
    () =>
      [...allStocks]
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, 5),
    [allStocks],
  );

  const recentStockData = useMemo(() => {
    const map = new Map(allStocks.map((s) => [s.ticker, s]));
    return recentStocks
      .map((t) => map.get(t))
      .filter(Boolean) as ScreenerResult[];
  }, [recentStocks, allStocks]);

  const sectorStocks = useMemo(() => {
    if (!expandedSector) return [];
    return allStocks.filter((s) => s.sector === expandedSector);
  }, [expandedSector, allStocks]);

  // Navigation
  const goToStock = useCallback(
    (ticker: string) => {
      addRecent(ticker);
      navigation.navigate('SignalDetail', { ticker });
    },
    [navigation, addRecent],
  );

  const toggleSector = useCallback((sector: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSector((prev) => (prev === sector ? null : sector));
  }, []);

  // ─── Render helpers ───

  const renderSearchResult = useCallback(
    ({ item }: { item: ScreenerResult }) => (
      <TouchableOpacity
        style={styles.stockRow}
        onPress={() => goToStock(item.ticker)}
        activeOpacity={0.7}
      >
        <View style={styles.stockRowLeft}>
          <View style={styles.tickerRow}>
            <Text style={styles.stockTicker}>{item.ticker}</Text>
            {tickersWithAlerts.has(item.ticker) && (
              <Ionicons name="notifications" size={12} color="#60A5FA" />
            )}
          </View>
          <Text style={styles.stockName} numberOfLines={1}>
            {item.companyName}
          </Text>
        </View>
        <View style={styles.stockRowMid}>
          <Text style={styles.stockSector} numberOfLines={1}>
            {item.sector}
          </Text>
        </View>
        <ScoreBadge score={item.aiScore} label={item.scoreLabel} />
      </TouchableOpacity>
    ),
    [goToStock, tickersWithAlerts],
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.searchBarContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" />
            <Text style={[styles.searchInput, { color: 'rgba(255,255,255,0.3)' }]}>
              Search stocks by name or ticker...
            </Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#60A5FA" />
          <Text style={styles.loadingText}>Loading stock universe...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search stocks by name or ticker..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isSearching ? (
        /* Search Results */
        searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.ticker}
            renderItem={renderSearchResult}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color="rgba(255,255,255,0.2)" />
            <Text style={styles.emptyText}>No stocks found for "{debouncedQuery}"</Text>
          </View>
        )
      ) : (
        /* Default Content */
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Active Alerts */}
          {(activeAlerts.length > 0 || triggeredAlerts.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Price Alerts</Text>
              {activeAlerts.map((alert) => (
                <View key={alert.id} style={styles.alertRow}>
                  <Ionicons name="notifications-outline" size={16} color="#60A5FA" />
                  <View style={styles.alertRowContent}>
                    <Text style={styles.alertRowTicker}>{alert.ticker}</Text>
                    <Text style={styles.alertRowDetail}>
                      {alert.direction === 'above' ? 'Above' : 'Below'} ${alert.targetPrice.toFixed(2)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeAlert(alert.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.3)" />
                  </TouchableOpacity>
                </View>
              ))}
              {triggeredAlerts.slice(0, 3).map((alert) => (
                <View key={alert.id} style={[styles.alertRow, styles.alertRowTriggered]}>
                  <Ionicons name="checkmark-circle" size={16} color="rgba(255,255,255,0.3)" />
                  <View style={styles.alertRowContent}>
                    <Text style={[styles.alertRowTicker, styles.alertRowTriggeredText]}>{alert.ticker}</Text>
                    <Text style={[styles.alertRowDetail, styles.alertRowTriggeredText]}>
                      {alert.direction === 'above' ? 'Above' : 'Below'} ${alert.targetPrice.toFixed(2)} — Triggered
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeAlert(alert.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.2)" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Recently Viewed */}
          {recentStockData.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recently Viewed</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalList}
              >
                {recentStockData.slice(0, 5).map((stock) => (
                  <TouchableOpacity
                    key={stock.ticker}
                    style={styles.recentCard}
                    onPress={() => goToStock(stock.ticker)}
                    activeOpacity={0.7}
                  >
                    <ScoreRing score={stock.aiScore} size={48} />
                    <Text style={styles.recentTicker}>{stock.ticker}</Text>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {stock.companyName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Top Scored */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Scored</Text>
            {topScored.map((stock) => (
              <TouchableOpacity
                key={stock.ticker}
                style={styles.stockRow}
                onPress={() => goToStock(stock.ticker)}
                activeOpacity={0.7}
              >
                <View style={styles.stockRowLeft}>
                  <Text style={styles.stockTicker}>{stock.ticker}</Text>
                  <Text style={styles.stockName} numberOfLines={1}>
                    {stock.companyName}
                  </Text>
                </View>
                <ScoreBadge score={stock.aiScore} label={stock.scoreLabel} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Biggest Movers */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Biggest Movers</Text>
            {biggestMovers.map((stock) => (
              <TouchableOpacity
                key={stock.ticker}
                style={styles.stockRow}
                onPress={() => goToStock(stock.ticker)}
                activeOpacity={0.7}
              >
                <View style={styles.stockRowLeft}>
                  <Text style={styles.stockTicker}>{stock.ticker}</Text>
                  <Text style={styles.stockName} numberOfLines={1}>
                    {stock.companyName}
                  </Text>
                </View>
                <View style={styles.changeContainer}>
                  <Text
                    style={[
                      styles.changeText,
                      { color: stock.changePercent >= 0 ? '#00C9A7' : '#F5A623' },
                    ]}
                  >
                    {stock.changePercent >= 0 ? '+' : ''}
                    {stock.changePercent.toFixed(2)}%
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Browse by Sector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Browse by Sector</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sectorPillsRow}
            >
              {SECTOR_LIST.map((sector) => (
                <TouchableOpacity
                  key={sector}
                  style={[
                    styles.sectorPill,
                    expandedSector === sector && styles.sectorPillActive,
                  ]}
                  onPress={() => toggleSector(sector)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.sectorPillText,
                      expandedSector === sector && styles.sectorPillTextActive,
                    ]}
                  >
                    {sector}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {expandedSector && sectorStocks.length > 0 && (
              <View style={styles.sectorList}>
                {sectorStocks.slice(0, 15).map((stock) => (
                  <TouchableOpacity
                    key={stock.ticker}
                    style={styles.stockRow}
                    onPress={() => goToStock(stock.ticker)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.stockRowLeft}>
                      <Text style={styles.stockTicker}>{stock.ticker}</Text>
                      <Text style={styles.stockName} numberOfLines={1}>
                        {stock.companyName}
                      </Text>
                    </View>
                    <ScoreBadge score={stock.aiScore} label={stock.scoreLabel} />
                  </TouchableOpacity>
                ))}
                {sectorStocks.length > 15 && (
                  <Text style={styles.moreText}>
                    +{sectorStocks.length - 15} more in {expandedSector}
                  </Text>
                )}
              </View>
            )}
            {expandedSector && sectorStocks.length === 0 && (
              <Text style={styles.emptyText}>No stocks in {expandedSector}</Text>
            )}
          </View>

          {/* Empty state hint */}
          <View style={styles.hintContainer}>
            <Ionicons name="search-outline" size={20} color="rgba(255,255,255,0.2)" />
            <Text style={styles.hintText}>Search any S&P 500 stock above</Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
};

// ─── Score Badge Component ───

const ScoreBadge: React.FC<{ score: number; label: ScoreLabel }> = React.memo(
  ({ score, label }) => {
    const color = SCORE_COLORS[label] || getScoreColor(score);
    return (
      <View style={[styles.scoreBadge, { backgroundColor: `${color}20` }]}>
        <Text style={[styles.scoreBadgeText, { color }]}>
          {score.toFixed(1)}
        </Text>
      </View>
    );
  },
);

// ─── Styles ───

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#0A1628',
    zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    height: 46,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    height: 46,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  listContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 100,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },

  // Sections
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },

  // Horizontal recently viewed
  horizontalList: {
    gap: 12,
    paddingRight: 16,
  },
  recentCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    width: 100,
    gap: 6,
  },
  recentTicker: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  recentName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    textAlign: 'center',
  },

  // Stock rows
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  stockRowLeft: {
    flex: 1,
  },
  stockRowMid: {
    width: 90,
    marginRight: 8,
  },
  stockTicker: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  stockName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  stockSector: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    textAlign: 'right',
  },

  // Score badge
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  scoreBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Change
  changeContainer: {
    minWidth: 70,
    alignItems: 'flex-end',
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Sector pills
  sectorPillsRow: {
    gap: 8,
    paddingBottom: 4,
  },
  sectorPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectorPillActive: {
    backgroundColor: '#60A5FA',
  },
  sectorPillText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  sectorPillTextActive: {
    color: '#FFFFFF',
  },
  sectorList: {
    marginTop: 12,
  },
  moreText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12,
  },

  // Hint
  hintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 32,
    paddingHorizontal: 16,
  },
  hintText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 13,
  },

  // Ticker row with alert indicator
  tickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // Alert rows
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  alertRowTriggered: {
    opacity: 0.5,
  },
  alertRowContent: {
    flex: 1,
  },
  alertRowTicker: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  alertRowDetail: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  alertRowTriggeredText: {
    textDecorationLine: 'line-through',
  },
});
