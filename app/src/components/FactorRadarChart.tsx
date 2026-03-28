import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Svg, { Polygon, Line, Path, Circle, G, Defs, RadialGradient, Stop } from 'react-native-svg';
import { getScoreColor, getScoreLabel } from '../utils/scoreColors';
import type { ScoreLabel } from '../types';

// ─── Factor Percentiles Interface ───
export interface FactorPercentiles {
  supply_chain_upstream: number; // 0-100
  supply_chain_downstream: number;
  geopolitical: number;
  monetary: number;
  correlations: number;
  performance: number;
}

interface FactorRadarChartProps {
  factorPercentiles: FactorPercentiles;
  compositeScore: number; // 1-10
  scoreLabel: string;
  size: 'thumbnail' | 'full';
  onAxisTap?: (factor: string) => void;
  showBenchmark?: boolean;
  scoreDrivers?: Array<{ factor: string; direction: string; description: string }>;
}

// ─── Axis Config ───
const AXES = [
  { key: 'supply_chain_upstream', label: 'Suppliers', fullLabel: 'Suppliers' },
  { key: 'supply_chain_downstream', label: 'Customers', fullLabel: 'Customers' },
  { key: 'geopolitical', label: 'Geo Risk', fullLabel: 'Geo Risk' },
  { key: 'monetary', label: 'Rate Impact', fullLabel: 'Rate Impact' },
  { key: 'correlations', label: 'Mkt Sync', fullLabel: 'Market Sync' },
  { key: 'performance', label: 'Earnings', fullLabel: 'Earnings' },
] as const;

const NUM_AXES = 6;
const GRID_LEVELS = [20, 40, 60, 80, 100]; // percentile grid rings

// Default percentiles (all neutral at 50)
const DEFAULT_PERCENTILES: FactorPercentiles = {
  supply_chain_upstream: 50,
  supply_chain_downstream: 50,
  geopolitical: 50,
  monetary: 50,
  correlations: 50,
  performance: 50,
};

// ─── Geometry Helpers ───
const getPoint = (
  axisIndex: number,
  value: number, // 0-100
  center: number,
  radius: number,
): { x: number; y: number } => {
  const angle = (Math.PI * 2 * axisIndex) / NUM_AXES - Math.PI / 2;
  const r = (Math.min(100, Math.max(0, value)) / 100) * radius;
  return {
    x: center + r * Math.cos(angle),
    y: center + r * Math.sin(angle),
  };
};

const pointsToString = (points: { x: number; y: number }[]): string =>
  points.map((p) => `${p.x},${p.y}`).join(' ');

// ─── Tooltip Component ───
const AxisTooltip: React.FC<{
  factor: string;
  percentile: number;
  driverDescription?: string;
  x: number;
  y: number;
  chartSize: number;
  onClose: () => void;
}> = ({ factor, percentile, driverDescription, x, y, chartSize, onClose }) => {
  const tooltipWidth = 180;
  const tooltipLeft = Math.max(4, Math.min(x - tooltipWidth / 2, chartSize - tooltipWidth - 4));
  const tooltipTop = y > chartSize / 2 ? y - 70 : y + 16;

  return (
    <TouchableOpacity
      style={[styles.tooltip, { left: tooltipLeft, top: tooltipTop, width: tooltipWidth }]}
      onPress={onClose}
      activeOpacity={0.9}
    >
      <Text style={styles.tooltipTitle}>{factor}</Text>
      <Text style={styles.tooltipPercentile}>{percentile}th percentile</Text>
      {driverDescription && (
        <Text style={styles.tooltipDesc} numberOfLines={3}>{driverDescription}</Text>
      )}
    </TouchableOpacity>
  );
};

// ─── Main Component ───
const FactorRadarChartInner: React.FC<FactorRadarChartProps> = ({
  factorPercentiles,
  compositeScore,
  scoreLabel,
  size,
  onAxisTap,
  showBenchmark = false,
  scoreDrivers,
}) => {
  const percentiles = { ...DEFAULT_PERCENTILES, ...factorPercentiles };
  const animProgress = useRef(new Animated.Value(0)).current;
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);

  useEffect(() => {
    animProgress.setValue(0);
    Animated.timing(animProgress, {
      toValue: 1,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [factorPercentiles]);

  const handleAxisTap = useCallback(
    (index: number) => {
      const axis = AXES[index];
      if (onAxisTap) {
        onAxisTap(axis.key);
      }
      setActiveTooltip(activeTooltip === index ? null : index);
    },
    [onAxisTap, activeTooltip],
  );

  const color = getScoreColor(compositeScore);
  const fillColor = color + '20'; // ~12% opacity
  const values = AXES.map((a) => percentiles[a.key] ?? 50);

  // ─── THUMBNAIL (72x72) ───
  if (size === 'thumbnail') {
    const sz = 72;
    const center = sz / 2;
    const radius = center * 0.82;

    const polygonPoints = pointsToString(
      values.map((val, i) => getPoint(i, val, center, radius)),
    );

    return (
      <View
        style={{ width: sz, height: sz }}
        accessibilityLabel={`Factor radar: score ${compositeScore.toFixed(1)}`}
      >
        <Svg width={sz} height={sz}>
          {/* Outer hex grid (just one ring for thumbnail) */}
          <Polygon
            points={pointsToString(
              AXES.map((_, i) => getPoint(i, 100, center, radius)),
            )}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
          />
          {/* Middle ring */}
          <Polygon
            points={pointsToString(
              AXES.map((_, i) => getPoint(i, 50, center, radius)),
            )}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={0.5}
          />
          {/* Score polygon */}
          <Polygon
            points={polygonPoints}
            fill={fillColor}
            stroke={color}
            strokeWidth={1.5}
          />
        </Svg>
      </View>
    );
  }

  // ─── FULL SIZE (260x260) ───
  const sz = 260;
  const center = sz / 2;
  const radius = center * 0.58; // Leave room for labels
  const labelRadius = center * 0.82;

  const polygonPoints = pointsToString(
    values.map((val, i) => getPoint(i, val, center, radius)),
  );

  const benchmarkPoints = showBenchmark
    ? pointsToString(AXES.map((_, i) => getPoint(i, 50, center, radius)))
    : '';

  // Axis endpoints
  const axisEndpoints = AXES.map((_, i) => getPoint(i, 100, center, radius));

  // Score dot positions
  const scoreDots = values.map((val, i) => getPoint(i, val, center, radius));

  // Label positions
  const labelPositions = AXES.map((_, i) => getPoint(i, 100, center, labelRadius));

  // Find driver description for a given axis
  const getDriverForAxis = (axisKey: string): string | undefined => {
    if (!scoreDrivers) return undefined;
    const match = scoreDrivers.find(
      (d) => d.factor.toLowerCase().includes(axisKey.replace(/_/g, ' ').split('_')[0]),
    );
    return match?.description;
  };

  return (
    <View style={{ width: sz, height: sz, position: 'relative' }}>
      <Svg width={sz} height={sz}>
        {/* 5 concentric hexagonal grid rings */}
        {GRID_LEVELS.map((level) => (
          <Polygon
            key={`grid-${level}`}
            points={pointsToString(
              AXES.map((_, i) => getPoint(i, level, center, radius)),
            )}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={level === 60 ? 0.8 : 0.5}
          />
        ))}

        {/* 6 axis lines from center */}
        {axisEndpoints.map((ep, i) => (
          <Line
            key={`axis-${i}`}
            x1={center}
            y1={center}
            x2={ep.x}
            y2={ep.y}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={0.5}
          />
        ))}

        {/* Benchmark polygon (optional, dashed) */}
        {showBenchmark && (
          <Polygon
            points={benchmarkPoints}
            fill="none"
            stroke="rgba(142,142,147,0.25)"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        )}

        {/* Stock polygon */}
        <Polygon
          points={polygonPoints}
          fill={fillColor}
          stroke={color}
          strokeWidth={2}
        />

        {/* Score dots */}
        {scoreDots.map((pt, i) => (
          <Circle
            key={`dot-${i}`}
            cx={pt.x}
            cy={pt.y}
            r={3}
            fill={color}
          />
        ))}
      </Svg>

      {/* Center hero number */}
      <View style={styles.centerHero}>
        <Text style={[styles.heroScore, { color }]}>{compositeScore.toFixed(1)}</Text>
        <Text style={styles.heroOutOf}>/10</Text>
        <Text style={[styles.heroLabel, { color }]}>{scoreLabel}</Text>
      </View>

      {/* Axis labels (positioned around the chart) */}
      {AXES.map((axis, i) => {
        const pt = labelPositions[i];
        return (
          <TouchableOpacity
            key={axis.key}
            style={[
              styles.axisLabelBtn,
              {
                left: pt.x - 36,
                top: pt.y - 10,
              },
            ]}
            onPress={() => handleAxisTap(i)}
            activeOpacity={0.7}
          >
            <Text style={styles.axisLabelText}>{axis.label}</Text>
            <Text style={[styles.axisValueText, { color }]}>
              {values[i]}%
            </Text>
          </TouchableOpacity>
        );
      })}

      {/* Tooltip (shown on axis tap) */}
      {activeTooltip != null && (
        <AxisTooltip
          factor={AXES[activeTooltip].fullLabel}
          percentile={values[activeTooltip]}
          driverDescription={getDriverForAxis(AXES[activeTooltip].key)}
          x={labelPositions[activeTooltip].x}
          y={labelPositions[activeTooltip].y}
          chartSize={sz}
          onClose={() => setActiveTooltip(null)}
        />
      )}
    </View>
  );
};

export const FactorRadarChart = React.memo(FactorRadarChartInner, (prev, next) => {
  if (prev.size !== next.size) return false;
  if (prev.compositeScore !== next.compositeScore) return false;
  if (prev.scoreLabel !== next.scoreLabel) return false;
  const pf = prev.factorPercentiles;
  const nf = next.factorPercentiles;
  return (
    pf.supply_chain_upstream === nf.supply_chain_upstream &&
    pf.supply_chain_downstream === nf.supply_chain_downstream &&
    pf.geopolitical === nf.geopolitical &&
    pf.monetary === nf.monetary &&
    pf.correlations === nf.correlations &&
    pf.performance === nf.performance
  );
});

// ─── Styles ───
const styles = StyleSheet.create({
  // Center hero
  centerHero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroScore: {
    fontSize: 32,
    fontWeight: '800',
  },
  heroOutOf: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    marginTop: -4,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // Axis labels
  axisLabelBtn: {
    position: 'absolute',
    width: 72,
    alignItems: 'center',
  },
  axisLabelText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
  axisValueText: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },

  // Tooltip
  tooltip: {
    position: 'absolute',
    backgroundColor: 'rgba(15,25,55,0.95)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 10,
  },
  tooltipTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  tooltipPercentile: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  tooltipDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    lineHeight: 14,
  },
});
