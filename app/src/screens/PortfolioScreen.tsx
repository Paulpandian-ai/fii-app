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
import { getPortfolioHealth } from '../services/api';
import { AddHoldingSheet } from '../components/AddHoldingSheet';
import { CSVUploadSheet } from '../components/CSVUploadSheet';
import { SearchOverlay } from '../components/SearchOverlay';
import { SectorPieChart } from '../components/SectorPieChart';
import { TrendingSection } from '../components/TrendingSection';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import type { Holding, PortfolioHealth, RootStackParamList, Watchlist, WatchlistItem } from '../types';

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
  green: '#10B981',
  red: '#EF4444',
  amber: '#F59E0B',
  textPrimary: '#FFF',
  textSecondary: 'rgba(255,255,255,0.6)',
  textTertiary: 'rgba(255,255,255,0.4)',
  textHint: 'rgba(255,255,255,0.3)',
  divider: 'rgba(255,255,255,0.06)',
};

const SECTOR_COLORS: Record<string, string> = {
  Technology: '#60A5FA',
  Healthcare: '#10B981',
  'Financial Services': '#F59E0B',
  Financials: '#F59E0B',
  'Consumer Cyclical': '#A78BFA',
  'Consumer Defensive': '#EC4899',
  Energy: '#EF4444',
  'Communication Services': '#F97316',
  Industrials: '#34D399',
  'Real Estate': '#6366F1',
  'Basic Materials': '#8B5CF6',
  Utilities: '#14B8A6',
};

const GRADE_COLORS: Record<string, string> = {
  A: '#10B981',
  B: '#34D399',
  C: '#F59E0B',
  D: '#F97316',
  F: '#EF4444',
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
    height: '100%',
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
          style={{ backgroundColor: COLORS.amber, width: 70, height: '100%', justifyContent: 'center', alignItems: 'center' }}
          onPress={onEdit}
        >
          <Ionicons name="pencil" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600', marginTop: 2 }}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ backgroundColor: COLORS.red, width: 70, height: '100%', justifyContent: 'center', alignItems: 'center' }}
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
    loadPortfolio,
    loadSummary,
    removeHolding,
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

  const hasHoldings = holdings.length > 0;
  const isPositiveDaily = dailyChange >= 0;

  // ── Section Collapse ──
  const toggleSection = useCallback((section: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const toggleWlCollapse = useCallback((wlId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadPortfolio(),
      loadSummary(),
      loadHealthData(),
      loadWatchlists(),
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
      navigation.navigate('SignalDetail', { ticker, feedItemId: ticker });
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
      const sector = enrichment?.sector || 'Other';
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

  // ── Computed: Risk Level ──
  const riskLevel = useMemo(() => {
    if (!healthData) return 'Medium';
    const riskScore = healthData.riskBalance.score;
    if (riskScore >= 70) return 'Low';
    if (riskScore >= 40) return 'Medium';
    return 'High';
  }, [healthData]);

  // ── Computed: Diversification & Risk Factor ──
  const { divGrade, topRiskFactor } = useMemo(() => {
    if (!hasHoldings) return { divGrade: 'F' as string, topRiskFactor: '' };

    const sectorMap: Record<string, number> = {};
    let totalVal = 0;
    for (const h of holdings) {
      const sector = enrichmentCache[h.ticker]?.sector || 'Unknown';
      const val = h.totalValue || 0;
      sectorMap[sector] = (sectorMap[sector] || 0) + val;
      totalVal += val;
    }

    const sectorCount = Object.keys(sectorMap).filter((s) => s !== 'Unknown').length;
    const maxConcentration = totalVal > 0 ? Math.max(...Object.values(sectorMap)) / totalVal : 1;

    let grade: string;
    if (maxConcentration >= 0.8) grade = 'F';
    else if (maxConcentration >= 0.6) grade = 'D';
    else if (sectorCount >= 5) grade = 'A';
    else if (sectorCount >= 4) grade = 'B';
    else if (sectorCount >= 3) grade = 'C';
    else grade = 'D';

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

    return { divGrade: grade, topRiskFactor: risk };
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
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Portfolio</Text>
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* ═══════ 1. PORTFOLIO SUMMARY ═══════ */}
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

        {/* ═══════ 2. PORTFOLIO HEALTH (collapsible) ═══════ */}
        <View style={styles.section}>
          <SectionHeader
            title="Portfolio Health"
            collapsed={!!collapsed.health}
            onToggle={() => toggleSection('health')}
          />

          {!collapsed.health && (
            <>
              {!hasHoldings ? (
                <View style={styles.emptyBody}>
                  <Ionicons name="heart-outline" size={32} color={COLORS.textHint} />
                  <Text style={styles.emptyText}>Add holdings to see portfolio health</Text>
                </View>
              ) : healthLoading ? (
                <View style={styles.sectionBody}>
                  <Skeleton width={'100%'} height={80} borderRadius={12} />
                </View>
              ) : healthError ? (
                <View style={styles.errorBody}>
                  <Text style={styles.errorText}>Unable to load</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={loadHealthData}>
                    <Ionicons name="refresh" size={14} color={COLORS.primary} />
                    <Text style={styles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.sectionBody}>
                  <View style={styles.healthGrid}>
                    <View style={styles.healthItem}>
                      <Text style={styles.healthLabel}>Portfolio FII Score</Text>
                      <Text
                        style={[styles.healthValue, { color: getScoreColor(weightedFIIScore) }]}
                      >
                        {weightedFIIScore.toFixed(1)}
                      </Text>
                    </View>

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
                    </View>

                    <View style={styles.healthItem}>
                      <Text style={styles.healthLabel}>Diversification</Text>
                      <Text
                        style={[
                          styles.healthValue,
                          { color: GRADE_COLORS[divGrade] || COLORS.amber },
                        ]}
                      >
                        {divGrade}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.riskFactorRow}>
                    <Ionicons name="warning-outline" size={14} color={COLORS.amber} />
                    <Text style={styles.riskFactorText} numberOfLines={2}>
                      {topRiskFactor}
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

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

                  {/* Holdings list — new 3-row layout */}
                  {sortedHoldings.map((item) => {
                    const signal = signals[item.ticker];
                    const isPositive = (item.gainLoss || 0) >= 0;
                    const positionValue = (item.currentPrice ?? 0) * item.shares;
                    const gainLoss = item.gainLoss || 0;
                    const gainLossPct = item.gainLossPercent || 0;

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
                              feedItemId: item.id,
                            })
                          }
                        >
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

        {/* ═══════ 4. TRENDING NOW 🔥 ═══════ */}
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

                    {/* Watchlist items */}
                    {isExpanded && wl.items.length > 0 &&
                      wl.items.map((item) => {
                        const itemSignal = signals[item.ticker];
                        const isUp = (item.changePercent ?? 0) >= 0;
                        return (
                          <SwipeableWatchlistRow
                            key={item.ticker}
                            onRemove={() => removeWatchlistTicker(wl.id, item.ticker)}
                          >
                            <TouchableOpacity
                              style={styles.wlItemRow}
                              activeOpacity={0.8}
                              onPress={() =>
                                navigation.navigate('SignalDetail', {
                                  ticker: item.ticker,
                                  feedItemId: item.ticker,
                                })
                              }
                              onLongPress={() => showWlItemOptions(wl.id, item)}
                            >
                              <View style={styles.wlItemLeft}>
                                <Text style={styles.wlItemTicker}>{item.ticker}</Text>
                                <Text style={styles.wlItemName} numberOfLines={1}>
                                  {item.companyName}
                                </Text>
                              </View>
                              <Text style={styles.wlItemPrice}>
                                {item.price ? `$${item.price.toFixed(2)}` : '\u2014'}
                              </Text>
                              <Text
                                style={[
                                  styles.wlItemChange,
                                  { color: isUp ? COLORS.green : COLORS.red },
                                ]}
                              >
                                {isUp ? '+' : ''}
                                {(item.changePercent ?? 0).toFixed(1)}%
                              </Text>
                              {(itemSignal || item.score) ? (
                                <FIIBadge
                                  score={itemSignal?.score ?? item.score ?? 0}
                                  size={24}
                                />
                              ) : null}
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

              {/* Create New Watchlist button */}
              <TouchableOpacity
                style={styles.createWlBtn}
                onPress={() => setCreateWlVisible(true)}
              >
                <Ionicons name="add-circle-outline" size={16} color={COLORS.primary} />
                <Text style={styles.createWlText}>Create New Watchlist</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

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
        visible={createWlVisible}
        transparent
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
              autoFocus
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
                disabled={!newWlName.trim()}
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
  wlItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingLeft: 36,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    backgroundColor: COLORS.bg,
    gap: 10,
  },
  wlItemLeft: {
    flex: 1,
    minWidth: 0,
  },
  wlItemTicker: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  wlItemName: {
    color: COLORS.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },
  wlItemPrice: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  wlItemChange: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 50,
    textAlign: 'right',
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
