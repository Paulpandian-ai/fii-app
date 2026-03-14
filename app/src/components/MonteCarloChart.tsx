import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Line, Text as SvgText } from 'react-native-svg';
import { getPortfolioMonteCarlo } from '../services/api';
import { Skeleton } from './Skeleton';

interface SimData {
  percentiles: {
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
  };
  expected_value: number;
  probability_gain: number;
  months: number;
}

const HORIZONS = [
  { label: '6mo', months: 6 },
  { label: '1yr', months: 12 },
  { label: '3yr', months: 36 },
  { label: '5yr', months: 60 },
];

const CHART_W = 320;
const CHART_H = 180;
const PAD_L = 0;
const PAD_R = 0;
const PAD_T = 10;
const PAD_B = 20;

const formatMoney = (v: number): string => {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

export const MonteCarloChart: React.FC = () => {
  const [data, setData] = useState<SimData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedHorizon, setSelectedHorizon] = useState(1); // index into HORIZONS

  useEffect(() => {
    fetchData(HORIZONS[selectedHorizon].months);
  }, [selectedHorizon]);

  const fetchData = async (months: number) => {
    setLoading(true);
    try {
      const res = await getPortfolioMonteCarlo(months, 500);
      if (res?.percentiles) {
        setData(res);
      }
    } catch {}
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Portfolio Projection</Text>
        <View style={styles.card}>
          <Skeleton width="100%" height={180} borderRadius={8} />
          <View style={{ marginTop: 12, gap: 8 }}>
            <Skeleton width="60%" height={14} borderRadius={4} />
            <Skeleton width="80%" height={14} borderRadius={4} />
          </View>
        </View>
      </View>
    );
  }

  if (!data) return null;

  const { percentiles, expected_value, probability_gain } = data;
  const p10 = percentiles.p10 || [];
  const p25 = percentiles.p25 || [];
  const p50 = percentiles.p50 || [];
  const p75 = percentiles.p75 || [];
  const p90 = percentiles.p90 || [];

  const len = p50.length;
  if (len < 2) return null;

  // Compute y bounds
  const allVals = [...p10, ...p90];
  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const yRange = yMax - yMin || 1;

  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;

  const toX = (i: number) => PAD_L + (i / (len - 1)) * plotW;
  const toY = (v: number) => PAD_T + plotH - ((v - yMin) / yRange) * plotH;

  const makePath = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  // Band paths (p10→p90 filled, p25→p75 filled)
  const bandPath = (upper: number[], lower: number[]) => {
    const top = upper.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
    const bottom = [...lower].reverse().map((v, i) => {
      const origIdx = lower.length - 1 - i;
      return `L${toX(origIdx).toFixed(1)},${toY(v).toFixed(1)}`;
    }).join(' ');
    return `${top} ${bottom} Z`;
  };

  const outerBand = bandPath(p90, p10);
  const innerBand = bandPath(p75, p25);
  const medianPath = makePath(p50);

  // Y axis labels
  const yLabels = [yMin, yMin + yRange * 0.5, yMax];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Portfolio Projection</Text>

      <View style={styles.card}>
        {/* Horizon tabs */}
        <View style={styles.horizonTabs}>
          {HORIZONS.map((h, i) => (
            <TouchableOpacity
              key={h.label}
              style={[styles.horizonTab, selectedHorizon === i && styles.horizonTabActive]}
              onPress={() => setSelectedHorizon(i)}
              activeOpacity={0.7}
            >
              <Text style={[styles.horizonText, selectedHorizon === i && styles.horizonTextActive]}>
                {h.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chart */}
        <View style={styles.chartWrap}>
          <Svg width={CHART_W} height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
            <Defs>
              <SvgGradient id="outerBand" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#60A5FA" stopOpacity="0.08" />
                <Stop offset="1" stopColor="#60A5FA" stopOpacity="0.03" />
              </SvgGradient>
              <SvgGradient id="innerBand" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#8B5CF6" stopOpacity="0.15" />
                <Stop offset="1" stopColor="#8B5CF6" stopOpacity="0.05" />
              </SvgGradient>
            </Defs>

            {/* Grid lines */}
            {yLabels.map((v, i) => (
              <Line
                key={i}
                x1={PAD_L}
                y1={toY(v)}
                x2={CHART_W - PAD_R}
                y2={toY(v)}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
            ))}

            {/* p10-p90 band */}
            <Path d={outerBand} fill="url(#outerBand)" />
            {/* p25-p75 band */}
            <Path d={innerBand} fill="url(#innerBand)" />
            {/* p50 median line */}
            <Path d={medianPath} fill="none" stroke="#8B5CF6" strokeWidth={2} />

            {/* Y labels */}
            {yLabels.map((v, i) => (
              <SvgText
                key={i}
                x={4}
                y={toY(v) - 4}
                fill="rgba(255,255,255,0.3)"
                fontSize={9}
                fontWeight="500"
              >
                {formatMoney(v)}
              </SvgText>
            ))}

            {/* End labels */}
            <SvgText x={CHART_W - 4} y={toY(p90[len - 1]) - 4} fill="rgba(96,165,250,0.6)" fontSize={8} textAnchor="end">
              p90
            </SvgText>
            <SvgText x={CHART_W - 4} y={toY(p10[len - 1]) + 12} fill="rgba(96,165,250,0.6)" fontSize={8} textAnchor="end">
              p10
            </SvgText>
          </Svg>
        </View>

        {/* Stats below chart */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Expected Value</Text>
            <Text style={styles.statValue}>{formatMoney(expected_value)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Probability of Gain</Text>
            <Text style={[styles.statValue, { color: probability_gain >= 50 ? '#00C9A7' : '#F5A623' }]}>
              {(probability_gain ?? 0).toFixed(0)}%
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Best Case (p90)</Text>
            <Text style={[styles.statValue, { color: '#60A5FA' }]}>
              {p90.length > 0 ? formatMoney(p90[p90.length - 1]) : '--'}
            </Text>
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: '#8B5CF6' }]} />
            <Text style={styles.legendText}>Median (p50)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: 'rgba(139,92,246,0.3)' }]} />
            <Text style={styles.legendText}>p25-p75</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: 'rgba(96,165,250,0.15)' }]} />
            <Text style={styles.legendText}>p10-p90</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          Monte Carlo simulation with 500 paths. For educational purposes only.
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
  horizonTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  horizonTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  horizonTabActive: {
    backgroundColor: 'rgba(139,92,246,0.2)',
  },
  horizonText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
  },
  horizonTextActive: {
    color: '#8B5CF6',
  },
  chartWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '500',
  },
  disclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 9,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
