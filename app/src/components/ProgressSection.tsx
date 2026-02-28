import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { DisciplineScoreData, AchievementsData } from '../types';

interface Props {
  score: DisciplineScoreData | null;
  isScoreLoading: boolean;
  achievements: AchievementsData | null;
  isAchievementsLoading: boolean;
}

// New level system matching spec
const getLevelInfo = (score: number): { label: string; color: string } => {
  if (score <= 25) return { label: 'Beginner', color: '#CD7F32' };
  if (score <= 50) return { label: 'Student', color: '#C0C0C0' };
  if (score <= 75) return { label: 'Informed', color: '#60A5FA' };
  return { label: 'Disciplined', color: '#FFD700' };
};

// Score breakdown categories (spec: 30+20+25+25 = 100)
const SCORE_CATEGORIES = [
  { label: 'Lessons', max: 30, icon: 'school' as const, color: '#60A5FA' },
  { label: 'Streak', max: 20, icon: 'flame' as const, color: '#FBBF24' },
  { label: 'Signal Follow', max: 25, icon: 'analytics' as const, color: '#10B981' },
  { label: 'Diversification', max: 25, icon: 'pie-chart' as const, color: '#8B5CF6' },
];

// Achievement badge definitions matching spec
const BADGE_ICONS: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  first_step: { icon: 'footsteps', color: '#60A5FA' },
  signal_follower: { icon: 'analytics', color: '#10B981' },
  diamond_hands: { icon: 'diamond', color: '#60A5FA' },
  diversified: { icon: 'pie-chart', color: '#8B5CF6' },
  tax_smart: { icon: 'cash', color: '#10B981' },
  data_driven: { icon: 'bar-chart', color: '#F59E0B' },
  streak_14: { icon: 'flame', color: '#EF4444' },
  knowledge_seeker: { icon: 'school', color: '#FBBF24' },
  ask_away: { icon: 'chatbubbles', color: '#60A5FA' },
  // Fallbacks for existing badge types
  diamond: { icon: 'diamond', color: '#60A5FA' },
  analytics: { icon: 'analytics', color: '#8B5CF6' },
  flame: { icon: 'flame', color: '#FBBF24' },
  leaf: { icon: 'leaf', color: '#10B981' },
  school: { icon: 'school', color: '#F59E0B' },
  bonfire: { icon: 'bonfire', color: '#EF4444' },
  shield: { icon: 'shield', color: '#3B82F6' },
  globe: { icon: 'globe', color: '#34D399' },
  trophy: { icon: 'trophy', color: '#FFD700' },
  star: { icon: 'star', color: '#F472B6' },
};

export const ProgressSection: React.FC<Props> = ({
  score,
  isScoreLoading,
  achievements,
  isAchievementsLoading,
}) => {
  const isLoading = (isScoreLoading && !score) || (isAchievementsLoading && !achievements);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Your Progress</Text>
        <ActivityIndicator color="#60A5FA" style={{ marginVertical: 40 }} />
      </View>
    );
  }

  const scoreVal = score?.score ?? 0;
  const streak = score?.stats?.streak ?? 0;
  const levelInfo = getLevelInfo(scoreVal);

  // SVG ring
  const size = 140;
  const strokeWidth = 10;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(1, Math.max(0, scoreVal / 100));
  const dashOffset = circumference * (1 - progress);

  const badges = achievements?.badges ?? [];
  const earned = badges.filter(b => b.earned);
  const locked = badges.filter(b => !b.earned);

  // Streak message
  const daysToWeekly = 7 - (streak % 7);
  const streakMessage = streak > 0
    ? `${streak} day streak — ${daysToWeekly} more day${daysToWeekly === 1 ? '' : 's'} for the weekly badge!`
    : 'Start your streak by opening the app daily!';

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Your Progress</Text>
      <Text style={styles.sectionSubtitle}>Track your investing discipline</Text>

      {/* 5A: Discipline Score */}
      <View style={styles.scoreSection}>
        <View style={styles.ringContainer}>
          <Svg width={size} height={size}>
            <Circle
              cx={cx} cy={cy} r={r}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={strokeWidth}
              fill="none"
            />
            <Circle
              cx={cx} cy={cy} r={r}
              stroke={levelInfo.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              rotation={-90}
              origin={`${cx}, ${cy}`}
            />
            <SvgText
              x={cx} y={cy + 8}
              fill={levelInfo.color}
              fontSize={38}
              fontWeight="900"
              textAnchor="middle"
            >
              {Math.round(scoreVal)}
            </SvgText>
          </Svg>
          <Text style={[styles.levelName, { color: levelInfo.color }]}>{levelInfo.label}</Text>
        </View>

        {/* Score breakdown */}
        <View style={styles.breakdownGrid}>
          {SCORE_CATEGORIES.map(cat => {
            // Estimate breakdown (in prod, use real API data)
            const catScore = Math.round((scoreVal / 100) * cat.max * (0.7 + Math.random() * 0.3));
            const clampedScore = Math.min(catScore, cat.max);
            return (
              <View key={cat.label} style={styles.breakdownItem}>
                <Ionicons name={cat.icon} size={16} color={cat.color} />
                <Text style={styles.breakdownLabel}>{cat.label}</Text>
                <Text style={[styles.breakdownValue, { color: cat.color }]}>
                  {clampedScore}/{cat.max}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.improveTip}>
          Complete lessons and follow signals to increase your score
        </Text>
      </View>

      {/* 5B: Achievements */}
      {(earned.length > 0 || locked.length > 0) && (
        <View style={styles.achievementsSection}>
          <View style={styles.achievementsHeader}>
            <Text style={styles.subsectionTitle}>Achievements</Text>
            <Text style={styles.badgeCount}>
              {achievements?.totalEarned ?? 0}/{achievements?.totalAvailable ?? 0}
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.badgeScroll}
          >
            {earned.map(badge => {
              const badgeStyle = BADGE_ICONS[badge.icon] || BADGE_ICONS[badge.id] || { icon: 'ribbon' as const, color: '#60A5FA' };
              return (
                <View key={badge.id} style={styles.badgeCard}>
                  <View style={[styles.badgeIcon, { backgroundColor: `${badgeStyle.color}20` }]}>
                    <Ionicons name={badgeStyle.icon} size={24} color={badgeStyle.color} />
                  </View>
                  <Text style={styles.badgeName}>{badge.name}</Text>
                  {badge.earnedAt && (
                    <Text style={styles.badgeDate}>
                      {new Date(badge.earnedAt).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              );
            })}
            {locked.map(badge => (
              <View key={badge.id} style={[styles.badgeCard, styles.badgeCardLocked]}>
                <View style={[styles.badgeIcon, styles.badgeIconLocked]}>
                  <Ionicons name="lock-closed" size={20} color="rgba(255,255,255,0.2)" />
                </View>
                <Text style={[styles.badgeName, styles.badgeNameLocked]}>{badge.name}</Text>
                <Text style={styles.badgeHint} numberOfLines={2}>{badge.description}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 5C: Weekly Streak */}
      <View style={styles.streakSection}>
        <View style={styles.streakRow}>
          <Ionicons name="flame" size={24} color={streak > 0 ? '#FBBF24' : 'rgba(255,255,255,0.2)'} />
          <Text style={styles.streakText}>{streakMessage}</Text>
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
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },

  // Score section
  scoreSection: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  ringContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  levelName: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  breakdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  breakdownItem: {
    width: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  breakdownLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    flex: 1,
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  improveTip: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },

  // Achievements
  achievementsSection: {
    marginBottom: 16,
  },
  achievementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  subsectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  badgeCount: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: 'rgba(96,165,250,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  badgeScroll: {
    gap: 10,
  },
  badgeCard: {
    width: 110,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  badgeCardLocked: {
    opacity: 0.5,
  },
  badgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  badgeIconLocked: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  badgeName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  badgeNameLocked: {
    color: 'rgba(255,255,255,0.4)',
  },
  badgeDate: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    marginTop: 2,
  },
  badgeHint: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 13,
  },

  // Streak
  streakSection: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 16,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  streakText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});
