import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { searchTickers, generateSignal } from '../services/api';
import { useWatchlistStore } from '../store/watchlistStore';
import type { SearchResult } from '../types';

const RECENT_SEARCHES_KEY = '@fii/recent_searches';
const MAX_RECENT = 8;

interface SearchOverlayProps {
  visible: boolean;
  onClose: () => void;
  onSelectTicker: (ticker: string) => void;
  mode?: 'navigate' | 'watchlist';
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  visible,
  onClose,
  onSelectTicker,
  mode = 'navigate',
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  const { addTicker, activeWatchlistId, isInAnyWatchlist } = useWatchlistStore();

  useEffect(() => {
    if (visible) {
      loadRecentSearches();
    }
  }, [visible]);

  const loadRecentSearches = async () => {
    try {
      const stored = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  };

  const saveRecentSearch = async (item: SearchResult) => {
    try {
      const stored = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      let recent: SearchResult[] = stored ? JSON.parse(stored) : [];
      recent = recent.filter((r) => r.ticker !== item.ticker);
      recent.unshift(item);
      recent = recent.slice(0, MAX_RECENT);
      await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
      setRecentSearches(recent);
    } catch {
      // ignore
    }
  };

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (text.length < 1) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const data = await searchTickers(text);
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSelect = useCallback(async (item: SearchResult) => {
    saveRecentSearch(item);

    if (mode === 'watchlist') {
      addTicker(activeWatchlistId, item.ticker, item.companyName);
      setQuery('');
      setResults([]);
      onClose();
      return;
    }

    setGenerating(item.ticker);
    try {
      await generateSignal(item.ticker);
    } catch {
      // still navigate
    } finally {
      setGenerating(null);
      onSelectTicker(item.ticker);
      setQuery('');
      setResults([]);
    }
  }, [onSelectTicker, mode, addTicker, activeWatchlistId, onClose]);

  const clearRecent = async () => {
    try {
      await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
      setRecentSearches([]);
    } catch {
      // ignore
    }
  };

  const showRecent = query.length === 0 && recentSearches.length > 0;

  const renderResult = ({ item }: { item: SearchResult }) => {
    const inWatchlist = isInAnyWatchlist(item.ticker);
    return (
      <TouchableOpacity
        style={styles.resultRow}
        onPress={() => handleSelect(item)}
        disabled={generating !== null}
      >
        <View style={styles.resultLeft}>
          <View style={styles.tickerRow}>
            <Text style={styles.resultTicker}>{item.ticker}</Text>
            {inWatchlist && (
              <Ionicons name="bookmark" size={10} color="#60A5FA" style={styles.bookmarkIcon} />
            )}
            {item.score != null && item.signal != null && (
              <View style={[styles.searchSignalPill, {
                backgroundColor: item.signal === 'BUY' ? 'rgba(16,185,129,0.15)' : item.signal === 'SELL' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
              }]}>
                <Text style={[styles.searchSignalText, {
                  color: item.signal === 'BUY' ? '#10B981' : item.signal === 'SELL' ? '#EF4444' : '#F59E0B',
                }]}>{item.signal} {item.score.toFixed(1)}</Text>
              </View>
            )}
          </View>
          <Text style={styles.resultName} numberOfLines={1}>{item.companyName}</Text>
          {item.sector ? (
            <Text style={styles.resultSector}>{item.sector}</Text>
          ) : null}
        </View>
        <View style={styles.resultRight}>
          {generating === item.ticker ? (
            <ActivityIndicator size="small" color="#60A5FA" />
          ) : mode === 'watchlist' ? (
            <Ionicons name="add-circle-outline" size={20} color="#60A5FA" />
          ) : (
            <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.3)" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.input}
                placeholder={mode === 'watchlist' ? 'Add to watchlist...' : 'Search any ticker or company...'}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={query}
                onChangeText={handleSearch}
                autoFocus={true}
                autoCapitalize="characters"
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}>
                  <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Searching indicator */}
          {searching && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#60A5FA" />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          )}

          {/* Recent Searches */}
          {showRecent && (
            <View style={styles.recentSection}>
              <View style={styles.recentHeader}>
                <Text style={styles.recentTitle}>Recent</Text>
                <TouchableOpacity onPress={clearRecent}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              </View>
              {recentSearches.map((item) => (
                <TouchableOpacity
                  key={item.ticker}
                  style={styles.recentRow}
                  onPress={() => handleSelect(item)}
                >
                  <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.25)" />
                  <Text style={styles.recentTicker}>{item.ticker}</Text>
                  <Text style={styles.recentName} numberOfLines={1}>{item.companyName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Results */}
          <FlatList
            data={results}
            keyExtractor={(item) => item.ticker}
            renderItem={renderResult}
            ListEmptyComponent={
              query.length > 0 && !searching ? (
                <Text style={styles.emptyText}>No results found</Text>
              ) : null
            }
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  container: {
    flex: 1,
    backgroundColor: '#0D1B3E',
    marginTop: 50,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    marginLeft: 8,
    fontWeight: '500',
  },
  cancelBtn: {
    marginLeft: 12,
    paddingVertical: 8,
  },
  cancelText: {
    color: '#60A5FA',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  recentSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recentTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  clearText: { color: '#60A5FA', fontSize: 12, fontWeight: '600' },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  recentTicker: { color: '#FFF', fontSize: 14, fontWeight: '700', letterSpacing: 0.5, minWidth: 50 },
  recentName: { color: 'rgba(255,255,255,0.4)', fontSize: 13, flex: 1 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  resultLeft: {
    flex: 1,
  },
  tickerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resultTicker: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bookmarkIcon: { marginTop: 1 },
  resultName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 2,
  },
  resultSector: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    marginTop: 1,
  },
  searchSignalPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  searchSignalText: {
    fontSize: 10,
    fontWeight: '700',
  },
  resultRight: {
    marginLeft: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    textAlign: 'center',
    padding: 40,
  },
});
