import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ScoreRing } from '../components/ScoreRing';
import { SignalBadge } from '../components/SignalBadge';
import { FactorBar } from '../components/FactorBar';
import { getSignalDetail, getPrice } from '../services/api';
import type {
  FullAnalysis,
  PriceData,
  FactorCategory,
  Confidence,
  Signal,
  Alternative,
} from '../types';

const FACTOR_NAMES: Record<string, string> = {
  A1: 'Operational Disruption', A2: 'Supplier Earnings Miss', A3: 'Lead Time Extensions',
  B1: 'CapEx Guidance Changes', B2: 'Contract Updates', B3: 'Customer Revenue Growth',
  C1: 'Physical Conflict', C2: 'Trade Barriers', C3: 'Logistics Disruption',
  D1: 'Fed Decisions', D2: 'CPI/Inflation', D3: '10Y Treasury Yield',
  E1: 'Sector Peers', E2: 'Commodity Link', E3: 'Risk Sentiment',
  F1: 'EPS Surprise', F2: 'Guidance Revision', F3: 'Beta/Volatility',
};

const CATEGORIES: { id: string; name: string; icon: string; factorIds: string[] }[] = [
  { id: 'A', name: 'Upstream Suppliers', icon: 'cube-outline', factorIds: ['A1', 'A2', 'A3'] },
  { id: 'B', name: 'Downstream Customers', icon: 'people-outline', factorIds: ['B1', 'B2', 'B3'] },
  { id: 'C', name: 'Geopolitics', icon: 'globe-outline', factorIds: ['C1', 'C2', 'C3'] },
  { id: 'D', name: 'Monetary Policy', icon: 'cash-outline', factorIds: ['D1', 'D2', 'D3'] },
  { id: 'E', name: 'Correlations', icon: 'git-compare-outline', factorIds: ['E1', 'E2', 'E3'] },
  { id: 'F', name: 'Risk & Performance', icon: 'trending-up-outline', factorIds: ['F1', 'F2', 'F3'] },
];

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  HIGH: '#10B981',
  MEDIUM: '#F59E0B',
  LOW: '#EF4444',
};

/** Safe number: coerce anything to a finite number or 0. */
const safeNum = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatLargeNumber = (n: unknown): string => {
  const v = safeNum(n);
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};

interface SignalDetailScreenProps {
  route: { params: { ticker: string } };
  navigation: any;
}

export const SignalDetailScreen: React.FC<SignalDetailScreenProps> = ({ route, navigation }) => {
  const { ticker } = route.params;
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [ticker]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [signalData, price] = await Promise.all([
        getSignalDetail(ticker).catch(() => null),
        getPrice(ticker).catch(() => null),
      ]);
      if (signalData) setAnalysis(signalData);
      if (price) setPriceData(price);
    } finally {
      setLoading(false);
    }
  };

  const buildCategories = (): FactorCategory[] => {
    if (!analysis?.factorDetails) return [];
    return CATEGORIES.map((cat) => {
      const subFactors = cat.factorIds.map((fid) => ({
        id: fid,
        name: FACTOR_NAMES[fid] || fid,
        score: analysis.factorDetails[fid]?.score ?? 0,
        reason: analysis.factorDetails[fid]?.reason ?? 'No data available',
      }));
      const scores = subFactors.map((sf) => sf.score);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return { id: cat.id, name: cat.name, icon: cat.icon, avgScore: Math.round(avgScore * 10) / 10, subFactors };
    });
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#60A5FA" />
          <Text style={styles.loadingText}>Loading analysis...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!analysis) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>No data available for {ticker}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const categories = buildCategories();
  const priceChange = safeNum(priceData?.change);
  const priceChangePct = safeNum(priceData?.changePercent);
  const priceValue = safeNum(priceData?.price);
  const hasPriceToShow = priceData != null && typeof priceData.price === 'number' && Number.isFinite(priceData.price);
  const isPositive = priceChange >= 0;
  const confidence = analysis.confidence || 'MEDIUM';
  const showAlternatives =
    analysis.alternatives?.length > 0 &&
    (analysis.signal === 'SELL' || (analysis.signal === 'HOLD' && safeNum(analysis.compositeScore) <= 4));

  return (
    <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
      <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={28} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Section 1: Header */}
        <View style={styles.header}>
          <ScoreRing score={safeNum(analysis.compositeScore)} size={100} />
          <Text style={styles.ticker}>{analysis.ticker}</Text>
          <Text style={styles.companyName}>{analysis.companyName}</Text>
          {hasPriceToShow && (
            <View style={styles.priceRow}>
              <Text style={styles.price}>${priceValue.toFixed(2)}</Text>
              <Text style={[styles.priceChange, { color: isPositive ? '#10B981' : '#EF4444' }]}>
                {isPositive ? '+' : ''}${priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePct.toFixed(1)}%)
              </Text>
            </View>
          )}
          <View style={styles.badgeRow}>
            <SignalBadge signal={analysis.signal as Signal} />
            <View style={[styles.confidencePill, { backgroundColor: CONFIDENCE_COLORS[confidence] + '30' }]}>
              <Text style={[styles.confidenceText, { color: CONFIDENCE_COLORS[confidence] }]}>
                {confidence}
              </Text>
            </View>
          </View>
        </View>

        {/* Section 2: The Analysis */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>The Analysis</Text>
          <View style={styles.reasoningCard}>
            <View style={styles.reasoningAccent} />
            <Text style={styles.reasoningText}>
              {analysis.reasoning || analysis.insight}
            </Text>
          </View>
        </View>

        {/* Section 3: Factor Breakdown */}
        {categories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Factor Breakdown</Text>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                activeOpacity={0.8}
                onPress={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
              >
                <View style={styles.categoryCard}>
                  <View style={styles.categoryHeader}>
                    <View style={styles.categoryLeft}>
                      <Ionicons name={cat.icon as any} size={20} color="#60A5FA" />
                      <Text style={styles.categoryName}>{cat.name}</Text>
                    </View>
                    <View style={styles.categoryRight}>
                      <FactorBar factor={{ name: cat.name, score: cat.avgScore }} compact />
                      <Ionicons
                        name={expandedCategory === cat.id ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="rgba(255,255,255,0.4)"
                        style={{ marginLeft: 8 }}
                      />
                    </View>
                  </View>
                  {expandedCategory === cat.id && (
                    <View style={styles.subFactors}>
                      {cat.subFactors.map((sf) => {
                        const sfScore = safeNum(sf.score);
                        const sfColor = sfScore >= 0 ? '#10B981' : '#EF4444';
                        const sign = sfScore >= 0 ? '+' : '';
                        return (
                          <View key={sf.id} style={styles.subFactorRow}>
                            <View style={styles.subFactorHeader}>
                              <Text style={styles.subFactorId}>{sf.id}</Text>
                              <Text style={styles.subFactorName}>{sf.name}</Text>
                              <Text style={[styles.subFactorScore, { color: sfColor }]}>
                                {sign}{sfScore.toFixed(1)}
                              </Text>
                            </View>
                            <Text style={styles.subFactorReason}>{sf.reason}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Section 5: Alternatives */}
        {showAlternatives && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alternatives</Text>
            {analysis.alternatives.map((alt: Alternative, i: number) => (
              <TouchableOpacity
                key={`${alt.ticker}-${i}`}
                style={styles.altCard}
                onPress={() => navigation.push('SignalDetail', { ticker: alt.ticker })}
              >
                <View style={styles.altHeader}>
                  <Text style={styles.altTicker}>{alt.ticker}</Text>
                  <SignalBadge signal={alt.signal as Signal} />
                </View>
                <Text style={styles.altName}>{alt.companyName}</Text>
                <Text style={styles.altReason}>{alt.reason}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Section 6: Key Data */}
        {priceData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Data</Text>
            <View style={styles.dataTable}>
              {[
                { label: 'Market Cap', value: formatLargeNumber(priceData.marketCap) },
                { label: 'Forward PE', value: priceData.forwardPE ? safeNum(priceData.forwardPE).toFixed(1) : 'N/A' },
                { label: 'Trailing PE', value: priceData.trailingPE ? safeNum(priceData.trailingPE).toFixed(1) : 'N/A' },
                { label: 'Beta', value: priceData.beta != null ? safeNum(priceData.beta).toFixed(2) : 'N/A' },
                { label: '52W Low', value: priceData.fiftyTwoWeekLow != null ? `$${safeNum(priceData.fiftyTwoWeekLow).toFixed(2)}` : 'N/A' },
                { label: '52W High', value: priceData.fiftyTwoWeekHigh != null ? `$${safeNum(priceData.fiftyTwoWeekHigh).toFixed(2)}` : 'N/A' },
                { label: 'Sector', value: priceData.sector || 'N/A' },
              ].map((row) => (
                <View key={row.label} style={styles.dataRow}>
                  <Text style={styles.dataLabel}>{row.label}</Text>
                  <Text style={styles.dataValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.3)" />
          <Text style={styles.disclaimerText}>
            For educational purposes only. Not financial advice. Always do your own research.
          </Text>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 60 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginTop: 16 },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  backBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#60A5FA', borderRadius: 8 },
  backBtnText: { color: '#FFF', fontWeight: '700' },
  header: { alignItems: 'center', marginBottom: 32 },
  ticker: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', letterSpacing: 2, marginTop: 16 },
  companyName: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8, gap: 8 },
  price: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  priceChange: { fontSize: 14, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 },
  confidencePill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  confidenceText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  section: { marginBottom: 28 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  reasoningCard: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden' },
  reasoningAccent: { width: 4, backgroundColor: '#60A5FA' },
  reasoningText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 22, padding: 16, flex: 1 },
  categoryCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  categoryRight: { flexDirection: 'row', alignItems: 'center' },
  subFactors: { paddingHorizontal: 14, paddingBottom: 14 },
  subFactorRow: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 12, marginTop: 6 },
  subFactorHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  subFactorId: {
    color: '#60A5FA', fontSize: 11, fontWeight: '800', marginRight: 8,
    backgroundColor: 'rgba(96,165,250,0.15)', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, overflow: 'hidden',
  },
  subFactorName: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500', flex: 1 },
  subFactorScore: { fontSize: 13, fontWeight: '800' },
  subFactorReason: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 17 },
  altCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14, marginBottom: 8 },
  altHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  altTicker: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  altName: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },
  altReason: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 8, lineHeight: 18 },
  dataTable: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden' },
  dataRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dataLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  dataValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  disclaimer: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  disclaimerText: { color: 'rgba(255,255,255,0.3)', fontSize: 11, flex: 1 },
});
