import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WeeklyRecapData } from '../types';

interface Props {
  data: WeeklyRecapData | null;
  isLoading: boolean;
  onRefresh: () => void;
}

const formatMoney = (v: unknown): string => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  const abs = Math.abs(n);
  if (abs >= 1000000) return `$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
};

export const WeeklyRecap: React.FC<Props> = ({
  data,
  isLoading,
  onRefresh,
}) => {
  if (isLoading && !data) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#60A5FA" style={{ marginVertical: 30 }} />
      </View>
    );
  }

  if (!data) return null;

  const weeklyChange = data.weeklyChange ?? 0;
  const weeklyPct = data.weeklyChangePct ?? 0;
  const isPositive = weeklyChange >= 0;
  const scoreChange = data.scoreChange ?? 0;
  const score = data.score ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="calendar" size={20} color="#8B5CF6" />
        <Text style={styles.sectionTitle}>Weekly Recap</Text>
        <TouchableOpacity onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color="rgba(255,255,255,0.3)" />
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {/* Week stats */}
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>This Week</Text>
            <Text
              style={[
                styles.statValue,
                { color: isPositive ? '#10B981' : '#EF4444' },
              ]}
            >
              {isPositive ? '+' : '-'}{formatMoney(weeklyChange)} ({isPositive ? '+' : ''}{(weeklyPct ?? 0).toFixed(1)}%)
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Signals</Text>
            <Text style={styles.statValueSmall}>{data.signalChangesText ?? 'No changes'}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Discipline</Text>
            <Text style={styles.statValueSmall}>
              {score} ({scoreChange >= 0 ? '+' : ''}{scoreChange})
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Claude's one-liner */}
        <View style={styles.claudeRow}>
          <Ionicons name="chatbubble-ellipses" size={16} color="#8B5CF6" />
          <Text style={styles.claudeText}>{data.claudeLine}</Text>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.12)',
  },
  statRow: {
    flexDirection: 'row',
    gap: 16,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statValueSmall: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 12,
  },
  claudeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  claudeText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
    fontStyle: 'italic',
  },
});
