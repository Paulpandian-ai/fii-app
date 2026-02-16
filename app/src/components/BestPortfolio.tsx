import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import type { AllocationItem, OptimizationResult, PortfolioMetrics } from '../types';
import { SignalBadge } from './SignalBadge';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DONUT_SIZE = 160;
const DONUT_CENTER = DONUT_SIZE / 2;
const DONUT_RADIUS = 58;
const DONUT_STROKE = 20;

// Allocation slice colors
const SLICE_COLORS = [
  '#60A5FA', '#FBBF24', '#10B981', '#F472B6',
  '#A78BFA', '#F97316', '#06B6D4', '#84CC16',
  '#E879F9', '#FB923C', '#2DD4BF', '#FCA5A5',
];

interface Props {
  optimized: OptimizationResult;
  currentPortfolio: PortfolioMetrics;
  allocation: AllocationItem[];
  moneyLeftOnTable: number;
  portfolioValue: number;
}

export const BestPortfolio: React.FC<Props> = ({
  optimized,
  currentPortfolio,
  allocation,
  moneyLeftOnTable,
  portfolioValue,
}) => {
  const animProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animProgress, {
      toValue: 1,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, []);

  // Compute donut slices (only show allocations > 1%)
  const visibleAlloc = allocation.filter((a) => a.weight > 0.01);
  const circumference = 2 * Math.PI * DONUT_RADIUS;

  let accumulatedOffset = 0;
  const slices = visibleAlloc.map((a, i) => {
    const segmentLength = a.weight * circumference;
    const dashOffset = circumference - segmentLength;
    const rotation = (accumulatedOffset / circumference) * 360;
    accumulatedOffset += segmentLength;
    return {
      color: SLICE_COLORS[i % SLICE_COLORS.length],
      dashArray: `${segmentLength} ${circumference - segmentLength}`,
      rotation,
      ticker: a.ticker,
      weight: a.weight,
    };
  });

  const comparisonBars = [
    {
      label: 'Return',
      yours: currentPortfolio.expectedReturn,
      optimal: optimized.expectedReturn,
      suffix: '%',
      better: optimized.expectedReturn > currentPortfolio.expectedReturn,
    },
    {
      label: 'Risk',
      yours: currentPortfolio.expectedVolatility,
      optimal: optimized.expectedVolatility,
      suffix: '%',
      better: optimized.expectedVolatility < currentPortfolio.expectedVolatility,
    },
    {
      label: 'Sharpe',
      yours: currentPortfolio.sharpeRatio,
      optimal: optimized.sharpeRatio,
      suffix: '',
      better: optimized.sharpeRatio > currentPortfolio.sharpeRatio,
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Your Best Portfolio</Text>

      {/* Hero stats */}
      <View style={styles.heroCard}>
        <View style={styles.heroRow}>
          <Text style={styles.heroLabel}>Maximum Sharpe Ratio</Text>
          <Text style={styles.heroValue}>{optimized.sharpeRatio.toFixed(2)}</Text>
        </View>
        <Text style={styles.heroSubline}>
          Expected Return: {optimized.expectedReturn.toFixed(1)}% | Risk:{' '}
          {optimized.expectedVolatility.toFixed(1)}%
        </Text>
      </View>

      {/* Donut chart */}
      <View style={styles.donutContainer}>
        <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
          {/* Background ring */}
          <Circle
            cx={DONUT_CENTER}
            cy={DONUT_CENTER}
            r={DONUT_RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={DONUT_STROKE}
          />
          {/* Allocation slices */}
          <G rotation={-90} origin={`${DONUT_CENTER}, ${DONUT_CENTER}`}>
            {slices.map((s, i) => (
              <Circle
                key={`slice-${i}`}
                cx={DONUT_CENTER}
                cy={DONUT_CENTER}
                r={DONUT_RADIUS}
                fill="none"
                stroke={s.color}
                strokeWidth={DONUT_STROKE}
                strokeDasharray={s.dashArray}
                strokeDashoffset={0}
                rotation={s.rotation}
                origin={`${DONUT_CENTER}, ${DONUT_CENTER}`}
                strokeLinecap="butt"
              />
            ))}
          </G>
        </Svg>

        {/* Center label */}
        <View style={styles.donutCenter}>
          <Text style={styles.donutCenterTitle}>OPTIMAL</Text>
          <Text style={styles.donutCenterValue}>
            {optimized.sharpeRatio.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Allocation list */}
      <View style={styles.allocList}>
        {visibleAlloc.map((a, i) => (
          <View key={a.ticker} style={styles.allocRow}>
            <View
              style={[
                styles.allocDot,
                { backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] },
              ]}
            />
            <Text style={styles.allocTicker}>{a.ticker}</Text>
            <Text style={styles.allocWeight}>
              {(a.weight * 100).toFixed(1)}%
            </Text>
            <View style={styles.allocScore}>
              <SignalBadge signal={a.signal} />
            </View>
          </View>
        ))}
      </View>

      {/* Comparison: Yours vs Optimal */}
      <View style={styles.comparisonCard}>
        <Text style={styles.compTitle}>Your Portfolio vs Best</Text>

        {comparisonBars.map((bar) => (
          <View key={bar.label} style={styles.compRow}>
            <Text style={styles.compLabel}>{bar.label}</Text>
            <View style={styles.compBarContainer}>
              <View style={styles.compBarGroup}>
                <View
                  style={[
                    styles.compBar,
                    styles.compBarYours,
                    {
                      width: `${Math.min(
                        100,
                        Math.max(10, (Math.abs(bar.yours) / Math.max(Math.abs(bar.optimal), Math.abs(bar.yours), 0.01)) * 100)
                      )}%`,
                    },
                  ]}
                />
                <Text style={styles.compBarValue}>
                  {bar.yours.toFixed(bar.suffix === '%' ? 1 : 2)}
                  {bar.suffix}
                </Text>
              </View>
              <View style={styles.compBarGroup}>
                <View
                  style={[
                    styles.compBar,
                    styles.compBarOptimal,
                    { width: '100%' },
                  ]}
                />
                <Text style={[styles.compBarValue, bar.better && styles.compBarBetter]}>
                  {bar.optimal.toFixed(bar.suffix === '%' ? 1 : 2)}
                  {bar.suffix}
                </Text>
              </View>
            </View>
          </View>
        ))}

        {moneyLeftOnTable > 0 && (
          <View style={styles.moneyBanner}>
            <Text style={styles.moneyText}>
              You're leaving{' '}
              <Text style={styles.moneyAmount}>
                ${moneyLeftOnTable.toLocaleString()}
              </Text>
              /year on the table
            </Text>
          </View>
        )}
      </View>
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
    marginBottom: 12,
  },
  heroCard: {
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
    marginBottom: 20,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
  },
  heroValue: {
    color: '#FBBF24',
    fontSize: 28,
    fontWeight: '800',
  },
  heroSubline: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginTop: 4,
  },
  donutContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  donutCenterTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  donutCenterValue: {
    color: '#FBBF24',
    fontSize: 20,
    fontWeight: '800',
  },
  allocList: {
    marginBottom: 20,
  },
  allocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  allocDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  allocTicker: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    width: 50,
  },
  allocWeight: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    flex: 1,
    textAlign: 'right',
    marginRight: 8,
  },
  allocScore: {
    width: 50,
    alignItems: 'flex-end',
  },
  comparisonCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
  },
  compTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 14,
  },
  compRow: {
    marginBottom: 12,
  },
  compLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  compBarContainer: {
    gap: 4,
  },
  compBarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compBar: {
    height: 8,
    borderRadius: 4,
  },
  compBarYours: {
    backgroundColor: '#60A5FA',
  },
  compBarOptimal: {
    backgroundColor: '#FBBF24',
  },
  compBarValue: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 50,
  },
  compBarBetter: {
    color: '#10B981',
  },
  moneyBanner: {
    marginTop: 14,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  moneyText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  moneyAmount: {
    color: '#EF4444',
    fontWeight: '800',
    fontSize: 16,
  },
});
