import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { FactorScore } from '../types';

interface FactorBarProps {
  factor: FactorScore;
  compact?: boolean;
}

const getBarColor = (score: number): string => {
  if (score <= -1) return '#EF4444';
  if (score < 0) return '#F59E0B';
  if (score < 1) return '#F59E0B';
  return '#10B981';
};

export const FactorBar: React.FC<FactorBarProps> = ({ factor, compact = false }) => {
  const score = factor.score ?? 0;
  const color = getBarColor(score);
  // Map -2..+2 to 0..1 for bar width
  const normalizedPosition = (score + 2) / 4;
  const sign = score >= 0 ? '+' : '';

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Text style={styles.compactName}>{factor.name}</Text>
        <Text style={[styles.compactScore, { color }]}>
          {sign}{score.toFixed(1)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{factor.name}</Text>
        <Text style={[styles.score, { color }]}>
          {sign}{score.toFixed(1)}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={styles.centerLine} />
        <View
          style={[
            styles.indicator,
            {
              left: `${normalizedPosition * 100}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  name: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
  score: {
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    position: 'relative',
    justifyContent: 'center',
  },
  centerLine: {
    position: 'absolute',
    left: '50%',
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  indicator: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
  },
  // Compact mode (inline on feed card)
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  compactName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '500',
    marginRight: 4,
  },
  compactScore: {
    fontSize: 12,
    fontWeight: '700',
  },
});
