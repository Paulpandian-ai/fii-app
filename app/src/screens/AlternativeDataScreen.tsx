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
import Svg, { Rect, Circle as SvgCircle, Line, G } from 'react-native-svg';
import { Skeleton } from '../components/Skeleton';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { getAltData } from '../services/api';
import type { AlternativeData, PatentData, ContractData, FDAData } from '../types';

const safeNum = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
};

const formatCurrency = (n: number): string => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

interface AlternativeDataScreenProps {
  route: { params: { ticker: string } };
  navigation: any;
}

// Score gauge component
const ScoreGauge: React.FC<{ score: number; label: string; color: string }> = ({ score, label, color }) => (
  <View style={styles.gaugeContainer}>
    <View style={[styles.gaugeCircle, { borderColor: color }]}>
      <Text style={[styles.gaugeScore, { color }]}>{safeNum(score).toFixed(1)}</Text>
      <Text style={styles.gaugeMax}>/10</Text>
    </View>
    <Text style={styles.gaugeLabel}>{label}</Text>
  </View>
);

// Bar chart for quarterly data
const QuarterlyBarChart: React.FC<{
  data: Array<{ quarter: string; count?: number; value?: number }>;
  valueKey: 'count' | 'value';
  color: string;
}> = ({ data, valueKey, color }) => {
  const values = data.map((d) => safeNum(valueKey === 'count' ? d.count : d.value));
  const maxVal = Math.max(...values, 1);

  return (
    <View style={styles.barChart}>
      <View style={styles.barChartBars}>
        {data.map((d, i) => {
          const val = values[i];
          const height = Math.max(4, (val / maxVal) * 60);
          return (
            <View key={`bar-${i}`} style={styles.barCol}>
              <Text style={styles.barValue}>
                {valueKey === 'value' ? formatCurrency(val) : val}
              </Text>
              <View style={[styles.bar, { height, backgroundColor: color }]} />
              <Text style={styles.barLabel} numberOfLines={1}>
                {d.quarter}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// Pipeline funnel chart for FDA
const PipelineFunnel: React.FC<{ funnel: FDAData['pipelineFunnel'] }> = ({ funnel }) => {
  const stages = [
    { label: 'Phase I', count: funnel.phase1, color: '#94A3B8' },
    { label: 'Phase II', count: funnel.phase2, color: '#60A5FA' },
    { label: 'Phase III', count: funnel.phase3, color: '#F59E0B' },
    { label: 'Phase IV', count: funnel.phase4, color: '#8B5CF6' },
    { label: 'Approved', count: funnel.approved, color: '#10B981' },
  ];
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <View style={styles.funnelContainer}>
      {stages.map((s) => {
        const width = Math.max(20, (s.count / maxCount) * 100);
        return (
          <View key={s.label} style={styles.funnelRow}>
            <Text style={styles.funnelLabel}>{s.label}</Text>
            <View style={styles.funnelBarTrack}>
              <View
                style={[
                  styles.funnelBarFill,
                  { width: `${width}%`, backgroundColor: s.color },
                ]}
              />
            </View>
            <Text style={[styles.funnelCount, { color: s.color }]}>{s.count}</Text>
          </View>
        );
      })}
    </View>
  );
};

export const AlternativeDataScreen: React.FC<AlternativeDataScreenProps> = ({
  route,
  navigation,
}) => {
  const { ticker } = route.params;
  const [data, setData] = useState<AlternativeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [ticker]);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getAltData(ticker);
      if (result) setData(result);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Alternative Data</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.content}>
          <Skeleton width={'100%'} height={120} borderRadius={12} />
          <View style={{ height: 20 }} />
          <Skeleton width={'100%'} height={200} borderRadius={12} />
          <View style={{ height: 20 }} />
          <Skeleton width={'100%'} height={200} borderRadius={12} />
        </View>
      </LinearGradient>
    );
  }

  const patents = data?.patents;
  const contracts = data?.contracts;
  const fda = data?.fda;
  const available = data?.available || [];

  return (
    <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{ticker} Alternative Data</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {available.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="analytics-outline" size={40} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyText}>
              No alternative data available for {ticker}
            </Text>
            <Text style={styles.emptySubtext}>
              Patent, government contract, and FDA data is available for tech, defense, and pharma companies.
            </Text>
          </View>
        )}

        {/* Patent Section */}
        {patents && patents.score > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="bulb-outline" size={20} color="#F59E0B" />
              <Text style={styles.sectionTitle}>Patent Intelligence</Text>
            </View>

            <ScoreGauge score={patents.score} label="Innovation Score" color="#F59E0B" />

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{patents.totalLast12Mo}</Text>
                <Text style={styles.statLabel}>Patents (12mo)</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, {
                  color: patents.velocity >= 0 ? '#10B981' : '#EF4444',
                }]}>
                  {patents.velocity >= 0 ? '+' : ''}{safeNum(patents.velocity).toFixed(0)}%
                </Text>
                <Text style={styles.statLabel}>YoY Growth</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{safeNum(patents.avgCitations).toFixed(1)}</Text>
                <Text style={styles.statLabel}>Avg Citations</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{patents.distinctCpcSections}</Text>
                <Text style={styles.statLabel}>Tech Areas</Text>
              </View>
            </View>

            {/* Quarterly bar chart */}
            {patents.quarterly && patents.quarterly.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Patent Grants by Quarter</Text>
                <QuarterlyBarChart
                  data={patents.quarterly}
                  valueKey="count"
                  color="#F59E0B"
                />
              </View>
            )}

            {/* Tech distribution */}
            {patents.techDistribution && Object.keys(patents.techDistribution).length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Technology Distribution</Text>
                {Object.entries(patents.techDistribution)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .slice(0, 5)
                  .map(([category, count]) => {
                    const total = Object.values(patents.techDistribution).reduce(
                      (a, b) => (a as number) + (b as number),
                      0,
                    ) as number;
                    const pct = total > 0 ? ((count as number) / total) * 100 : 0;
                    return (
                      <View key={category} style={styles.distRow}>
                        <Text style={styles.distLabel} numberOfLines={1}>{category}</Text>
                        <View style={styles.distBarTrack}>
                          <View
                            style={[styles.distBarFill, {
                              width: `${Math.min(100, pct)}%`,
                              backgroundColor: '#F59E0B',
                            }]}
                          />
                        </View>
                        <Text style={styles.distValue}>{count as number}</Text>
                      </View>
                    );
                  })}
              </View>
            )}

            {/* Recent patents */}
            {patents.recentPatents && patents.recentPatents.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Recent Patents (90 days)</Text>
                {patents.recentPatents.map((p, i) => (
                  <View key={`pat-${i}`} style={styles.listItem}>
                    <View style={styles.listItemHeader}>
                      <Text style={styles.listItemTitle} numberOfLines={2}>{p.title}</Text>
                    </View>
                    <View style={styles.listItemMeta}>
                      <Text style={styles.listItemDate}>{p.date}</Text>
                      {p.category ? (
                        <Text style={styles.listItemTag}>{p.category}</Text>
                      ) : null}
                      {p.citations > 0 && (
                        <Text style={styles.listItemCite}>{p.citations} citations</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.attribution}>Powered by USPTO PatentsView</Text>
          </View>
        )}

        {/* Government Contracts Section */}
        {contracts && contracts.score > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="business-outline" size={20} color="#60A5FA" />
              <Text style={styles.sectionTitle}>Government Contracts</Text>
            </View>

            <ScoreGauge score={contracts.score} label="Contract Score" color="#60A5FA" />

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {formatCurrency(safeNum(contracts.totalValueCurrent))}
                </Text>
                <Text style={styles.statLabel}>Awards (12mo)</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, {
                  color: contracts.awardGrowth >= 0 ? '#10B981' : '#EF4444',
                }]}>
                  {contracts.awardGrowth >= 0 ? '+' : ''}{safeNum(contracts.awardGrowth).toFixed(0)}%
                </Text>
                <Text style={styles.statLabel}>YoY Growth</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{contracts.activeContracts}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{contracts.distinctAgencies}</Text>
                <Text style={styles.statLabel}>Agencies</Text>
              </View>
            </View>

            {/* Quarterly awards chart */}
            {contracts.quarterly && contracts.quarterly.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Contract Awards by Quarter</Text>
                <QuarterlyBarChart
                  data={contracts.quarterly}
                  valueKey="value"
                  color="#60A5FA"
                />
              </View>
            )}

            {/* Agency breakdown */}
            {contracts.agencyBreakdown && contracts.agencyBreakdown.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Top Awarding Agencies</Text>
                {contracts.agencyBreakdown.slice(0, 5).map((a, i) => {
                  const maxAmt = Math.max(
                    ...contracts.agencyBreakdown.map((x) => safeNum(x.amount)),
                    1,
                  );
                  const pct = (safeNum(a.amount) / maxAmt) * 100;
                  return (
                    <View key={`agency-${i}`} style={styles.distRow}>
                      <Text style={styles.distLabel} numberOfLines={1}>{a.agency}</Text>
                      <View style={styles.distBarTrack}>
                        <View
                          style={[styles.distBarFill, {
                            width: `${Math.min(100, pct)}%`,
                            backgroundColor: '#60A5FA',
                          }]}
                        />
                      </View>
                      <Text style={styles.distValue}>{formatCurrency(safeNum(a.amount))}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Recent major contracts */}
            {contracts.recentAwards && contracts.recentAwards.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Recent Major Contracts</Text>
                {contracts.recentAwards.map((a, i) => (
                  <View key={`award-${i}`} style={styles.listItem}>
                    <View style={styles.listItemHeader}>
                      <Text style={styles.listItemTitle} numberOfLines={1}>{a.agency}</Text>
                      <Text style={[styles.listItemValue, { color: '#60A5FA' }]}>
                        {formatCurrency(safeNum(a.value))}
                      </Text>
                    </View>
                    <Text style={styles.listItemDesc} numberOfLines={2}>{a.description}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.attribution}>Powered by USASpending.gov</Text>
          </View>
        )}

        {/* FDA Pipeline Section */}
        {fda && fda.score > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="medical-outline" size={20} color="#8B5CF6" />
              <Text style={styles.sectionTitle}>FDA Pipeline</Text>
            </View>

            <ScoreGauge score={fda.score} label="Catalyst Score" color="#8B5CF6" />

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{fda.totalActiveTrials}</Text>
                <Text style={styles.statLabel}>Active Trials</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{fda.pdufaWithin90Days}</Text>
                <Text style={styles.statLabel}>PDUFA (&lt;90d)</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {(fda.pipelineFunnel?.phase3 ?? 0)}
                </Text>
                <Text style={styles.statLabel}>Phase III</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {(fda.pipelineFunnel?.approved ?? 0)}
                </Text>
                <Text style={styles.statLabel}>Approved</Text>
              </View>
            </View>

            {/* Pipeline funnel */}
            {fda.pipelineFunnel && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Pipeline Funnel</Text>
                <PipelineFunnel funnel={fda.pipelineFunnel} />
              </View>
            )}

            {/* Upcoming PDUFA dates */}
            {fda.upcomingPDUFA && fda.upcomingPDUFA.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Upcoming PDUFA Dates</Text>
                {fda.upcomingPDUFA.map((p, i) => (
                  <View key={`pdufa-${i}`} style={styles.listItem}>
                    <View style={styles.listItemHeader}>
                      <Text style={styles.listItemTitle} numberOfLines={1}>
                        {p.drugName}
                      </Text>
                      <View style={[styles.pdufaBadge, {
                        backgroundColor: p.isWithin90Days
                          ? 'rgba(239,68,68,0.15)'
                          : 'rgba(245,158,11,0.15)',
                      }]}>
                        <Text style={[styles.pdufaDays, {
                          color: p.isWithin90Days ? '#EF4444' : '#F59E0B',
                        }]}>
                          {p.daysAway}d
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.listItemDesc}>{p.indication}</Text>
                    <Text style={styles.listItemDate}>Est. {p.estimatedDate}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Recent approvals */}
            {fda.recentApprovals && fda.recentApprovals.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Recent Approvals</Text>
                {fda.recentApprovals.map((a, i) => (
                  <View key={`approval-${i}`} style={styles.listItem}>
                    <View style={styles.listItemHeader}>
                      <Text style={styles.listItemTitle}>{a.brandName}</Text>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    </View>
                    {a.genericName ? (
                      <Text style={styles.listItemDesc}>{a.genericName}</Text>
                    ) : null}
                    <Text style={styles.listItemDate}>{a.approvalDate}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Top trials */}
            {fda.topTrials && fda.topTrials.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Key Pipeline Trials</Text>
                {fda.topTrials.map((t, i) => (
                  <View key={`trial-${i}`} style={styles.listItem}>
                    <View style={styles.listItemHeader}>
                      <Text style={styles.listItemTitle} numberOfLines={2}>{t.title}</Text>
                    </View>
                    <View style={styles.listItemMeta}>
                      <Text style={styles.trialPhase}>{t.phase}</Text>
                      <Text style={styles.trialStatus}>{t.status}</Text>
                    </View>
                    <Text style={styles.listItemDesc} numberOfLines={1}>
                      {t.condition} - {t.intervention}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.attribution}>Powered by ClinicalTrials.gov + OpenFDA</Text>
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
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { padding: 8 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  content: { padding: 20 },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Sections
  section: { marginBottom: 32 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  // Score gauge
  gaugeContainer: { alignItems: 'center', marginBottom: 16 },
  gaugeCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  gaugeScore: { fontSize: 24, fontWeight: '900' },
  gaugeMax: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: -2 },
  gaugeLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600', marginTop: 6 },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2, textAlign: 'center' },

  // Chart card
  chartCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  chartTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Bar chart
  barChart: { marginTop: 4 },
  barChartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 90,
  },
  barCol: { alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  bar: { width: 16, borderRadius: 4, minHeight: 4 },
  barValue: { color: 'rgba(255,255,255,0.5)', fontSize: 8, marginBottom: 4, textAlign: 'center' },
  barLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 8, marginTop: 4, textAlign: 'center' },

  // Distribution row
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  distLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, width: 90 },
  distBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  distBarFill: { height: 6, borderRadius: 3 },
  distValue: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', width: 50, textAlign: 'right' },

  // List items
  listItem: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  listItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listItemTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  listItemValue: { fontSize: 13, fontWeight: '800' },
  listItemDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  listItemDate: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    marginTop: 2,
  },
  listItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  listItemTag: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '600',
    backgroundColor: 'rgba(245,158,11,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  listItemCite: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
  },

  // FDA-specific
  pdufaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pdufaDays: { fontSize: 12, fontWeight: '800' },
  trialPhase: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(96,165,250,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  trialStatus: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    textTransform: 'capitalize',
  },

  // Funnel
  funnelContainer: { gap: 6 },
  funnelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  funnelLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, width: 60 },
  funnelBarTrack: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  funnelBarFill: { height: 14, borderRadius: 7 },
  funnelCount: { fontSize: 12, fontWeight: '800', width: 30, textAlign: 'right' },

  // Attribution
  attribution: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
  },
});
