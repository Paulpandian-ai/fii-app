import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AchievementsData } from '../types';

interface Props {
  data: AchievementsData | null;
  isLoading: boolean;
}

const BADGE_ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  diamond: 'diamond',
  analytics: 'analytics',
  flame: 'flame',
  leaf: 'leaf',
  school: 'school',
  bonfire: 'bonfire',
  shield: 'shield',
  globe: 'globe',
  trophy: 'trophy',
  star: 'star',
};

const BADGE_COLORS: Record<string, string> = {
  diamond: '#60A5FA',
  analytics: '#8B5CF6',
  flame: '#FBBF24',
  leaf: '#10B981',
  school: '#F59E0B',
  bonfire: '#EF4444',
  shield: '#3B82F6',
  globe: '#34D399',
  trophy: '#FFD700',
  star: '#F472B6',
};

export const AchievementBadges: React.FC<Props> = ({ data, isLoading }) => {
  if (isLoading && !data) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#60A5FA" style={{ marginVertical: 30 }} />
      </View>
    );
  }

  if (!data) return null;

  const badges = data.badges ?? [];
  const earned = badges.filter((b) => b.earned);
  const locked = badges.filter((b) => !b.earned);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Achievements</Text>
        <Text style={styles.countBadge}>
          {data.totalEarned}/{data.totalAvailable}
        </Text>
      </View>

      {/* Earned badges */}
      {earned.length > 0 && (
        <ScrollView
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.badgeScroll}
        >
          {earned.map((badge) => {
            const iconName = BADGE_ICON_MAP[badge.icon] ?? 'ribbon';
            const color = BADGE_COLORS[badge.icon] ?? '#60A5FA';
            return (
              <View key={badge.id} style={styles.badgeCard}>
                <View style={[styles.badgeIcon, { backgroundColor: `${color}20` }]}>
                  <Ionicons name={iconName} size={28} color={color} />
                </View>
                <Text style={styles.badgeName}>{badge.name}</Text>
                <Text style={styles.badgeDesc} numberOfLines={2}>
                  {badge.description}
                </Text>
                {badge.earnedAt && (
                  <Text style={styles.badgeDate}>
                    {new Date(badge.earnedAt).toLocaleDateString()}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Locked badges */}
      {locked.length > 0 && (
        <>
          <Text style={styles.lockedTitle}>Locked</Text>
          <ScrollView
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.badgeScroll}
          >
            {locked.map((badge) => (
              <View key={badge.id} style={[styles.badgeCard, styles.badgeCardLocked]}>
                <View style={[styles.badgeIcon, styles.badgeIconLocked]}>
                  <Ionicons name="lock-closed" size={24} color="rgba(255,255,255,0.2)" />
                </View>
                <Text style={[styles.badgeName, styles.badgeNameLocked]}>{badge.name}</Text>
                <Text style={[styles.badgeDesc, styles.badgeDescLocked]} numberOfLines={2}>
                  {badge.description}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  countBadge: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: 'rgba(96,165,250,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  badgeScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  badgeCard: {
    width: 130,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  badgeCardLocked: {
    opacity: 0.5,
  },
  badgeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  badgeIconLocked: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  badgeName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeNameLocked: {
    color: 'rgba(255,255,255,0.4)',
  },
  badgeDesc: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 14,
  },
  badgeDescLocked: {
    color: 'rgba(255,255,255,0.2)',
  },
  badgeDate: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    marginTop: 4,
  },
  lockedTitle: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    fontWeight: '700',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
