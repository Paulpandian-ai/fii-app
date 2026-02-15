import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { FeedScreen } from './src/screens/FeedScreen';
import { PortfolioScreen } from './src/screens/PortfolioScreen';
import { StrategyScreen } from './src/screens/StrategyScreen';
import { CoachScreen } from './src/screens/CoachScreen';
import { SignalDetailScreen } from './src/screens/SignalDetailScreen';
import type { RootTabParamList, RootStackParamList } from './src/types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, { focused: keyof typeof Ionicons.glyphMap; unfocused: keyof typeof Ionicons.glyphMap }> = {
  Feed: { focused: 'play-circle', unfocused: 'play-circle-outline' },
  Portfolio: { focused: 'briefcase', unfocused: 'briefcase-outline' },
  Strategy: { focused: 'bar-chart', unfocused: 'bar-chart-outline' },
  Coach: { focused: 'shield-checkmark', unfocused: 'shield-checkmark-outline' },
};

function MainTabs() {
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
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen} />
      <Tab.Screen name="Strategy" component={StrategyScreen} />
      <Tab.Screen name="Coach" component={CoachScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen
          name="SignalDetail"
          component={SignalDetailScreen}
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
