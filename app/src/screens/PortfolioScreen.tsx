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
import type { Holding, RootStackParamList } from '../types';

const formatMoney = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(2)}`;
};

const formatPct = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

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
    summary,
    isLoading,
    loadPortfolio,
    loadSummary,
    removeHolding,
  } = usePortfolioStore();

  const [addVisible, setAddVisible] = useState(false);
  const [csvVisible, setCsvVisible] = useState(false);
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

  const isEmpty = holdings.length === 0 && !isLoading;

  // ─── Empty State ───
  if (isEmpty) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="briefcase-outline" size={64} color="rgba(96,165,250,0.4)" />
          </View>
          <Text style={styles.emptyTitle}>Your Portfolio</Text>
          <Text style={styles.emptySubtitle}>
            Add your holdings to unlock portfolio optimization, tax strategy, and diversification analysis.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setAddVisible(true)}>
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.primaryBtnText}>Add Manually</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setCsvVisible(true)}>
            <Ionicons name="cloud-upload-outline" size={20} color="#60A5FA" />
            <Text style={styles.secondaryBtnText}>Upload CSV</Text>
          </TouchableOpacity>
        </View>

        <AddHoldingSheet visible={addVisible} onClose={handleAddClose} />
        <CSVUploadSheet visible={csvVisible} onClose={handleCsvClose} />
      </LinearGradient>
    );
  }

  // ─── Dashboard ───
  const isPositiveTotal = totalGainLoss >= 0;
  const isPositiveDaily = dailyChange >= 0;

  const biggestWinner = summary?.biggestWinner;
  const biggestRisk = summary?.biggestRisk;
  const sellCount = summary?.sellCount || 0;

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
              ${(item.currentPrice || 0).toFixed(2)}
            </Text>
            <Text style={[styles.holdingDailyChange, { color: isDailyPositive ? '#10B981' : '#EF4444' }]}>
              {isDailyPositive ? '+' : ''}{(item.changePercent || 0).toFixed(2)}%
            </Text>
          </View>
          <View style={styles.holdingRight}>
            <Text style={styles.holdingValue}>
              {formatMoney(item.totalValue || 0)}
            </Text>
            <Text style={[styles.holdingGainLoss, { color: isPositive ? '#10B981' : '#EF4444' }]}>
              {isPositive ? '+' : ''}{formatMoney(item.gainLoss || 0)} ({formatPct(item.gainLossPercent || 0)})
            </Text>
          </View>
        </TouchableOpacity>
      </SwipeRow>
    );
  };

  const ListHeader = () => (
    <View>
      {/* Total Value Card */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Portfolio Value</Text>
        <Text style={styles.totalValue}>{formatMoney(totalValue)}</Text>
        <View style={styles.totalChangeRow}>
          <View style={styles.changePill}>
            <Ionicons
              name={isPositiveDaily ? 'trending-up' : 'trending-down'}
              size={14}
              color={isPositiveDaily ? '#10B981' : '#EF4444'}
            />
            <Text style={[styles.changeText, { color: isPositiveDaily ? '#10B981' : '#EF4444' }]}>
              {isPositiveDaily ? '+' : ''}{formatMoney(dailyChange)} ({formatPct(dailyChangePercent)}) today
            </Text>
          </View>
        </View>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Gain/Loss</Text>
          <Text style={[styles.summaryValue, { color: isPositiveTotal ? '#10B981' : '#EF4444' }]}>
            {isPositiveTotal ? '+' : ''}{formatMoney(totalGainLoss)}
          </Text>
          <Text style={[styles.summaryPct, { color: isPositiveTotal ? '#10B981' : '#EF4444' }]}>
            {formatPct(totalGainLossPercent)}
          </Text>
        </View>

        {biggestWinner && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Biggest Winner</Text>
            <Text style={styles.summaryTicker}>{biggestWinner.ticker}</Text>
            <Text style={[styles.summaryPct, { color: '#10B981' }]}>
              {formatPct(biggestWinner.gainLossPercent)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.summaryRow}>
        {biggestRisk && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Biggest Risk</Text>
            <Text style={styles.summaryTicker}>{biggestRisk.ticker}</Text>
            <Text style={[styles.summaryPct, { color: '#EF4444' }]}>
              FII: {biggestRisk.score.toFixed(1)} ({biggestRisk.signal})
            </Text>
          </View>
        )}

        {sellCount > 0 && (
          <View style={[styles.summaryCard, styles.warnCard]}>
            <Text style={styles.summaryLabel}>FII Says</Text>
            <Text style={styles.warnText}>
              {sellCount} of {holdings.length} holdings rated SELL
            </Text>
            <Text style={styles.warnHint}>Tap for details</Text>
          </View>
        )}
      </View>

      {/* Holdings Header */}
      <View style={styles.holdingsHeader}>
        <Text style={styles.holdingsTitle}>Holdings ({holdings.length})</Text>
        <Text style={styles.holdingsHint}>Long press to edit/delete</Text>
      </View>
    </View>
  );

  const ListFooter = () => (
    <View style={styles.footer}>
      <View style={styles.footerActions}>
        <TouchableOpacity style={styles.footerBtn} onPress={() => setAddVisible(true)}>
          <Ionicons name="add-circle-outline" size={20} color="#60A5FA" />
          <Text style={styles.footerBtnText}>Add Holding</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerBtn} onPress={() => setCsvVisible(true)}>
          <Ionicons name="cloud-upload-outline" size={20} color="#60A5FA" />
          <Text style={styles.footerBtnText}>Upload CSV</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading && holdings.length === 0) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#60A5FA" />
          <Text style={styles.loadingText}>Loading portfolio...</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
      <FlatList
        data={holdings}
        renderItem={renderHolding}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={styles.listContent}
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
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginTop: 16 },
  listContent: { paddingTop: 60, paddingBottom: 24 },

  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIcon: { marginBottom: 24 },
  emptyTitle: { color: '#FFF', fontSize: 28, fontWeight: '800', marginBottom: 12 },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#60A5FA',
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 16,
    gap: 8,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.4)',
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 16,
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#60A5FA', fontSize: 16, fontWeight: '700' },

  // Total card
  totalCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    alignItems: 'center',
  },
  totalLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  totalValue: { color: '#FFF', fontSize: 36, fontWeight: '800', marginTop: 8 },
  totalChangeRow: { marginTop: 12 },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  changeText: { fontSize: 14, fontWeight: '600' },

  // Summary cards
  summaryRow: { flexDirection: 'row', marginHorizontal: 20, gap: 10, marginBottom: 10 },
  summaryCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
  },
  summaryLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  summaryValue: { fontSize: 18, fontWeight: '800', marginTop: 6 },
  summaryTicker: { color: '#FFF', fontSize: 18, fontWeight: '800', marginTop: 6 },
  summaryPct: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  warnCard: { borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  warnText: { color: '#EF4444', fontSize: 13, fontWeight: '700', marginTop: 6 },
  warnHint: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 4 },

  // Holdings list
  holdingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  holdingsTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  holdingsHint: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },

  holdingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#0D1B3E',
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

  // Footer
  footer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  footerActions: { flexDirection: 'row', gap: 12 },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 6,
  },
  footerBtnText: { color: '#60A5FA', fontSize: 14, fontWeight: '600' },
});
