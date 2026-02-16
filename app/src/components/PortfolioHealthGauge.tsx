import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { getPortfolioHealth } from '../services/api';
import type { PortfolioHealth, HealthSubScore } from '../types';

const GAUGE_SIZE = 120;
const STROKE_WIDTH = 10;
const RADIUS = (GAUGE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const GRADE_COLORS: Record<string, string> = {
  A: '#10B981',
  B: '#34D399',
  C: '#F59E0B',
  D: '#F97316',
  F: '#EF4444',
};

interface PortfolioHealthGaugeProps {
  hasHoldings: boolean;
}

export const PortfolioHealthGauge: React.FC<PortfolioHealthGaugeProps> = ({ hasHoldings }) => {
  const [health, setHealth] = useState<PortfolioHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (hasHoldings) {
      loadHealth();
    } else {
      setLoading(false);
    }
  }, [hasHoldings]);

  const loadHealth = async () => {
    try {
      const data = await getPortfolioHealth();
      setHealth(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  if (!hasHoldings) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Portfolio Health</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="heart-outline" size={32} color="rgba(255,255,255,0.15)" />
          <Text style={styles.emptyText}>Add holdings to see your health score</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Portfolio Health</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#60A5FA" />
        </View>
      </View>
    );
  }

  if (!health) return null;

  const score = health.overallScore;
  const gradeColor = GRADE_COLORS[health.grade] || '#F59E0B';
  const progressOffset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
  const center = GAUGE_SIZE / 2;

  const renderSubScore = (sub: HealthSubScore) => {
    const barWidth = sub.score;
    return (
      <View key={sub.label} style={styles.subRow}>
        <View style={styles.subLabel}>
          <Text style={styles.subLabelText}>{sub.label}</Text>
          <Text style={styles.subScore}>{sub.score}</Text>
        </View>
        <View style={styles.subBarBg}>
          <View
            style={[
              styles.subBarFill,
              {
                width: `${barWidth}%`,
                backgroundColor: barWidth >= 70 ? '#10B981' : barWidth >= 45 ? '#F59E0B' : '#EF4444',
              },
            ]}
          />
        </View>
        <Text style={styles.subDesc}>{sub.description}</Text>
      </View>
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Portfolio Health</Text>
      </View>

      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => setExpanded(!expanded)}
      >
        <View style={styles.gaugeRow}>
          {/* Circular gauge */}
          <View style={styles.gauge}>
            <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
              <Circle
                cx={center}
                cy={center}
                r={RADIUS}
                strokeWidth={STROKE_WIDTH}
                stroke="rgba(255,255,255,0.08)"
                fill="none"
              />
              <Circle
                cx={center}
                cy={center}
                r={RADIUS}
                strokeWidth={STROKE_WIDTH}
                stroke={gradeColor}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={progressOffset}
                rotation={-90}
                origin={`${center}, ${center}`}
              />
            </Svg>
            <View style={styles.gaugeInner}>
              <Text style={[styles.gaugeScore, { color: gradeColor }]}>{score}</Text>
              <Text style={[styles.gaugeGrade, { color: gradeColor }]}>{health.grade}</Text>
            </View>
          </View>

          <View style={styles.gaugeInfo}>
            <Text style={styles.gaugeTitle}>
              {score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 50 ? 'Fair' : 'Needs Work'}
            </Text>
            {health.suggestions.length > 0 && (
              <Text style={styles.gaugeSuggestion} numberOfLines={2}>
                {health.suggestions[0]}
              </Text>
            )}
            <View style={styles.expandHint}>
              <Text style={styles.expandText}>{expanded ? 'Tap to collapse' : 'Tap for details'}</Text>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="rgba(255,255,255,0.3)"
              />
            </View>
          </View>
        </View>

        {expanded && (
          <View style={styles.details}>
            {renderSubScore(health.diversification)}
            {renderSubScore(health.riskBalance)}
            {renderSubScore(health.signalAlignment)}
            {renderSubScore(health.concentration)}

            {health.suggestions.length > 1 && (
              <View style={styles.suggestionsBox}>
                <Text style={styles.suggestionsTitle}>Suggestions</Text>
                {health.suggestions.map((s, i) => (
                  <View key={i} style={styles.suggestionRow}>
                    <Ionicons name="bulb-outline" size={12} color="#F59E0B" />
                    <Text style={styles.suggestionText}>{s}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  loadingContainer: { height: 120, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },
  card: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  gauge: { position: 'relative', width: GAUGE_SIZE, height: GAUGE_SIZE },
  gaugeInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gaugeScore: { fontSize: 28, fontWeight: '800' },
  gaugeGrade: { fontSize: 14, fontWeight: '700', marginTop: -2 },
  gaugeInfo: { flex: 1 },
  gaugeTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  gaugeSuggestion: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6, lineHeight: 18 },
  expandHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  expandText: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },
  details: { marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 14, gap: 14 },
  subRow: {},
  subLabel: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  subLabelText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },
  subScore: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  subBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' },
  subBarFill: { height: 6, borderRadius: 3 },
  subDesc: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3 },
  suggestionsBox: { marginTop: 4, backgroundColor: 'rgba(245,158,11,0.06)', borderRadius: 10, padding: 12 },
  suggestionsTitle: { color: '#F59E0B', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  suggestionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 6 },
  suggestionText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, flex: 1, lineHeight: 17 },
});
