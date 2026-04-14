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
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { getScreener } from '../services/api';
import { useRecentStocks } from '../contexts/RecentStocksContext';
import { SCORE_COLORS, getScoreColor, getScoreLabel } from '../utils/scoreColors';
import type { ScreenerResult, RootStackParamList, ScoreLabel } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const DEBOUNCE_MS = 200;
const MAX_SEARCH_RESULTS = 20;

// Cache stock list in-module so remounts don't trigger a refetch
let _stockCache: ScreenerResult[] | null = null;
let _stockCacheAt = 0;
const STOCK_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Normalize raw API items to ScreenerResult shape ───
const normalizeItem = (item: any): ScreenerResult => ({
  ticker: item.ticker || '',
  companyName: item.companyName || item.company_name || '',
  price: item.price ?? 0,
  change: item.change ?? 0,
  changePercent: item.changePercent ?? item.change_percent ?? 0,
  aiScore: item.aiScore ?? item.ai_score ?? item.compositeScore ?? item.score ?? 0,
  scoreLabel: item.scoreLabel ?? item.score_label ?? getScoreLabel(item.aiScore ?? item.ai_score ?? item.compositeScore ?? item.score ?? 0),
  confidence: item.confidence || '',
  technicalScore: item.technicalScore ?? item.technical_score ?? null,
  fundamentalGrade: item.fundamentalGrade ?? item.fundamental_grade ?? '',
  rsi: item.rsi ?? null,
  sector: item.sector || '',
  marketCap: item.marketCap ?? item.market_cap ?? 0,
  marketCapLabel: item.marketCapLabel ?? item.market_cap_label ?? '',
  peRatio: item.peRatio ?? item.pe_ratio ?? null,
});

// ─── Feature cards data ───
// Order: 6-Factor Analysis (core differentiator) → 69 Financial Metrics →
// Stress Testing. Descriptions are intentionally 2-3 sentences for a
// richer landing experience.
const FEATURES = [
  {
    emoji: '\u{1F52C}',
    icon: 'flask-outline' as const,
    title: '6-Factor Analysis',
    desc:
      'See how supply chains, geopolitics, monetary policy, competitive dynamics, correlations, and earnings quality affect each stock. ' +
      'Every score shows the WHY with sourced citations from SEC filings, Fed data, and Finnhub metrics.',
  },
  {
    emoji: '\u{1F4CA}',
    icon: 'stats-chart-outline' as const,
    title: '69 Financial Metrics',
    desc:
      'Profitability, growth, valuation, health, dividends, analyst estimates, technicals, ownership \u2014 all benchmarked against ' +
      'sector medians with percentile rankings. Go deep or stay at a glance.',
  },
  {
    emoji: '\u{1F6E1}\uFE0F',
    icon: 'shield-checkmark-outline' as const,
    title: 'Stress Testing',
    desc:
      'Fed DFAST-calibrated scenarios: Market Pullback, Recession, Severe Crisis, Sector Shock, Bull Rally. ' +
      'See how each stock would perform in a $10,000 investment \u2014 in dollar terms, not abstract percents.',
  },
];

// ─── Main Screen ───

export const RadarScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { addRecent } = useRecentStocks();

  // All stocks cache (hydrated from module-level cache if fresh)
  const [allStocks, setAllStocks] = useState<ScreenerResult[]>(() => {
    if (_stockCache && Date.now() - _stockCacheAt < STOCK_CACHE_TTL_MS) {
      return _stockCache;
    }
    return [];
  });
  const [loading, setLoading] = useState<boolean>(allStocks.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Search state
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch all stocks once on mount (or on retry). The module-level cache
  // survives remounts for the lifetime of the app session.
  useEffect(() => {
    if (allStocks.length > 0 && !loadError) return;
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const data = await getScreener({ limit: '600', sortBy: 'ticker', sortDir: 'asc' });
        const raw = data?.results || data?.items || [];
        if (!mounted) return;
        if (raw.length > 0) {
          const normalized = raw.map(normalizeItem);
          _stockCache = normalized;
          _stockCacheAt = Date.now();
          setAllStocks(normalized);
          setLoadError(null);
        } else {
          setLoadError('No stocks returned. Please try again.');
        }
      } catch (err) {
        if (mounted) setLoadError('Unable to load stocks. Please check your connection and try again.');
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [reloadKey]);

  const handleRetry = useCallback(() => {
    _stockCache = null;
    _stockCacheAt = 0;
    setAllStocks([]);
    setReloadKey((k) => k + 1);
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
    console.log('Search query:', q, 'Total stocks:', allStocks.length);
    return allStocks
      .filter(
        (s) =>
          s.ticker?.toLowerCase().includes(q) ||
          s.companyName?.toLowerCase().includes(q),
      )
      .slice(0, MAX_SEARCH_RESULTS);
  }, [debouncedQuery, allStocks]);

  const isSearching = debouncedQuery.length > 0;

  // Navigation
  const goToStock = useCallback(
    (ticker: string) => {
      addRecent(ticker);
      navigation.navigate('SignalDetail', { ticker });
    },
    [navigation, addRecent],
  );

  // ─── Render helpers ───

  const renderSearchResult = useCallback(
    ({ item }: { item: ScreenerResult }) => (
      <TouchableOpacity
        style={styles.searchResultRow}
        onPress={() => goToStock(item.ticker)}
        activeOpacity={0.7}
      >
        <View style={styles.searchResultLeft}>
          <Text style={styles.searchResultTicker}>{item.ticker}</Text>
          <Text style={styles.searchResultName} numberOfLines={1}>
            {item.companyName}
          </Text>
        </View>
        <View style={styles.searchResultRight}>
          {item.price > 0 && (
            <Text style={styles.searchResultPrice}>${item.price.toFixed(2)}</Text>
          )}
          <ScoreBadge score={item.aiScore} label={item.scoreLabel} />
        </View>
      </TouchableOpacity>
    ),
    [goToStock],
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.searchBarContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" />
            <Text style={[styles.searchInput, { color: 'rgba(255,255,255,0.3)' }]}>
              Search any S&P 500 stock...
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

  if (loadError && allStocks.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.searchBarContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" />
            <Text style={[styles.searchInput, { color: 'rgba(255,255,255,0.3)' }]}>
              Search any S&P 500 stock...
            </Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="cloud-offline-outline" size={36} color="rgba(255,255,255,0.35)" />
          <Text style={styles.loadingText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.8}>
            <Ionicons name="refresh" size={14} color="#60A5FA" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
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
            placeholder="Search any S&P 500 stock..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="characters"
            autoCorrect={false}
            clearButtonMode="while-editing"
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
        /* Search Results Overlay */
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
        /* Landing Content */
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero Section — expanded value prop */}
          <View style={styles.heroSection}>
            <Text style={styles.heroIcon}>{'\u{1F4E1}'}</Text>
            <Text style={styles.heroTitle}>Factor Impact Analysis for Stocks</Text>
            <Text style={styles.heroSubtitle}>
              Institutional-grade insights for all 500+ S&P 500 companies {'\u2014'} previously locked behind
              $28,000/year Bloomberg terminals.
            </Text>
          </View>

          {/* Feature Cards — reordered: 6-Factor → 69 Metrics → Stress Testing */}
          <View style={styles.featureCardsContainer}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.featureCard}>
                <View style={styles.featureCardHeader}>
                  <Text style={styles.featureCardEmoji}>{f.emoji}</Text>
                  <Text style={styles.featureCardTitle}>{f.title}</Text>
                </View>
                <Text style={styles.featureCardDesc}>{f.desc}</Text>
              </View>
            ))}
          </View>

          {/* Disclaimer */}
          <View style={styles.disclaimerContainer}>
            <Text style={styles.disclaimerText}>
              Scores reflect factor analysis. For educational purposes only.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
};

// ─── Helpers ───

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

  // Hero
  heroSection: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  heroIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 30,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },

  // Feature cards — expanded value props (stacked, 2-3 sentences each)
  featureCardsContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  featureCard: {
    backgroundColor: 'rgba(96,165,250,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.12)',
    padding: 18,
  },
  featureCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  featureCardEmoji: {
    fontSize: 22,
  },
  featureCardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  featureCardDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 19,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(96,165,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)',
    marginTop: 4,
  },
  retryText: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '600',
  },

  // Search result rows
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  searchResultLeft: {
    flex: 1,
  },
  searchResultRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchResultPrice: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  searchResultTicker: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  searchResultName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
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

  // Disclaimer
  disclaimerContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  disclaimerText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
