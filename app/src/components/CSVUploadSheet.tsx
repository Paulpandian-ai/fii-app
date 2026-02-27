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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { parsePortfolioCsv } from '../services/api';
import { usePortfolioStore } from '../store/portfolioStore';
import type { CSVPreviewRow } from '../types';

interface CSVUploadSheetProps {
  visible: boolean;
  onClose: () => void;
}

export const CSVUploadSheet: React.FC<CSVUploadSheetProps> = ({ visible, onClose }) => {
  const { importHoldings } = usePortfolioStore();
  const [csvText, setCsvText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<CSVPreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const step = done ? 3 : preview.length > 0 ? 2 : 1;

  const handleParse = useCallback(async () => {
    if (!csvText.trim()) return;
    setParsing(true);
    setError('');
    try {
      const data = await parsePortfolioCsv(csvText);
      if (data.holdings && data.holdings.length > 0) {
        setPreview(data.holdings);
      } else if (data.needsMapping) {
        setError(`Could not auto-detect columns. Headers found: ${data.headers?.join(', ')}`);
      } else {
        setError('No valid holdings found in CSV. Make sure it has ticker/symbol and quantity/shares columns.');
      }
    } catch {
      setError('Failed to parse CSV. Please check the format.');
    } finally {
      setParsing(false);
    }
  }, [csvText]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      await importHoldings(
        preview.map((row) => ({
          ticker: row.ticker,
          companyName: row.companyName || row.ticker,
          shares: row.shares,
          avgCost: row.avgCost,
        }))
      );
      setDone(true);
    } catch {
      setError('Failed to import holdings');
    } finally {
      setImporting(false);
    }
  }, [preview, importHoldings]);

  const handleClose = () => {
    setCsvText('');
    setPreview([]);
    setDone(false);
    setError('');
    onClose();
  };

  return (
    <Modal visible={Boolean(visible)} animationType="slide" transparent={true}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {step === 1 ? 'Upload CSV' : step === 2 ? 'Preview Import' : 'Imported!'}
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>

          {step === 1 && (
            <View style={styles.content}>
              <Text style={styles.hint}>
                Paste CSV from Fidelity, Schwab, Robinhood, Vanguard, or any brokerage export.
                Must include columns for ticker/symbol and shares/quantity.
              </Text>
              <TextInput
                style={styles.csvInput}
                placeholder={'Symbol,Quantity,Cost Basis\nAAPL,10,150.00\nMSFT,5,380.00'}
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={csvText}
                onChangeText={setCsvText}
                multiline={true}
                numberOfLines={8}
                textAlignVertical="top"
                autoCapitalize="none"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.parseBtn, !csvText.trim() && styles.parseBtnDisabled]}
                onPress={handleParse}
                disabled={csvText.trim().length === 0 || Boolean(parsing)}
              >
                {parsing ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.parseBtnText}>Parse CSV</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === 2 && (
            <View style={styles.content}>
              <Text style={styles.previewCount}>
                {preview.length} holding{preview.length !== 1 ? 's' : ''} found
              </Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.thTicker]}>Ticker</Text>
                <Text style={[styles.th, styles.thShares]}>Shares</Text>
                <Text style={[styles.th, styles.thCost]}>Avg Cost</Text>
              </View>
              <FlatList
                data={preview}
                keyExtractor={(item) => item.ticker}
                style={styles.previewList}
                renderItem={({ item }) => (
                  <View style={styles.tableRow}>
                    <Text style={[styles.td, styles.tdTicker]}>{item.ticker}</Text>
                    <Text style={[styles.td, styles.tdShares]}>{item.shares}</Text>
                    <Text style={[styles.td, styles.tdCost]}>
                      {(item.avgCost ?? 0) > 0 ? `$${(item.avgCost ?? 0).toFixed(2)}` : '--'}
                    </Text>
                  </View>
                )}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.previewActions}>
                <TouchableOpacity style={styles.backBtn} onPress={() => setPreview([])}>
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.importBtn}
                  onPress={handleImport}
                  disabled={Boolean(importing)}
                >
                  {importing ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.importBtnText}>
                      Import {preview.length} Holdings
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={styles.doneContainer}>
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={40} color="#10B981" />
              </View>
              <Text style={styles.doneText}>
                {preview.length} holdings imported successfully
              </Text>
              <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
                <Text style={styles.doneBtnText}>Done</Text>
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
  content: { padding: 20 },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 20, marginBottom: 16 },
  csvInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    color: '#FFF',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    padding: 16,
    minHeight: 160,
  },
  error: { color: '#EF4444', fontSize: 13, marginTop: 12 },
  parseBtn: {
    backgroundColor: '#60A5FA',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  parseBtnDisabled: { opacity: 0.4 },
  parseBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  previewCount: { color: '#60A5FA', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 8,
  },
  th: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  thTicker: { flex: 2 },
  thShares: { flex: 1, textAlign: 'right' },
  thCost: { flex: 1, textAlign: 'right' },
  previewList: { maxHeight: 250 },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  td: { fontSize: 14 },
  tdTicker: { flex: 2, color: '#FFF', fontWeight: '700' },
  tdShares: { flex: 1, color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  tdCost: { flex: 1, color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  previewActions: { flexDirection: 'row', marginTop: 20, gap: 12 },
  backBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  backBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  importBtn: { flex: 2, backgroundColor: '#10B981', borderRadius: 12, padding: 14, alignItems: 'center' },
  importBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  doneContainer: { alignItems: 'center', padding: 32 },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(16,185,129,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  doneText: { color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  doneBtn: {
    backgroundColor: '#60A5FA',
    borderRadius: 12,
    paddingHorizontal: 48,
    paddingVertical: 14,
    marginTop: 24,
  },
  doneBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
