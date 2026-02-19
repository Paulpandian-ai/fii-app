import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Animated,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePortfolioStore } from '../store/portfolioStore';
import { AddHoldingSheet } from '../components/AddHoldingSheet';
import { CSVUploadSheet } from '../components/CSVUploadSheet';
import { BasketCarousel } from '../components/BasketCarousel';
import { WatchlistTabs } from '../components/WatchlistTabs';
import { PortfolioHealthGauge } from '../components/PortfolioHealthGauge';
import { StockDiscovery } from '../components/StockDiscovery';
import { TrendingSection } from '../components/TrendingSection';
import { SearchOverlay } from '../components/SearchOverlay';
import { Skeleton } from '../components/Skeleton';
import type { Holding, RootStackParamList } from '../types';

const formatMoney = (n: unknown): string => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${v.toFixed(2)}`;
};

const formatPct = (n: unknown): string => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
};

// ─── Swipeable Row ───

interface SwipeRowProps {
  children: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}

const SwipeRow: React.FC<SwipeRowProps> = ({ children, onEdit, onDelete }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const [swiped, setSwiped] = useState(false);

  const handleSwipe = () => {
    Animated.spring(translateX, {
      toValue: swiped ? 0 : -140,
      useNativeDriver: true,
    }).start();
    setSwiped(!swiped);
  };

  return (
    <View style={swipeStyles.container}>
      <View style={swipeStyles.actions}>
        <TouchableOpacity style={swipeStyles.editBtn} onPress={onEdit}>
          <Ionicons name="pencil" size={18} color="#FFF" />
          <Text style={swipeStyles.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={swipeStyles.deleteBtn} onPress={onDelete}>
          <Ionicons name="trash" size={18} color="#FFF" />
          <Text style={swipeStyles.actionText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }}>
        <TouchableOpacity activeOpacity={0.95} onLongPress={handleSwipe}>
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
  editBtn: {
    backgroundColor: '#F59E0B',
    width: 70,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    backgroundColor: '#EF4444',
    width: 70,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: { color: '#FFF', fontSize: 11, fontWeight: '600', marginTop: 4 },
});

// ─── Main Screen ───

export const PortfolioScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    holdings,
    totalValue,
    totalGainLoss,
    totalGainLossPercent,
    dailyChange,
    dailyChangePercent,
    isLoading,
    loadPortfolio,
    loadSummary,
    removeHolding,
  } = usePortfolioStore();

  const [addVisible, setAddVisible] = useState(false);
  const [csvVisible, setCsvVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchMode, setSearchMode] = useState<'navigate' | 'watchlist'>('navigate');
  const [editHolding, setEditHolding] = useState<Holding | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadPortfolio();
    loadSummary();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPortfolio();
    await loadSummary();
    setRefreshing(false);
  }, [loadPortfolio, loadSummary]);

  const handleAddClose = useCallback(() => {
    setAddVisible(false);
    loadPortfolio();
    loadSummary();
  }, [loadPortfolio, loadSummary]);

  const handleCsvClose = useCallback(() => {
    setCsvVisible(false);
    loadPortfolio();
    loadSummary();
  }, [loadPortfolio, loadSummary]);

  const handleSearchSelect = useCallback((ticker: string) => {
    setSearchVisible(false);
    navigation.navigate('SignalDetail', { ticker, feedItemId: ticker });
  }, [navigation]);

  const openWatchlistSearch = useCallback(() => {
    setSearchMode('watchlist');
    setSearchVisible(true);
  }, []);

  const openNavigateSearch = useCallback(() => {
    setSearchMode('navigate');
    setSearchVisible(true);
  }, []);

  const hasHoldings = holdings.length > 0;
  const isPositiveDaily = dailyChange >= 0;

  const renderHolding = ({ item }: { item: Holding }) => {
    const isPositive = (item.gainLoss || 0) >= 0;
    const isDailyPositive = (item.change || 0) >= 0;

    return (
      <SwipeRow
        onEdit={() => {
          setEditHolding(item);
          setAddVisible(true);
        }}
        onDelete={() => removeHolding(item.id)}
      >
        <TouchableOpacity
          style={styles.holdingRow}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('SignalDetail', { ticker: item.ticker, feedItemId: item.id })}
        >
          <View style={styles.holdingLeft}>
            <Text style={styles.holdingTicker}>{item.ticker}</Text>
            <Text style={styles.holdingShares}>
              {item.shares} shares
            </Text>
          </View>
          <View style={styles.holdingCenter}>
            <Text style={styles.holdingPrice}>
              ${(item.currentPrice ?? 0).toFixed(2)}
            </Text>
            <Text style={[styles.holdingDailyChange, { color: isDailyPositive ? '#10B981' : '#EF4444' }]}>
              {isDailyPositive ? '+' : ''}{(item.changePercent ?? 0).toFixed(2)}%
            </Text>
          </View>
          <View style={styles.holdingRight}>
            <Text style={styles.holdingValue}>
              {formatMoney(item.totalValue || 0)}
            </Text>
            <Text style={[styles.holdingGainLoss, { color: isPositive ? '#10B981' : '#EF4444' }]}>
              {isPositive ? '+' : ''}{formatMoney(item.gainLoss || 0)}
            </Text>
          </View>
        </TouchableOpacity>
      </SwipeRow>
    );
  };

  // Sections rendered as data items for FlatList
  type SectionItem =
    | { type: 'header' }
    | { type: 'baskets' }
    | { type: 'watchlists' }
    | { type: 'health' }
    | { type: 'holdings_header' }
    | { type: 'holding'; data: Holding }
    | { type: 'add_buttons' }
    | { type: 'screener_cta' }
    | { type: 'discovery' }
    | { type: 'trending' }
    | { type: 'spacer' };

  const sections: SectionItem[] = [];

  // 1. Portfolio value header (if has holdings)
  if (hasHoldings) {
    sections.push({ type: 'header' });
  }

  // 2. AI Baskets carousel (always)
  sections.push({ type: 'baskets' });

  // 3. Watchlists
  sections.push({ type: 'watchlists' });

  // 4. Portfolio Health gauge
  sections.push({ type: 'health' });

  // 5. Holdings list (if any)
  if (hasHoldings) {
    sections.push({ type: 'holdings_header' });
    for (const h of holdings) {
      sections.push({ type: 'holding', data: h });
    }
  }

  // 6. Add / CSV buttons
  sections.push({ type: 'add_buttons' });

  // 7a. Stock Screener CTA
  sections.push({ type: 'screener_cta' });

  // 7b. Tinder-style Discovery
  sections.push({ type: 'discovery' });

  // 8. Trending
  sections.push({ type: 'trending' });

  // Bottom spacer
  sections.push({ type: 'spacer' });

  const renderSection = ({ item }: { item: SectionItem }) => {
    switch (item.type) {
      case 'header':
        return (
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>PORTFOLIO VALUE</Text>
            <Text style={styles.totalValue}>{formatMoney(totalValue)}</Text>
            <View style={styles.totalChangeRow}>
              <Ionicons
                name={isPositiveDaily ? 'trending-up' : 'trending-down'}
                size={14}
                color={isPositiveDaily ? '#10B981' : '#EF4444'}
              />
              <Text style={[styles.changeText, { color: isPositiveDaily ? '#10B981' : '#EF4444' }]}>
                {isPositiveDaily ? '+' : ''}{formatMoney(dailyChange)} ({formatPct(dailyChangePercent)}) today
              </Text>
            </View>
            {totalGainLoss !== 0 && (
              <Text style={[styles.totalGainLoss, { color: totalGainLoss >= 0 ? '#10B981' : '#EF4444' }]}>
                Total: {totalGainLoss >= 0 ? '+' : ''}{formatMoney(totalGainLoss)} ({formatPct(totalGainLossPercent)})
              </Text>
            )}
          </View>
        );

      case 'baskets':
        return <BasketCarousel onBrowseAll={() => navigation.navigate('BasketList')} />;

      case 'watchlists':
        return <WatchlistTabs onOpenSearch={openWatchlistSearch} />;

      case 'health':
        return <PortfolioHealthGauge hasHoldings={hasHoldings} />;

      case 'holdings_header':
        return (
          <View style={styles.holdingsHeader}>
            <Text style={styles.holdingsTitle}>Holdings ({holdings.length})</Text>
            <Text style={styles.holdingsHint}>Long press to edit/delete</Text>
          </View>
        );

      case 'holding':
        return renderHolding({ item: item.data });

      case 'add_buttons':
        return (
          <View style={styles.addSection}>
            <Text style={styles.addTitle}>{hasHoldings ? 'Manage Holdings' : 'Add Your Holdings'}</Text>
            {!hasHoldings && (
              <Text style={styles.addSubtitle}>
                Unlock health scores, optimization, and personalized signals
              </Text>
            )}
            <View style={styles.addRow}>
              <TouchableOpacity style={styles.addBtn} onPress={() => setAddVisible(true)}>
                <Ionicons name="add" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Add Manually</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.csvBtn} onPress={() => setCsvVisible(true)}>
                <Ionicons name="cloud-upload-outline" size={18} color="#60A5FA" />
                <Text style={styles.csvBtnText}>Upload CSV</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'screener_cta':
        return (
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: 'rgba(96,165,250,0.08)', borderRadius: 14, padding: 16,
              marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(96,165,250,0.15)',
            }}
            onPress={() => navigation.navigate('Screener')}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="search" size={22} color="#60A5FA" />
              <View>
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Stock Screener</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>
                  Filter by AI score, technicals, fundamentals
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        );

      case 'discovery':
        return <StockDiscovery />;

      case 'trending':
        return <TrendingSection />;

      case 'spacer':
        return <View style={styles.bottomSpacer} />;

      default:
        return null;
    }
  };

  if (isLoading && holdings.length === 0) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>Portfolio</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Skeleton width={'85%'} height={100} borderRadius={16} />
          <View style={{ height: 16 }} />
          <Skeleton width={'85%'} height={60} borderRadius={12} />
          <View style={{ height: 12 }} />
          <Skeleton width={'85%'} height={60} borderRadius={12} />
          <View style={{ height: 12 }} />
          <Skeleton width={'85%'} height={60} borderRadius={12} />
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Portfolio</Text>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.searchBtn} onPress={openNavigateSearch}>
            <Ionicons name="search" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.searchBtn} onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={sections}
        renderItem={renderSection}
        keyExtractor={(_, index) => `section-${index}`}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#60A5FA"
          />
        }
      />

      <AddHoldingSheet visible={addVisible} onClose={handleAddClose} />
      <CSVUploadSheet visible={csvVisible} onClose={handleCsvClose} />
      <SearchOverlay
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        onSelectTicker={handleSearchSelect}
        mode={searchMode}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
  },
  topTitle: { color: '#FFF', fontSize: 28, fontWeight: '800' },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Total card
  totalCard: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    alignItems: 'center',
  },
  totalLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  totalValue: { color: '#FFF', fontSize: 34, fontWeight: '800', marginTop: 6 },
  totalChangeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  changeText: { fontSize: 13, fontWeight: '600' },
  totalGainLoss: { fontSize: 12, fontWeight: '600', marginTop: 4 },

  // Holdings list
  holdingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  holdingsTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  holdingsHint: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },

  holdingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  holdingLeft: { flex: 1.2 },
  holdingTicker: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  holdingShares: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
  holdingCenter: { flex: 1, alignItems: 'center' },
  holdingPrice: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  holdingDailyChange: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  holdingRight: { flex: 1.3, alignItems: 'flex-end' },
  holdingValue: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  holdingGainLoss: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  // Add holdings section
  addSection: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  addTitle: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  addSubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  addRow: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#60A5FA',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 6,
  },
  addBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  csvBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.4)',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 6,
  },
  csvBtnText: { color: '#60A5FA', fontSize: 14, fontWeight: '700' },

  // Bottom spacer
  bottomSpacer: { height: 32 },
});
