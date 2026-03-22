import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { postCritiqueReport, getScreener } from '../services/api';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ─── Agreement score color helpers ───
function getAgreementColor(score: number): string {
  if (score <= 40) return '#F59E0B';     // amber – significant disagreement
  if (score <= 60) return '#FBBF24';     // amber – partial agreement
  if (score <= 80) return '#60A5FA';     // blue – mostly aligned
  return '#00C9A7';                       // teal – strong agreement
}

function getAgreementLabel(score: number): string {
  if (score <= 40) return 'Significant Disagreement';
  if (score <= 60) return 'Partial Agreement';
  if (score <= 80) return 'Mostly Aligned';
  return 'Strong Agreement';
}

function getConfidenceColor(c: string): string {
  return c === 'High' ? '#00C9A7' : '#8E8E93';
}

function getRiskColor(r: string): string {
  return r === 'Material' ? '#FBBF24' : '#8E8E93';
}

interface StockItem {
  ticker: string;
  companyName: string;
  aiScore?: number | null;
}

// ─── Main Screen ───
export function ReportCritiqueScreen() {
  const navigation = useNavigation<Nav>();

  // Input state
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [reportText, setReportText] = useState('');
  const [source, setSource] = useState('');

  // Result state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  // Collapsible sections
  const [showAgreements, setShowAgreements] = useState(true);
  const [showContradictions, setShowContradictions] = useState(true);
  const [showBlindSpots, setShowBlindSpots] = useState(true);

  // Load stock list for search
  useEffect(() => {
    (async () => {
      try {
        const data = await getScreener({ limit: '600' });
        const items: StockItem[] = (data.stocks || data.results || []).map((s: any) => ({
          ticker: s.ticker,
          companyName: s.companyName || s.company_name || '',
          aiScore: s.aiScore ?? s.score ?? null,
        }));
        setStocks(items);
      } catch {}
    })();
  }, []);

  // Search filter
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 1) return [];
    const q = searchQuery.toUpperCase();
    return stocks
      .filter(
        (s) => s.ticker.includes(q) || s.companyName.toUpperCase().includes(q),
      )
      .slice(0, 10);
  }, [searchQuery, stocks]);

  const canAnalyze = selectedStock && reportText.trim().length > 20;

  const handleAnalyze = useCallback(async () => {
    if (!selectedStock || !reportText.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await postCritiqueReport({
        ticker: selectedStock.ticker,
        report_text: reportText.trim(),
        source: source.trim() || undefined,
      });
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to analyze report');
    } finally {
      setLoading(false);
    }
  }, [selectedStock, reportText, source]);

  const handleAskCoach = useCallback(() => {
    if (!result || !selectedStock) return;
    const summary = result.executive_summary || '';
    const msg = `I just ran an analyst report critique for ${selectedStock.ticker}. Here's the summary:\n\n${summary}\n\nCan you help me understand the key risks?`;
    navigation.navigate('AICoach', {
      mode: 'research',
      ticker: selectedStock.ticker,
      initialMessage: msg,
    });
  }, [result, selectedStock, navigation]);

  // ─── RESULTS VIEW ───
  if (result && !loading) {
    const critique = result.critique || {};
    const summary = result.analyst_summary || {};
    const fiiVs = result.fii_vs_analyst || {};
    const agreementScore = critique.agreement_score ?? 50;
    const agreements = critique.agreements || [];
    const contradictions = critique.contradictions || [];
    const blindSpots = critique.blind_spots || [];

    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setResult(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Report Critique: {selectedStock?.ticker}</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Agreement Score Card */}
          <View style={styles.scoreCard}>
            <Text style={styles.scoreCardTitle}>Agreement Score</Text>
            <View style={styles.scoreBarContainer}>
              <View
                style={[
                  styles.scoreBarFill,
                  {
                    width: `${agreementScore}%`,
                    backgroundColor: getAgreementColor(agreementScore),
                  },
                ]}
              />
            </View>
            <View style={styles.scoreRow}>
              <Text style={[styles.scoreValue, { color: getAgreementColor(agreementScore) }]}>
                {agreementScore}/100
              </Text>
              <Text style={styles.scoreLabel}>{getAgreementLabel(agreementScore)}</Text>
            </View>

            <View style={styles.scoreDivider} />

            <View style={styles.compareRow}>
              <View style={styles.compareItem}>
                <Text style={styles.compareLabel}>FII Score</Text>
                <Text style={styles.compareValue}>
                  {fiiVs.fii_score ?? 'N/A'} {fiiVs.fii_label || ''}
                </Text>
              </View>
              <View style={styles.compareItem}>
                <Text style={styles.compareLabel}>Analyst</Text>
                <Text style={styles.compareValue}>
                  {summary.rating || fiiVs.analyst_rating || 'N/A'}
                  {summary.price_target ? `, ${summary.price_target}` : ''}
                </Text>
              </View>
            </View>

            {fiiVs.alignment ? (
              <Text style={styles.alignmentText}>"{fiiVs.alignment}"</Text>
            ) : null}
          </View>

          {/* Confirmed Section */}
          {agreements.length > 0 && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setShowAgreements(!showAgreements)}
                activeOpacity={0.7}
              >
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#00C9A7" />
                  <Text style={styles.sectionTitle}>CONFIRMED by FII Data</Text>
                </View>
                <Ionicons
                  name={showAgreements ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="rgba(255,255,255,0.4)"
                />
              </TouchableOpacity>
              {showAgreements &&
                agreements.map((a: any, i: number) => (
                  <View key={i} style={[styles.itemCard, { borderLeftColor: '#00C9A7' }]}>
                    <Text style={styles.itemClaim}>"{a.analyst_claim}"</Text>
                    <Text style={styles.itemData}>
                      FII confirms: {a.fii_data}
                    </Text>
                    <View style={styles.itemFooter}>
                      <View
                        style={[
                          styles.confidenceDot,
                          { backgroundColor: getConfidenceColor(a.confidence) },
                        ]}
                      />
                      <Text style={styles.itemConfidence}>{a.confidence || 'Medium'}</Text>
                    </View>
                  </View>
                ))}
            </View>
          )}

          {/* Contradicted Section */}
          {contradictions.length > 0 && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setShowContradictions(!showContradictions)}
                activeOpacity={0.7}
              >
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="warning" size={18} color="#FBBF24" />
                  <Text style={styles.sectionTitle}>CONTRADICTED by FII Data</Text>
                </View>
                <Ionicons
                  name={showContradictions ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="rgba(255,255,255,0.4)"
                />
              </TouchableOpacity>
              {showContradictions &&
                contradictions.map((c: any, i: number) => (
                  <View key={i} style={[styles.itemCard, { borderLeftColor: '#FBBF24' }]}>
                    <Text style={styles.itemClaim}>"{c.analyst_claim}"</Text>
                    <Text style={styles.itemData}>
                      FII contradicts: {c.fii_data}
                    </Text>
                    <View style={styles.itemFooter}>
                      <View
                        style={[
                          styles.confidenceDot,
                          { backgroundColor: getRiskColor(c.risk_level) },
                        ]}
                      />
                      <Text style={styles.itemConfidence}>{c.risk_level || 'Moderate'}</Text>
                    </View>
                  </View>
                ))}
            </View>
          )}

          {/* Blind Spots Section */}
          {blindSpots.length > 0 && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setShowBlindSpots(!showBlindSpots)}
                activeOpacity={0.7}
              >
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="search" size={18} color="#8B5CF6" />
                  <Text style={styles.sectionTitle}>BLIND SPOTS — Analyst Missed</Text>
                </View>
                <Ionicons
                  name={showBlindSpots ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="rgba(255,255,255,0.4)"
                />
              </TouchableOpacity>
              {showBlindSpots &&
                blindSpots.map((b: any, i: number) => (
                  <View key={i} style={[styles.itemCard, { borderLeftColor: '#8B5CF6' }]}>
                    <Text style={styles.itemFactor}>{b.factor}</Text>
                    <Text style={styles.itemData}>{b.fii_finding}</Text>
                    <Text style={styles.itemWhy}>{b.why_it_matters}</Text>
                    <View style={styles.itemFooter}>
                      <View
                        style={[
                          styles.confidenceDot,
                          { backgroundColor: getRiskColor(b.risk_level) },
                        ]}
                      />
                      <Text style={styles.itemConfidence}>{b.risk_level || 'Moderate'}</Text>
                    </View>
                  </View>
                ))}
            </View>
          )}

          {/* Executive Summary */}
          {result.executive_summary ? (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="document-text" size={18} color="#60A5FA" />
                <Text style={styles.sectionTitle}>Executive Summary</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryText}>{result.executive_summary}</Text>
              </View>
            </View>
          ) : null}

          {/* Ask AI Coach */}
          <TouchableOpacity style={styles.coachButton} onPress={handleAskCoach} activeOpacity={0.7}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#60A5FA" />
            <Text style={styles.coachButtonText}>Ask AI Coach about this critique</Text>
            <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>

          {/* Disclaimer */}
          <View style={styles.disclaimerContainer}>
            <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.35)" />
            <Text style={styles.disclaimerText}>
              {result.disclaimer ||
                'Educational analysis comparing third-party reports against FII factor data. Not investment advice.'}
            </Text>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // ─── INPUT VIEW ───
  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analyst Report Critic</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Stock Search */}
          <Text style={styles.inputLabel}>Which stock is this report about?</Text>
          {selectedStock ? (
            <View style={styles.selectedRow}>
              <Text style={styles.selectedTicker}>{selectedStock.ticker}</Text>
              <Text style={styles.selectedName} numberOfLines={1}>
                {selectedStock.companyName}
              </Text>
              <TouchableOpacity onPress={() => { setSelectedStock(null); setSearchQuery(''); }}>
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={16} color="rgba(255,255,255,0.3)" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search stock..."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="characters"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.3)" />
                  </TouchableOpacity>
                )}
              </View>
              {searchResults.length > 0 && (
                <View style={styles.searchResults}>
                  {searchResults.map((s) => (
                    <TouchableOpacity
                      key={s.ticker}
                      style={styles.searchResultRow}
                      onPress={() => {
                        setSelectedStock(s);
                        setSearchQuery('');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.searchResultTicker}>{s.ticker}</Text>
                      <Text style={styles.searchResultName} numberOfLines={1}>
                        {s.companyName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Report Text */}
          <Text style={[styles.inputLabel, { marginTop: 20 }]}>Paste the analyst report below:</Text>
          <View style={styles.textAreaContainer}>
            <TextInput
              style={styles.textArea}
              placeholder="Paste analyst report text here..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              value={reportText}
              onChangeText={(t) => setReportText(t.slice(0, 15000))}
              multiline
              textAlignVertical="top"
              scrollEnabled
            />
          </View>
          <Text style={styles.charCount}>
            {reportText.length.toLocaleString()} / 15,000
          </Text>

          {/* Source */}
          <Text style={[styles.inputLabel, { marginTop: 16 }]}>Source (optional):</Text>
          <View style={styles.sourceContainer}>
            <TextInput
              style={styles.sourceInput}
              placeholder="e.g. Morgan Stanley"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={source}
              onChangeText={setSource}
            />
          </View>

          {/* Analyze Button */}
          <TouchableOpacity
            style={[styles.analyzeButton, !canAnalyze && styles.analyzeButtonDisabled]}
            onPress={handleAnalyze}
            disabled={!canAnalyze || loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.analyzeButtonText}>
                  Analyzing... This takes ~10 seconds
                </Text>
              </View>
            ) : (
              <View style={styles.loadingRow}>
                <Ionicons name="flask" size={18} color="#fff" />
                <Text style={styles.analyzeButtonText}>Analyze Report</Text>
              </View>
            )}
          </TouchableOpacity>

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color="#F59E0B" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Hint */}
          <View style={styles.hintContainer}>
            <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.35)" />
            <Text style={styles.hintText}>
              Paste text from any analyst report — Morningstar, Seeking Alpha, Goldman Sachs, JP
              Morgan, etc.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// ─── Styles ───
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { marginRight: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Input
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    marginLeft: 8,
  },
  searchResults: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  searchResultTicker: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    width: 60,
  },
  searchResultName: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,201,167,0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,201,167,0.2)',
    gap: 8,
  },
  selectedTicker: { fontSize: 15, fontWeight: '700', color: '#00C9A7' },
  selectedName: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.6)' },

  textAreaContainer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 180,
    maxHeight: 300,
  },
  textArea: {
    fontSize: 14,
    color: '#fff',
    padding: 14,
    minHeight: 180,
    lineHeight: 20,
  },
  charCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'right',
    marginTop: 4,
  },
  sourceContainer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
  },
  sourceInput: { fontSize: 15, color: '#fff' },

  analyzeButton: {
    marginTop: 24,
    backgroundColor: '#60A5FA',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  analyzeButtonDisabled: { opacity: 0.4 },
  analyzeButtonText: { fontSize: 16, fontWeight: '700', color: '#fff', marginLeft: 8 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  errorText: { fontSize: 13, color: '#F59E0B' },

  hintContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 20,
    gap: 6,
  },
  hintText: { fontSize: 12, color: 'rgba(255,255,255,0.35)', flex: 1, lineHeight: 17 },

  // Results
  scoreCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  scoreCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreBarContainer: {
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 10,
  },
  scoreBarFill: { height: '100%', borderRadius: 5 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6 },
  scoreValue: { fontSize: 24, fontWeight: '800' },
  scoreLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  scoreDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 14,
  },
  compareRow: { flexDirection: 'row', gap: 20 },
  compareItem: { flex: 1 },
  compareLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2, textTransform: 'uppercase' },
  compareValue: { fontSize: 14, fontWeight: '600', color: '#fff' },
  alignmentText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 12,
    lineHeight: 18,
  },

  // Sections
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },

  itemCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  itemClaim: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
    fontStyle: 'italic',
  },
  itemFactor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  itemData: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
    marginBottom: 6,
  },
  itemWhy: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 17,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  itemFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confidenceDot: { width: 8, height: 8, borderRadius: 4 },
  itemConfidence: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },

  // Summary
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  summaryText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 20 },

  // Coach button
  coachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(96,165,250,0.08)',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.15)',
    gap: 8,
  },
  coachButtonText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#60A5FA' },

  // Disclaimer
  disclaimerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
    marginBottom: 20,
  },
  disclaimerText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    flex: 1,
    lineHeight: 16,
  },
});
