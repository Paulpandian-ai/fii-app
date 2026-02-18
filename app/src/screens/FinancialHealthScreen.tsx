import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { getFundamentals } from '../services/api';
import type { FundamentalAnalysis } from '../types';

/** Safe number: coerce anything to a finite number or 0. */
const safeNum = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const GRADE_COLORS: Record<string, string> = {
  A: '#10B981', 'A-': '#10B981',
  'B+': '#34D399', B: '#34D399',
  'C+': '#F59E0B', C: '#F59E0B',
  D: '#EF4444', F: '#EF4444',
  'N/A': '#64748B',
};

const getGradeColor = (grade: string): string =>
  GRADE_COLORS[grade] || GRADE_COLORS['N/A'];

interface FinancialHealthScreenProps {
  route: { params: { ticker: string } };
  navigation: any;
}

export const FinancialHealthScreen: React.FC<FinancialHealthScreenProps> = ({ route, navigation }) => {
  const { ticker } = route.params;
  const [data, setData] = useState<FundamentalAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [ticker]);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getFundamentals(ticker);
      if (result) setData(result);
    } catch {
      // handled by error state
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={styles.content}>
          <View style={{ alignItems: 'center' }}>
            <Skeleton width={120} height={120} borderRadius={60} />
            <View style={{ height: 16 }} />
            <Skeleton width={200} height={24} borderRadius={8} />
          </View>
          <View style={{ height: 32 }} />
          <Skeleton width={'100%'} height={100} borderRadius={12} />
          <View style={{ height: 16 }} />
          <Skeleton width={'100%'} height={100} borderRadius={12} />
          <View style={{ height: 16 }} />
          <Skeleton width={'100%'} height={100} borderRadius={12} />
        </View>
      </LinearGradient>
    );
  }

  if (!data || data.error) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <ErrorState
          icon="warning"
          message={`Financial data unavailable for ${ticker}`}
          subtitle={data?.error || 'SEC EDGAR data may not be available for this company.'}
          onRetry={loadData}
          retryLabel="Retry"
        />
      </LinearGradient>
    );
  }

  const gradeColor = getGradeColor(data.grade);
  const zScore = data.zScore;
  const fScore = data.fScore;
  const mScore = data.mScore;
  const dcf = data.dcf;
  const ratios = data.ratios || {};

  return (
    <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
      <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero Grade */}
        <View style={styles.heroSection}>
          <View style={[styles.gradeCircle, { borderColor: gradeColor }]}>
            <Text style={[styles.gradeText, { color: gradeColor }]}>{data.grade}</Text>
          </View>
          <Text style={styles.ticker}>{ticker}</Text>
          <Text style={styles.subtitle}>Financial Health Grade</Text>
          <Text style={styles.gradeScoreText}>
            Score: {safeNum(data.gradeScore).toFixed(0)}/100
          </Text>
        </View>

        {/* Score Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scoring Models</Text>

          {/* Z-Score Card */}
          {zScore && (
            <View style={styles.scoreCard}>
              <View style={styles.scoreCardHeader}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#60A5FA" />
                <Text style={styles.scoreCardTitle}>Altman Z-Score</Text>
                <View style={[styles.zonePill, {
                  backgroundColor: zScore.zone === 'safe' ? 'rgba(16,185,129,0.15)' :
                    zScore.zone === 'gray' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                }]}>
                  <Text style={[styles.zonePillText, {
                    color: zScore.zone === 'safe' ? '#10B981' :
                      zScore.zone === 'gray' ? '#F59E0B' : '#EF4444',
                  }]}>
                    {zScore.zone === 'safe' ? 'Safe' : zScore.zone === 'gray' ? 'Gray Zone' : 'Distress'}
                  </Text>
                </View>
              </View>
              <Text style={styles.scoreValue}>{safeNum(zScore.value).toFixed(2)}</Text>
              {/* Z-Score gauge */}
              <View style={styles.gauge}>
                <View style={[styles.gaugeZone, { flex: 1.81, backgroundColor: 'rgba(239,68,68,0.3)' }]} />
                <View style={[styles.gaugeZone, { flex: 1.18, backgroundColor: 'rgba(245,158,11,0.3)' }]} />
                <View style={[styles.gaugeZone, { flex: 2, backgroundColor: 'rgba(16,185,129,0.3)' }]} />
              </View>
              <View style={styles.gaugeLabels}>
                <Text style={styles.gaugeLabel}>0</Text>
                <Text style={styles.gaugeLabel}>1.81</Text>
                <Text style={styles.gaugeLabel}>2.99</Text>
                <Text style={styles.gaugeLabel}>5+</Text>
              </View>
              <Text style={styles.scoreCaption}>
                Bankruptcy prediction model (Z {'>'} 2.99 = safe)
              </Text>
            </View>
          )}

          {/* F-Score Card */}
          {fScore && (
            <View style={styles.scoreCard}>
              <View style={styles.scoreCardHeader}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#60A5FA" />
                <Text style={styles.scoreCardTitle}>Piotroski F-Score</Text>
                <View style={[styles.zonePill, {
                  backgroundColor: fScore.interpretation === 'strong' ? 'rgba(16,185,129,0.15)' :
                    fScore.interpretation === 'moderate' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                }]}>
                  <Text style={[styles.zonePillText, {
                    color: fScore.interpretation === 'strong' ? '#10B981' :
                      fScore.interpretation === 'moderate' ? '#F59E0B' : '#EF4444',
                  }]}>
                    {fScore.interpretation}
                  </Text>
                </View>
              </View>
              <Text style={styles.scoreValue}>{safeNum(fScore.value)}/9</Text>
              {/* F-Score dot grid */}
              <View style={styles.dotGrid}>
                {Array.from({ length: 9 }).map((_, i) => (
                  <View
                    key={`dot-${i}`}
                    style={[
                      styles.dot,
                      {
                        backgroundColor: i < safeNum(fScore.value)
                          ? '#10B981' : 'rgba(255,255,255,0.15)',
                      },
                    ]}
                  />
                ))}
              </View>
              {/* Criteria list */}
              {fScore.criteria && fScore.criteria.length > 0 && (
                <View style={styles.criteriaList}>
                  {fScore.criteria.map((c, i) => (
                    <View key={`crit-${i}`} style={styles.criteriaRow}>
                      <Ionicons
                        name={c.earned ? 'checkmark-circle' : 'close-circle'}
                        size={16}
                        color={c.earned ? '#10B981' : 'rgba(239,68,68,0.5)'}
                      />
                      <Text style={styles.criteriaName}>{c.name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* M-Score Card */}
          {mScore && (
            <View style={styles.scoreCard}>
              <View style={styles.scoreCardHeader}>
                <Ionicons name="eye-outline" size={20} color="#60A5FA" />
                <Text style={styles.scoreCardTitle}>Beneish M-Score</Text>
                <View style={[styles.zonePill, {
                  backgroundColor: mScore.interpretation === 'unlikely_manipulator'
                    ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                }]}>
                  <Text style={[styles.zonePillText, {
                    color: mScore.interpretation === 'unlikely_manipulator'
                      ? '#10B981' : '#EF4444',
                  }]}>
                    {mScore.interpretation === 'unlikely_manipulator' ? 'Clean' : 'Red Flag'}
                  </Text>
                </View>
              </View>
              <Text style={styles.scoreValue}>{safeNum(mScore.value).toFixed(2)}</Text>
              <Text style={styles.scoreCaption}>
                Earnings manipulation detection (M {'<'} -2.22 = unlikely)
              </Text>
            </View>
          )}
        </View>

        {/* DCF Valuation */}
        {dcf && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DCF Valuation</Text>
            <View style={styles.dcfCard}>
              <View style={styles.dcfHeader}>
                <View>
                  <Text style={styles.dcfLabel}>Fair Value</Text>
                  <Text style={styles.dcfFairValue}>${safeNum(dcf.fairValue).toFixed(2)}</Text>
                </View>
                {dcf.upside != null && (
                  <View style={[styles.upsidePill, {
                    backgroundColor: dcf.upside >= 0
                      ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  }]}>
                    <Ionicons
                      name={dcf.upside >= 0 ? 'trending-up' : 'trending-down'}
                      size={16}
                      color={dcf.upside >= 0 ? '#10B981' : '#EF4444'}
                    />
                    <Text style={[styles.upsideText, {
                      color: dcf.upside >= 0 ? '#10B981' : '#EF4444',
                    }]}>
                      {dcf.upside >= 0 ? '+' : ''}{safeNum(dcf.upside).toFixed(1)}%
                    </Text>
                  </View>
                )}
              </View>

              {/* Price thermometer */}
              {dcf.currentPrice != null && dcf.currentPrice > 0 && (
                <View style={styles.thermometer}>
                  <View style={styles.thermoBar}>
                    <View style={[styles.thermoFill, {
                      width: `${Math.min(100, Math.max(10, (dcf.currentPrice / dcf.fairValue) * 100))}%`,
                      backgroundColor: dcf.upside != null && dcf.upside >= 0 ? '#10B981' : '#EF4444',
                    }]} />
                  </View>
                  <View style={styles.thermoLabels}>
                    <Text style={styles.thermoLabel}>
                      Current: ${safeNum(dcf.currentPrice).toFixed(2)}
                    </Text>
                    <Text style={styles.thermoLabel}>
                      Fair: ${safeNum(dcf.fairValue).toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}

              <Text style={styles.dcfCaption}>
                Based on 10-year DCF model with {safeNum(dcf.growthRate).toFixed(1)}% growth,{' '}
                {safeNum(dcf.discountRate).toFixed(1)}% WACC
              </Text>

              {/* Sensitivity Table */}
              {dcf.sensitivity && dcf.sensitivity.length > 0 && dcf.terminalGrowthScenarios && (
                <View style={styles.sensitivityTable}>
                  <Text style={styles.sensitivityTitle}>Sensitivity Analysis</Text>
                  {/* Header row */}
                  <View style={styles.sensitivityRow}>
                    <Text style={[styles.sensitivityCell, styles.sensitivityHeader]}>WACC \\ TG</Text>
                    {dcf.terminalGrowthScenarios.map((tg, i) => (
                      <Text key={`tg-${i}`} style={[styles.sensitivityCell, styles.sensitivityHeader]}>
                        {safeNum(tg).toFixed(1)}%
                      </Text>
                    ))}
                  </View>
                  {/* Data rows */}
                  {dcf.sensitivity.map((row, ri) => (
                    <View key={`row-${ri}`} style={styles.sensitivityRow}>
                      <Text style={[styles.sensitivityCell, styles.sensitivityHeader]}>
                        {safeNum(row.wacc).toFixed(1)}%
                      </Text>
                      {row.values.map((val, ci) => (
                        <Text key={`cell-${ri}-${ci}`} style={styles.sensitivityCell}>
                          {val != null ? `$${safeNum(val).toFixed(0)}` : '—'}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Key Ratios */}
        {Object.keys(ratios).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Ratios</Text>
            <View style={styles.ratiosGrid}>
              {[
                { label: 'P/E', value: ratios.peRatio, fmt: (v: number) => safeNum(v).toFixed(1) },
                { label: 'P/B', value: ratios.priceToBook, fmt: (v: number) => safeNum(v).toFixed(2) },
                { label: 'EV/EBITDA', value: ratios.evToEbitda, fmt: (v: number) => safeNum(v).toFixed(1) },
                { label: 'ROE', value: ratios.roe, fmt: (v: number) => `${safeNum(v).toFixed(1)}%` },
                { label: 'Debt/Equity', value: ratios.debtToEquity, fmt: (v: number) => safeNum(v).toFixed(2) },
                { label: 'Current Ratio', value: ratios.currentRatio, fmt: (v: number) => safeNum(v).toFixed(2) },
                { label: 'Net Margin', value: ratios.netProfitMargin, fmt: (v: number) => `${safeNum(v).toFixed(1)}%` },
                { label: 'Op Margin', value: ratios.operatingMargin, fmt: (v: number) => `${safeNum(v).toFixed(1)}%` },
              ].filter(r => r.value != null).map((r) => (
                <View key={r.label} style={styles.ratioItem}>
                  <Text style={styles.ratioLabel}>{r.label}</Text>
                  <Text style={styles.ratioValue}>{r.fmt(r.value as number)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <DisclaimerBanner />
        <View style={{ height: 40 }} />
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 60 },
  closeBtn: { position: 'absolute', top: 50, left: 20, zIndex: 10, padding: 8 },

  // Hero
  heroSection: { alignItems: 'center', marginBottom: 32 },
  gradeCircle: {
    width: 120, height: 120, borderRadius: 60,
    borderWidth: 4, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  gradeText: { fontSize: 48, fontWeight: '900' },
  ticker: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', letterSpacing: 2, marginTop: 16 },
  subtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4 },
  gradeScoreText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 8, fontWeight: '600' },

  // Sections
  section: { marginBottom: 28 },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 16 },

  // Score Cards
  scoreCard: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16,
    padding: 16, marginBottom: 12,
  },
  scoreCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  scoreCardTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flex: 1 },
  scoreValue: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', marginBottom: 8 },
  scoreCaption: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 8 },

  // Zone pill
  zonePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  zonePillText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  // Gauge
  gauge: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  gaugeZone: { height: 8 },
  gaugeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  gaugeLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10 },

  // Dot grid
  dotGrid: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  dot: { width: 24, height: 24, borderRadius: 12 },

  // F-Score criteria
  criteriaList: { marginTop: 8 },
  criteriaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  criteriaName: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },

  // DCF
  dcfCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16 },
  dcfHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  dcfLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 4 },
  dcfFairValue: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  dcfCaption: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 12 },

  // Upside pill
  upsidePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
  },
  upsideText: { fontSize: 16, fontWeight: '800' },

  // Thermometer
  thermometer: { marginVertical: 12 },
  thermoBar: {
    height: 12, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden',
  },
  thermoFill: { height: 12, borderRadius: 6 },
  thermoLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  thermoLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },

  // Sensitivity table
  sensitivityTable: { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 12 },
  sensitivityTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  sensitivityRow: { flexDirection: 'row' },
  sensitivityCell: {
    flex: 1, textAlign: 'center', color: 'rgba(255,255,255,0.7)',
    fontSize: 11, paddingVertical: 4,
  },
  sensitivityHeader: { color: 'rgba(255,255,255,0.4)', fontWeight: '700' },

  // Ratios
  ratiosGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16,
  },
  ratioItem: {
    width: '47%', backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10, padding: 12,
  },
  ratioLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 4 },
  ratioValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
