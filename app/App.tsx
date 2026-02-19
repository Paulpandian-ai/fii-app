import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
import { useCoachStore } from './src/store/coachStore';
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

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, { focused: keyof typeof Ionicons.glyphMap; unfocused: keyof typeof Ionicons.glyphMap }> = {
  Feed: { focused: 'play-circle', unfocused: 'play-circle-outline' },
  Portfolio: { focused: 'briefcase', unfocused: 'briefcase-outline' },
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

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('@fii_onboarding_complete').then((val) => {
      setShowOnboarding(val !== 'true');
    });
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
          name="Screener"
          component={WrappedScreener}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="WealthSimulator"
          component={WrappedWealthSimulator}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="TaxStrategy"
          component={WrappedTaxStrategy}
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
          name="Backtest"
          component={WrappedBacktest}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Settings"
          component={WrappedSettings}
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
