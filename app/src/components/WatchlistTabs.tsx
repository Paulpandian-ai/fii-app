import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useWatchlistStore } from '../store/watchlistStore';
import type { RootStackParamList, Signal, WatchlistItem } from '../types';

const SIGNAL_COLORS: Record<Signal, string> = {
  BUY: '#10B981',
  HOLD: '#F59E0B',
  SELL: '#EF4444',
};

interface WatchlistTabsProps {
  onOpenSearch?: () => void;
}

export const WatchlistTabs: React.FC<WatchlistTabsProps> = ({ onOpenSearch }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    watchlists,
    activeWatchlistId,
    loadWatchlists,
    setActiveWatchlist,
    createWatchlist,
    removeWatchlist,
    removeTicker,
  } = useWatchlistStore();

  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadWatchlists();
  }, []);

  const activeWl = watchlists.find((w) => w.id === activeWatchlistId) || watchlists[0];
  const items = activeWl?.items || [];

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createWatchlist(name);
    setNewName('');
    setShowNewInput(false);
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Watchlist', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeWatchlist(id) },
    ]);
  };

  const renderItem = (item: WatchlistItem) => (
    <TouchableOpacity
      key={item.ticker}
      style={styles.itemRow}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('SignalDetail', { ticker: item.ticker, feedItemId: item.ticker })}
    >
      <View style={styles.itemLeft}>
        <Text style={styles.itemTicker}>{item.ticker}</Text>
        <Text style={styles.itemName} numberOfLines={1}>{item.companyName}</Text>
      </View>
      <View style={styles.itemRight}>
        {item.signal && (
          <View style={[styles.signalPill, { backgroundColor: SIGNAL_COLORS[item.signal] + '20' }]}>
            <Text style={[styles.signalText, { color: SIGNAL_COLORS[item.signal] }]}>
              {item.signal}
            </Text>
          </View>
        )}
        {item.changePercent !== undefined && (
          <Text style={[styles.itemChange, { color: item.changePercent >= 0 ? '#10B981' : '#EF4444' }]}>
            {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(1)}%
          </Text>
        )}
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => removeTicker(activeWl.id, item.ticker)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={14} color="rgba(255,255,255,0.3)" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Watchlists</Text>
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
      >
        {watchlists.map((wl) => (
          <TouchableOpacity
            key={wl.id}
            style={[styles.tab, wl.id === activeWatchlistId && styles.tabActive]}
            onPress={() => setActiveWatchlist(wl.id)}
            onLongPress={() => {
              if (wl.id !== 'default') handleDelete(wl.id, wl.name);
            }}
          >
            <Text style={[styles.tabText, wl.id === activeWatchlistId && styles.tabTextActive]}>
              {wl.name}
            </Text>
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{wl.items.length}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {showNewInput ? (
          <View style={styles.newInputWrap}>
            <TextInput
              style={styles.newInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Name..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoFocus={true}
              onSubmitEditing={handleCreate}
              returnKeyType="done"
              maxLength={20}
            />
            <TouchableOpacity onPress={handleCreate}>
              <Ionicons name="checkmark" size={18} color="#60A5FA" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addTab} onPress={() => setShowNewInput(true)}>
            <Ionicons name="add" size={18} color="#60A5FA" />
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Items */}
      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="eye-outline" size={32} color="rgba(255,255,255,0.15)" />
          <Text style={styles.emptyText}>No stocks in this watchlist</Text>
          <TouchableOpacity style={styles.addBtn} onPress={onOpenSearch}>
            <Ionicons name="add" size={16} color="#60A5FA" />
            <Text style={styles.addBtnText}>Add Stock</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.itemList}>
          {items.map(renderItem)}
          <TouchableOpacity style={styles.addMoreBtn} onPress={onOpenSearch}>
            <Ionicons name="add-circle-outline" size={16} color="#60A5FA" />
            <Text style={styles.addMoreText}>Add more</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 10 },
  sectionTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  tabBar: { paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    gap: 6,
  },
  tabActive: { backgroundColor: 'rgba(96,165,250,0.2)', borderWidth: 1, borderColor: 'rgba(96,165,250,0.4)' },
  tabText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#60A5FA' },
  tabBadge: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeText: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700' },
  addTab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(96,165,250,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 12,
    gap: 6,
  },
  newInput: { color: '#FFF', fontSize: 13, fontWeight: '500', width: 80, paddingVertical: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  addBtnText: { color: '#60A5FA', fontSize: 13, fontWeight: '600' },
  itemList: { paddingHorizontal: 20 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  itemLeft: { flex: 1 },
  itemTicker: { color: '#FFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  itemName: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  signalPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  signalText: { fontSize: 10, fontWeight: '700' },
  itemChange: { fontSize: 13, fontWeight: '600', minWidth: 48, textAlign: 'right' },
  removeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 14,
  },
  addMoreText: { color: '#60A5FA', fontSize: 13, fontWeight: '600' },
});
