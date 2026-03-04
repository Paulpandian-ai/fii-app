import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Linking,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getFactorDetail } from '../services/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const DIMENSION_LABELS: Record<string, string> = {
  supply_chain_upstream: 'Supply Chain (Upstream)',
  supply_chain_downstream: 'Supply Chain (Downstream)',
  geopolitical: 'Geopolitical',
  monetary: 'Monetary Policy',
  correlations: 'Correlations',
  risk_performance: 'Risk & Performance',
};

const DIMENSION_ICONS: Record<string, string> = {
  supply_chain_upstream: 'cube-outline',
  supply_chain_downstream: 'people-outline',
  geopolitical: 'globe-outline',
  monetary: 'cash-outline',
  correlations: 'git-compare-outline',
  risk_performance: 'trending-up-outline',
};

interface Finding {
  direction: 'positive' | 'negative' | 'up' | 'down';
  text: string;
  source?: string;
  source_url?: string;
}

interface FactorDetailData {
  dimension: string;
  score: number;
  score_label: string;
  confidence: string;
  percentile: number;
  findings: Finding[];
  beginner_summary: string;
  updated_at: string;
}

interface FactorDetailCardProps {
  ticker: string;
  dimension: string;
  onClose: () => void;
}

// Cache factor detail data across re-opens
const _factorDetailCache = new Map<string, FactorDetailData>();

export const FactorDetailCard: React.FC<FactorDetailCardProps> = ({
  ticker,
  dimension,
  onClose,
}) => {
  const [data, setData] = useState<FactorDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    // Animate in
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();

    // Check cache first
    const cacheKey = `${ticker}:${dimension}`;
    const cached = _factorDetailCache.get(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    // Fetch from API
    getFactorDetail(ticker, dimension)
      .then((result: any) => {
        const parsed: FactorDetailData = {
          dimension: result.dimension || dimension,
          score: result.score ?? 0,
          score_label: result.score_label || '',
          confidence: result.confidence || 'Medium',
          percentile: result.percentile ?? 50,
          findings: Array.isArray(result.findings) ? result.findings : [],
          beginner_summary: result.beginner_summary || result.summary || '',
          updated_at: result.updated_at || result.computed_at || '',
        };
        _factorDetailCache.set(cacheKey, parsed);
        setData(parsed);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [ticker, dimension]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const getScoreColor = (pct: number) =>
    pct >= 90 ? '#00C9A7' : pct >= 70 ? '#4A90D9' : pct >= 40 ? '#8E8E93' : pct >= 20 ? '#F5A623' : '#5856D6';

  const formatDate = (ts: string) => {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return ts;
    }
  };

  const label = DIMENSION_LABELS[dimension] || dimension;
  const icon = DIMENSION_ICONS[dimension] || 'analytics-outline';
  const pct = data?.percentile ?? 50;
  const scoreColor = getScoreColor(pct);

  return (
    <Modal transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Ionicons name={icon as any} size={16} color={scoreColor} />
              <Text style={styles.headerTitle}>{label}</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={[styles.percentileText, { color: scoreColor }]}>{Math.round(pct)}th</Text>
              <View style={[styles.percentileDot, { backgroundColor: scoreColor }]} />
            </View>
          </View>

          {/* Score Label + Confidence */}
          {data && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: scoreColor }]}>
                {data.score_label}
              </Text>
              <Text style={styles.metaSeparator}> · </Text>
              <Text style={styles.metaConfidence}>
                {data.confidence} Confidence
              </Text>
            </View>
          )}

          <View style={styles.divider} />

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#60A5FA" size="small" />
                <Text style={styles.loadingText}>Loading factor analysis...</Text>
              </View>
            )}

            {error && !data && (
              <View style={styles.emptyContainer}>
                <Ionicons name="hourglass-outline" size={28} color="rgba(255,255,255,0.3)" />
                <Text style={styles.emptyText}>
                  Factor analysis in progress. Available after next scoring cycle.
                </Text>
              </View>
            )}

            {data && (
              <>
                {/* Key Findings */}
                {data.findings.length > 0 && (
                  <View style={styles.findingsSection}>
                    <Text style={styles.sectionLabel}>Key Findings</Text>
                    {data.findings.map((finding, idx) => {
                      const isPositive = finding.direction === 'positive' || finding.direction === 'up';
                      const arrowColor = isPositive ? '#00C9A7' : '#F5A623';
                      return (
                        <View key={`finding-${idx}`} style={styles.findingRow}>
                          <Text style={[styles.findingArrow, { color: arrowColor }]}>
                            {isPositive ? '\u2191' : '\u2193'}
                          </Text>
                          <View style={styles.findingContent}>
                            <Text style={styles.findingText}>{finding.text}</Text>
                            {finding.source && (
                              <TouchableOpacity
                                onPress={() => {
                                  if (finding.source_url) Linking.openURL(finding.source_url);
                                }}
                                disabled={!finding.source_url}
                              >
                                <Text style={styles.findingSource}>
                                  {'\uD83D\uDCC4'} {finding.source}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* What This Means */}
                {data.beginner_summary ? (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.summarySection}>
                      <Text style={styles.sectionLabel}>What This Means</Text>
                      <Text style={styles.summaryText}>{data.beginner_summary}</Text>
                    </View>
                  </>
                ) : null}

                {/* Footer */}
                <View style={styles.footer}>
                  {data.updated_at ? (
                    <Text style={styles.footerTimestamp}>
                      {'\uD83D\uDD50'} Last updated: {formatDate(data.updated_at)}
                    </Text>
                  ) : null}
                  <Text style={styles.footerDisclaimer}>
                    {'\u24D8'} For educational purposes only
                  </Text>
                </View>
              </>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.8,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  percentileText: {
    fontSize: 16,
    fontWeight: '800',
  },
  percentileDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginLeft: 34,
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  metaSeparator: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
  },
  metaConfidence: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 12,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  findingsSection: {
    marginBottom: 4,
  },
  sectionLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  findingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  findingArrow: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 1,
  },
  findingContent: {
    flex: 1,
  },
  findingText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 20,
  },
  findingSource: {
    color: '#00C9A7',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  summarySection: {
    marginBottom: 4,
  },
  summaryText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 21,
  },
  footer: {
    marginTop: 16,
    gap: 6,
  },
  footerTimestamp: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
  footerDisclaimer: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    fontStyle: 'italic',
  },
});
