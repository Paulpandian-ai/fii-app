import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RootTabParamList } from '../types';

import { useCoachStore } from '../store/coachStore';
import { DailyBriefing } from '../components/DailyBriefing';
import { DisciplineScore } from '../components/DisciplineScore';
import { AchievementBadges } from '../components/AchievementBadges';
import { MarketContextCards } from '../components/MarketContextCards';
import { VolatilityAlert } from '../components/VolatilityAlert';
import { WeeklyRecap } from '../components/WeeklyRecap';

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
    weekly,
    isWeeklyLoading,
    hasLoaded,
    loadAll,
    dismissDaily,
    logEvent,
    loadWeekly,
  } = useCoachStore();

  // Volatility alert state (simulated — in prod, check SPY on load)
  const [showVolatilityAlert, setShowVolatilityAlert] = useState(false);
  const [spyDrop] = useState(0); // In prod: check SPY drop % on app open

  // Load data on mount
  useEffect(() => {
    if (!hasLoaded) {
      loadAll();
    }
  }, [hasLoaded, loadAll]);

  // Check for volatility alert (simulated: only show if SPY drops > 2%)
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

  const handleRefreshWeekly = useCallback(() => {
    loadWeekly();
  }, [loadWeekly]);

  const isLoading = isDailyLoading || isScoreLoading || isAchievementsLoading;

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Coach</Text>
        {isLoading && <ActivityIndicator color="#60A5FA" size="small" />}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Section 1: Daily Briefing */}
        {daily && !dailyDismissed && (
          <DailyBriefing
            briefing={daily}
            onDismiss={handleDismissDaily}
          />
        )}

        {/* Section 2: Discipline Score */}
        <DisciplineScore
          data={score}
          isLoading={isScoreLoading}
        />

        {/* Section 3: Achievement Badges */}
        <AchievementBadges
          data={achievements}
          isLoading={isAchievementsLoading}
        />

        {/* Section 4: Market Context Cards */}
        <MarketContextCards onCardsRead={handleCardsRead} />

        {/* Section 7: Weekly Recap */}
        <WeeklyRecap
          data={weekly}
          isLoading={isWeeklyLoading}
          onRefresh={handleRefreshWeekly}
        />
      </ScrollView>

      {/* Section 5: Volatility Alert (Modal overlay) */}
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
