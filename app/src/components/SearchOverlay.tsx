import React, { useState, useCallback } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { searchTickers, generateSignal } from '../services/api';
import type { SearchResult } from '../types';

interface SearchOverlayProps {
  visible: boolean;
  onClose: () => void;
  onSelectTicker: (ticker: string) => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  visible,
  onClose,
  onSelectTicker,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

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

  const handleSelect = useCallback(async (ticker: string) => {
    setGenerating(ticker);
    try {
      // Generate signal on-demand for this ticker
      await generateSignal(ticker);
    } catch {
      // If generation fails, still navigate — detail screen will handle missing data
    } finally {
      setGenerating(null);
      onSelectTicker(ticker);
      setQuery('');
      setResults([]);
    }
  }, [onSelectTicker]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.input}
                placeholder="Search any ticker or company..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={query}
                onChangeText={handleSearch}
                autoFocus
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

          {/* Results */}
          {searching && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#60A5FA" />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          )}

          <FlatList
            data={results}
            keyExtractor={(item) => item.ticker}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.resultRow}
                onPress={() => handleSelect(item.ticker)}
                disabled={generating !== null}
              >
                <View style={styles.resultLeft}>
                  <Text style={styles.resultTicker}>{item.ticker}</Text>
                  <Text style={styles.resultName} numberOfLines={1}>{item.companyName}</Text>
                </View>
                <View style={styles.resultRight}>
                  {generating === item.ticker ? (
                    <ActivityIndicator size="small" color="#60A5FA" />
                  ) : (
                    <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.3)" />
                  )}
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              query.length > 0 && !searching ? (
                <Text style={styles.emptyText}>No results found</Text>
              ) : null
            }
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
  resultTicker: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  resultName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 2,
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
