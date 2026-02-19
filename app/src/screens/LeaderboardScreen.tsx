import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { getLeaderboard } from '../services/api';
import type { LeaderboardEntry, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ─── Level Colors ───

const LEVEL_COLORS: Record<string, string> = {
  Diamond: '#60A5FA',
  Platinum: '#A78BFA',
  Gold: '#FFD700',
  Silver: '#C0C0C0',
  Bronze: '#CD7F32',
  Beginner: 'rgba(255,255,255,0.4)',
};

const getLevelColor = (level: string): string =>
  LEVEL_COLORS[level] ?? 'rgba(255,255,255,0.4)';

// ─── Podium Medal Colors ───

const MEDAL_COLORS: Record<number, string> = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32',
};

const MEDAL_LABELS: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
};

// ─── Component ───

export const LeaderboardScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const data = await getLeaderboard();
      setEntries(data?.entries ?? data?.leaderboard ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // ─── Loading State ───

  if (loading) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Leaderboard</Text>
            <View style={{ width: 36 }} />
          </View>
          <View style={styles.skeletons}>
            <Skeleton width="100%" height={60} borderRadius={12} />
            <Skeleton width="100%" height={140} borderRadius={16} />
            <Skeleton width="100%" height={48} borderRadius={10} />
            <Skeleton width="100%" height={48} borderRadius={10} />
            <Skeleton width="100%" height={48} borderRadius={10} />
            <Skeleton width="100%" height={48} borderRadius={10} />
            <Skeleton width="100%" height={48} borderRadius={10} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ─── Error State ───

  if (error) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Leaderboard</Text>
            <View style={{ width: 36 }} />
          </View>
          <ErrorState
            icon="warning"
            message={error}
            subtitle="Pull down to try again or tap the button below."
            onRetry={loadData}
            retryLabel="Try Again"
          />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ─── Data Splits ───

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3, 50);

  // ─── Podium Card ───

  const renderPodiumCard = (entry: LeaderboardEntry) => {
    const medalColor = MEDAL_COLORS[entry.rank] ?? '#FFF';
    const isFirst = entry.rank === 1;

    return (
      <View
        key={`podium-${entry.rank}`}
        style={[
          styles.podiumCard,
          {
            borderColor: medalColor + '60',
            backgroundColor: medalColor + '10',
          },
          isFirst && styles.podiumCardFirst,
        ]}
      >
        {/* Medal badge */}
        <View style={[styles.medalBadge, { backgroundColor: medalColor + '30' }]}>
          <Ionicons
            name="trophy"
            size={isFirst ? 22 : 18}
            color={medalColor}
          />
        </View>

        <Text style={[styles.podiumRankLabel, { color: medalColor }]}>
          {MEDAL_LABELS[entry.rank]}
        </Text>

        <Text style={styles.podiumName} numberOfLines={1}>
          {entry.displayName}
        </Text>

        <Text style={[styles.podiumScore, { color: medalColor }]}>
          {(entry.disciplineScore ?? 0).toFixed(1)}
        </Text>

        <View style={styles.podiumMeta}>
          <View style={[styles.levelPill, { backgroundColor: getLevelColor(entry.level) + '25' }]}>
            <Text style={[styles.levelPillText, { color: getLevelColor(entry.level) }]}>
              {entry.level}
            </Text>
          </View>
          <View style={styles.streakRow}>
            <Ionicons name="flame" size={13} color="#F59E0B" />
            <Text style={styles.streakText}>{entry.streakDays ?? 0}d</Text>
          </View>
        </View>
      </View>
    );
  };

  // ─── List Row ───

  const renderRow = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isEven = index % 2 === 0;
    const levelColor = getLevelColor(item.level);

    return (
      <View
        style={[
          styles.row,
          { backgroundColor: isEven ? 'rgba(255,255,255,0.03)' : 'transparent' },
        ]}
      >
        {/* Rank */}
        <View style={styles.rankCell}>
          <Text style={styles.rankNumber}>{item.rank}</Text>
        </View>

        {/* Name */}
        <View style={styles.nameCell}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.displayName}
          </Text>
        </View>

        {/* Score */}
        <View style={styles.scoreCell}>
          <Text style={styles.rowScore}>
            {(item.disciplineScore ?? 0).toFixed(1)}
          </Text>
        </View>

        {/* Level badge */}
        <View style={styles.levelCell}>
          <View style={[styles.levelBadge, { backgroundColor: levelColor + '20' }]}>
            <Text style={[styles.levelBadgeText, { color: levelColor }]}>
              {item.level}
            </Text>
          </View>
        </View>

        {/* Streak */}
        <View style={styles.streakCell}>
          <Ionicons name="flame" size={12} color="#F59E0B" />
          <Text style={styles.rowStreak}>{item.streakDays ?? 0}</Text>
        </View>

        {/* Badge count */}
        <View style={styles.badgeCell}>
          <Ionicons name="ribbon" size={12} color="#A78BFA" />
          <Text style={styles.rowBadgeCount}>{item.badgeCount ?? 0}</Text>
        </View>
      </View>
    );
  };

  // ─── List Header (Podium + column labels) ───

  const ListHeader = () => (
    <View>
      {/* Subtitle header */}
      <View style={styles.subtitleCard}>
        <Ionicons name="shield-checkmark" size={20} color="#60A5FA" />
        <View style={styles.subtitleTextWrap}>
          <Text style={styles.subtitleTitle}>Discipline Score Leaderboard</Text>
          <Text style={styles.subtitleDesc}>
            Ranked by discipline and consistency, not investment returns.
            Build streaks, earn badges, and climb the ranks.
          </Text>
        </View>
      </View>

      {/* Top 3 Podium */}
      {top3.length > 0 && (
        <View style={styles.podiumSection}>
          {/* Render in visual order: 2nd, 1st, 3rd */}
          <View style={styles.podiumRow}>
            {top3[1] && renderPodiumCard(top3[1])}
            {top3[0] && renderPodiumCard(top3[0])}
            {top3[2] && renderPodiumCard(top3[2])}
          </View>
        </View>
      )}

      {/* Column header for list */}
      {rest.length > 0 && (
        <View style={styles.columnHeader}>
          <Text style={[styles.colLabel, styles.rankCol]}>#</Text>
          <Text style={[styles.colLabel, styles.nameCol]}>Name</Text>
          <Text style={[styles.colLabel, styles.scoreCol]}>Score</Text>
          <Text style={[styles.colLabel, styles.levelCol]}>Level</Text>
          <Text style={[styles.colLabel, styles.streakCol]}>Streak</Text>
          <Text style={[styles.colLabel, styles.badgeCol]}>Badges</Text>
        </View>
      )}
    </View>
  );

  // ─── Main Render ───

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Leaderboard</Text>
          <View style={{ width: 36 }} />
        </View>

        <FlatList
          data={rest}
          keyExtractor={(item) => `row-${item.rank}`}
          renderItem={renderRow}
          ListHeaderComponent={ListHeader}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#60A5FA"
            />
          }
          ListEmptyComponent={
            top3.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="podium-outline" size={48} color="rgba(255,255,255,0.15)" />
                <Text style={styles.emptyText}>No leaderboard data yet</Text>
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

// ─── Styles ───

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 20, fontWeight: '800' },

  // Loading
  skeletons: { padding: 16, gap: 12 },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },

  // Subtitle card
  subtitleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(96,165,250,0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.15)',
    gap: 12,
  },
  subtitleTextWrap: { flex: 1 },
  subtitleTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitleDesc: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 18,
  },

  // ─── Podium ───
  podiumSection: { marginBottom: 24 },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
  },
  podiumCard: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  podiumCardFirst: {
    paddingVertical: 20,
    marginBottom: 0,
  },
  medalBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  podiumRankLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  podiumName: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 2,
  },
  podiumScore: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  podiumMeta: {
    alignItems: 'center',
    gap: 6,
  },
  levelPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  levelPillText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  streakText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
  },

  // ─── Column Header ───
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  colLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  rankCol: { width: 32 },
  nameCol: { flex: 1 },
  scoreCol: { width: 50, textAlign: 'right' },
  levelCol: { width: 64, textAlign: 'center' },
  streakCol: { width: 48, textAlign: 'center' },
  badgeCol: { width: 48, textAlign: 'center' },

  // ─── Rows ───
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  rankCell: { width: 32 },
  rankNumber: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '700',
  },
  nameCell: { flex: 1, paddingRight: 6 },
  rowName: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  scoreCell: { width: 50, alignItems: 'flex-end' },
  rowScore: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '800',
  },
  levelCell: { width: 64, alignItems: 'center' },
  levelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  levelBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  streakCell: {
    width: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  rowStreak: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  badgeCell: {
    width: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  rowBadgeCount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },

  // ─── Empty ───
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
  },
});
