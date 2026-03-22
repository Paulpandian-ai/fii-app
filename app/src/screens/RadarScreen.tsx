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
import { SCORE_COLORS, getScoreColor } from '../utils/scoreColors';
import type { ScreenerResult, RootStackParamList, ScoreLabel } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const DEBOUNCE_MS = 300;
const MAX_SEARCH_RESULTS = 20;

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
const FEATURES = [
  {
    icon: 'flask-outline' as const,
    title: '6-Factor Analysis',
    desc: 'Supply chain, geopolitical, macro, correlations, earnings, risk',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Stress Testing',
    desc: 'See how stocks perform in crashes, recessions, and sector shocks',
  },
  {
    icon: 'stats-chart-outline' as const,
    title: '69 Financial Metrics',
    desc: 'Valuation, profitability, growth with sector benchmarks',
  },
];

// ─── Main Screen ───

export const RadarScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { addRecent } = useRecentStocks();

  // All stocks cache
  const [allStocks, setAllStocks] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(true);

  // Search state
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch all stocks on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getScreener({ limit: '600', sortBy: 'ticker', sortDir: 'asc' });
        console.log('allStocks length:', (data?.results || data?.items || []).length);
        const raw = data?.results || data?.items || [];
        if (raw.length > 0) {
          console.log('First stock:', JSON.stringify(raw[0]));
        }
        if (mounted && raw.length > 0) {
          setAllStocks(raw.map(normalizeItem));
        }
      } catch (err) {
        console.error('Stock load failed:', err);
      }
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
        <View style={styles.searchResultMid}>
          <Text style={styles.searchResultSector} numberOfLines={1}>
            {item.sector}
          </Text>
        </View>
        <ScoreBadge score={item.aiScore} label={item.scoreLabel} />
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
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Text style={styles.heroIcon}>📡</Text>
            <Text style={styles.heroTitle}>Scan Any Stock in Seconds</Text>
            <Text style={styles.heroSubtitle}>
              Get institutional-grade analysis on all 547 S&P 500 companies
            </Text>
          </View>

          {/* Feature Cards */}
          <View style={styles.featureCardsContainer}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.featureCard}>
                <Ionicons name={f.icon} size={22} color="#60A5FA" />
                <View style={styles.featureCardText}>
                  <Text style={styles.featureCardTitle}>{f.title}</Text>
                  <Text style={styles.featureCardDesc}>{f.desc}</Text>
                </View>
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
    paddingTop: 24,
    paddingBottom: 8,
    paddingHorizontal: 24,
  },
  heroIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Feature cards
  featureCardsContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 10,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(96,165,250,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.12)',
    padding: 16,
    gap: 14,
  },
  featureCardText: {
    flex: 1,
  },
  featureCardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  featureCardDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    lineHeight: 17,
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
  searchResultMid: {
    width: 90,
    marginRight: 8,
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
  searchResultSector: {
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
