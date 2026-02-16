import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { DisciplineScoreData } from '../types';

interface Props {
  data: DisciplineScoreData | null;
  isLoading: boolean;
}

const LEVEL_RING_COLORS: Record<string, string> = {
  Rookie: '#CD7F32',
  Apprentice: '#C0C0C0',
  Steady: '#60A5FA',
  Disciplined: '#FFD700',
  'Zen Master': '#8B5CF6',
};

export const DisciplineScore: React.FC<Props> = ({ data, isLoading }) => {
  if (isLoading && !data) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#60A5FA" style={{ marginVertical: 40 }} />
      </View>
    );
  }

  if (!data) return null;

  const score = data.score ?? 0;
  const level = data.level ?? 'Rookie';
  const nextThreshold = data.nextThreshold ?? 100;
  const pointsToNext = nextThreshold - score;
  const ringColor = LEVEL_RING_COLORS[level] ?? '#60A5FA';

  // SVG ring
  const size = 160;
  const strokeWidth = 10;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(1, Math.max(0, score / 100));
  const dashOffset = circumference * (1 - progress);

  const stats = data.stats ?? {};

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Discipline Score</Text>

      {/* Score ring */}
      <View style={styles.ringContainer}>
        <Svg width={size} height={size}>
          {/* Background */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${cx}, ${cy}`}
          />
          {/* Score text */}
          <SvgText
            x={cx}
            y={cy + 8}
            fill={ringColor}
            fontSize={42}
            fontWeight="900"
            textAnchor="middle"
          >
            {Math.round(score)}
          </SvgText>
        </Svg>
        <Text style={[styles.levelName, { color: ringColor }]}>{level}</Text>
        <Text style={styles.levelProgress}>
          {score}/{nextThreshold} — {pointsToNext > 0 ? `${pointsToNext} points to next level` : 'Max level!'}
        </Text>
      </View>

      {/* Stats 2x2 grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Ionicons name="shield" size={20} color="#60A5FA" />
          <Text style={styles.statValue}>{stats.panicSurvived ?? 0}</Text>
          <Text style={styles.statLabel}>Panic Events Survived</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="cash" size={20} color="#10B981" />
          <Text style={styles.statValue}>
            ${((stats.worstAvoided ?? 0) >= 1000
              ? `${((stats.worstAvoided ?? 0) / 1000).toFixed(1)}K`
              : (stats.worstAvoided ?? 0).toFixed(0))}
          </Text>
          <Text style={styles.statLabel}>Worst Decision Avoided</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="flame" size={20} color="#FBBF24" />
          <Text style={styles.statValue}>{stats.streak ?? 0}</Text>
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="analytics" size={20} color="#8B5CF6" />
          <Text style={styles.statValue}>{stats.signalAlignment ?? 0}/5</Text>
          <Text style={styles.statLabel}>Signal Alignment</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  ringContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    paddingVertical: 20,
    marginBottom: 16,
  },
  levelName: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  levelProgress: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '47.5%',
    flexGrow: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
