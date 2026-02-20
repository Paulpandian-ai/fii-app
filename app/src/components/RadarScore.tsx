import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Svg, { Polygon, Line, Circle, G } from 'react-native-svg';

/**
 * 5-axis radar/spider chart for dimension scores.
 * Axes: Supply Chain, Macro & Geo, Technical, Fundamental, Sentiment
 * Each axis scaled 0-10, gridlines at 2.5, 5.0, 7.5.
 */

export interface DimensionScores {
  supplyChain: number;
  macroGeo: number;
  technical: number;
  fundamental: number;
  sentiment: number;
  altData?: number;
}

interface RadarScoreProps {
  scores: DimensionScores;
  size?: number;
  signal?: 'BUY' | 'HOLD' | 'SELL';
  onAxisPress?: (dimension: string) => void;
  mini?: boolean;
}

const AXES_5 = [
  { key: 'supplyChain', label: 'Supply\nChain', short: 'SC' },
  { key: 'macroGeo', label: 'Macro &\nGeo', short: 'MG' },
  { key: 'technical', label: 'Technical', short: 'TE' },
  { key: 'fundamental', label: 'Fundamental', short: 'FD' },
  { key: 'sentiment', label: 'Sentiment', short: 'SE' },
];

const AXES_6 = [
  ...AXES_5,
  { key: 'altData', label: 'Alt\nData', short: 'AD' },
];

const SIGNAL_COLORS: Record<string, { fill: string; stroke: string }> = {
  BUY: { fill: 'rgba(16, 185, 129, 0.25)', stroke: '#10B981' },
  HOLD: { fill: 'rgba(245, 158, 11, 0.25)', stroke: '#F59E0B' },
  SELL: { fill: 'rgba(239, 68, 68, 0.25)', stroke: '#EF4444' },
};

const safeNum = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
};

const getPolygonPoint = (
  axisIndex: number,
  value: number,
  center: number,
  radius: number,
  totalAxes: number,
): { x: number; y: number } => {
  const angle = (Math.PI * 2 * axisIndex) / totalAxes - Math.PI / 2;
  const r = (Math.min(10, Math.max(0, value)) / 10) * radius;
  return {
    x: center + r * Math.cos(angle),
    y: center + r * Math.sin(angle),
  };
};

export const RadarScore: React.FC<RadarScoreProps> = ({
  scores,
  size = 200,
  signal = 'HOLD',
  onAxisPress,
  mini = false,
}) => {
  const animProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animProgress.setValue(0);
    Animated.timing(animProgress, {
      toValue: 1,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [scores]);

  const center = size / 2;
  const radius = mini ? center * 0.85 : center * 0.65;
  const colors = SIGNAL_COLORS[signal] || SIGNAL_COLORS.HOLD;

  // Dynamically choose 5 or 6 axes based on altData availability
  const hasAltData = scores.altData != null && scores.altData > 0;
  const AXES = hasAltData ? AXES_6 : AXES_5;
  const numAxes = AXES.length;

  const scoreValues = AXES.map((a) => safeNum((scores as any)[a.key]));

  // Grid lines at 25%, 50%, 75%, 100%
  const gridLevels = [2.5, 5, 7.5, 10];

  // Build polygon points for the score shape
  const polygonPoints = scoreValues
    .map((val, i) => {
      const pt = getPolygonPoint(i, val, center, radius, numAxes);
      return `${pt.x},${pt.y}`;
    })
    .join(' ');

  // Axis endpoints
  const axisEndpoints = AXES.map((_, i) =>
    getPolygonPoint(i, 10, center, radius, numAxes),
  );

  if (mini) {
    return (
      <View style={{ width: size, height: size }} accessibilityLabel={`Radar score: ${AXES.map((a, i) => `${a.short} ${safeNum(scoreValues[i]).toFixed(1)}`).join(', ')}`}>
        <Svg width={size} height={size}>
          {/* Grid */}
          {gridLevels.map((level) => {
            const pts = AXES.map((_, i) =>
              getPolygonPoint(i, level, center, radius, numAxes),
            )
              .map((p) => `${p.x},${p.y}`)
              .join(' ');
            return (
              <Polygon
                key={`grid-${level}`}
                points={pts}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={0.5}
              />
            );
          })}
          {/* Score polygon */}
          <Polygon
            points={polygonPoints}
            fill={colors.fill}
            stroke={colors.stroke}
            strokeWidth={1.5}
          />
        </Svg>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size + 20 }]} accessibilityLabel={`Radar score chart: ${AXES.map((a, i) => `${a.short} ${safeNum(scoreValues[i]).toFixed(1)}`).join(', ')}`}>
      <Svg width={size} height={size}>
        {/* Grid polygons */}
        {gridLevels.map((level) => {
          const pts = AXES.map((_, i) =>
            getPolygonPoint(i, level, center, radius, numAxes),
          )
            .map((p) => `${p.x},${p.y}`)
            .join(' ');
          return (
            <Polygon
              key={`grid-${level}`}
              points={pts}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={level === 5 ? 1 : 0.5}
            />
          );
        })}

        {/* Axis lines */}
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

        {/* Score polygon */}
        <Polygon
          points={polygonPoints}
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth={2}
        />

        {/* Score dots */}
        {scoreValues.map((val, i) => {
          const pt = getPolygonPoint(i, val, center, radius, numAxes);
          return (
            <Circle
              key={`dot-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={3}
              fill={colors.stroke}
            />
          );
        })}
      </Svg>

      {/* Axis labels (positioned around the chart) */}
      {AXES.map((axis, i) => {
        const labelPt = getPolygonPoint(i, 12.5, center, radius, numAxes);
        return (
          <TouchableOpacity
            key={axis.key}
            style={[
              styles.axisLabel,
              {
                left: labelPt.x - 30,
                top: labelPt.y - 12,
              },
            ]}
            onPress={() => onAxisPress?.(axis.key)}
            activeOpacity={0.7}
          >
            <Text style={styles.axisLabelText}>{axis.short}</Text>
            <Text style={styles.axisValueText}>
              {safeNum(scoreValues[i]).toFixed(1)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  axisLabel: {
    position: 'absolute',
    width: 60,
    alignItems: 'center',
  },
  axisLabelText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  axisValueText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
});
