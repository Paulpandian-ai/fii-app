import React, { useState, useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dataRefreshManager } from './src/services/DataRefreshManager';
import { syncService } from './src/services/SyncService';
import { runMigration } from './src/services/MigrationService';
import { getCurrentSession } from './src/services/auth';

import { ErrorBoundary } from './src/components/ErrorBoundary';
import { FeedScreen } from './src/screens/FeedScreen';
import { PortfolioScreen } from './src/screens/PortfolioScreen';
import { StrategyScreen } from './src/screens/StrategyScreen';
import { CoachScreen } from './src/screens/CoachScreen';
import { SignalDetailScreen } from './src/screens/SignalDetailScreen';
import { WealthSimulatorScreen } from './src/screens/WealthSimulatorScreen';
import { TaxStrategyScreen } from './src/screens/TaxStrategyScreen';
import { PortfolioXRayScreen } from './src/screens/PortfolioXRayScreen';
import { AIAdvisorScreen } from './src/screens/AIAdvisorScreen';
import { BacktestScreen } from './src/screens/BacktestScreen';
import { FinancialHealthScreen } from './src/screens/FinancialHealthScreen';
import { AlternativeDataScreen } from './src/screens/AlternativeDataScreen';
import { ScreenerScreen } from './src/screens/ScreenerScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { EventTimelineScreen } from './src/screens/EventTimelineScreen';
import { EarningsCalendarScreen } from './src/screens/EarningsCalendarScreen';
import { MarketDashboardScreen } from './src/screens/MarketDashboardScreen';
import { BasketListScreen } from './src/screens/BasketListScreen';
import { TrackRecordScreen } from './src/screens/TrackRecordScreen';
import { DiscussionScreen } from './src/screens/DiscussionScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { AIChatScreen } from './src/screens/AIChatScreen';
import { PaywallScreen } from './src/screens/PaywallScreen';
import { PrivacyPolicyScreen } from './src/screens/PrivacyPolicyScreen';
import { TermsOfServiceScreen } from './src/screens/TermsOfServiceScreen';
import { WealthAdvisorScreen } from './src/screens/WealthAdvisorScreen';
import { TaxPlaybookScreen } from './src/screens/TaxPlaybookScreen';
import { AICoachScreen } from './src/screens/AICoachScreen';
import { useCoachStore } from './src/store/coachStore';
import { registerDeviceToken } from './src/services/api';
import type { RootTabParamList, RootStackParamList } from './src/types';

const WrappedFeed = () => (
  <ErrorBoundary screenName="FeedScreen"><FeedScreen /></ErrorBoundary>
);
const WrappedPortfolio = () => (
  <ErrorBoundary screenName="PortfolioScreen"><PortfolioScreen /></ErrorBoundary>
);
const WrappedStrategy = () => (
  <ErrorBoundary screenName="StrategyScreen"><StrategyScreen /></ErrorBoundary>
);
const WrappedCoach = () => (
  <ErrorBoundary screenName="CoachScreen"><CoachScreen /></ErrorBoundary>
);
const WrappedSignalDetail = (props: any) => (
  <ErrorBoundary screenName="SignalDetailScreen"><SignalDetailScreen {...props} /></ErrorBoundary>
);
const WrappedWealthSimulator = () => (
  <ErrorBoundary screenName="WealthSimulatorScreen"><WealthSimulatorScreen /></ErrorBoundary>
);
const WrappedTaxStrategy = () => (
  <ErrorBoundary screenName="TaxStrategyScreen"><TaxStrategyScreen /></ErrorBoundary>
);
const WrappedPortfolioXRay = () => (
  <ErrorBoundary screenName="PortfolioXRayScreen"><PortfolioXRayScreen /></ErrorBoundary>
);
const WrappedAIAdvisor = () => (
  <ErrorBoundary screenName="AIAdvisorScreen"><AIAdvisorScreen /></ErrorBoundary>
);
const WrappedBacktest = () => (
  <ErrorBoundary screenName="BacktestScreen"><BacktestScreen /></ErrorBoundary>
);
const WrappedFinancialHealth = (props: any) => (
  <ErrorBoundary screenName="FinancialHealthScreen"><FinancialHealthScreen {...props} /></ErrorBoundary>
);
const WrappedAlternativeData = (props: any) => (
  <ErrorBoundary screenName="AlternativeDataScreen"><AlternativeDataScreen {...props} /></ErrorBoundary>
);
const WrappedScreener = () => (
  <ErrorBoundary screenName="ScreenerScreen"><ScreenerScreen /></ErrorBoundary>
);
const WrappedSettings = () => (
  <ErrorBoundary screenName="SettingsScreen"><SettingsScreen /></ErrorBoundary>
);
const WrappedEventTimeline = (props: any) => (
  <ErrorBoundary screenName="EventTimelineScreen"><EventTimelineScreen {...props} /></ErrorBoundary>
);
const WrappedEarningsCalendar = () => (
  <ErrorBoundary screenName="EarningsCalendarScreen"><EarningsCalendarScreen /></ErrorBoundary>
);
const WrappedMarketDashboard = () => (
  <ErrorBoundary screenName="MarketDashboardScreen"><MarketDashboardScreen /></ErrorBoundary>
);
const WrappedBasketList = () => (
  <ErrorBoundary screenName="BasketListScreen"><BasketListScreen /></ErrorBoundary>
);
const WrappedTrackRecord = () => (
  <ErrorBoundary screenName="TrackRecordScreen"><TrackRecordScreen /></ErrorBoundary>
);
const WrappedDiscussion = (props: any) => (
  <ErrorBoundary screenName="DiscussionScreen"><DiscussionScreen {...props} /></ErrorBoundary>
);
const WrappedProfile = () => (
  <ErrorBoundary screenName="ProfileScreen"><ProfileScreen /></ErrorBoundary>
);
const WrappedLeaderboard = () => (
  <ErrorBoundary screenName="LeaderboardScreen"><LeaderboardScreen /></ErrorBoundary>
);
const WrappedAIChat = (props: any) => (
  <ErrorBoundary screenName="AIChatScreen"><AIChatScreen {...props} /></ErrorBoundary>
);
const WrappedPaywall = (props: any) => (
  <ErrorBoundary screenName="PaywallScreen"><PaywallScreen {...props} /></ErrorBoundary>
);
const WrappedWealthAdvisor = () => (
  <ErrorBoundary screenName="WealthAdvisorScreen"><WealthAdvisorScreen /></ErrorBoundary>
);
const WrappedTaxPlaybook = () => (
  <ErrorBoundary screenName="TaxPlaybookScreen"><TaxPlaybookScreen /></ErrorBoundary>
);
const WrappedAICoach = () => (
  <ErrorBoundary screenName="AICoachScreen"><AICoachScreen /></ErrorBoundary>
);
const WrappedPrivacyPolicy = () => (
  <ErrorBoundary screenName="PrivacyPolicyScreen"><PrivacyPolicyScreen /></ErrorBoundary>
);
const WrappedTermsOfService = () => (
  <ErrorBoundary screenName="TermsOfServiceScreen"><TermsOfServiceScreen /></ErrorBoundary>
);

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, { focused: keyof typeof Ionicons.glyphMap; unfocused: keyof typeof Ionicons.glyphMap }> = {
  Feed: { focused: 'play-circle', unfocused: 'play-circle-outline' },
  Portfolio: { focused: 'briefcase', unfocused: 'briefcase-outline' },
  Screener: { focused: 'funnel', unfocused: 'funnel-outline' },
  Strategy: { focused: 'bar-chart', unfocused: 'bar-chart-outline' },
  Coach: { focused: 'shield-checkmark', unfocused: 'shield-checkmark-outline' },
};

function MainTabs() {
  const dailyDismissed = useCoachStore((s) => s.dailyDismissed);
  const daily = useCoachStore((s) => s.daily);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: true, // Don't mount off-screen tabs until user navigates to them
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons.focused : icons.unfocused;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#60A5FA',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
        tabBarStyle: {
          backgroundColor: '#0A1628',
          borderTopColor: 'rgba(255,255,255,0.08)',
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 88,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen name="Feed" component={WrappedFeed} />
      <Tab.Screen name="Portfolio" component={WrappedPortfolio} />
      <Tab.Screen name="Screener" component={WrappedScreener} />
      <Tab.Screen name="Strategy" component={WrappedStrategy} />
      <Tab.Screen
        name="Coach"
        component={WrappedCoach}
        options={{
          tabBarBadge: daily && !dailyDismissed ? '' : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#EF4444',
            minWidth: 8,
            maxHeight: 8,
            borderRadius: 4,
            fontSize: 0,
          },
        }}
      />
    </Tab.Navigator>
  );
}

async function setupPushNotifications() {
  try {
    // Dynamically import expo-notifications (optional dependency)
    const Notifications = await import('expo-notifications').catch(() => null);
    if (!Notifications) return;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    if (token) {
      await registerDeviceToken(token, 'expo').catch(() => {});
      await AsyncStorage.setItem('@fii_push_token', token);
    }
  } catch {
    // Push notifications not available (e.g. simulator)
  }
}

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('@fii_onboarding_complete').then((val) => {
      setShowOnboarding(val !== 'true');
    });

    // Initialize SyncService for cloud sync
    syncService.initialize().then(async () => {
      // Check auth and run migration if authenticated
      try {
        const session = await getCurrentSession();
        if (session?.idToken) {
          syncService.setAuthenticated(true);
          // Run one-time migration from AsyncStorage to DynamoDB
          await runMigration();
        }
      } catch {}
    });

    // Push notifications setup (deferred to avoid competing with Feed's API calls)
    const pushTimer = setTimeout(() => setupPushNotifications(), 5000);

    // Pause/resume data polling based on app state (foreground/background)
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        dataRefreshManager.resume();
      } else {
        dataRefreshManager.pause();
      }
    });

    return () => {
      clearTimeout(pushTimer);
      appStateSubscription.remove();
      syncService.destroy();
    };
  }, []);

  // Wait for onboarding check
  if (showOnboarding === null) return null;

  if (showOnboarding) {
    return (
      <>
        <StatusBar style="light" />
        <OnboardingScreen onComplete={() => setShowOnboarding(false)} />
      </>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen
          name="SignalDetail"
          component={WrappedSignalDetail}
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="FinancialHealth"
          component={WrappedFinancialHealth}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="AlternativeData"
          component={WrappedAlternativeData}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="WealthSimulator"
          component={WrappedWealthSimulator}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="WealthAdvisor"
          component={WrappedWealthAdvisor}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="TaxStrategy"
          component={WrappedTaxStrategy}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="TaxPlaybook"
          component={WrappedTaxPlaybook}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="PortfolioXRay"
          component={WrappedPortfolioXRay}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="AIAdvisor"
          component={WrappedAIAdvisor}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="AICoach"
          component={WrappedAICoach}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Backtest"
          component={WrappedBacktest}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="EventTimeline"
          component={WrappedEventTimeline}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="EarningsCalendar"
          component={WrappedEarningsCalendar}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="MarketDashboard"
          component={WrappedMarketDashboard}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="BasketList"
          component={WrappedBasketList}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="TrackRecord"
          component={WrappedTrackRecord}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Discussion"
          component={WrappedDiscussion}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="ProfileScreen"
          component={WrappedProfile}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Leaderboard"
          component={WrappedLeaderboard}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="AIChat"
          component={WrappedAIChat}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Paywall"
          component={WrappedPaywall}
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="Settings"
          component={WrappedSettings}
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="PrivacyPolicy"
          component={WrappedPrivacyPolicy}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="TermsOfService"
          component={WrappedTermsOfService}
          options={{ animation: 'slide_from_right' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
