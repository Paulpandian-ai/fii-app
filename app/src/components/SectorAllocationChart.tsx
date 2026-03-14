import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { getPortfolioAnalytics } from '../services/api';
import { Skeleton } from './Skeleton';

interface SectorData {
  sector: string;
  weight: number;
  benchmark_weight?: number;
}

const SECTOR_COLORS: Record<string, string> = {
  'Technology': '#8B5CF6',
  'Information Technology': '#8B5CF6',
  'Healthcare': '#00C9A7',
  'Health Care': '#00C9A7',
  'Financials': '#60A5FA',
  'Consumer Discretionary': '#F5A623',
  'Communication Services': '#EC4899',
  'Industrials': '#14B8A6',
  'Consumer Staples': '#A78BFA',
  'Energy': '#F97316',
  'Utilities': '#6366F1',
  'Real Estate': '#84CC16',
  'Materials': '#06B6D4',
  'Other': '#6B7280',
};

const getColor = (sector: string, idx: number): string => {
  const fallback = ['#8B5CF6', '#00C9A7', '#60A5FA', '#F5A623', '#EC4899', '#14B8A6', '#A78BFA', '#F97316', '#6366F1', '#84CC16'];
  return SECTOR_COLORS[sector] || fallback[idx % fallback.length];
};

const SIZE = 160;
const R = 60;
const INNER_R = 38;
const CX = SIZE / 2;
const CY = SIZE / 2;

interface Props {
  analyticsData?: any;
}

export const SectorAllocationChart: React.FC<Props> = ({ analyticsData }) => {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(!analyticsData);

  useEffect(() => {
    if (analyticsData?.sector_breakdown) {
      parseSectors(analyticsData.sector_breakdown);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const data = await getPortfolioAnalytics();
        if (mounted && data?.sector_breakdown) {
          parseSectors(data.sector_breakdown);
        }
      } catch {}
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [analyticsData]);

  const parseSectors = (breakdown: any[]) => {
    const parsed = breakdown
      .map((s: any) => ({
        sector: s.sector || 'Other',
        weight: s.weight || s.pct || 0,
        benchmark_weight: s.benchmark_weight,
      }))
      .filter((s: SectorData) => s.weight > 0)
      .sort((a: SectorData, b: SectorData) => b.weight - a.weight);
    setSectors(parsed);
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Sector Allocation</Text>
        <View style={styles.card}>
          <View style={styles.chartRow}>
            <Skeleton width={SIZE} height={SIZE} borderRadius={SIZE / 2} />
            <View style={{ flex: 1, gap: 8 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} width="100%" height={14} borderRadius={4} />
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (sectors.length === 0) return null;

  // Build donut arcs
  const arcs: { path: string; color: string }[] = [];
  let startAngle = -90; // start at top

  sectors.forEach((s, idx) => {
    const angle = (s.weight / 100) * 360;
    if (angle < 0.5) return; // skip tiny slices
    const endAngle = startAngle + angle;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const largeArc = angle > 180 ? 1 : 0;

    const x1 = CX + R * Math.cos(startRad);
    const y1 = CY + R * Math.sin(startRad);
    const x2 = CX + R * Math.cos(endRad);
    const y2 = CY + R * Math.sin(endRad);

    const ix1 = CX + INNER_R * Math.cos(endRad);
    const iy1 = CY + INNER_R * Math.sin(endRad);
    const ix2 = CX + INNER_R * Math.cos(startRad);
    const iy2 = CY + INNER_R * Math.sin(startRad);

    const d = [
      `M ${x1} ${y1}`,
      `A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${INNER_R} ${INNER_R} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      'Z',
    ].join(' ');

    arcs.push({ path: d, color: getColor(s.sector, idx) });
    startAngle = endAngle;
  });

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Sector Allocation</Text>

      <View style={styles.card}>
        <View style={styles.chartRow}>
          {/* Donut */}
          <View style={styles.donutWrap}>
            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              {arcs.map((arc, i) => (
                <Path key={i} d={arc.path} fill={arc.color} />
              ))}
              {/* Center hole background */}
              <Circle cx={CX} cy={CY} r={INNER_R - 1} fill="#1A1A2E" />
            </Svg>
            {/* Center text */}
            <View style={styles.centerText}>
              <Text style={styles.centerCount}>{sectors.length}</Text>
              <Text style={styles.centerLabel}>Sectors</Text>
            </View>
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            {sectors.slice(0, 6).map((s, i) => {
              const diff = s.benchmark_weight != null ? s.weight - s.benchmark_weight : null;
              return (
                <View key={s.sector} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: getColor(s.sector, i) }]} />
                  <View style={styles.legendInfo}>
                    <Text style={styles.legendSector} numberOfLines={1}>{s.sector}</Text>
                    <Text style={styles.legendWeight}>{s.weight.toFixed(1)}%</Text>
                  </View>
                  {diff != null && Math.abs(diff) >= 2 && (
                    <Text style={[styles.legendDiff, { color: diff > 0 ? '#F5A623' : '#60A5FA' }]}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(0)}%
                    </Text>
                  )}
                </View>
              );
            })}
            {sectors.length > 6 && (
              <Text style={styles.moreText}>+{sectors.length - 6} more</Text>
            )}
          </View>
        </View>

        <Text style={styles.disclaimer}>
          Differences shown vs S&P 500 benchmark weights.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  donutWrap: {
    width: SIZE,
    height: SIZE,
    position: 'relative',
  },
  centerText: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerCount: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  centerLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '600',
  },
  legend: {
    flex: 1,
    gap: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legendSector: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
    marginRight: 4,
  },
  legendWeight: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
  },
  legendDiff: {
    fontSize: 9,
    fontWeight: '700',
    width: 30,
    textAlign: 'right',
  },
  moreText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    marginTop: 2,
    marginLeft: 14,
  },
  disclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 9,
    fontStyle: 'italic',
    marginTop: 12,
    textAlign: 'center',
  },
});
