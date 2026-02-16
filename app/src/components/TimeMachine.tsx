import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';
import type { ProjectionResult } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 64;
const CHART_HEIGHT = 200;
const PAD = { top: 10, right: 15, bottom: 25, left: 50 };
const PLOT_W = CHART_WIDTH - PAD.left - PAD.right;
const PLOT_H = CHART_HEIGHT - PAD.top - PAD.bottom;

interface Props {
  projection: ProjectionResult | null;
  isLoading: boolean;
  onYearsChange: (years: number) => void;
}

const formatCurrency = (raw: number) => {
  const v = raw ?? 0;
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

export const TimeMachine: React.FC<Props> = ({
  projection,
  isLoading,
  onYearsChange,
}) => {
  const [years, setYears] = useState(5);

  const handleSliderComplete = useCallback(
    (val: number) => {
      const rounded = Math.round(val);
      setYears(rounded);
      onYearsChange(rounded);
    },
    [onYearsChange]
  );

  const chartPaths = useMemo(() => {
    if (!projection || !projection.projection.length) return null;

    const points = projection.projection;
    const allVals = points.flatMap((p) => [p.p5, p.p95]);
    const minY = Math.min(...allVals) * 0.9;
    const maxY = Math.max(...allVals) * 1.05;
    const maxMonth = points[points.length - 1].month;

    const sx = (month: number) => PAD.left + (month / maxMonth) * PLOT_W;
    const sy = (val: number) => PAD.top + (1 - (val - minY) / (maxY - minY)) * PLOT_H;

    const buildPath = (key: 'p5' | 'p25' | 'p50' | 'p75' | 'p95') => {
      return points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.month).toFixed(1)} ${sy(p[key]).toFixed(1)}`)
        .join(' ');
    };

    // Fan area path (p5 to p95)
    const topLine = points.map((p) => `${sx(p.month).toFixed(1)},${sy(p.p95).toFixed(1)}`).join(' ');
    const bottomLine = [...points].reverse().map((p) => `${sx(p.month).toFixed(1)},${sy(p.p5).toFixed(1)}`).join(' ');
    const fanPath = `M ${topLine} L ${bottomLine} Z`;

    // Inner fan (p25 to p75)
    const innerTop = points.map((p) => `${sx(p.month).toFixed(1)},${sy(p.p75).toFixed(1)}`).join(' ');
    const innerBottom = [...points].reverse().map((p) => `${sx(p.month).toFixed(1)},${sy(p.p25).toFixed(1)}`).join(' ');
    const innerFanPath = `M ${innerTop} L ${innerBottom} Z`;

    // Y-axis ticks
    const yTicks = [];
    const step = (maxY - minY) / 4;
    for (let i = 0; i <= 4; i++) {
      const val = minY + step * i;
      yTicks.push({ y: sy(val), label: formatCurrency(val) });
    }

    return {
      fanPath,
      innerFanPath,
      medianPath: buildPath('p50'),
      bestPath: buildPath('p95'),
      worstPath: buildPath('p5'),
      yTicks,
    };
  }, [projection]);

  const stats = projection?.finalStats;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Time Machine</Text>
      <Text style={styles.sectionSubtitle}>
        How far into the future?
      </Text>

      {/* Year slider */}
      <View style={styles.sliderContainer}>
        <Text style={styles.sliderLabel}>{years} year{years !== 1 ? 's' : ''}</Text>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={10}
          step={1}
          value={years}
          onSlidingComplete={handleSliderComplete}
          onValueChange={(val) => setYears(Math.round(val))}
          minimumTrackTintColor="#60A5FA"
          maximumTrackTintColor="rgba(255,255,255,0.15)"
          thumbTintColor="#60A5FA"
        />
        <View style={styles.sliderRange}>
          <Text style={styles.sliderRangeText}>1yr</Text>
          <Text style={styles.sliderRangeText}>10yr</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#60A5FA" style={{ marginVertical: 40 }} />
      ) : chartPaths ? (
        <>
          {/* Fan chart */}
          <View style={styles.chartContainer}>
            <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
              {/* Y-axis ticks */}
              {chartPaths.yTicks.map((tick, i) => (
                <React.Fragment key={`y-${i}`}>
                  <Line
                    x1={PAD.left}
                    y1={tick.y}
                    x2={PAD.left + PLOT_W}
                    y2={tick.y}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={1}
                  />
                  <SvgText
                    x={PAD.left - 4}
                    y={tick.y + 3}
                    fill="rgba(255,255,255,0.4)"
                    fontSize={9}
                    textAnchor="end"
                  >
                    {tick.label}
                  </SvgText>
                </React.Fragment>
              ))}

              {/* Outer fan (5th-95th) */}
              <Path d={chartPaths.fanPath} fill="rgba(96,165,250,0.08)" />

              {/* Inner fan (25th-75th) */}
              <Path d={chartPaths.innerFanPath} fill="rgba(96,165,250,0.15)" />

              {/* Best case line */}
              <Path d={chartPaths.bestPath} stroke="#10B981" strokeWidth={1.5} fill="none" opacity={0.6} />

              {/* Median line */}
              <Path d={chartPaths.medianPath} stroke="#60A5FA" strokeWidth={2.5} fill="none" />

              {/* Worst case line */}
              <Path d={chartPaths.worstPath} stroke="#EF4444" strokeWidth={1.5} fill="none" opacity={0.6} />
            </Svg>
          </View>

          {/* Stats */}
          {stats && (
            <View style={styles.statsCard}>
              <Text style={styles.statsIntro}>
                Starting with {formatCurrency(projection!.initialValue)}:
              </Text>

              <View style={styles.statRow}>
                <View style={[styles.statDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.statLabel}>Best case</Text>
                <Text style={[styles.statValue, { color: '#10B981', fontSize: 20 }]}>
                  {formatCurrency(stats.best)}
                </Text>
              </View>

              <View style={styles.statRow}>
                <View style={[styles.statDot, { backgroundColor: '#60A5FA' }]} />
                <Text style={styles.statLabel}>Most likely</Text>
                <Text style={[styles.statValue, { color: '#60A5FA', fontSize: 18 }]}>
                  {formatCurrency(stats.likely)}
                </Text>
              </View>

              <View style={styles.statRow}>
                <View style={[styles.statDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.statLabel}>Worst case</Text>
                <Text style={[styles.statValue, { color: '#EF4444', fontSize: 15 }]}>
                  {formatCurrency(stats.worst)}
                </Text>
              </View>

              <View style={styles.lossProbRow}>
                <Text style={styles.lossProbLabel}>Chance of losing money:</Text>
                <Text
                  style={[
                    styles.lossProbValue,
                    {
                      color:
                        stats.lossProbability > 15
                          ? '#EF4444'
                          : stats.lossProbability < 5
                          ? '#10B981'
                          : '#FBBF24',
                    },
                  ]}
                >
                  {(stats.lossProbability ?? 0).toFixed(1)}%
                </Text>
              </View>
            </View>
          )}
        </>
      ) : (
        <Text style={styles.emptyText}>
          Run a simulation to see your future projections
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  sliderContainer: {
    marginBottom: 16,
  },
  sliderLabel: {
    color: '#60A5FA',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  sliderRangeText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
  chartContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 4,
    alignItems: 'center',
  },
  statsCard: {
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
  },
  statsIntro: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    flex: 1,
  },
  statValue: {
    fontWeight: '800',
  },
  lossProbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  lossProbLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    flex: 1,
  },
  lossProbValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 30,
  },
});
