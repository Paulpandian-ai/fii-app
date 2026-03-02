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
  SectionList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Skeleton } from '../components/Skeleton';
import { FactorRadarChart } from '../components/FactorRadarChart';
import type { FactorPercentiles } from '../components/FactorRadarChart';
import { SectorHeatmap } from '../components/SectorHeatmap';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { LiveIndicator } from '../components/LiveIndicator';
import { LastUpdated } from '../components/LastUpdated';
import { RefreshProgressBar } from '../components/RefreshProgressBar';
import { getScreener, getScreenerTemplates, getScreenerSectors } from '../services/api';
import { useWatchlistStore } from '../store/watchlistStore';
import { useDataRefresh } from '../hooks/useDataRefresh';
import { useShallow } from 'zustand/react/shallow';
import type { ScoreLabel, RootStackParamList } from '../types';
import { SCORE_COLORS, getScoreColor } from '../utils/scoreColors';

// ─── Constants ───

const SCREEN_WIDTH = Dimensions.get('window').width;

const SCORE_LABEL_OPTIONS: ScoreLabel[] = ['Strong', 'Favorable', 'Neutral', 'Weak', 'Caution'];

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

// Part C: Extended sort options
const SORT_OPTIONS = [
  'FII Score',
  'Percentile Rank',
  'Supply Chain \u2191',
  'Supply Chain \u2193',
  'Geopolitical',
  'Monetary',
  'Correlations',
  'Performance',
  'Price',
  'Price Change',
  'Market Cap',
  'P/E',
  'Ticker',
  'Tech Score',
] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

const SIGNAL_COLORS = SCORE_COLORS;

const GRADE_COLORS: Record<Grade, string> = {
  A: '#26a69a',
  B: '#66bb6a',
  C: '#ffa726',
  D: '#ff7043',
  F: '#ef5350',
};

// ─── Part A: Factor Filter Chip Definitions ───

interface FactorFilterChip {
  id: string;
  label: string;
  paramKey: string;
  minValue: number;
}

const FACTOR_FILTER_CHIPS: FactorFilterChip[] = [
  { id: 'strong-supply', label: 'Strong Supply Chain', paramKey: 'min_supply_chain', minValue: 70 },
  { id: 'low-geo', label: 'Low Geo Risk', paramKey: 'min_geopolitical', minValue: 70 },
  { id: 'rate-resilient', label: 'Rate Resilient', paramKey: 'min_monetary', minValue: 70 },
  { id: 'momentum', label: 'Momentum', paramKey: 'min_performance', minValue: 80 },
  { id: 'high-corr', label: 'High Correlation', paramKey: 'min_correlations', minValue: 70 },
];

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
    filters: { aiScoreMin: 6, aiScoreMax: 10, scoreLabels: ['Strong', 'Favorable'], sortBy: 'FII Score' },
  },
  {
    id: 'value-plays',
    label: 'Value Plays',
    icon: 'diamond-outline',
    filters: { scoreLabels: ['Strong', 'Favorable'], marketCaps: ['Large', 'Mega'], sortBy: 'FII Score' },
  },
  {
    id: 'momentum-leaders',
    label: 'Momentum Leaders',
    icon: 'rocket-outline',
    filters: { scoreLabels: ['Strong', 'Favorable'], sortBy: 'Price Change' },
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
    filters: { aiScoreMin: 1, aiScoreMax: 5, scoreLabels: ['Caution', 'Weak'], sortBy: 'FII Score' },
  },
];

// ─── Types ───

interface ScreenerFilters {
  aiScoreMin: number;
  aiScoreMax: number;
  techScoreMin: number;
  techScoreMax: number;
  scoreLabels: ScoreLabel[];
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
  scoreLabel: ScoreLabel | null;
  confidence: string | null;
  sector: string;
  marketCap: number | null;
  marketCapLabel: string;
  tier: string;
  isETF: boolean;
  percentileRank: number | null;
  sectorPercentile: number | null;
  factorPercentiles: FactorPercentiles | null;
  scoreDrivers: Array<{ factor: string; direction: string; description: string }> | null;
}

interface SectorSummary {
  name: string;
  stockCount: number;
  avgScore: number;
  topStock: { ticker: string; score: number };
}

const DEFAULT_FILTERS: ScreenerFilters = {
  aiScoreMin: 1,
  aiScoreMax: 10,
  techScoreMin: 1,
  techScoreMax: 10,
  scoreLabels: [],
  sectors: [],
  grades: [],
  marketCaps: [],
  sortBy: 'FII Score',
};

// ─── Helpers ───

const getPercentileLabel = (pct: number | null): string => {
  if (pct == null || pct <= 0) return '';
  if (pct >= 95) return 'Top 5%';
  if (pct >= 90) return 'Top 10%';
  if (pct >= 85) return 'Top 15%';
  if (pct >= 80) return 'Top 20%';
  if (pct >= 75) return 'Top 25%';
  if (pct >= 50) return `Top ${100 - pct}%`;
  return '';
};

const DEFAULT_FACTOR_PERCENTILES: FactorPercentiles = {
  supply_chain_upstream: 50,
  supply_chain_downstream: 50,
  geopolitical: 50,
  monetary: 50,
  correlations: 50,
  performance: 50,
};

// ─── Memoized Row Component (Part D) ───

interface ResultRowProps {
  item: ScreenerResult;
  onPress: (item: ScreenerResult) => void;
  onToggleWatchlist: (ticker: string, companyName: string) => void;
  isStarred: boolean;
  showSectorPercentile: boolean;
}

const ResultRowInner: React.FC<ResultRowProps> = ({
  item,
  onPress,
  onToggleWatchlist,
  isStarred,
  showSectorPercentile,
}) => {
  const changeColor = (item.changePercent ?? 0) >= 0 ? '#26a69a' : '#ef5350';
  const changeSign = (item.changePercent ?? 0) >= 0 ? '+' : '';
  const hasScoreLabel = item.scoreLabel != null;
  const signalColor = hasScoreLabel ? SIGNAL_COLORS[item.scoreLabel!] : '#8b949e';
  const hasAiScore = item.aiScore != null;
  const aiColor = hasAiScore ? getScoreColor(item.aiScore!) : '#8b949e';
  const pctLabel = getPercentileLabel(
    showSectorPercentile ? item.sectorPercentile : item.percentileRank,
  );

  const fp = item.factorPercentiles ?? DEFAULT_FACTOR_PERCENTILES;

  return (
    <TouchableOpacity
      style={styles.resultRow}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${item.ticker} ${item.companyName}, ${hasScoreLabel ? item.scoreLabel + ' score' : 'no score'}`}
    >
      {/* Radar Thumbnail (72x72 scaled to 40x40) */}
      <View style={styles.radarThumb}>
        <View style={{ transform: [{ scale: 40 / 72 }] }}>
          <FactorRadarChart
            factorPercentiles={fp}
            compositeScore={item.aiScore ?? 5}
            scoreLabel={item.scoreLabel ?? 'Neutral'}
            size="thumbnail"
          />
        </View>
      </View>

      <View style={styles.resultLeft}>
        <View style={styles.resultTickerRow}>
          <Text style={styles.resultTicker}>{item.ticker}</Text>
          <TouchableOpacity
            onPress={() => onToggleWatchlist(item.ticker, item.companyName)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={isStarred ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            <Ionicons
              name={isStarred ? 'star' : 'star-outline'}
              size={14}
              color={isStarred ? '#ffa726' : '#8b949e'}
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.resultCompany} numberOfLines={1}>
          {item.companyName}
        </Text>
      </View>

      <View style={styles.resultRight}>
        <View style={[styles.aiScoreBadge, { backgroundColor: signalColor + '20' }]}>
          <Text style={[styles.aiScoreText, { color: signalColor }]}>
            {hasAiScore ? item.aiScore!.toFixed(1) : '\u2014'}
          </Text>
        </View>
        <Text style={[styles.scoreLabelText, { color: signalColor }]}>
          {hasScoreLabel ? item.scoreLabel : ''}
        </Text>
        {pctLabel ? (
          <Text style={styles.percentileText}>{pctLabel}</Text>
        ) : null}
        <View style={styles.resultPriceCol}>
          <Text style={styles.resultPrice}>
            {item.price ? `$${item.price.toFixed(2)}` : '\u2014'}
          </Text>
          <Text style={[styles.resultChange, { color: changeColor }]}>
            {changeSign}{(item.changePercent ?? 0).toFixed(2)}%
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const ResultRow = React.memo(ResultRowInner, (prev, next) => {
  return (
    prev.item.ticker === next.item.ticker &&
    prev.item.aiScore === next.item.aiScore &&
    prev.item.price === next.item.price &&
    prev.item.changePercent === next.item.changePercent &&
    prev.item.scoreLabel === next.item.scoreLabel &&
    prev.item.percentileRank === next.item.percentileRank &&
    prev.item.sectorPercentile === next.item.sectorPercentile &&
    prev.isStarred === next.isStarred &&
    prev.showSectorPercentile === next.showSectorPercentile
  );
});

// ─── Sector Card Component (Part E) ───

interface SectorCardProps {
  sector: SectorSummary;
  onPress: (sectorName: string) => void;
  isActive: boolean;
}

const SectorCardInner: React.FC<SectorCardProps> = ({ sector, onPress, isActive }) => {
  const scoreColor = getScoreColor(sector.avgScore);
  return (
    <TouchableOpacity
      style={[
        styles.sectorCard,
        isActive && { borderColor: '#60A5FA', backgroundColor: '#60A5FA10' },
      ]}
      onPress={() => onPress(sector.name)}
      activeOpacity={0.7}
    >
      <Text style={styles.sectorCardName} numberOfLines={1}>{sector.name}</Text>
      <View style={styles.sectorCardRow}>
        <Text style={styles.sectorCardTicker}>{sector.topStock.ticker}</Text>
        <Text style={[styles.sectorCardScore, { color: scoreColor }]}>
          {sector.topStock.score.toFixed(1)}
        </Text>
      </View>
      <Text style={styles.sectorCardCount}>{sector.stockCount} stocks</Text>
    </TouchableOpacity>
  );
};

const SectorCard = React.memo(SectorCardInner);

// ─── Component ───

export const ScreenerScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Watchlist integration
  const watchlistTickers = useWatchlistStore(useShallow((s) => s.getAllWatchlistTickers()));
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
  const [screenerLastUpdated, setScreenerLastUpdated] = useState(0);
  const [isPolling, setIsPolling] = useState(false);

  // Part A: Factor filter chips state
  const [activeFactorChips, setActiveFactorChips] = useState<Set<string>>(new Set());

  // Part B: Sector view toggle state
  const [sectorViewActive, setSectorViewActive] = useState(false);

  // Part E: Sector summaries
  const [sectorSummaries, setSectorSummaries] = useState<SectorSummary[]>([]);
  const [activeSectorCard, setActiveSectorCard] = useState<string | null>(null);

  // ─── Data polling: screener refresh every 60s (only when tab is active) ───
  useDataRefresh(
    'screener',
    async () => {
      setIsPolling(true);
      try {
        const params = _buildParams(filters);
        const data = await getScreener(params);
        const items: ScreenerResult[] = _parseItems(data);
        if (items.length > 0) {
          setResults(items);
          setTotalCount(data?.total ?? items.length);
          setScreenerLastUpdated(Date.now());
        }
      } finally {
        setIsPolling(false);
      }
    },
    60_000,
  );
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
    if (appliedFilters.scoreLabels.length > 0) params.scoreLabel = appliedFilters.scoreLabels.join(',');
    if (appliedFilters.sectors.length > 0) params.sector = appliedFilters.sectors.join(',');
    if (appliedFilters.grades.length > 0) params.fundamentalGrade = appliedFilters.grades.join(',');
    if (appliedFilters.marketCaps.length > 0) params.marketCap = appliedFilters.marketCaps.join(',');

    // Part C: Extended sort mapping
    const sortMap: Record<string, string> = {
      'FII Score': 'aiScore',
      'Percentile Rank': 'percentileRank',
      'Supply Chain \u2191': 'supplyChain',
      'Supply Chain \u2193': 'supplyChain',
      'Geopolitical': 'geopolitical',
      'Monetary': 'monetary',
      'Correlations': 'correlations',
      'Performance': 'performance',
      'Price': 'price',
      'Price Change': 'changePercent',
      'Market Cap': 'marketCap',
      'P/E': 'peRatio',
      'Ticker': 'ticker',
      'Tech Score': 'technicalScore',
    };
    if (appliedFilters.sortBy) params.sortBy = sortMap[appliedFilters.sortBy] || 'changePercent';
    if (appliedFilters.sortBy === 'Ticker') params.sortDir = 'asc';
    if (appliedFilters.sortBy === 'Supply Chain \u2193') params.sortDir = 'asc';

    // Part A: Factor filter chip params
    activeFactorChips.forEach((chipId) => {
      const chip = FACTOR_FILTER_CHIPS.find((c) => c.id === chipId);
      if (chip) params[chip.paramKey] = String(chip.minValue);
    });

    // Part E: Sector card filter
    if (activeSectorCard) {
      params.sector = activeSectorCard;
    }

    return params;
  }, [activeFactorChips, activeSectorCard]);

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
      scoreLabel: item.scoreLabel ?? item.score_label ?? null,
      confidence: item.confidence || null,
      sector: item.sector || '',
      marketCap: item.marketCap ?? null,
      marketCapLabel: item.marketCapLabel || '',
      tier: item.tier || 'TIER_3',
      isETF: item.isETF ?? false,
      percentileRank: item.percentile_rank ?? item.percentileRank ?? null,
      sectorPercentile: item.sector_percentile ?? item.sectorPercentile ?? null,
      factorPercentiles: item.factor_percentiles ?? item.factorPercentiles ?? null,
      scoreDrivers: item.score_drivers ?? item.scoreDrivers ?? null,
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

  // Part E: Load sector summaries on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await getScreenerSectors();
        if (data?.sectors) {
          setSectorSummaries(data.sectors);
        }
      } catch {
        // Sector cards are optional, fail silently
      }
    })();
  }, []);

  // Refetch when factor chips or sector card change
  useEffect(() => {
    fetchResults(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFactorChips, activeSectorCard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchResults(filters);
    setRefreshing(false);
  }, [filters, fetchResults]);

  // ─── Template Selection ───

  const handleTemplatePress = useCallback(
    (template: Template) => {
      if (activeTemplate === template.id) {
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

  // ─── Part A: Factor Chip Toggle ───

  const toggleFactorChip = useCallback((chipId: string) => {
    setActiveFactorChips((prev) => {
      const next = new Set(prev);
      if (next.has(chipId)) {
        next.delete(chipId);
      } else {
        next.add(chipId);
      }
      return next;
    });
  }, []);

  // ─── Part B: Sector View Toggle ───

  const toggleSectorView = useCallback(() => {
    setSectorViewActive((prev) => !prev);
  }, []);

  // ─── Part E: Sector Card Press ───

  const handleSectorCardPress = useCallback((sectorName: string) => {
    setActiveSectorCard((prev) => (prev === sectorName ? null : sectorName));
  }, []);

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

  const toggleScoreLabel = useCallback((label: ScoreLabel) => {
    setPendingFilters((prev) => {
      const exists = prev.scoreLabels.includes(label);
      return {
        ...prev,
        scoreLabels: exists
          ? prev.scoreLabels.filter((s) => s !== label)
          : [...prev.scoreLabels, label],
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
    if (filters.scoreLabels.length > 0) count++;
    if (filters.sectors.length > 0) count++;
    if (filters.grades.length > 0) count++;
    if (filters.marketCaps.length > 0) count++;
    if (watchlistOnly) count++;
    if (activeFactorChips.size > 0) count += activeFactorChips.size;
    return count;
  })();

  // ─── Client-side search filter ───

  const filteredResults = useMemo(() => {
    let data = results;
    if (watchlistOnly) {
      const wlSet = new Set(watchlistTickers);
      data = data.filter((r) => wlSet.has(r.ticker));
    }
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

  // ─── Part B: Sector-grouped sections ───

  const sectorSections = useMemo(() => {
    if (!sectorViewActive) return [];
    const sectorMap = new Map<string, { items: ScreenerResult[]; totalScore: number }>();

    filteredResults.forEach((r) => {
      const sec = r.sector || 'Other';
      if (!sectorMap.has(sec)) {
        sectorMap.set(sec, { items: [], totalScore: 0 });
      }
      const entry = sectorMap.get(sec)!;
      entry.items.push(r);
      entry.totalScore += (r.aiScore ?? 0);
    });

    const sections = Array.from(sectorMap.entries()).map(([sector, data]) => {
      const sorted = [...data.items].sort(
        (a, b) => (b.sectorPercentile ?? 0) - (a.sectorPercentile ?? 0),
      );
      return {
        title: sector,
        stockCount: data.items.length,
        avgScore: data.items.length > 0 ? data.totalScore / data.items.length : 0,
        data: sorted,
      };
    });

    sections.sort((a, b) => b.avgScore - a.avgScore);
    return sections;
  }, [sectorViewActive, filteredResults]);

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
    ({ item }: { item: ScreenerResult }) => (
      <ResultRow
        item={item}
        onPress={handleResultPress}
        onToggleWatchlist={toggleWatchlistItem}
        isStarred={isInAnyWatchlist(item.ticker)}
        showSectorPercentile={sectorViewActive}
      />
    ),
    [handleResultPress, isInAnyWatchlist, toggleWatchlistItem, sectorViewActive],
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
            setActiveFactorChips(new Set());
            setActiveSectorCard(null);
            const rf = { ...DEFAULT_FILTERS };
            setFilters(rf);
            setPendingFilters(rf);
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
      {screenerLastUpdated > 0 && <LastUpdated timestamp={screenerLastUpdated} />}
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

  // ─── Render: Sector Section Header (Part B) ───

  const renderSectionHeader = ({ section }: { section: { title: string; stockCount: number; avgScore: number } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderTitle}>{section.title}</Text>
      <Text style={styles.sectionHeaderMeta}>
        {section.stockCount} stocks
      </Text>
      <View style={[styles.sectionHeaderScoreBadge, { backgroundColor: getScoreColor(section.avgScore) + '20' }]}>
        <Text style={[styles.sectionHeaderScore, { color: getScoreColor(section.avgScore) }]}>
          Avg {section.avgScore.toFixed(1)}
        </Text>
      </View>
    </View>
  );

  // ─── List Footer ───

  const listFooter = filteredResults.length > 0 ? (
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
  ) : null;

  // ─── Main Render ───

  return (
    <View style={styles.container}>
      <RefreshProgressBar visible={isPolling} />

      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.screenTitle}>Screener</Text>
          <LiveIndicator forceActive={!loading && results.length > 0} />
        </View>
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

      {/* Part A: Factor Filter Chips */}
      <View style={styles.factorChipContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.factorChipScroll}
        >
          {FACTOR_FILTER_CHIPS.map((chip) => {
            const isActive = activeFactorChips.has(chip.id);
            return (
              <TouchableOpacity
                key={chip.id}
                style={[
                  styles.factorChip,
                  isActive && styles.factorChipActive,
                ]}
                onPress={() => toggleFactorChip(chip.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.factorChipText, isActive && styles.factorChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Part B: Sector View Toggle (inline with sort indicator) */}
      <View style={styles.viewToggleRow}>
        <Text style={styles.sortIndicator}>
          Sort: {filters.sortBy}
        </Text>
        <TouchableOpacity
          style={[styles.sectorToggleBtn, sectorViewActive && styles.sectorToggleBtnActive]}
          onPress={toggleSectorView}
          activeOpacity={0.7}
        >
          <Ionicons
            name="grid-outline"
            size={14}
            color={sectorViewActive ? '#fff' : '#8b949e'}
          />
          <Text style={[styles.sectorToggleText, sectorViewActive && styles.sectorToggleTextActive]}>
            By Sector
          </Text>
        </TouchableOpacity>
      </View>

      {/* Part E: Top Stocks by Sector (horizontal scroll) */}
      {sectorSummaries.length > 0 && (
        <View style={styles.sectorCardsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sectorCardsScroll}
          >
            {sectorSummaries.map((sec) => (
              <SectorCard
                key={sec.name}
                sector={sec}
                onPress={handleSectorCardPress}
                isActive={activeSectorCard === sec.name}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Sector Heatmap */}
      {results.length > 0 && !sectorViewActive && (
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
      ) : sectorViewActive && sectorSections.length > 0 ? (
        /* Part B: Sector-grouped SectionList */
        <SectionList
          sections={sectorSections}
          renderItem={renderResultItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item, index) => item.ticker || 'item-' + index}
          ListHeaderComponent={filteredResults.length > 0 ? renderHeader : null}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={listFooter}
          contentContainerStyle={filteredResults.length === 0 ? styles.emptyList : styles.resultList}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
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
      ) : (
        <FlatList
          data={filteredResults}
          renderItem={renderResultItem}
          keyExtractor={(item, index) => item.ticker || 'item-' + index}
          ListHeaderComponent={filteredResults.length > 0 ? renderHeader : null}
          ListEmptyComponent={renderEmpty}
          onEndReached={searchQuery.trim() ? undefined : loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={listFooter}
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

              {/* Score Label Toggles */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Score Label</Text>
                <View style={styles.chipRow}>
                  {SCORE_LABEL_OPTIONS.map((label) =>
                    renderFilterChip(
                      label,
                      pendingFilters.scoreLabels.includes(label),
                      () => toggleScoreLabel(label),
                      SIGNAL_COLORS[label],
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

              {/* Part C: Sort By (extended options) */}
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

  // Template Chips
  templateContainer: {
    paddingBottom: 8,
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

  // Part A: Factor Filter Chips
  factorChipContainer: {
    paddingBottom: 8,
  },
  factorChipScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  factorChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#30363d',
    backgroundColor: '#0d1117',
    marginRight: 8,
  },
  factorChipActive: {
    backgroundColor: '#00C9A7',
    borderColor: '#00C9A7',
  },
  factorChipText: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
  },
  factorChipTextActive: {
    color: '#fff',
  },

  // Part B: View Toggle Row
  viewToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  sortIndicator: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
  },
  sectorToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#30363d',
    backgroundColor: '#161b22',
  },
  sectorToggleBtnActive: {
    backgroundColor: '#60A5FA20',
    borderColor: '#60A5FA',
  },
  sectorToggleText: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
  },
  sectorToggleTextActive: {
    color: '#60A5FA',
  },

  // Part E: Sector Cards
  sectorCardsContainer: {
    paddingVertical: 8,
  },
  sectorCardsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  sectorCard: {
    backgroundColor: '#161b22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#21262d',
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 120,
    marginRight: 8,
  },
  sectorCardName: {
    color: '#c9d1d9',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectorCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectorCardTicker: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  sectorCardScore: {
    fontSize: 14,
    fontWeight: '800',
  },
  sectorCardCount: {
    color: '#8b949e',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },

  // Part B: Section Headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    gap: 8,
  },
  sectionHeaderTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  sectionHeaderMeta: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeaderScoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sectionHeaderScore: {
    fontSize: 11,
    fontWeight: '800',
  },

  // Part D: Radar thumbnail in result row
  radarThumb: {
    width: 40,
    height: 40,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#161b22',
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#21262d',
  },
  resultLeft: {
    flex: 1,
    marginRight: 8,
  },
  resultTickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultTicker: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  resultCompany: {
    color: '#8b949e',
    fontSize: 11,
    marginTop: 2,
  },
  resultRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  resultPriceCol: {
    alignItems: 'flex-end',
    marginTop: 2,
  },
  resultPrice: {
    color: '#c9d1d9',
    fontSize: 12,
    fontWeight: '700',
  },
  resultChange: {
    fontSize: 11,
    fontWeight: '600',
  },
  aiScoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  aiScoreText: {
    fontSize: 15,
    fontWeight: '800',
  },
  scoreLabelText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  percentileText: {
    color: '#60A5FA',
    fontSize: 9,
    fontWeight: '600',
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

  // Result meta (kept for backwards compat)
  resultCenter: {
    alignItems: 'flex-end',
    marginRight: 12,
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

  // Star button
  starBtn: {
    paddingRight: 10,
    paddingVertical: 4,
  },
});
