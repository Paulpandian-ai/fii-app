import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { DailyBriefingData } from '../types';

interface Props {
  briefing: DailyBriefingData;
  onDismiss: () => void;
}

const formatMoney = (v: unknown): string => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  const abs = Math.abs(n);
  if (abs >= 1000000) return `$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
};

export const DailyBriefing: React.FC<Props> = ({ briefing, onDismiss }) => {
  const changePct = briefing.stats?.portfolioChangePct ?? 0;
  const changeDollar = briefing.stats?.portfolioChange ?? 0;
  const isPositive = changeDollar >= 0;
  const streak = briefing.stats?.streak ?? 0;
  const signalsChanged = briefing.stats?.signalsChanged ?? 0;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0F3460', '#16213E', '#1A1A2E']}
        style={styles.card}
      >
        {/* Greeting */}
        <Text style={styles.greeting}>{briefing.greeting}</Text>

        {/* Summary */}
        <Text style={styles.summary}>{briefing.summary}</Text>

        {/* Quick stats */}
        <Text style={styles.statsTitle}>Your Day in 10 Seconds</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons
              name={isPositive ? 'trending-up' : 'trending-down'}
              size={20}
              color={isPositive ? '#10B981' : '#EF4444'}
            />
            <Text style={[styles.statValue, { color: isPositive ? '#10B981' : '#EF4444' }]}>
              {isPositive ? '+' : '-'}{formatMoney(changeDollar)}
            </Text>
            <Text style={styles.statLabel}>
              ({isPositive ? '+' : ''}{(changePct ?? 0).toFixed(1)}%)
            </Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <Ionicons name="pulse" size={20} color="#60A5FA" />
            <Text style={[styles.statValue, { color: '#60A5FA' }]}>
              {signalsChanged}
            </Text>
            <Text style={styles.statLabel}>
              {signalsChanged === 0 ? 'stable' : 'changed'}
            </Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <Ionicons name="flame" size={20} color="#FBBF24" />
            <Text style={[styles.statValue, { color: '#FBBF24' }]}>
              {streak}
            </Text>
            <Text style={styles.statLabel}>day streak</Text>
          </View>
        </View>

        {/* Dismiss */}
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={onDismiss}
          activeOpacity={0.8}
        >
          <Text style={styles.dismissText}>Got it!</Text>
          <Text style={styles.dismissSubtext}>+1 streak</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.15)',
  },
  greeting: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
  },
  summary: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  statsTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dismissButton: {
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    paddingVertical: 14,
  },
  dismissText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  dismissSubtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
});
