import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import Svg, { Circle, Line, Text as SvgText, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import type { FrontierPoint, BenchmarkPoint, PortfolioMetrics, OptimizationResult } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 64;
const CHART_HEIGHT = 220;
const PADDING = { top: 20, right: 20, bottom: 30, left: 40 };
const PLOT_W = CHART_WIDTH - PADDING.left - PADDING.right;
const PLOT_H = CHART_HEIGHT - PADDING.top - PADDING.bottom;

interface Props {
  frontier: FrontierPoint[];
  currentPortfolio: PortfolioMetrics;
  optimized: OptimizationResult;
  benchmarks: BenchmarkPoint[];
  onTapOptimal?: () => void;
}

export const RiskRewardMap: React.FC<Props> = ({
  frontier,
  currentPortfolio,
  optimized,
  benchmarks,
  onTapOptimal,
}) => {
  const { points, yourDot, optimalDot, benchDots, xRange, yRange } = useMemo(() => {
    if (!frontier.length) return { points: [], yourDot: null, optimalDot: null, benchDots: [], xRange: [0, 25], yRange: [0, 20] };

    // Compute axis ranges
    const allX = frontier.map((p) => p.volatility);
    const allY = frontier.map((p) => p.expectedReturn);
    const minX = Math.max(0, Math.min(...allX) - 2);
    const maxX = Math.max(...allX) + 2;
    const minY = Math.min(0, Math.min(...allY) - 2);
    const maxY = Math.max(...allY) + 2;

    const scaleX = (v: number) => PADDING.left + ((v - minX) / (maxX - minX)) * PLOT_W;
    const scaleY = (v: number) => PADDING.top + (1 - (v - minY) / (maxY - minY)) * PLOT_H;

    // Downsample frontier to max 500 points for performance
    const step = Math.max(1, Math.floor(frontier.length / 500));
    const sampled = frontier.filter((_, i) => i % step === 0);

    // Color by Sharpe ratio
    const sharpes = sampled.map((p) => p.sharpeRatio);
    const minSharpe = Math.min(...sharpes);
    const maxSharpe = Math.max(...sharpes);

    const pts = sampled.map((p) => {
      const t = maxSharpe > minSharpe ? (p.sharpeRatio - minSharpe) / (maxSharpe - minSharpe) : 0.5;
      // Purple (#8B5CF6) to Yellow (#FBBF24)
      const r = Math.round(139 + t * (251 - 139));
      const g = Math.round(92 + t * (191 - 92));
      const b = Math.round(246 + t * (36 - 246));
      return {
        cx: scaleX(p.volatility),
        cy: scaleY(p.expectedReturn),
        color: `rgb(${r},${g},${b})`,
      };
    });

    const yourD = {
      cx: scaleX(currentPortfolio.expectedVolatility),
      cy: scaleY(currentPortfolio.expectedReturn),
    };

    const optD = {
      cx: scaleX(optimized.expectedVolatility),
      cy: scaleY(optimized.expectedReturn),
    };

    const bDots = benchmarks.map((b) => ({
      cx: scaleX(b.volatility),
      cy: scaleY(b.expectedReturn),
      label: b.label,
    }));

    return {
      points: pts,
      yourDot: yourD,
      optimalDot: optD,
      benchDots: bDots,
      xRange: [minX, maxX],
      yRange: [minY, maxY],
    };
  }, [frontier, currentPortfolio, optimized, benchmarks]);

  if (!frontier.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Risk vs Reward Map</Text>
      <Text style={styles.sectionSubtitle}>
        2,000 possible portfolios — find your sweet spot
      </Text>

      <View style={styles.chartContainer}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          {/* Grid lines */}
          <Line
            x1={PADDING.left}
            y1={PADDING.top + PLOT_H}
            x2={PADDING.left + PLOT_W}
            y2={PADDING.top + PLOT_H}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
          />
          <Line
            x1={PADDING.left}
            y1={PADDING.top}
            x2={PADDING.left}
            y2={PADDING.top + PLOT_H}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
          />

          {/* Axis labels */}
          <SvgText
            x={PADDING.left + PLOT_W / 2}
            y={CHART_HEIGHT - 4}
            fill="rgba(255,255,255,0.4)"
            fontSize={10}
            textAnchor="middle"
          >
            Risk Level (Volatility %)
          </SvgText>
          <SvgText
            x={10}
            y={PADDING.top + PLOT_H / 2}
            fill="rgba(255,255,255,0.4)"
            fontSize={10}
            textAnchor="middle"
            rotation={-90}
            originX={10}
            originY={PADDING.top + PLOT_H / 2}
          >
            Expected Gain %
          </SvgText>

          {/* Frontier dots */}
          {points.map((p, i) => (
            <Circle
              key={`f-${i}`}
              cx={p.cx}
              cy={p.cy}
              r={1.5}
              fill={p.color}
              opacity={0.6}
            />
          ))}

          {/* Benchmark dots */}
          {benchDots.map((b, i) => (
            <React.Fragment key={`b-${i}`}>
              <Circle cx={b.cx} cy={b.cy} r={5} fill="#6B7280" stroke="#9CA3AF" strokeWidth={1} />
              <SvgText
                x={b.cx}
                y={b.cy - 9}
                fill="#9CA3AF"
                fontSize={9}
                textAnchor="middle"
                fontWeight="600"
              >
                {b.label}
              </SvgText>
            </React.Fragment>
          ))}

          {/* Your portfolio (blue pulsing dot) */}
          {yourDot && (
            <>
              <Circle cx={yourDot.cx} cy={yourDot.cy} r={12} fill="rgba(96,165,250,0.2)" />
              <Circle cx={yourDot.cx} cy={yourDot.cy} r={7} fill="#60A5FA" stroke="#FFFFFF" strokeWidth={2} />
              <SvgText
                x={yourDot.cx}
                y={yourDot.cy - 16}
                fill="#60A5FA"
                fontSize={10}
                textAnchor="middle"
                fontWeight="700"
              >
                YOU
              </SvgText>
            </>
          )}

          {/* Optimal portfolio (gold star) */}
          {optimalDot && (
            <>
              <Circle cx={optimalDot.cx} cy={optimalDot.cy} r={14} fill="rgba(251,191,36,0.15)" />
              <Circle cx={optimalDot.cx} cy={optimalDot.cy} r={7} fill="#FBBF24" stroke="#FFFFFF" strokeWidth={2} />
              <SvgText
                x={optimalDot.cx}
                y={optimalDot.cy - 16}
                fill="#FBBF24"
                fontSize={9}
                textAnchor="middle"
                fontWeight="700"
              >
                OPTIMAL
              </SvgText>
            </>
          )}
        </Svg>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#60A5FA' }]} />
          <Text style={styles.legendText}>Your Portfolio</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FBBF24' }]} />
          <Text style={styles.legendText}>Optimal</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#8B5CF6' }]} />
          <Text style={styles.legendText}>Low Sharpe</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FBBF24' }]} />
          <Text style={styles.legendText}>High Sharpe</Text>
        </View>
      </View>

      {onTapOptimal && (
        <TouchableOpacity style={styles.hintButton} onPress={onTapOptimal} activeOpacity={0.7}>
          <Text style={styles.hintText}>Tap the gold star to see your best portfolio →</Text>
        </TouchableOpacity>
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
  chartContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 8,
    alignItems: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
  },
  hintButton: {
    marginTop: 12,
    alignSelf: 'center',
  },
  hintText: {
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: '500',
  },
});
