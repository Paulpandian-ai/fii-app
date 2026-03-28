import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Animated,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePortfolioStore } from '../store/portfolioStore';
import { useWatchlistStore } from '../store/watchlistStore';
import { useSignalStore } from '../store/signalStore';
import { getPortfolioHealth, getBatchPrices, batchSignals, getSignalDetail } from '../services/api';
import { MiniRadarChart } from '../components/MiniRadarChart';
import { AddHoldingSheet } from '../components/AddHoldingSheet';
import { CSVUploadSheet } from '../components/CSVUploadSheet';
import { SearchOverlay } from '../components/SearchOverlay';
import { SectorPieChart } from '../components/SectorPieChart';
import { TrendingSection } from '../components/TrendingSection';
import { FactorRadarChart } from '../components/FactorRadarChart';
import type { FactorPercentiles } from '../components/FactorRadarChart';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { LiveIndicator } from '../components/LiveIndicator';
import { LastUpdated } from '../components/LastUpdated';
import { RefreshProgressBar } from '../components/RefreshProgressBar';
import { useDataRefresh } from '../hooks/useDataRefresh';
import { dataRefreshManager } from '../services/DataRefreshManager';
import { DisclaimerFooter } from '../components/DisclaimerFooter';
import { SCORE_COLORS, getScoreColor as getScoreColorFromUtil, getScoreLabel as getScoreLabelFromUtil } from '../utils/scoreColors';
import type { Holding, PortfolioHealth, RootStackParamList, Watchlist, WatchlistItem, ScoreLabel } from '../types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constants ───

const COLORS = {
  bg: '#0D1B3E',
  bgEnd: '#1F3864',
  cardBg: 'rgba(255,255,255,0.05)',
  cardBorder: 'rgba(255,255,255,0.06)',
  primary: '#60A5FA',
  green: '#00C9A7',
  red: '#F5A623',
  amber: '#F59E0B',
  textPrimary: '#FFF',
  textSecondary: 'rgba(255,255,255,0.6)',
  textTertiary: 'rgba(255,255,255,0.4)',
  textHint: 'rgba(255,255,255,0.3)',
  divider: 'rgba(255,255,255,0.06)',
};

const SECTOR_COLORS: Record<string, string> = {
  Technology: '#60A5FA',
  Healthcare: '#00C9A7',
  Financials: '#A78BFA',
  'Consumer Disc.': '#F97316',
  'Consumer Staples': '#EC4899',
  Energy: '#F59E0B',
  'Communication Services': '#F5A623',
  Industrials: '#34D399',
  'Real Estate': '#6366F1',
  Materials: '#8B5CF6',
  Utilities: '#14B8A6',
  Other: 'rgba(255,255,255,0.3)',
};

const GRADE_COLORS: Record<string, string> = {
  A: '#00C9A7',
  B: '#34D399',
  C: '#F59E0B',
  D: '#F97316',
  F: '#F5A623',
};

// Fallback sector map for common S&P 500 stocks when enrichment data is missing
const TICKER_SECTOR_MAP: Record<string, string> = {
  'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'GOOG': 'Technology',
  'AMZN': 'Consumer Disc.', 'NVDA': 'Technology', 'META': 'Technology', 'TSLA': 'Consumer Disc.',
  'LLY': 'Healthcare', 'JNJ': 'Healthcare', 'UNH': 'Healthcare', 'PFE': 'Healthcare',
  'ABBV': 'Healthcare', 'MRK': 'Healthcare', 'TMO': 'Healthcare', 'ABT': 'Healthcare',
  'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'SLB': 'Energy', 'EOG': 'Energy',
  'JPM': 'Financials', 'BAC': 'Financials', 'GS': 'Financials', 'WFC': 'Financials',
  'V': 'Financials', 'MA': 'Financials', 'C': 'Financials', 'BLK': 'Financials',
  'PG': 'Consumer Staples', 'KO': 'Consumer Staples', 'PEP': 'Consumer Staples',
  'COST': 'Consumer Staples', 'WMT': 'Consumer Staples', 'PM': 'Consumer Staples',
  'HD': 'Consumer Disc.', 'MCD': 'Consumer Disc.', 'NKE': 'Consumer Disc.', 'SBUX': 'Consumer Disc.',
  'NEE': 'Utilities', 'DUK': 'Utilities', 'SO': 'Utilities', 'D': 'Utilities',
  'DIS': 'Communication Services', 'NFLX': 'Communication Services', 'CMCSA': 'Communication Services',
  'T': 'Communication Services', 'VZ': 'Communication Services',
  'BA': 'Industrials', 'HON': 'Industrials', 'UPS': 'Industrials', 'CAT': 'Industrials',
  'GE': 'Industrials', 'RTX': 'Industrials', 'LMT': 'Industrials', 'DE': 'Industrials',
  'AMT': 'Real Estate', 'PLD': 'Real Estate', 'CCI': 'Real Estate',
  'LIN': 'Materials', 'APD': 'Materials', 'FCX': 'Materials',
  'AVGO': 'Technology', 'CRM': 'Technology', 'ADBE': 'Technology', 'AMD': 'Technology',
  'INTC': 'Technology', 'ORCL': 'Technology', 'CSCO': 'Technology', 'QCOM': 'Technology',
  'IBM': 'Technology', 'TXN': 'Technology', 'NOW': 'Technology', 'INTU': 'Technology',
};

// Normalize various sector name formats to display names
const SECTOR_NAME_NORMALIZE: Record<string, string> = {
  'Information Technology': 'Technology',
  'Info Tech': 'Technology',
  'Consumer Discretionary': 'Consumer Disc.',
  'Consumer Cyclical': 'Consumer Disc.',
  'Consumer Defensive': 'Consumer Staples',
  'Health Care': 'Healthcare',
  'Financial Services': 'Financials',
  'Basic Materials': 'Materials',
  'Communication Svcs': 'Communication Services',
  'Comm Services': 'Communication Services',
};

// ─── Helpers ───

const formatMoney = (n: unknown): string => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${v.toFixed(2)}`;
};

const formatPct = (n: unknown): string => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
};

const getScoreColor = (score: number): string => {
  if (score <= 3) return COLORS.red;
  if (score <= 6) return COLORS.amber;
  return COLORS.green;
};

// ─── Collapsible Section Header ───

interface SectionHeaderProps {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  rightElement?: React.ReactNode;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  collapsed,
  onToggle,
  rightElement,
}) => (
  <TouchableOpacity style={headerStyles.container} onPress={onToggle} activeOpacity={0.7}>
    <View style={headerStyles.left}>
      <Text style={headerStyles.title}>{title}</Text>
      {rightElement}
    </View>
    <Ionicons
      name={collapsed ? 'chevron-down' : 'chevron-up'}
      size={18}
      color={COLORS.textTertiary}
    />
  </TouchableOpacity>
);

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
});

// ─── FII Score Badge ───

const FIIBadge: React.FC<{ score: number; size?: number }> = ({ score, size = 30 }) => {
  const color = getScoreColor(score);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color + '20',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text style={{ color, fontSize: size * 0.38, fontWeight: '800' }}>
        {score.toFixed(1)}
      </Text>
    </View>
  );
};

// ─── Swipeable Watchlist Row ───

const SwipeableWatchlistRow: React.FC<{
  children: React.ReactNode;
  onRemove: () => void;
}> = ({ children, onRemove }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const [swiped, setSwiped] = useState(false);

  const handleToggle = () => {
    Animated.spring(translateX, {
      toValue: swiped ? 0 : -80,
      useNativeDriver: true,
    }).start();
    setSwiped(!swiped);
  };

  const handleRemove = () => {
    Alert.alert('Remove from Watchlist', 'Are you sure you want to remove this stock?', [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          setSwiped(false);
        },
      },
      { text: 'Remove', style: 'destructive', onPress: onRemove },
    ]);
  };

  return (
    <View style={swipeStyles.container}>
      <View style={swipeStyles.actions}>
        <TouchableOpacity style={swipeStyles.deleteBtn} onPress={handleRemove}>
          <Ionicons name="trash" size={18} color="#FFF" />
          <Text style={swipeStyles.deleteText}>Remove</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }], backgroundColor: COLORS.bg }}>
        <TouchableOpacity activeOpacity={0.95} onLongPress={handleToggle}>
          {children}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const swipeStyles = StyleSheet.create({
  container: { position: 'relative', overflow: 'hidden' },
  actions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteBtn: {
    backgroundColor: COLORS.red,
    width: 80,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: { color: '#FFF', fontSize: 10, fontWeight: '600', marginTop: 2 },
});

// ─── Holdings Swipe Row (edit/delete) ───

const HoldingSwipeRow: React.FC<{
  children: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ children, onEdit, onDelete }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const [swiped, setSwiped] = useState(false);

  const handleToggle = () => {
    Animated.spring(translateX, {
      toValue: swiped ? 0 : -140,
      useNativeDriver: true,
    }).start();
    setSwiped(!swiped);
  };

  return (
    <View style={swipeStyles.container}>
      <View style={swipeStyles.actions}>
        <TouchableOpacity
          style={{ backgroundColor: COLORS.amber, width: 70, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center' }}
          onPress={onEdit}
        >
          <Ionicons name="pencil" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600', marginTop: 2 }}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ backgroundColor: COLORS.red, width: 70, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center' }}
          onPress={onDelete}
        >
          <Ionicons name="trash" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600', marginTop: 2 }}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }], backgroundColor: COLORS.bg }}>
        <TouchableOpacity activeOpacity={0.95} onLongPress={handleToggle}>
          {children}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

// ═══════════════════════════════════════════════
// ─── Main Screen ───
// ═══════════════════════════════════════════════

export const PortfolioScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // ── Stores ──
  const {
    holdings,
    totalValue,
    totalCost,
    totalGainLoss,
    totalGainLossPercent,
    dailyChange,
    dailyChangePercent,
    isLoading,
    error,
    lastUpdated,
    loadPortfolio,
    loadSummary,
    removeHolding,
    updatePrices,
  } = usePortfolioStore();

  const {
    watchlists,
    loadWatchlists,
    createWatchlist,
    removeTicker: removeWatchlistTicker,
    addTicker: addWatchlistTicker,
  } = useWatchlistStore();

  const { signals, enrichmentCache } = useSignalStore();

  // ── Local State ──
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sortMode, setSortMode] = useState<'size' | 'score' | 'change'>('size');
  const [healthData, setHealthData] = useState<PortfolioHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [csvVisible, setCsvVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [editHolding, setEditHolding] = useState<Holding | null>(null);
  const [createWlVisible, setCreateWlVisible] = useState(false);
  const [newWlName, setNewWlName] = useState('');
  const [wlCollapsed, setWlCollapsed] = useState<Record<string, boolean>>({});

  const [isPolling, setIsPolling] = useState(false);
  const [wlSignalData, setWlSignalData] = useState<Record<string, any>>({});

  // ─── Data polling: holdings prices every 30s during market hours ───
  useDataRefresh(
    'holdings-prices',
    async () => {
      const tickers = holdings.map((h) => h.ticker);
      if (tickers.length === 0) return;
      setIsPolling(true);
      try {
        const data = await getBatchPrices(tickers);
        if (data?.prices) {
          updatePrices(data.prices);
        }
      } finally {
        setIsPolling(false);
      }
    },
    30_000,
    holdings.length > 0,
  );

  // ─── Data polling: portfolio summary every 60s ───
  useDataRefresh(
    'portfolio-summary',
    async () => {
      await loadSummary();
    },
    60_000,
    holdings.length > 0,
  );

  // ─── Data polling: watchlist prices every 60s ───
  const allWatchlistTickers = useWatchlistStore((s) => s.getAllWatchlistTickers)();
  useDataRefresh(
    'watchlist-prices',
    async () => {
      if (allWatchlistTickers.length === 0) return;
      const data = await getBatchPrices(allWatchlistTickers);
      if (data?.prices) {
        useSignalStore.getState().updateEnrichmentPrices(data.prices);
      }
    },
    60_000,
    allWatchlistTickers.length > 0,
  );

  const hasHoldings = holdings.length > 0;
  const isPositiveDaily = dailyChange >= 0;

  // ── Section Collapse ──
  const toggleSection = useCallback((section: string) => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch {
      // LayoutAnimation can throw on Android in certain RN versions
    }
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const toggleWlCollapse = useCallback((wlId: string) => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch {
      // LayoutAnimation can throw on Android in certain RN versions
    }
    setWlCollapsed((prev) => ({ ...prev, [wlId]: !prev[wlId] }));
  }, []);

  // ── Data Fetching ──
  const loadHealthData = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(false);
    try {
      const data = await getPortfolioHealth();
      setHealthData(data);
    } catch {
      setHealthError(true);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolio();
    loadSummary();
    loadHealthData();
    loadWatchlists();
  }, []);

  // Fetch signal data for watchlist tickers (for rich cards)
  useEffect(() => {
    const allTickers = watchlists.flatMap((wl) => wl.items.map((i) => i.ticker));
    const uniqueTickers = [...new Set(allTickers)].filter((t) => !wlSignalData[t]);
    if (uniqueTickers.length === 0) return;
    let mounted = true;
    (async () => {
      try {
        // Fetch batch signals first
        const batch = await batchSignals(uniqueTickers);
        const signalsArr = batch?.signals || [];
        if (!mounted) return;
        const newData: Record<string, any> = { ...wlSignalData };
        for (const sig of signalsArr) {
          if (sig?.ticker) newData[sig.ticker] = sig;
        }
        setWlSignalData(newData);

        // Also try to get enrichment for tickers that don't have it
        for (const ticker of uniqueTickers) {
          if (enrichmentCache[ticker]) continue;
          try {
            const detail = await getSignalDetail(ticker);
            if (!mounted) return;
            if (detail?.ticker) {
              newData[detail.ticker] = { ...newData[detail.ticker], ...detail };
              setWlSignalData({ ...newData });
            }
          } catch {}
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, [watchlists.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadPortfolio(),
      loadSummary(),
      loadHealthData(),
      loadWatchlists(),
      dataRefreshManager.refreshAll(),
    ]);
    setRefreshing(false);
  }, [loadPortfolio, loadSummary, loadHealthData, loadWatchlists]);

  const handleAddClose = useCallback(() => {
    setAddVisible(false);
    setEditHolding(null);
    loadPortfolio();
    loadSummary();
    loadHealthData();
  }, [loadPortfolio, loadSummary, loadHealthData]);

  const handleCsvClose = useCallback(() => {
    setCsvVisible(false);
    loadPortfolio();
    loadSummary();
    loadHealthData();
  }, [loadPortfolio, loadSummary, loadHealthData]);

  const handleSearchSelect = useCallback(
    (ticker: string) => {
      setSearchVisible(false);
      navigation.navigate('SignalDetail', { ticker });
    },
    [navigation],
  );

  // ── Watchlist Helpers ──
  const handleCreateWatchlist = useCallback(() => {
    const name = newWlName.trim();
    if (!name) return;
    createWatchlist(name);
    setNewWlName('');
    setCreateWlVisible(false);
  }, [newWlName, createWatchlist]);

  const showWlItemOptions = useCallback(
    (watchlistId: string, item: WatchlistItem) => {
      const otherWatchlists = watchlists.filter((w) => w.id !== watchlistId);

      const buttons: any[] = [
        { text: 'Cancel', style: 'cancel' },
      ];

      if (otherWatchlists.length > 0) {
        buttons.push({
          text: 'Move to...',
          onPress: () => {
            Alert.alert(
              `Move ${item.ticker} to...`,
              'Select a watchlist',
              [
                { text: 'Cancel', style: 'cancel' },
                ...otherWatchlists.map((wl) => ({
                  text: wl.name,
                  onPress: () => {
                    addWatchlistTicker(wl.id, item.ticker, item.companyName);
                    removeWatchlistTicker(watchlistId, item.ticker);
                  },
                })),
              ],
            );
          },
        });
      }

      buttons.push({
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeWatchlistTicker(watchlistId, item.ticker),
      });

      Alert.alert(item.ticker, 'What would you like to do?', buttons);
    },
    [watchlists, addWatchlistTicker, removeWatchlistTicker],
  );

  const getWlAvgScore = useCallback(
    (wl: Watchlist): number => {
      if (wl.items.length === 0) return 0;
      let sum = 0;
      let count = 0;
      for (const item of wl.items) {
        const signal = signals[item.ticker];
        const score = signal?.score ?? item.score;
        if (score != null && score > 0) {
          sum += score;
          count += 1;
        }
      }
      return count > 0 ? sum / count : 0;
    },
    [signals],
  );

  // ── Computed: Sector Allocation ──
  const sectorData = useMemo(() => {
    if (!hasHoldings) return [];
    const sectorMap: Record<string, number> = {};
    for (const h of holdings) {
      const enrichment = enrichmentCache[h.ticker];
      // Try enrichment sector, then normalize, then fallback map
      let rawSector = enrichment?.sector || TICKER_SECTOR_MAP[h.ticker] || 'Other';
      const sector = SECTOR_NAME_NORMALIZE[rawSector] || rawSector;
      sectorMap[sector] = (sectorMap[sector] || 0) + (h.totalValue || 0);
    }
    return Object.entries(sectorMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name,
        value,
        color: SECTOR_COLORS[name] || 'rgba(255,255,255,0.3)',
      }));
  }, [holdings, enrichmentCache, hasHoldings]);

  // ── Computed: Weighted FII Score ──
  const weightedFIIScore = useMemo(() => {
    if (!hasHoldings) return 0;
    let totalWeight = 0;
    let weightedSum = 0;
    for (const h of holdings) {
      const signal = signals[h.ticker];
      if (signal) {
        const weight = h.totalValue || 0;
        weightedSum += signal.score * weight;
        totalWeight += weight;
      }
    }
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }, [holdings, signals, hasHoldings]);

  // ── Computed: Portfolio Factor Percentiles (Part A) ──
  const portfolioFactorPercentiles = useMemo((): FactorPercentiles => {
    const defaultPct: FactorPercentiles = {
      supply_chain_upstream: 50,
      supply_chain_downstream: 50,
      geopolitical: 50,
      monetary: 50,
      correlations: 50,
      performance: 50,
    };
    if (!hasHoldings) return defaultPct;

    const dims: (keyof FactorPercentiles)[] = [
      'supply_chain_upstream', 'supply_chain_downstream', 'geopolitical',
      'monetary', 'correlations', 'performance',
    ];
    const dimNameMap: Record<string, keyof FactorPercentiles> = {
      supplyChain: 'supply_chain_upstream',
      supply_chain_upstream: 'supply_chain_upstream',
      supply_chain_downstream: 'supply_chain_downstream',
      geopolitical: 'geopolitical',
      monetary: 'monetary',
      correlations: 'correlations',
      performance: 'performance',
      macroGeo: 'geopolitical',
      technical: 'performance',
      fundamental: 'correlations',
      sentiment: 'monetary',
    };

    const weightedSums: Record<string, number> = {};
    let totalWeight = 0;

    for (const dim of dims) weightedSums[dim] = 0;

    for (const h of holdings) {
      const enrichment = enrichmentCache[h.ticker];
      const weight = h.totalValue || 0;
      if (!enrichment || weight <= 0) continue;

      const dimScores = enrichment.dimensionScores || {};
      totalWeight += weight;

      for (const [rawKey, rawVal] of Object.entries(dimScores)) {
        const mappedKey = dimNameMap[rawKey];
        if (mappedKey && typeof rawVal === 'number') {
          // dimensionScores are 0-10, convert to percentile (0-100)
          weightedSums[mappedKey] += (rawVal / 10) * 100 * weight;
        }
      }
    }

    if (totalWeight <= 0) return defaultPct;

    const result = { ...defaultPct };
    for (const dim of dims) {
      result[dim] = Math.round(weightedSums[dim] / totalWeight);
    }
    return result;
  }, [holdings, enrichmentCache, hasHoldings]);

  // ── Computed: Strongest & Weakest Factor ──
  const { strongestFactor, weakestFactor } = useMemo(() => {
    const labels: Record<keyof FactorPercentiles, string> = {
      supply_chain_upstream: 'Suppliers',
      supply_chain_downstream: 'Customers',
      geopolitical: 'Geo Risk',
      monetary: 'Rate Impact',
      correlations: 'Market Sync',
      performance: 'Earnings',
    };

    const entries = Object.entries(portfolioFactorPercentiles) as [keyof FactorPercentiles, number][];
    if (entries.length === 0) return { strongestFactor: '', weakestFactor: '' };

    const sorted = [...entries].sort((a, b) => b[1] - a[1]);
    const strongest = sorted[0];
    const weakest = sorted[sorted.length - 1];

    return {
      strongestFactor: `Strongest factor: ${labels[strongest[0]]} (${strongest[1]}th percentile)`,
      weakestFactor: `Weakest factor: ${labels[weakest[0]]} (${weakest[1]}th percentile)`,
    };
  }, [portfolioFactorPercentiles]);

  // ── Computed: Portfolio Factor Insights (Part D) ──
  const portfolioInsights = useMemo(() => {
    if (!hasHoldings) return [];
    const insights: { icon: string; text: string }[] = [];

    // Check for weak dimensions (< 30th percentile)
    const dimLabels: Record<keyof FactorPercentiles, string> = {
      supply_chain_upstream: 'supplier',
      supply_chain_downstream: 'customer',
      geopolitical: 'geo risk',
      monetary: 'rate impact',
      correlations: 'market sync',
      performance: 'earnings',
    };

    for (const [key, val] of Object.entries(portfolioFactorPercentiles) as [keyof FactorPercentiles, number][]) {
      if (val < 30) {
        insights.push({
          icon: 'information-circle-outline',
          text: `Your portfolio has limited ${dimLabels[key]} exposure (${val}th percentile). Portfolios with concentrated factor profiles historically experience higher volatility.`,
        });
        break; // Only show one weak-dimension insight
      }
    }

    // Check for sector concentration
    if (sectorData.length > 0) {
      const totalSectorValue = sectorData.reduce((sum, s) => sum + s.value, 0);
      const topSector = sectorData[0]; // already sorted desc
      if (totalSectorValue > 0) {
        const topPct = (topSector.value / totalSectorValue) * 100;
        if (topPct >= 60) {
          insights.push({
            icon: 'pie-chart-outline',
            text: `${topPct.toFixed(0)}% of your portfolio is in ${topSector.name}. Sector concentration increases sensitivity to industry-specific events.`,
          });
        }
      }
    }

    // High average score observation
    if (weightedFIIScore >= 7) {
      insights.push({
        icon: 'trending-up-outline',
        text: `Your portfolio's average factor score is ${weightedFIIScore.toFixed(1)}, placing it in the upper tier of portfolio factor profiles.`,
      });
    }

    return insights.slice(0, 3);
  }, [hasHoldings, portfolioFactorPercentiles, sectorData, weightedFIIScore]);

  // ── Computed: Risk Level ──
  const { riskLevel, riskScore } = useMemo(() => {
    if (!healthData) return { riskLevel: 'Medium', riskScore: 50 };
    const score = healthData.riskBalance.score;
    const level = score >= 70 ? 'Low' : score >= 40 ? 'Medium' : 'High';
    return { riskLevel: level, riskScore: Math.round(100 - score) }; // invert: higher = riskier
  }, [healthData]);

  // ── Computed: Diversification & Risk Factor ──
  const { divScore, topRiskFactor } = useMemo(() => {
    if (!hasHoldings) return { divScore: 20, topRiskFactor: '' };

    const sectorMap: Record<string, number> = {};
    let totalVal = 0;
    for (const h of holdings) {
      const rawSector = enrichmentCache[h.ticker]?.sector || TICKER_SECTOR_MAP[h.ticker] || 'Unknown';
      const sector = SECTOR_NAME_NORMALIZE[rawSector] || rawSector;
      const val = h.totalValue || 0;
      sectorMap[sector] = (sectorMap[sector] || 0) + val;
      totalVal += val;
    }

    const sectorCount = Object.keys(sectorMap).filter((s) => s !== 'Unknown').length;
    const maxConcentration = totalVal > 0 ? Math.max(...Object.values(sectorMap)) / totalVal : 1;

    // Compute a 0-100 score based on concentration and sector count
    let score: number;
    if (maxConcentration >= 0.8) score = 15;
    else if (maxConcentration >= 0.6) score = 30;
    else if (sectorCount >= 5) score = 90;
    else if (sectorCount >= 4) score = 75;
    else if (sectorCount >= 3) score = 55;
    else score = 35;

    // Refine score based on how spread the sectors are
    const evenness = 1 - maxConcentration; // 0 = all in one, 1 = perfectly spread
    score = Math.round(score * 0.7 + evenness * 100 * 0.3);

    let risk = '';
    if (maxConcentration >= 0.6) {
      const topSector = Object.entries(sectorMap).sort((a, b) => b[1] - a[1])[0];
      risk = `High ${topSector[0]} concentration (${(maxConcentration * 100).toFixed(0)}%)`;
    } else if (healthData?.suggestions?.[0]) {
      risk = healthData.suggestions[0];
    } else if (sectorCount < 3) {
      risk = 'Low sector diversification';
    } else {
      risk = 'Portfolio is well-balanced';
    }

    return { divScore: Math.min(100, Math.max(0, score)), topRiskFactor: risk };
  }, [holdings, enrichmentCache, healthData, hasHoldings]);

  // ── Computed: Sorted Holdings ──
  const sortedHoldings = useMemo(() => {
    const sorted = [...holdings];
    switch (sortMode) {
      case 'score':
        sorted.sort((a, b) => (signals[b.ticker]?.score ?? 0) - (signals[a.ticker]?.score ?? 0));
        break;
      case 'change':
        sorted.sort(
          (a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0),
        );
        break;
      default:
        sorted.sort((a, b) => (b.totalValue ?? 0) - (a.totalValue ?? 0));
    }
    return sorted;
  }, [holdings, sortMode, signals]);

  // ═══════ LOADING STATE ═══════
  if (isLoading && holdings.length === 0) {
    return (
      <LinearGradient colors={[COLORS.bg, COLORS.bgEnd]} style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>Portfolio</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Skeleton width={'90%'} height={140} borderRadius={16} />
          <View style={{ height: 16 }} />
          <Skeleton width={'90%'} height={100} borderRadius={12} />
          <View style={{ height: 12 }} />
          <Skeleton width={'90%'} height={60} borderRadius={12} />
          <View style={{ height: 12 }} />
          <Skeleton width={'90%'} height={60} borderRadius={12} />
          <View style={{ height: 12 }} />
          <Skeleton width={'90%'} height={60} borderRadius={12} />
        </View>
      </LinearGradient>
    );
  }

  // ═══════ ERROR STATE ═══════
  if (error && holdings.length === 0) {
    return (
      <LinearGradient colors={[COLORS.bg, COLORS.bgEnd]} style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>Portfolio</Text>
        </View>
        <ErrorState
          message={error}
          onRetry={() => {
            loadPortfolio();
            loadSummary();
          }}
        />
      </LinearGradient>
    );
  }

  // ═══════ MAIN RENDER ═══════

  return (
    <LinearGradient colors={[COLORS.bg, COLORS.bgEnd]} style={styles.container}>
      <RefreshProgressBar visible={isPolling} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.topTitle}>Portfolio</Text>
          <LiveIndicator />
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setSearchVisible(true)}>
            <Ionicons name="search" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* ═══════ 1. PORTFOLIO SUMMARY ═══════ */}

        {lastUpdated > 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 4 }}>
            <LastUpdated timestamp={lastUpdated} />
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.staticHeader}>
            <Text style={styles.sectionTitle}>Portfolio Summary</Text>
          </View>

          {hasHoldings ? (
            <View style={styles.card}>
              <Text style={styles.totalValue}>{formatMoney(totalValue)}</Text>

              {/* Daily Change — single clear number */}
              <View style={styles.changeRow}>
                <Ionicons
                  name={isPositiveDaily ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={isPositiveDaily ? COLORS.green : COLORS.red}
                />
                <Text
                  style={[styles.changeText, { color: isPositiveDaily ? COLORS.green : COLORS.red }]}
                >
                  {isPositiveDaily ? '+' : ''}
                  {formatMoney(dailyChange)} ({formatPct(dailyChangePercent)}) today
                </Text>
              </View>

              {/* Total Gain/Loss */}
              {totalGainLoss !== 0 && (
                <Text
                  style={[
                    styles.totalGainLossText,
                    { color: totalGainLoss >= 0 ? COLORS.green : COLORS.red },
                  ]}
                >
                  Total gain/loss: {totalGainLoss >= 0 ? '+' : ''}
                  {formatMoney(totalGainLoss)} ({formatPct(totalGainLossPercent)})
                </Text>
              )}

              {/* Sector Allocation Donut Chart */}
              {sectorData.length > 0 && (
                <View style={styles.pieContainer}>
                  <Text style={styles.pieLabel}>Sector Allocation</Text>
                  <SectorPieChart sectors={sectorData} size={100} />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="pie-chart-outline" size={36} color={COLORS.textHint} />
              <Text style={styles.emptyText}>
                Add your first stock to see portfolio summary
              </Text>
              <View style={styles.addBtnsRow}>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => setAddVisible(true)}>
                  <Ionicons name="add" size={16} color="#FFF" />
                  <Text style={styles.primaryBtnText}>Add Manually</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.outlineBtn} onPress={() => setCsvVisible(true)}>
                  <Ionicons name="cloud-upload-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.outlineBtnText}>Upload CSV</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ═══════ 2. PORTFOLIO FACTOR PROFILE (Part A) ═══════ */}

        <View style={styles.section}>
          <SectionHeader
            title="Portfolio Factor Profile"
            collapsed={!!collapsed.health}
            onToggle={() => toggleSection('health')}
          />

          {!collapsed.health && (
            <>
              {!hasHoldings ? (
                <View style={styles.emptyBody}>
                  <Ionicons name="analytics-outline" size={32} color={COLORS.textHint} />
                  <Text style={styles.emptyText}>Add holdings to see your portfolio factor profile</Text>
                </View>
              ) : (
                <View style={styles.sectionBody}>
                  {/* Full-size radar chart (200x200) */}
                  <View style={styles.radarContainer}>
                    <View style={{ transform: [{ scale: 200 / 260 }] }}>
                      <FactorRadarChart
                        factorPercentiles={portfolioFactorPercentiles}
                        compositeScore={weightedFIIScore}
                        scoreLabel={getScoreLabelFromUtil(weightedFIIScore)}
                        size="full"
                        showBenchmark={true}
                      />
                    </View>
                  </View>
                  <Text style={styles.radarLabel}>Your Portfolio Factor Profile</Text>

                  {/* Factor analysis summary */}
                  <View style={styles.factorSummaryRow}>
                    <Text style={styles.factorSummaryText}>{strongestFactor}</Text>
                  </View>
                  <View style={styles.factorSummaryRow}>
                    <Text style={styles.factorSummaryText}>{weakestFactor}</Text>
                  </View>

                  {/* Health grid kept compact */}
                  <View style={[styles.healthGrid, { marginTop: 12 }]}>
                    <View style={styles.healthItem}>
                      <Text style={styles.healthLabel}>Risk Level</Text>
                      <Text
                        style={[
                          styles.healthValue,
                          {
                            color:
                              riskLevel === 'Low'
                                ? COLORS.green
                                : riskLevel === 'Medium'
                                  ? COLORS.amber
                                  : COLORS.red,
                          },
                        ]}
                      >
                        {riskLevel}
                      </Text>
                      {/* Risk bar */}
                      <View style={styles.scoreBarBg}>
                        <View style={[styles.scoreBarFill, {
                          width: `${riskScore}%`,
                          backgroundColor: riskLevel === 'Low' ? COLORS.green : riskLevel === 'Medium' ? COLORS.amber : COLORS.red,
                        }]} />
                      </View>
                      <Text style={styles.scoreBarLabel}>{riskScore}/100</Text>
                    </View>

                    <View style={styles.healthItem}>
                      <Text style={styles.healthLabel}>Diversification</Text>
                      <Text
                        style={[
                          styles.healthValue,
                          { color: divScore >= 60 ? COLORS.green : divScore >= 30 ? COLORS.amber : COLORS.red },
                        ]}
                      >
                        {divScore}
                      </Text>
                      {/* Diversification bar */}
                      <View style={styles.scoreBarBg}>
                        <View style={[styles.scoreBarFill, {
                          width: `${divScore}%`,
                          backgroundColor: divScore >= 60 ? COLORS.green : divScore >= 30 ? COLORS.amber : COLORS.red,
                        }]} />
                      </View>
                      <Text style={styles.scoreBarLabel}>{divScore}/100</Text>
                    </View>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* ═══════ 2b. PORTFOLIO FACTOR INSIGHTS (Part D) ═══════ */}

        {hasHoldings && portfolioInsights.length > 0 && (
          <View style={styles.section}>
            <View style={styles.staticHeader}>
              <Text style={styles.sectionTitle}>Portfolio Factor Insights</Text>
            </View>
            <View style={styles.sectionBody}>
              {portfolioInsights.map((insight, idx) => (
                <View key={idx} style={styles.insightCard}>
                  <Ionicons name={insight.icon as any} size={16} color={COLORS.primary} />
                  <Text style={styles.insightText}>{insight.text}</Text>
                </View>
              ))}
              <Text style={styles.insightDisclaimer}>
                Factor analysis is for educational purposes only. Past factor performance does not guarantee future results. This is not investment advice.
              </Text>
            </View>
          </View>
        )}

        {/* ═══════ 3. HOLDINGS (collapsible) ═══════ */}

        <View style={styles.section}>
          <SectionHeader
            title={`Holdings${hasHoldings ? ` (${holdings.length})` : ''}`}
            collapsed={!!collapsed.holdings}
            onToggle={() => toggleSection('holdings')}
            rightElement={
              hasHoldings ? (
                <TouchableOpacity
                  onPress={() => setAddVisible(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="add-circle" size={20} color={COLORS.primary} />
                </TouchableOpacity>
              ) : undefined
            }
          />

          {!collapsed.holdings && (
            <>
              {hasHoldings ? (
                <>
                  {/* Sort pills */}
                  <View style={styles.sortRow}>
                    {(['size', 'score', 'change'] as const).map((mode) => (
                      <TouchableOpacity
                        key={mode}
                        style={[styles.sortPill, sortMode === mode && styles.sortPillActive]}
                        onPress={() => setSortMode(mode)}
                      >
                        <Text
                          style={[
                            styles.sortText,
                            sortMode === mode && styles.sortTextActive,
                          ]}
                        >
                          {mode === 'size'
                            ? 'Position'
                            : mode === 'score'
                              ? 'FII Score'
                              : 'Daily Change'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Holdings list — with radar thumbnails (Part B) */}
                  {sortedHoldings.map((item) => {
                    const signal = signals[item.ticker];
                    const enrichment = enrichmentCache[item.ticker];
                    const isPositive = (item.gainLoss || 0) >= 0;
                    const positionValue = (item.currentPrice ?? 0) * item.shares;
                    const gainLoss = item.gainLoss || 0;
                    const gainLossPct = item.gainLossPercent || 0;

                    // Build factor percentiles from enrichment dimensionScores
                    const holdingFP: FactorPercentiles = {
                      supply_chain_upstream: 50,
                      supply_chain_downstream: 50,
                      geopolitical: 50,
                      monetary: 50,
                      correlations: 50,
                      performance: 50,
                    };
                    if (enrichment?.dimensionScores) {
                      const ds = enrichment.dimensionScores;
                      const dimMap: Record<string, keyof FactorPercentiles> = {
                        supplyChain: 'supply_chain_upstream',
                        supply_chain_upstream: 'supply_chain_upstream',
                        supply_chain_downstream: 'supply_chain_downstream',
                        geopolitical: 'geopolitical',
                        macroGeo: 'geopolitical',
                        monetary: 'monetary',
                        sentiment: 'monetary',
                        correlations: 'correlations',
                        fundamental: 'correlations',
                        performance: 'performance',
                        technical: 'performance',
                      };
                      for (const [k, v] of Object.entries(ds)) {
                        const mapped = dimMap[k];
                        if (mapped && typeof v === 'number') {
                          holdingFP[mapped] = Math.round((v / 10) * 100);
                        }
                      }
                    }

                    return (
                      <HoldingSwipeRow
                        key={item.id}
                        onEdit={() => {
                          setEditHolding(item);
                          setAddVisible(true);
                        }}
                        onDelete={() => removeHolding(item.id)}
                      >
                        <TouchableOpacity
                          style={styles.holdingRow}
                          activeOpacity={0.8}
                          onPress={() =>
                            navigation.navigate('SignalDetail', {
                              ticker: item.ticker,
                              companyName: item.companyName,
                            })
                          }
                        >
                          {/* Radar thumbnail (40x40) */}
                          <View style={styles.holdingRadarThumb}>
                            <View style={{ transform: [{ scale: 40 / 72 }] }}>
                              <FactorRadarChart
                                factorPercentiles={holdingFP}
                                compositeScore={signal?.score ?? 5}
                                scoreLabel={signal?.scoreLabel ?? 'Neutral'}
                                size="thumbnail"
                              />
                            </View>
                          </View>

                          {/* Left: Ticker + Company */}
                          <View style={styles.holdingLeft}>
                            <View style={styles.holdingTickerRow}>
                              <Text style={styles.holdingTicker} numberOfLines={1}>
                                {item.ticker}
                              </Text>
                              {signal && <FIIBadge score={signal.score} size={22} />}
                            </View>
                            <Text style={styles.holdingCompany} numberOfLines={1}>
                              {item.companyName}
                            </Text>
                          </View>

                          {/* Middle: Price + Shares */}
                          <View style={styles.holdingMiddle}>
                            <Text style={styles.holdingPrice} numberOfLines={1}>
                              ${(item.currentPrice ?? 0).toFixed(2)}
                            </Text>
                            <Text style={styles.holdingShares}>
                              {item.shares} shares
                            </Text>
                          </View>

                          {/* Right: Total Value + Gain/Loss */}
                          <View style={styles.holdingRight}>
                            <Text style={styles.holdingTotalValue} numberOfLines={1}>
                              {formatMoney(positionValue)}
                            </Text>
                            <Text
                              style={[
                                styles.holdingGainLoss,
                                { color: isPositive ? COLORS.green : COLORS.red },
                              ]}
                              numberOfLines={1}
                            >
                              {isPositive ? '+' : ''}
                              {formatMoney(gainLoss)} ({formatPct(gainLossPct)})
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </HoldingSwipeRow>
                    );
                  })}

                  {/* Manage buttons */}
                  <View style={styles.manageRow}>
                    <TouchableOpacity style={styles.manageBtnPrimary} onPress={() => setAddVisible(true)}>
                      <Ionicons name="add" size={16} color="#FFF" />
                      <Text style={styles.manageBtnPrimaryText}>Add</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.manageBtnOutline} onPress={() => setCsvVisible(true)}>
                      <Ionicons name="cloud-upload-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.manageBtnOutlineText}>CSV</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.emptyBody}>
                  <Ionicons name="search-outline" size={32} color={COLORS.textHint} />
                  <Text style={styles.emptyText}>
                    Search stocks in the Screener to add holdings
                  </Text>
                  <View style={styles.addBtnsRow}>
                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={() => setAddVisible(true)}
                    >
                      <Ionicons name="add" size={16} color="#FFF" />
                      <Text style={styles.primaryBtnText}>Add Manually</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.outlineBtn}
                      onPress={() => setCsvVisible(true)}
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.outlineBtnText}>Upload CSV</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* ═══════ 4. TRENDING NOW ═══════ */}

        <TrendingSection />

        {/* ═══════ 5. WATCHLISTS (collapsible) ═══════ */}

        <View style={styles.section}>
          <SectionHeader
            title="Watchlists"
            collapsed={!!collapsed.watchlist}
            onToggle={() => toggleSection('watchlist')}
            rightElement={
              <TouchableOpacity
                onPress={() => setCreateWlVisible(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="add-circle" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            }
          />

          {!collapsed.watchlist && (
            <View>
              {watchlists.map((wl) => {
                const isExpanded = !wlCollapsed[wl.id];
                const avgScore = getWlAvgScore(wl);

                return (
                  <View key={wl.id}>
                    {/* Watchlist header */}
                    <TouchableOpacity
                      style={styles.wlHeader}
                      activeOpacity={0.7}
                      onPress={() => toggleWlCollapse(wl.id)}
                    >
                      <Ionicons
                        name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                        size={16}
                        color={COLORS.textTertiary}
                      />
                      <Text style={styles.wlName} numberOfLines={1}>
                        {wl.name}
                      </Text>
                      <View style={styles.wlCountBadge}>
                        <Text style={styles.wlCountText}>{wl.items.length}</Text>
                      </View>
                      {avgScore > 0 && <FIIBadge score={avgScore} size={22} />}
                    </TouchableOpacity>

                    {/* Rich watchlist cards */}
                    {isExpanded && wl.items.length > 0 &&
                      wl.items.map((item) => {
                        const itemSignal = signals[item.ticker];
                        const sigData = wlSignalData[item.ticker];
                        const wlEnrichment = enrichmentCache[item.ticker];
                        const isUp = (item.changePercent ?? 0) >= 0;
                        const itemScore = itemSignal?.score ?? item.score ?? 5;
                        const itemLabel = itemSignal?.scoreLabel ?? getScoreLabelFromUtil(itemScore);
                        const scoreColor = getScoreColorFromUtil(itemScore);

                        // Sector from enrichment or fallback
                        const rawSector = wlEnrichment?.sector || TICKER_SECTOR_MAP[item.ticker] || '';
                        const sector = SECTOR_NAME_NORMALIZE[rawSector] || rawSector;

                        // Metrics
                        const peRatio = wlEnrichment?.peRatio ?? sigData?.pe_ratio ?? sigData?.trailingPE;
                        const marketCap = wlEnrichment?.marketCap ?? sigData?.market_cap ?? sigData?.marketCap ?? 0;
                        const w52Low = wlEnrichment?.w52Low ?? sigData?.fiftyTwoWeekLow;
                        const w52High = wlEnrichment?.w52High ?? sigData?.fiftyTwoWeekHigh;
                        const price = item.price ?? wlEnrichment?.price ?? 0;

                        // Format market cap
                        const fmtMCap = marketCap >= 1e12 ? `$${(marketCap / 1e12).toFixed(1)}T`
                          : marketCap >= 1e9 ? `$${(marketCap / 1e9).toFixed(1)}B`
                          : marketCap >= 1e6 ? `$${(marketCap / 1e6).toFixed(0)}M` : '';

                        // Score drivers
                        const drivers = sigData?.score_drivers ?? sigData?.scoreDrivers;
                        let driverArr: any[] = [];
                        try {
                          driverArr = typeof drivers === 'string' ? JSON.parse(drivers) : (Array.isArray(drivers) ? drivers : []);
                        } catch {}
                        const topDriver = driverArr[0];

                        // Build enriched factors (positive and negative)
                        const enrichedFactors = wlEnrichment?.enrichedFactors ?? [];
                        const posFactors = enrichedFactors.filter((f: any) => f.score > 0).slice(0, 2);
                        const negFactors = enrichedFactors.filter((f: any) => f.score < 0).slice(0, 2);

                        // Mini radar scores from enrichment dimensionScores
                        const dimScores = wlEnrichment?.dimensionScores || {};
                        const dimMap: Record<string, string> = {
                          supplyChain: 'supply_chain_upstream',
                          supply_chain_upstream: 'supply_chain_upstream',
                          supply_chain_downstream: 'supply_chain_downstream',
                          geopolitical: 'geopolitical',
                          macroGeo: 'geopolitical',
                          monetary: 'monetary',
                          sentiment: 'monetary',
                          correlations: 'correlations',
                          fundamental: 'correlations',
                          performance: 'risk_performance',
                          technical: 'risk_performance',
                        };
                        const radarScores = {
                          supply_chain_upstream: 50,
                          supply_chain_downstream: 50,
                          geopolitical: 50,
                          monetary: 50,
                          correlations: 50,
                          risk_performance: 50,
                        };
                        for (const [k, v] of Object.entries(dimScores)) {
                          const mapped = dimMap[k];
                          if (mapped && typeof v === 'number') {
                            (radarScores as any)[mapped] = Math.round((v / 10) * 100);
                          }
                        }

                        // 52-week position
                        const w52Pct = (w52Low != null && w52High != null && w52High > w52Low && price > 0)
                          ? Math.max(0, Math.min(100, ((price - w52Low) / (w52High - w52Low)) * 100))
                          : null;

                        // Factor label rename map
                        const factorRename: Record<string, string> = {
                          'Supply Chain (Upstream)': 'Suppliers',
                          'Supply Chain (Downstream)': 'Customers',
                          'Supply Chain': 'Suppliers',
                          'Geopolitical': 'Geo Risk',
                          'Monetary': 'Rate Impact',
                          'Monetary Policy': 'Rate Impact',
                          'Correlations': 'Market Sync',
                          'Performance': 'Earnings',
                          'Risk & Performance': 'Earnings',
                        };

                        return (
                          <SwipeableWatchlistRow
                            key={item.ticker}
                            onRemove={() => removeWatchlistTicker(wl.id, item.ticker)}
                          >
                            <TouchableOpacity
                              style={styles.wlCard}
                              activeOpacity={0.8}
                              onPress={() =>
                                navigation.navigate('SignalDetail', {
                                  ticker: item.ticker,
                                  companyName: item.companyName,
                                })
                              }
                              onLongPress={() => showWlItemOptions(wl.id, item)}
                            >
                              {/* Row 1: Header — Ticker, Company, Score, Label */}
                              <View style={styles.wlCardHeader}>
                                <View style={{ flex: 1 }}>
                                  <View style={styles.wlCardTickerRow}>
                                    <Text style={styles.wlCardTicker}>{item.ticker}</Text>
                                    <Text style={styles.wlCardCompany} numberOfLines={1}>{item.companyName}</Text>
                                  </View>
                                  <View style={styles.wlCardPriceRow}>
                                    <Text style={styles.wlCardPrice}>{price ? `$${price.toFixed(2)}` : '\u2014'}</Text>
                                    <Text style={[styles.wlCardChange, { color: isUp ? COLORS.green : COLORS.red }]}>
                                      {isUp ? '\u25B2' : '\u25BC'}{isUp ? '+' : ''}{(item.changePercent ?? 0).toFixed(1)}%
                                    </Text>
                                    {sector ? <Text style={styles.wlCardSector}>{sector}</Text> : null}
                                  </View>
                                </View>
                                <View style={[styles.wlCardScoreBadge, { backgroundColor: scoreColor + '20' }]}>
                                  <Text style={[styles.wlCardScoreNum, { color: scoreColor }]}>{itemScore.toFixed(1)}</Text>
                                  <Text style={[styles.wlCardScoreLabel, { color: scoreColor }]}>{itemLabel}</Text>
                                </View>
                              </View>

                              {/* Row 2: Mini radar + Key metrics */}
                              <View style={styles.wlCardBody}>
                                <MiniRadarChart scores={radarScores} size={64} />
                                <View style={styles.wlCardMetrics}>
                                  {peRatio != null && peRatio > 0 && (
                                    <View style={styles.wlCardMetricItem}>
                                      <Text style={styles.wlCardMetricLabel}>P/E</Text>
                                      <Text style={styles.wlCardMetricValue}>{peRatio.toFixed(0)}</Text>
                                    </View>
                                  )}
                                  {fmtMCap ? (
                                    <View style={styles.wlCardMetricItem}>
                                      <Text style={styles.wlCardMetricLabel}>MCap</Text>
                                      <Text style={styles.wlCardMetricValue}>{fmtMCap}</Text>
                                    </View>
                                  ) : null}
                                </View>
                              </View>

                              {/* Row 3: Key signal / driver */}
                              {topDriver?.description && (
                                <View style={styles.wlCardSignalRow}>
                                  <Ionicons name="key-outline" size={12} color={COLORS.primary} />
                                  <Text style={styles.wlCardSignalText} numberOfLines={2}>
                                    {topDriver.description}
                                  </Text>
                                </View>
                              )}

                              {/* Row 4: Factor chips */}
                              {(posFactors.length > 0 || negFactors.length > 0) && (
                                <View style={styles.wlCardFactors}>
                                  {posFactors.map((f: any, i: number) => (
                                    <View key={`p${i}`} style={[styles.wlCardChip, { backgroundColor: 'rgba(0,201,167,0.12)' }]}>
                                      <Text style={[styles.wlCardChipText, { color: COLORS.green }]}>
                                        {'\u2197'} {factorRename[f.name] || f.name} +{f.score.toFixed(1)}
                                      </Text>
                                    </View>
                                  ))}
                                  {negFactors.map((f: any, i: number) => (
                                    <View key={`n${i}`} style={[styles.wlCardChip, { backgroundColor: 'rgba(245,166,35,0.12)' }]}>
                                      <Text style={[styles.wlCardChipText, { color: COLORS.red }]}>
                                        {'\u2198'} {factorRename[f.name] || f.name} {f.score.toFixed(1)}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              )}

                              {/* Row 5: 52-week range bar */}
                              {w52Pct != null && w52Low != null && w52High != null && (
                                <View style={styles.wlCard52w}>
                                  <Text style={styles.wlCard52wLabel}>52W</Text>
                                  <Text style={styles.wlCard52wVal}>${w52Low.toFixed(0)}</Text>
                                  <View style={styles.wlCard52wBar}>
                                    <View style={styles.wlCard52wTrack} />
                                    <View style={[styles.wlCard52wDot, { left: `${w52Pct}%` }]} />
                                  </View>
                                  <Text style={styles.wlCard52wVal}>${w52High.toFixed(0)}</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          </SwipeableWatchlistRow>
                        );
                      })}

                    {/* Empty watchlist state */}
                    {isExpanded && wl.items.length === 0 && (
                      <View style={styles.wlEmpty}>
                        <Text style={styles.emptyText}>No stocks in this watchlist</Text>
                        <TouchableOpacity
                          style={styles.wlAddStockBtn}
                          onPress={() => setSearchVisible(true)}
                        >
                          <Ionicons name="add" size={14} color={COLORS.primary} />
                          <Text style={styles.wlAddStockText}>Add Stock</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Add to Watchlist button */}
              <TouchableOpacity
                style={styles.createWlBtn}
                onPress={() => setSearchVisible(true)}
              >
                <Ionicons name="add-circle-outline" size={16} color={COLORS.primary} />
                <Text style={styles.createWlText}>+ Add to Watchlist</Text>
              </TouchableOpacity>

              {/* Create New Watchlist button */}
              <TouchableOpacity
                style={[styles.createWlBtn, { marginTop: 0 }]}
                onPress={() => setCreateWlVisible(true)}
              >
                <Ionicons name="folder-open-outline" size={16} color={COLORS.textTertiary} />
                <Text style={[styles.createWlText, { color: COLORS.textTertiary }]}>Create New Watchlist</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <DisclaimerFooter />

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals */}
      <AddHoldingSheet visible={addVisible} onClose={handleAddClose} />
      <CSVUploadSheet visible={csvVisible} onClose={handleCsvClose} />
      <SearchOverlay
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        onSelectTicker={handleSearchSelect}
        mode="navigate"
      />

      {/* Create Watchlist Modal */}
      <Modal
        visible={Boolean(createWlVisible)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCreateWlVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCreateWlVisible(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.modalTitle}>Create New Watchlist</Text>
            <TextInput
              style={styles.modalInput}
              value={newWlName}
              onChangeText={setNewWlName}
              placeholder="e.g. Tech Picks, Dividend Stocks..."
              placeholderTextColor={COLORS.textHint}
              autoFocus={true}
              maxLength={30}
              onSubmitEditing={handleCreateWatchlist}
              returnKeyType="done"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setNewWlName('');
                  setCreateWlVisible(false);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalCreateBtn,
                  !newWlName.trim() && { opacity: 0.4 },
                ]}
                onPress={handleCreateWatchlist}
                disabled={newWlName.trim().length === 0}
              >
                <Text style={styles.modalCreateText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </LinearGradient>
  );
};

// ═══════════════════════════════════════════════
// ─── Styles ───
// ═══════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  topTitle: { color: '#FFF', fontSize: 28, fontWeight: '800' },
  topBarLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Sections
  section: {
    marginBottom: 8,
  },
  staticHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  // Part A: Radar container
  radarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    marginBottom: 4,
    overflow: 'hidden',
  },
  radarLabel: {
    color: COLORS.textTertiary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  factorSummaryRow: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  factorSummaryText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  // Part D: Insight cards
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(96,165,250,0.06)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.1)',
  },
  insightText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  insightDisclaimer: {
    color: COLORS.textHint,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // Part B: Holding radar thumbnail
  holdingRadarThumb: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // Part E: Watchlist radar thumbnail
  wlRadarThumb: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // Card (Summary)
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 16,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
  },
  totalValue: {
    color: '#FFF',
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 6,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  totalGainLossText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  pieContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    width: '100%',
  },
  pieLabel: {
    color: COLORS.textTertiary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Empty states
  emptyCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 24,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    gap: 10,
  },
  emptyBody: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyText: {
    color: COLORS.textHint,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Error states
  errorBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  errorText: {
    color: COLORS.textTertiary,
    fontSize: 13,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(96,165,250,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.2)',
  },
  retryText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
  },

  // Add buttons
  addBtnsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 4,
  },
  primaryBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.4)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 4,
  },
  outlineBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },

  // ─── Health Section ───
  healthGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  healthItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  healthLabel: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  healthValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  scoreBarBg: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 4,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  scoreBarLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  riskFactorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(245,158,11,0.06)',
    borderRadius: 10,
    padding: 10,
  },
  riskFactorText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  // ─── Holdings Section ───
  sortRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sortPillActive: {
    backgroundColor: 'rgba(96,165,250,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
  },
  sortText: {
    color: COLORS.textTertiary,
    fontSize: 12,
    fontWeight: '600',
  },
  sortTextActive: {
    color: COLORS.primary,
  },

  holdingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    backgroundColor: COLORS.bg,
    gap: 10,
  },
  holdingLeft: {
    flex: 1,
    minWidth: 0,
  },
  holdingTickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  holdingTicker: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  holdingCompany: {
    color: COLORS.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  holdingMiddle: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  holdingPrice: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  holdingShares: {
    color: COLORS.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  holdingRight: {
    alignItems: 'flex-end',
    minWidth: 90,
  },
  holdingTotalValue: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  holdingGainLoss: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  manageRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  manageBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  manageBtnPrimaryText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  manageBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.4)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  manageBtnOutlineText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },

  // ─── Watchlist Section ───
  wlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    gap: 8,
  },
  wlName: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  wlCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  wlCountText: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontWeight: '700',
  },
  // Rich watchlist card styles
  wlCard: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  wlCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  wlCardTickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  wlCardTicker: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  wlCardCompany: {
    color: COLORS.textTertiary,
    fontSize: 12,
    flex: 1,
  },
  wlCardPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wlCardPrice: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  wlCardChange: {
    fontSize: 13,
    fontWeight: '700',
  },
  wlCardSector: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontWeight: '500',
  },
  wlCardScoreBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 56,
  },
  wlCardScoreNum: {
    fontSize: 16,
    fontWeight: '800',
  },
  wlCardScoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  wlCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  wlCardMetrics: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  wlCardMetricItem: {
    alignItems: 'center',
  },
  wlCardMetricLabel: {
    color: COLORS.textTertiary,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 1,
  },
  wlCardMetricValue: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  wlCardSignalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(96,165,250,0.06)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  wlCardSignalText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  wlCardFactors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  wlCardChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  wlCardChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  wlCard52w: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wlCard52wLabel: {
    color: COLORS.textHint,
    fontSize: 10,
    fontWeight: '600',
  },
  wlCard52wVal: {
    color: COLORS.textHint,
    fontSize: 10,
    fontWeight: '500',
    minWidth: 28,
  },
  wlCard52wBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  wlCard52wTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  wlCard52wDot: {
    position: 'absolute',
    top: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    marginLeft: -5,
  },
  wlEmpty: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  wlAddStockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  wlAddStockText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  createWlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  createWlText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '600',
  },

  // ─── Create Watchlist Modal ───
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  modalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalCreateBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  modalCreateText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
