import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RootTabParamList } from '../types';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { LastUpdated } from '../components/LastUpdated';
import { useDataRefresh } from '../hooks/useDataRefresh';

import { useCoachStore } from '../store/coachStore';
import { DailyBriefing } from '../components/DailyBriefing';
import { MarketContextCards } from '../components/MarketContextCards';
import { LearningPaths } from '../components/LearningPaths';
import { AskCoach } from '../components/AskCoach';
import { ProgressSection } from '../components/ProgressSection';
import { VolatilityAlert } from '../components/VolatilityAlert';

export const CoachScreen: React.FC = () => {
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();

  const {
    daily,
    isDailyLoading,
    dailyDismissed,
    score,
    isScoreLoading,
    achievements,
    isAchievementsLoading,
    learningPaths,
    isLearningPathsLoading,
    completedLessons,
    hasLoaded,
    loadAll,
    dismissDaily,
    logEvent,
    completeLesson,
  } = useCoachStore();

  // Volatility alert state
  const [showVolatilityAlert, setShowVolatilityAlert] = useState(false);
  const [spyDrop] = useState(0);
  const [coachLastUpdated, setCoachLastUpdated] = useState(0);

  // ─── Data polling: daily briefing refresh every 5min (not time-sensitive) ───
  useDataRefresh(
    'daily-briefing',
    async () => {
      try {
        const { loadDaily } = useCoachStore.getState();
        await loadDaily();
        setCoachLastUpdated(Date.now());
      } catch {}
    },
    300_000,
    hasLoaded,
  );

  // Load data on mount
  useEffect(() => {
    if (!hasLoaded) {
      loadAll();
    }
  }, [hasLoaded, loadAll]);

  // Check for volatility alert
  useEffect(() => {
    if (spyDrop < -2) {
      setShowVolatilityAlert(true);
    }
  }, [spyDrop]);

  const handleDismissDaily = useCallback(() => {
    dismissDaily();
  }, [dismissDaily]);

  const handleStayCourse = useCallback(() => {
    logEvent('stay_the_course');
    setShowVolatilityAlert(false);
  }, [logEvent]);

  const handleReviewLater = useCallback(() => {
    logEvent('panic_survived', 0);
    setShowVolatilityAlert(false);
  }, [logEvent]);

  const handleReviewHoldings = useCallback(() => {
    setShowVolatilityAlert(false);
    navigation.navigate('Portfolio');
  }, [navigation]);

  const handleCardsRead = useCallback(() => {
    logEvent('cards_read');
  }, [logEvent]);

  const isLoading = isDailyLoading || isScoreLoading || isAchievementsLoading;

  if (!hasLoaded && isLoading) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Coach</Text>
        </View>
        <View style={{ padding: 16, gap: 16 }}>
          <Skeleton width="100%" height={160} borderRadius={12} />
          <Skeleton width="100%" height={80} borderRadius={12} />
          <Skeleton width="100%" height={80} borderRadius={12} />
          <Skeleton width="100%" height={100} borderRadius={12} />
        </View>
      </LinearGradient>
    );
  }

  if (!hasLoaded && !isLoading && !daily && !score) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Coach</Text>
        </View>
        <ErrorState
          message="Couldn't load coaching data"
          onRetry={loadAll}
        />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarTitle}>Coach</Text>
          {coachLastUpdated > 0 && <LastUpdated timestamp={coachLastUpdated} />}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {isLoading && <ActivityIndicator color="#60A5FA" size="small" />}
          <TouchableOpacity onPress={() => navigation.getParent<any>()?.navigate('Leaderboard')}>
            <Ionicons name="podium-outline" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.getParent<any>()?.navigate('Settings')}>
            <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* SECTION 1: Daily Briefing */}
        {daily && !dailyDismissed && (
          <DailyBriefing
            briefing={daily}
            onDismiss={handleDismissDaily}
          />
        )}

        {/* SECTION 2: Market Context Stories */}
        <MarketContextCards onCardsRead={handleCardsRead} />

        {/* SECTION 3: Learning Paths */}
        {learningPaths && (
          <LearningPaths
            paths={learningPaths.paths}
            completedLessons={completedLessons}
            onCompleteLesson={completeLesson}
          />
        )}

        {/* SECTION 4: Ask Your Coach */}
        <AskCoach />

        {/* SECTION 5: Your Progress */}
        <ProgressSection
          score={score}
          isScoreLoading={isScoreLoading}
          achievements={achievements}
          isAchievementsLoading={isAchievementsLoading}
        />
      </ScrollView>

      {/* Volatility Alert (Modal overlay) */}
      <VolatilityAlert
        visible={showVolatilityAlert}
        spyDropPct={spyDrop}
        estimatedLoss={Math.abs(spyDrop * 500)}
        onStayCourse={handleStayCourse}
        onReviewLater={handleReviewLater}
        onReviewHoldings={handleReviewHoldings}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  topBarTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  scrollContent: {
    paddingBottom: 40,
  },
});
