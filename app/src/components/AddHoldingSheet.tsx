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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { searchTickers, getPrice } from '../services/api';
import { usePortfolioStore } from '../store/portfolioStore';
import type { SearchResult } from '../types';

interface AddHoldingSheetProps {
  visible: boolean;
  onClose: () => void;
}

export const AddHoldingSheet: React.FC<AddHoldingSheetProps> = ({ visible, onClose }) => {
  const { addHolding } = usePortfolioStore();

  // Step 1: Search for ticker
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Step 2: Enter details
  const [selectedTicker, setSelectedTicker] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 3: Confirmation
  const [confirmed, setConfirmed] = useState(false);
  const [addedGainLoss, setAddedGainLoss] = useState(0);

  const step = selectedTicker ? (confirmed ? 3 : 2) : 1;

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

  const handleSelectTicker = useCallback(async (ticker: string, companyName: string) => {
    setSelectedTicker(ticker);
    setSelectedName(companyName);
    setResults([]);
    setQuery('');

    try {
      const priceData = await getPrice(ticker);
      setCurrentPrice(priceData.price || 0);
      setAvgCost(String(priceData.price || ''));
    } catch {
      // Price fetch failed — user can still enter manually
    }
  }, []);

  const handleAdd = useCallback(async () => {
    const sharesNum = parseFloat(shares);
    const costNum = parseFloat(avgCost) || currentPrice;
    if (!sharesNum || sharesNum <= 0) return;

    setSaving(true);
    try {
      await addHolding({
        ticker: selectedTicker,
        companyName: selectedName,
        shares: sharesNum,
        avgCost: costNum,
      });
      const gainLoss = currentPrice > 0 ? (currentPrice - costNum) * sharesNum : 0;
      setAddedGainLoss(gainLoss);
      setConfirmed(true);
    } catch {
      // Error handled in store
    } finally {
      setSaving(false);
    }
  }, [selectedTicker, selectedName, shares, avgCost, currentPrice, addHolding]);

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setSelectedTicker('');
    setSelectedName('');
    setShares('');
    setAvgCost('');
    setCurrentPrice(0);
    setConfirmed(false);
    setSaving(false);
    onClose();
  };

  const isValid = selectedTicker && parseFloat(shares) > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {step === 1 ? 'Search Ticker' : step === 2 ? selectedTicker : 'Added!'}
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>

          {step === 1 && (
            <>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={20} color="rgba(255,255,255,0.4)" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search ticker or company..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={query}
                  onChangeText={handleSearch}
                  autoFocus
                  autoCapitalize="characters"
                />
              </View>
              {searching && <ActivityIndicator color="#60A5FA" style={styles.loader} />}
              <FlatList
                data={results}
                keyExtractor={(item) => item.ticker}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.resultRow}
                    onPress={() => handleSelectTicker(item.ticker, item.companyName)}
                  >
                    <View>
                      <Text style={styles.resultTicker}>{item.ticker}</Text>
                      <Text style={styles.resultName} numberOfLines={1}>
                        {item.companyName}
                      </Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={24} color="#60A5FA" />
                  </TouchableOpacity>
                )}
                style={styles.resultList}
              />
            </>
          )}

          {step === 2 && (
            <View style={styles.form}>
              <View style={styles.tickerBadge}>
                <Text style={styles.tickerBadgeText}>{selectedTicker}</Text>
                <Text style={styles.tickerBadgeName}>{selectedName}</Text>
                {currentPrice > 0 && (
                  <Text style={styles.tickerBadgePrice}>
                    Current: ${(currentPrice ?? 0).toFixed(2)}
                  </Text>
                )}
              </View>

              <Text style={styles.label}>Shares</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 10"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={shares}
                onChangeText={setShares}
                keyboardType="decimal-pad"
                autoFocus
              />

              <Text style={styles.label}>Average Cost per Share</Text>
              <TextInput
                style={styles.input}
                placeholder={currentPrice > 0 ? `Default: $${(currentPrice ?? 0).toFixed(2)}` : 'e.g. 150.00'}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={avgCost}
                onChangeText={setAvgCost}
                keyboardType="decimal-pad"
              />

              {isValid && (
                <View style={styles.preview}>
                  <Text style={styles.previewLabel}>Position Value</Text>
                  <Text style={styles.previewValue}>
                    ${((parseFloat(shares) || 0) * ((parseFloat(avgCost) || 0) || (currentPrice ?? 0))).toFixed(2)}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.addBtn, !isValid && styles.addBtnDisabled]}
                onPress={handleAdd}
                disabled={!isValid || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.addBtnText}>Add to Portfolio</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => {
                  setSelectedTicker('');
                  setSelectedName('');
                  setShares('');
                  setAvgCost('');
                }}
              >
                <Text style={styles.backBtnText}>Search different ticker</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 3 && (
            <View style={styles.confirmation}>
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={40} color="#10B981" />
              </View>
              <Text style={styles.confirmTicker}>{selectedTicker}</Text>
              <Text style={styles.confirmDetail}>
                {shares} shares at ${((parseFloat(avgCost) || 0) || (currentPrice ?? 0)).toFixed(2)}
              </Text>
              {currentPrice > 0 && (
                <Text
                  style={[
                    styles.confirmGainLoss,
                    { color: addedGainLoss >= 0 ? '#10B981' : '#EF4444' },
                  ]}
                >
                  {(addedGainLoss ?? 0) >= 0 ? '+' : ''}${(addedGainLoss ?? 0).toFixed(2)} unrealized
                </Text>
              )}
              <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addAnotherBtn}
                onPress={() => {
                  setSelectedTicker('');
                  setSelectedName('');
                  setShares('');
                  setAvgCost('');
                  setConfirmed(false);
                }}
              >
                <Text style={styles.addAnotherText}>Add Another</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#0D1B3E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: 400,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 12,
    height: 48,
  },
  searchInput: { flex: 1, color: '#FFF', fontSize: 16, marginLeft: 8 },
  loader: { marginTop: 16 },
  resultList: { marginTop: 8, maxHeight: 300 },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  resultTicker: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  resultName: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2, maxWidth: 250 },
  form: { padding: 20 },
  tickerBadge: {
    backgroundColor: 'rgba(96,165,250,0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  tickerBadgeText: { color: '#60A5FA', fontSize: 24, fontWeight: '800', letterSpacing: 2 },
  tickerBadgeName: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 },
  tickerBadgePrice: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600', marginTop: 8 },
  label: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    padding: 16,
  },
  preview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  previewLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  previewValue: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  addBtn: {
    backgroundColor: '#60A5FA',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  backBtn: { alignItems: 'center', marginTop: 16 },
  backBtnText: { color: '#60A5FA', fontSize: 14, fontWeight: '600' },
  confirmation: { alignItems: 'center', padding: 32 },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(16,185,129,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmTicker: { color: '#FFF', fontSize: 28, fontWeight: '800', letterSpacing: 2 },
  confirmDetail: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginTop: 8 },
  confirmGainLoss: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  doneBtn: {
    backgroundColor: '#60A5FA',
    borderRadius: 12,
    paddingHorizontal: 48,
    paddingVertical: 14,
    marginTop: 24,
  },
  doneBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  addAnotherBtn: { marginTop: 16 },
  addAnotherText: { color: '#60A5FA', fontSize: 14, fontWeight: '600' },
});
