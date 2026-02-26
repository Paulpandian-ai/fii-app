import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Modal,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Dimensions,
  Platform,
  Vibration,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Skeleton } from '../components/Skeleton';
import { SectorHeatmap } from '../components/SectorHeatmap';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { getScreener, getScreenerTemplates } from '../services/api';
import { useWatchlistStore } from '../store/watchlistStore';
import type { Signal, RootStackParamList } from '../types';

// ─── Constants ───

const SCREEN_WIDTH = Dimensions.get('window').width;

const SIGNAL_OPTIONS: Signal[] = ['BUY', 'HOLD', 'SELL'];

const SECTORS = [
  'Technology',
  'Healthcare',
  'Financial Services',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Energy',
  'Industrials',
  'Basic Materials',
  'Real Estate',
  'Utilities',
  'Communication Services',
] as const;

type Sector = (typeof SECTORS)[number];

const GRADES = ['A', 'B', 'C', 'D', 'F'] as const;
type Grade = (typeof GRADES)[number];

const MARKET_CAPS = ['Small', 'Mid', 'Large', 'Mega'] as const;
type MarketCap = (typeof MARKET_CAPS)[number];

const SORT_OPTIONS = ['FII Score', 'Price', 'Price Change', 'Market Cap', 'P/E', 'Ticker', 'Tech Score'] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

const SIGNAL_COLORS: Record<Signal, string> = {
  BUY: '#26a69a',
  HOLD: '#ffa726',
  SELL: '#ef5350',
};

const GRADE_COLORS: Record<Grade, string> = {
  A: '#26a69a',
  B: '#66bb6a',
  C: '#ffa726',
  D: '#ff7043',
  F: '#ef5350',
};

// ─── Template Definitions ───

interface Template {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  filters: Partial<ScreenerFilters>;
}

const TEMPLATES: Template[] = [
  {
    id: 'ai-top-picks',
    label: 'AI Top Picks',
    icon: 'sparkles',
    filters: { aiScoreMin: 6, aiScoreMax: 10, signals: ['BUY'], sortBy: 'FII Score' },
  },
  {
    id: 'value-plays',
    label: 'Value Plays',
    icon: 'diamond-outline',
    filters: { signals: ['BUY'], marketCaps: ['Large', 'Mega'], sortBy: 'FII Score' },
  },
  {
    id: 'momentum-leaders',
    label: 'Momentum Leaders',
    icon: 'rocket-outline',
    filters: { signals: ['BUY'], sortBy: 'Price Change' },
  },
  {
    id: 'dividend-stars',
    label: 'Dividend Stars',
    icon: 'cash-outline',
    filters: { marketCaps: ['Large', 'Mega'], sortBy: 'FII Score' },
  },
  {
    id: 'undervalued-ai',
    label: 'Undervalued by AI',
    icon: 'trending-up-outline',
    filters: { aiScoreMin: 6, aiScoreMax: 10, sortBy: 'FII Score' },
  },
  {
    id: 'risk-alerts',
    label: 'Risk Alerts',
    icon: 'warning-outline',
    filters: { aiScoreMin: 1, aiScoreMax: 5, signals: ['SELL'], sortBy: 'FII Score' },
  },
];

// ─── Types ───

interface ScreenerFilters {
  aiScoreMin: number;
  aiScoreMax: number;
  techScoreMin: number;
  techScoreMax: number;
  signals: Signal[];
  sectors: Sector[];
  grades: Grade[];
  marketCaps: MarketCap[];
  sortBy: SortOption;
}

interface ScreenerResult {
  ticker: string;
  companyName: string;
  price: number;
  change: number;
  changePercent: number;
  aiScore: number | null;
  technicalScore: number | null;
  fundamentalGrade: string | null;
  signal: Signal | null;
  confidence: string | null;
  sector: string;
  marketCap: number | null;
  marketCapLabel: string;
  tier: string;
  isETF: boolean;
}

const DEFAULT_FILTERS: ScreenerFilters = {
  aiScoreMin: 1,
  aiScoreMax: 10,
  techScoreMin: 1,
  techScoreMax: 10,
  signals: [],
  sectors: [],
  grades: [],
  marketCaps: [],
  sortBy: 'FII Score',
};

// ─── Helpers ───

const getAiScoreColor = (score: number): string => {
  if (score >= 8) return '#26a69a';
  if (score >= 6) return '#66bb6a';
  if (score >= 4) return '#ffa726';
  if (score >= 2) return '#ff7043';
  return '#ef5350';
};

// ─── Component ───

export const ScreenerScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Watchlist integration
  const watchlistTickers = useWatchlistStore((s) => s.getAllWatchlistTickers());
  const isInAnyWatchlist = useWatchlistStore((s) => s.isInAnyWatchlist);
  const addTicker = useWatchlistStore((s) => s.addTicker);
  const removeTicker = useWatchlistStore((s) => s.removeTicker);
  const activeWatchlistId = useWatchlistStore((s) => s.activeWatchlistId);

  // State
  const [filters, setFilters] = useState<ScreenerFilters>({ ...DEFAULT_FILTERS });
  const [pendingFilters, setPendingFilters] = useState<ScreenerFilters>({ ...DEFAULT_FILTERS });
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const PAGE_SIZE = 50;

  // ─── Data Fetching ───

  const _buildParams = useCallback((appliedFilters: ScreenerFilters, offset = 0) => {
    const params: Record<string, any> = { limit: String(PAGE_SIZE), offset: String(offset) };
    if (appliedFilters.aiScoreMin > 1 || appliedFilters.aiScoreMax < 10) {
      params.aiScore = `${appliedFilters.aiScoreMin},${appliedFilters.aiScoreMax}`;
    }
    if (appliedFilters.techScoreMin > 1 || appliedFilters.techScoreMax < 10) {
      params.technicalScore = `${appliedFilters.techScoreMin},${appliedFilters.techScoreMax}`;
    }
    if (appliedFilters.signals.length > 0) params.signal = appliedFilters.signals.join(',');
    if (appliedFilters.sectors.length > 0) params.sector = appliedFilters.sectors.join(',');
    if (appliedFilters.grades.length > 0) params.fundamentalGrade = appliedFilters.grades.join(',');
    if (appliedFilters.marketCaps.length > 0) params.marketCap = appliedFilters.marketCaps.join(',');
    const sortMap: Record<string, string> = {
      'FII Score': 'aiScore', 'Price': 'price', 'Price Change': 'changePercent',
      'Market Cap': 'marketCap', 'P/E': 'peRatio', 'Ticker': 'ticker',
      'Tech Score': 'technicalScore',
    };
    if (appliedFilters.sortBy) params.sortBy = sortMap[appliedFilters.sortBy] || 'changePercent';
    if (appliedFilters.sortBy === 'Ticker') params.sortDir = 'asc';
    return params;
  }, []);

  const _parseItems = (data: any): ScreenerResult[] =>
    (data?.results || data?.items || []).map((item: any) => ({
      ticker: item.ticker || '',
      companyName: item.companyName || item.company_name || '',
      price: item.price ?? 0,
      change: item.change ?? 0,
      changePercent: item.changePercent ?? item.change_percent ?? 0,
      aiScore: item.aiScore ?? null,
      technicalScore: item.technicalScore ?? null,
      fundamentalGrade: item.fundamentalGrade ?? null,
      signal: item.signal || null,
      confidence: item.confidence || null,
      sector: item.sector || '',
      marketCap: item.marketCap ?? null,
      marketCapLabel: item.marketCapLabel || '',
      tier: item.tier || 'TIER_3',
      isETF: item.isETF ?? false,
    }));

  const fetchResults = useCallback(async (appliedFilters: ScreenerFilters) => {
    setError(null);
    try {
      const params = _buildParams(appliedFilters, 0);
      const data = await getScreener(params);
      const items = _parseItems(data);
      setResults(items);
      setTotalCount(data?.total ?? items.length);
      setHasMore(data?.hasMore ?? false);
      setCurrentOffset(PAGE_SIZE);
    } catch (err: any) {
      setError('Failed to load screener results. Pull to refresh.');
      setResults([]);
    }
  }, [_buildParams]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params = _buildParams(filters, currentOffset);
      const data = await getScreener(params);
      const items = _parseItems(data);
      setResults(prev => [...prev, ...items]);
      setHasMore(data?.hasMore ?? false);
      setCurrentOffset(prev => prev + PAGE_SIZE);
    } catch {
      // Silently fail on load more
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, filters, currentOffset, _buildParams]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchResults(filters);
    setLoading(false);
  }, [filters, fetchResults]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchResults(filters);
    setRefreshing(false);
  }, [filters, fetchResults]);

  // ─── Template Selection ───

  const handleTemplatePress = useCallback(
    (template: Template) => {
      if (activeTemplate === template.id) {
        // Deselect template, reset to defaults
        setActiveTemplate(null);
        const resetFilters = { ...DEFAULT_FILTERS };
        setFilters(resetFilters);
        setPendingFilters(resetFilters);
        return;
      }

      setActiveTemplate(template.id);
      const newFilters: ScreenerFilters = { ...DEFAULT_FILTERS, ...template.filters };
      setFilters(newFilters);
      setPendingFilters(newFilters);
    },
    [activeTemplate],
  );

  // ─── Filter Modal Actions ───

  const openFilterModal = useCallback(() => {
    setPendingFilters({ ...filters });
    setFilterModalVisible(true);
  }, [filters]);

  const closeFilterModal = useCallback(() => {
    setFilterModalVisible(false);
  }, []);

  const applyFilters = useCallback(() => {
    setActiveTemplate(null);
    setFilters({ ...pendingFilters });
    setFilterModalVisible(false);
  }, [pendingFilters]);

  const resetFilters = useCallback(() => {
    setPendingFilters({ ...DEFAULT_FILTERS });
  }, []);

  const resetAndClose = useCallback(() => {
    setActiveTemplate(null);
    setFilters({ ...DEFAULT_FILTERS });
    setPendingFilters({ ...DEFAULT_FILTERS });
    setFilterModalVisible(false);
  }, []);

  // ─── Pending Filter Toggles ───

  const toggleSignal = useCallback((signal: Signal) => {
    setPendingFilters((prev) => {
      const exists = prev.signals.includes(signal);
      return {
        ...prev,
        signals: exists
          ? prev.signals.filter((s) => s !== signal)
          : [...prev.signals, signal],
      };
    });
  }, []);

  const toggleSector = useCallback((sector: Sector) => {
    setPendingFilters((prev) => {
      const exists = prev.sectors.includes(sector);
      return {
        ...prev,
        sectors: exists
          ? prev.sectors.filter((s) => s !== sector)
          : [...prev.sectors, sector],
      };
    });
  }, []);

  const toggleGrade = useCallback((grade: Grade) => {
    setPendingFilters((prev) => {
      const exists = prev.grades.includes(grade);
      return {
        ...prev,
        grades: exists
          ? prev.grades.filter((g) => g !== grade)
          : [...prev.grades, grade],
      };
    });
  }, []);

  const toggleMarketCap = useCallback((cap: MarketCap) => {
    setPendingFilters((prev) => {
      const exists = prev.marketCaps.includes(cap);
      return {
        ...prev,
        marketCaps: exists
          ? prev.marketCaps.filter((c) => c !== cap)
          : [...prev.marketCaps, cap],
      };
    });
  }, []);

  const selectSort = useCallback((sort: SortOption) => {
    setPendingFilters((prev) => ({ ...prev, sortBy: sort }));
  }, []);

  // ─── Navigation ───

  const handleResultPress = useCallback(
    (item: ScreenerResult) => {
      navigation.navigate('SignalDetail', { ticker: item.ticker, feedItemId: item.ticker });
    },
    [navigation],
  );

  // ─── Watchlist Toggle ───

  const toggleWatchlistItem = useCallback(
    (ticker: string, companyName: string) => {
      Vibration.vibrate(10);
      if (isInAnyWatchlist(ticker)) {
        removeTicker(activeWatchlistId, ticker);
      } else {
        addTicker(activeWatchlistId, ticker, companyName);
      }
    },
    [isInAnyWatchlist, addTicker, removeTicker, activeWatchlistId],
  );

  // ─── Active Filter Count ───

  const activeFilterCount = (() => {
    let count = 0;
    if (filters.aiScoreMin > 1 || filters.aiScoreMax < 10) count++;
    if (filters.techScoreMin > 1 || filters.techScoreMax < 10) count++;
    if (filters.signals.length > 0) count++;
    if (filters.sectors.length > 0) count++;
    if (filters.grades.length > 0) count++;
    if (filters.marketCaps.length > 0) count++;
    if (watchlistOnly) count++;
    return count;
  })();

  // ─── Client-side search filter ───

  const filteredResults = useMemo(() => {
    let data = results;
    // Watchlist filter
    if (watchlistOnly) {
      const wlSet = new Set(watchlistTickers);
      data = data.filter((r) => wlSet.has(r.ticker));
    }
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      data = data.filter(
        (r) =>
          r.ticker.toLowerCase().includes(q) ||
          r.companyName.toLowerCase().includes(q),
      );
    }
    return data;
  }, [results, searchQuery, watchlistOnly, watchlistTickers]);

  // ─── Render: Template Chip ───

  const renderTemplateChip = useCallback(
    (template: Template) => {
      const isActive = activeTemplate === template.id;
      return (
        <TouchableOpacity
          key={template.id}
          style={[styles.templateChip, isActive && styles.templateChipActive]}
          onPress={() => handleTemplatePress(template)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${template.label} filter${isActive ? ', selected' : ''}`}
        >
          <Ionicons
            name={template.icon}
            size={16}
            color={isActive ? '#fff' : '#8b949e'}
          />
          <Text style={[styles.templateChipText, isActive && styles.templateChipTextActive]}>
            {template.label}
          </Text>
        </TouchableOpacity>
      );
    },
    [activeTemplate, handleTemplatePress],
  );

  // ─── Render: Result Row ───

  const renderResultItem = useCallback(
    ({ item }: { item: ScreenerResult }) => {
      const changeColor = (item.changePercent ?? 0) >= 0 ? '#26a69a' : '#ef5350';
      const changeSign = (item.changePercent ?? 0) >= 0 ? '+' : '';
      const hasSignal = item.signal != null;
      const signalColor = hasSignal ? SIGNAL_COLORS[item.signal!] : '#8b949e';
      const hasAiScore = item.aiScore != null;
      const aiColor = hasAiScore ? getAiScoreColor(item.aiScore!) : '#8b949e';
      const gradeColor =
        item.fundamentalGrade ? (GRADE_COLORS[item.fundamentalGrade as Grade] || '#8b949e') : '#8b949e';
      const starred = isInAnyWatchlist(item.ticker);

      return (
        <TouchableOpacity
          style={styles.resultRow}
          onPress={() => handleResultPress(item)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${item.ticker} ${item.companyName}, ${hasSignal ? item.signal + ' signal' : 'no signal'}`}
        >
          {/* Star / Watchlist toggle */}
          <TouchableOpacity
            style={styles.starBtn}
            onPress={() => toggleWatchlistItem(item.ticker, item.companyName)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={starred ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            <Ionicons
              name={starred ? 'star' : 'star-outline'}
              size={18}
              color={starred ? '#ffa726' : '#8b949e'}
            />
          </TouchableOpacity>

          <View style={styles.resultLeft}>
            <View style={styles.resultTickerRow}>
              <Text style={styles.resultTicker}>{item.ticker}</Text>
              <View style={[styles.signalBadge, { backgroundColor: signalColor + '20' }]}>
                <Text style={[styles.signalBadgeText, { color: signalColor }]}>
                  {hasSignal ? item.signal : '—'}
                </Text>
              </View>
            </View>
            <Text style={styles.resultCompany} numberOfLines={1}>
              {item.companyName}
            </Text>
          </View>

          <View style={styles.resultCenter}>
            <View style={styles.resultPriceCol}>
              <Text style={styles.resultPrice}>
                {item.price ? `$${item.price.toFixed(2)}` : '—'}
              </Text>
              <Text style={[styles.resultChange, { color: changeColor }]}>
                {changeSign}{(item.changePercent ?? 0).toFixed(2)}%
              </Text>
            </View>
          </View>

          <View style={styles.resultRight}>
            <View style={[styles.aiScoreBadge, { backgroundColor: aiColor + '20' }]}>
              <Text style={[styles.aiScoreText, { color: aiColor }]}>
                {hasAiScore ? item.aiScore!.toFixed(1) : '—'}
              </Text>
            </View>
            <View style={styles.resultMetaRow}>
              {item.technicalScore != null && (
                <>
                  <Text style={styles.resultMetaLabel}>T:</Text>
                  <Text style={styles.resultMetaValue}>
                    {item.technicalScore.toFixed(1)}
                  </Text>
                </>
              )}
              <View style={[styles.gradeBadgeMini, { backgroundColor: gradeColor + '20' }]}>
                <Text style={[styles.gradeBadgeMiniText, { color: gradeColor }]}>
                  {item.fundamentalGrade || '—'}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [handleResultPress, isInAnyWatchlist, toggleWatchlistItem],
  );

  // ─── Render: Loading Skeleton ───

  const renderSkeleton = () => (
    <View style={styles.skeletonContainer}>
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={`skel-${i}`} style={styles.skeletonRow}>
          <View style={styles.skeletonLeft}>
            <Skeleton width={60} height={18} borderRadius={4} />
            <View style={{ height: 6 }} />
            <Skeleton width={120} height={12} borderRadius={4} />
          </View>
          <View style={styles.skeletonCenter}>
            <Skeleton width={60} height={16} borderRadius={4} />
          </View>
          <View style={styles.skeletonRight}>
            <Skeleton width={36} height={28} borderRadius={8} />
          </View>
        </View>
      ))}
    </View>
  );

  // ─── Render: Empty State ───

  const renderEmpty = () => {
    if (loading) return null;
    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color="#8b949e" />
          <Text style={styles.emptyTitle}>{error}</Text>
          <TouchableOpacity style={styles.resetButton} onPress={onRefresh}>
            <Text style={styles.resetButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="filter-outline" size={48} color="#8b949e" />
        <Text style={styles.emptyTitle}>No stocks match your filters.</Text>
        <Text style={styles.emptySubtitle}>Try broadening your criteria.</Text>
        <TouchableOpacity
          style={styles.resetButton}
          onPress={() => {
            setActiveTemplate(null);
            const resetFilters = { ...DEFAULT_FILTERS };
            setFilters(resetFilters);
            setPendingFilters(resetFilters);
          }}
        >
          <Text style={styles.resetButtonText}>Reset Filters</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Render: Header ───

  const renderHeader = () => (
    <View style={styles.resultHeader}>
      <Text style={styles.resultCount}>
        {searchQuery.trim()
          ? `${filteredResults.length} of ${totalCount} stocks`
          : `Showing ${results.length} of ${totalCount} stocks`}
      </Text>
    </View>
  );

  // ─── Render: Filter Chip (for modal) ───

  const renderFilterChip = (
    label: string,
    isActive: boolean,
    onPress: () => void,
    color?: string,
  ) => (
    <TouchableOpacity
      key={label}
      style={[
        styles.filterChip,
        isActive && { backgroundColor: (color || '#26a69a') + '20', borderColor: color || '#26a69a' },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label} filter${isActive ? ', selected' : ''}`}
    >
      <Text
        style={[
          styles.filterChipText,
          isActive && { color: color || '#26a69a' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  // ─── Main Render ───

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <Text style={styles.screenTitle}>Screener</Text>
        <TouchableOpacity style={styles.filterButton} onPress={openFilterModal} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Open filters${activeFilterCount > 0 ? ', ' + activeFilterCount + ' active' : ''}`}>
          <Ionicons name="options-outline" size={18} color="#fff" />
          <Text style={styles.filterButtonText}>Filters</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#8b949e" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by ticker or company..."
          placeholderTextColor="#8b949e"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color="#8b949e" />
          </TouchableOpacity>
        )}
      </View>

      {/* Watchlist Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleBtn, !watchlistOnly && styles.toggleBtnActive]}
          onPress={() => setWatchlistOnly(false)}
          activeOpacity={0.7}
        >
          <Ionicons name="globe-outline" size={14} color={!watchlistOnly ? '#fff' : '#8b949e'} />
          <Text style={[styles.toggleBtnText, !watchlistOnly && styles.toggleBtnTextActive]}>All Stocks</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, watchlistOnly && styles.toggleBtnActive]}
          onPress={() => setWatchlistOnly(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="star" size={14} color={watchlistOnly ? '#ffa726' : '#8b949e'} />
          <Text style={[styles.toggleBtnText, watchlistOnly && styles.toggleBtnTextActive]}>
            My Watchlist{watchlistTickers.length > 0 ? ` (${watchlistTickers.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Template Chips */}
      <View style={styles.templateContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.templateScroll}
        >
          {TEMPLATES.map(renderTemplateChip)}
        </ScrollView>
      </View>

      {/* Sector Heatmap */}
      {results.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <SectorHeatmap
            sectors={(() => {
              const sectorMap: Record<string, { marketCap: number; totalChange: number; count: number }> = {};
              results.forEach((r) => {
                const sec = r.sector || 'Other';
                if (!sectorMap[sec]) sectorMap[sec] = { marketCap: 0, totalChange: 0, count: 0 };
                const mc = typeof r.marketCap === 'number' ? r.marketCap : 0;
                sectorMap[sec].marketCap += mc;
                sectorMap[sec].totalChange += (r.changePercent ?? 0);
                sectorMap[sec].count += 1;
              });
              return Object.entries(sectorMap).map(([sector, data]) => ({
                sector,
                marketCap: data.marketCap,
                changePercent: data.count > 0 ? data.totalChange / data.count : 0,
                stockCount: data.count,
              }));
            })()}
            onSectorPress={(sector) => {
              const next = { ...filters, sectors: [sector] };
              setFilters(next);
              setPendingFilters(next);
              setActiveTemplate(null);
              fetchResults(next);
            }}
            height={140}
          />
        </View>
      )}

      {/* Results List */}
      {loading && filteredResults.length === 0 ? (
        renderSkeleton()
      ) : (
        <FlatList
          data={filteredResults}
          renderItem={renderResultItem}
          keyExtractor={(item, index) => item.ticker || 'item-' + index}
          ListHeaderComponent={filteredResults.length > 0 ? renderHeader : null}
          ListEmptyComponent={renderEmpty}
          onEndReached={searchQuery.trim() ? undefined : loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={filteredResults.length > 0 ? (
            <>
              {!searchQuery.trim() && loadingMore && (
                <ActivityIndicator size="small" color="#60A5FA" style={{ paddingVertical: 12 }} />
              )}
              {!searchQuery.trim() && hasMore && !loadingMore && (
                <Text style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingVertical: 8, fontSize: 12 }}>
                  Scroll for more...
                </Text>
              )}
              <DisclaimerBanner />
            </>
          ) : null}
          contentContainerStyle={filteredResults.length === 0 ? styles.emptyList : styles.resultList}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={15}
          windowSize={7}
          initialNumToRender={15}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#26a69a"
              colors={['#26a69a']}
            />
          }
        />
      )}

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeFilterModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={closeFilterModal} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalContent}
            >
              {/* AI Score Range */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>
                  AI Score: {pendingFilters.aiScoreMin} - {pendingFilters.aiScoreMax}
                </Text>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderEdgeLabel}>Min</Text>
                  <View style={styles.sliderWrapper}>
                    <Slider
                      style={styles.slider}
                      minimumValue={1}
                      maximumValue={10}
                      step={1}
                      value={pendingFilters.aiScoreMin}
                      onValueChange={(val: number) =>
                        setPendingFilters((prev) => ({
                          ...prev,
                          aiScoreMin: Math.min(val, prev.aiScoreMax),
                        }))
                      }
                      minimumTrackTintColor="#26a69a"
                      maximumTrackTintColor="#30363d"
                      thumbTintColor="#26a69a"
                    />
                  </View>
                  <Text style={styles.sliderValueLabel}>{pendingFilters.aiScoreMin}</Text>
                </View>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderEdgeLabel}>Max</Text>
                  <View style={styles.sliderWrapper}>
                    <Slider
                      style={styles.slider}
                      minimumValue={1}
                      maximumValue={10}
                      step={1}
                      value={pendingFilters.aiScoreMax}
                      onValueChange={(val: number) =>
                        setPendingFilters((prev) => ({
                          ...prev,
                          aiScoreMax: Math.max(val, prev.aiScoreMin),
                        }))
                      }
                      minimumTrackTintColor="#26a69a"
                      maximumTrackTintColor="#30363d"
                      thumbTintColor="#26a69a"
                    />
                  </View>
                  <Text style={styles.sliderValueLabel}>{pendingFilters.aiScoreMax}</Text>
                </View>
              </View>

              {/* Signal Toggles */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Signal</Text>
                <View style={styles.chipRow}>
                  {SIGNAL_OPTIONS.map((signal) =>
                    renderFilterChip(
                      signal,
                      pendingFilters.signals.includes(signal),
                      () => toggleSignal(signal),
                      SIGNAL_COLORS[signal],
                    ),
                  )}
                </View>
              </View>

              {/* Sector Multi-Select */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Sector</Text>
                <View style={styles.chipRow}>
                  {SECTORS.map((sector) =>
                    renderFilterChip(
                      sector,
                      pendingFilters.sectors.includes(sector),
                      () => toggleSector(sector),
                    ),
                  )}
                </View>
              </View>

              {/* Technical Score Range */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>
                  Technical Score: {pendingFilters.techScoreMin} - {pendingFilters.techScoreMax}
                </Text>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderEdgeLabel}>Min</Text>
                  <View style={styles.sliderWrapper}>
                    <Slider
                      style={styles.slider}
                      minimumValue={1}
                      maximumValue={10}
                      step={1}
                      value={pendingFilters.techScoreMin}
                      onValueChange={(val: number) =>
                        setPendingFilters((prev) => ({
                          ...prev,
                          techScoreMin: Math.min(val, prev.techScoreMax),
                        }))
                      }
                      minimumTrackTintColor="#26a69a"
                      maximumTrackTintColor="#30363d"
                      thumbTintColor="#26a69a"
                    />
                  </View>
                  <Text style={styles.sliderValueLabel}>{pendingFilters.techScoreMin}</Text>
                </View>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderEdgeLabel}>Max</Text>
                  <View style={styles.sliderWrapper}>
                    <Slider
                      style={styles.slider}
                      minimumValue={1}
                      maximumValue={10}
                      step={1}
                      value={pendingFilters.techScoreMax}
                      onValueChange={(val: number) =>
                        setPendingFilters((prev) => ({
                          ...prev,
                          techScoreMax: Math.max(val, prev.techScoreMin),
                        }))
                      }
                      minimumTrackTintColor="#26a69a"
                      maximumTrackTintColor="#30363d"
                      thumbTintColor="#26a69a"
                    />
                  </View>
                  <Text style={styles.sliderValueLabel}>{pendingFilters.techScoreMax}</Text>
                </View>
              </View>

              {/* Fundamental Grade */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Fundamental Grade</Text>
                <View style={styles.chipRow}>
                  {GRADES.map((grade) =>
                    renderFilterChip(
                      grade,
                      pendingFilters.grades.includes(grade),
                      () => toggleGrade(grade),
                      GRADE_COLORS[grade],
                    ),
                  )}
                </View>
              </View>

              {/* Market Cap */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Market Cap</Text>
                <View style={styles.chipRow}>
                  {MARKET_CAPS.map((cap) =>
                    renderFilterChip(
                      cap,
                      pendingFilters.marketCaps.includes(cap),
                      () => toggleMarketCap(cap),
                    ),
                  )}
                </View>
              </View>

              {/* Sort By */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Sort by</Text>
                <View style={styles.chipRow}>
                  {SORT_OPTIONS.map((sort) =>
                    renderFilterChip(
                      sort,
                      pendingFilters.sortBy === sort,
                      () => selectSort(sort),
                    ),
                  )}
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={resetFilters} activeOpacity={0.7}>
                  <Text style={styles.resetText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.applyButton}
                  onPress={applyFilters}
                  activeOpacity={0.7}
                >
                  <Text style={styles.applyButtonText}>Apply Filters</Text>
                </TouchableOpacity>
              </View>

              {/* Bottom spacing for safe area */}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Styles ───

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },

  // Header Bar
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#0d1117',
  },
  screenTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161b22',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#30363d',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    padding: 0,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161b22',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  filterButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  filterCountBadge: {
    backgroundColor: '#26a69a',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  filterCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  // Watchlist Toggle
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    overflow: 'hidden',
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#21262d',
  },
  toggleBtnText: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: '#fff',
  },

  // Star button on result row
  starBtn: {
    paddingRight: 10,
    paddingVertical: 4,
  },

  // Template Chips
  templateContainer: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  templateScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161b22',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: '#30363d',
    marginRight: 8,
  },
  templateChipActive: {
    backgroundColor: '#26a69a20',
    borderColor: '#26a69a',
  },
  templateChipText: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
  },
  templateChipTextActive: {
    color: '#26a69a',
  },

  // Result List
  resultList: {
    paddingBottom: 40,
  },
  emptyList: {
    flexGrow: 1,
  },
  resultHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  resultCount: {
    color: '#8b949e',
    fontSize: 14,
    fontWeight: '600',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#161b22',
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#21262d',
  },
  resultLeft: {
    flex: 1,
    marginRight: 12,
  },
  resultTickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultTicker: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  resultCompany: {
    color: '#8b949e',
    fontSize: 12,
    marginTop: 2,
  },
  resultCenter: {
    alignItems: 'flex-end',
    marginRight: 12,
  },
  resultPriceCol: {
    alignItems: 'flex-end',
  },
  resultPrice: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  resultChange: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  resultRight: {
    alignItems: 'center',
    gap: 4,
  },
  aiScoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  aiScoreText: {
    fontSize: 15,
    fontWeight: '800',
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultMetaLabel: {
    color: '#8b949e',
    fontSize: 10,
    fontWeight: '600',
  },
  resultMetaValue: {
    color: '#c9d1d9',
    fontSize: 10,
    fontWeight: '700',
  },

  // Signal Badge
  signalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  signalBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Grade Badge Mini
  gradeBadgeMini: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 2,
  },
  gradeBadgeMiniText: {
    fontSize: 10,
    fontWeight: '800',
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  emptyTitle: {
    color: '#c9d1d9',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#8b949e',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  resetButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#26a69a',
    borderRadius: 20,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Skeleton
  skeletonContainer: {
    padding: 12,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161b22',
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#21262d',
  },
  skeletonLeft: {
    flex: 1,
  },
  skeletonCenter: {
    marginRight: 12,
  },
  skeletonRight: {
    alignItems: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#161b22',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#30363d',
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#21262d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },

  // Filter Sections
  filterSection: {
    marginBottom: 24,
  },
  filterLabel: {
    color: '#c9d1d9',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#30363d',
    backgroundColor: '#0d1117',
  },
  filterChipText: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
  },

  // Sliders
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  sliderEdgeLabel: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
    width: 30,
  },
  sliderWrapper: {
    flex: 1,
    marginHorizontal: 4,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderValueLabel: {
    color: '#26a69a',
    fontSize: 14,
    fontWeight: '800',
    width: 24,
    textAlign: 'right',
  },

  // Modal Actions
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#21262d',
  },
  resetText: {
    color: '#8b949e',
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  applyButton: {
    backgroundColor: '#26a69a',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
