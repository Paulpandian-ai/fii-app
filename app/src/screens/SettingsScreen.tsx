import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Share,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { DisclaimerFull } from '../components/DisclaimerBanner';
import { useEventStore } from '../store/eventStore';
import { useSubscriptionStore } from '../store/subscriptionStore';
import { getAdminAgents, updateAdminAgentConfig, runAdminAgent } from '../services/api';

const TAX_BRACKETS = [10, 12, 22, 24, 32, 35, 37];

// Pre-defined schedule presets for agent time settings
const SCHEDULE_PRESETS: Record<string, { label: string; value: string }[]> = {
  price_refresh: [
    { label: 'Market hours (default)', value: 'default' },
    { label: 'Every 15 min', value: 'rate(15 minutes)' },
    { label: 'Every hour', value: 'rate(1 hour)' },
  ],
  technicals_refresh: [
    { label: '4:30 PM ET (default)', value: 'default' },
    { label: '1:00 PM ET', value: 'cron(0 18 ? * MON-FRI *)' },
    { label: '8:00 PM ET', value: 'cron(0 1 ? * TUE-SAT *)' },
  ],
  signal_generation: [
    { label: '6:00 PM ET (default)', value: 'default' },
    { label: '5:00 PM ET', value: 'cron(0 22 ? * MON-FRI *)' },
    { label: '9:00 PM ET', value: 'cron(0 2 ? * TUE-SAT *)' },
  ],
  fundamentals_refresh: [
    { label: 'Sunday 6 AM ET (default)', value: 'default' },
    { label: 'Saturday 6 AM ET', value: 'cron(0 10 ? * SAT *)' },
    { label: 'Daily 7 AM ET', value: 'cron(0 12 ? * MON-FRI *)' },
  ],
  feed_compile: [
    { label: '6:30 AM ET (default)', value: 'default' },
    { label: '7:30 AM ET', value: 'cron(30 12 ? * MON-FRI *)' },
    { label: '5:30 AM ET', value: 'cron(30 10 ? * MON-FRI *)' },
  ],
  ai_agent: [
    { label: 'Every hour (default)', value: 'default' },
    { label: 'Every 30 min', value: 'rate(30 minutes)' },
    { label: 'Every 2 hours', value: 'rate(2 hours)' },
    { label: '4x daily', value: 'cron(0 14,17,20,23 ? * MON-FRI *)' },
  ],
};

const AGENT_ICONS: Record<string, string> = {
  price_refresh: 'trending-up',
  technicals_refresh: 'analytics',
  signal_generation: 'flash',
  fundamentals_refresh: 'document-text',
  feed_compile: 'newspaper',
  ai_agent: 'sparkles',
};

const AGENT_COLORS: Record<string, string> = {
  price_refresh: '#10B981',
  technicals_refresh: '#60A5FA',
  signal_generation: '#FBBF24',
  fundamentals_refresh: '#F97316',
  feed_compile: '#8B5CF6',
  ai_agent: '#A78BFA',
};

interface AgentInfo {
  id: string;
  name: string;
  description: string;
  schedules: Record<string, string>;
  scheduleLabels: Record<string, string>;
  enabled: boolean;
  customSchedule: string | null;
  lastRun: {
    timestamp: string;
    status: string;
    trigger: string;
  } | null;
}
const RISK_PROFILES = [
  { id: 'conservative', label: 'Conservative', color: '#60A5FA' },
  { id: 'moderate', label: 'Moderate', color: '#FBBF24' },
  { id: 'aggressive', label: 'Aggressive', color: '#EF4444' },
];

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [riskProfile, setRiskProfile] = useState('moderate');
  const [taxBracket, setTaxBracket] = useState(24);
  const [dailyBriefing, setDailyBriefing] = useState(true);
  const [weeklyRecap, setWeeklyRecap] = useState(true);
  const [volatilityAlerts, setVolatilityAlerts] = useState(true);

  // Event alert preferences
  const preferences = useEventStore((s) => s.preferences);
  const updatePreferences = useEventStore((s) => s.updatePreferences);
  const loadPreferences = useEventStore((s) => s.loadPreferences);

  // Load settings
  useEffect(() => {
    const load = async () => {
      try {
        const profile = await AsyncStorage.getItem('@fii_risk_profile');
        if (profile) setRiskProfile(profile);
        const bracket = await AsyncStorage.getItem('@fii_tax_bracket');
        if (bracket) setTaxBracket(parseInt(bracket, 10));
        const daily = await AsyncStorage.getItem('@fii_daily_briefing');
        if (daily !== null) setDailyBriefing(daily === 'true');
        const weekly = await AsyncStorage.getItem('@fii_weekly_recap');
        if (weekly !== null) setWeeklyRecap(weekly === 'true');
        const vol = await AsyncStorage.getItem('@fii_volatility_alerts');
        if (vol !== null) setVolatilityAlerts(vol === 'true');
      } catch {
        // Use defaults
      }
    };
    load();
    loadPreferences();
  }, [loadPreferences]);

  const saveProfile = useCallback(async (profile: string) => {
    setRiskProfile(profile);
    await AsyncStorage.setItem('@fii_risk_profile', profile);
  }, []);

  const saveBracket = useCallback(async (bracket: number) => {
    setTaxBracket(bracket);
    await AsyncStorage.setItem('@fii_tax_bracket', bracket.toString());
  }, []);

  const handleExportData = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const stores = await AsyncStorage.multiGet(keys);
      const data: Record<string, any> = {};
      for (const [k, v] of stores) {
        if (k.startsWith('@fii_')) {
          try { data[k] = JSON.parse(v ?? ''); } catch { data[k] = v; }
        }
      }
      await Share.share({
        message: JSON.stringify(data, null, 2),
        title: 'FII Data Export',
      });
    } catch {
      Alert.alert('Export failed', 'Could not export your data.');
    }
  }, []);

  const handleClearCache = useCallback(() => {
    Alert.alert(
      'Clear Cache',
      'This will clear cached data. Your portfolio and settings will be preserved.',
      [
        { text: 'Cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            const cacheKeys = ['@fii_feed_cache', '@fii_signals_cache', '@fii_strategy_cache', '@fii_coach_cache'];
            await AsyncStorage.multiRemove(cacheKeys);
            Alert.alert('Done', 'Cache cleared.');
          },
        },
      ]
    );
  }, []);

  const handleResetApp = useCallback(() => {
    Alert.alert(
      'Reset App',
      'This will delete all your data and show onboarding again. Are you sure?',
      [
        { text: 'Cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            Alert.alert('Done', 'App has been reset. Restart the app to see onboarding.');
          },
        },
      ]
    );
  }, []);

  const handleShareApp = useCallback(async () => {
    await Share.share({
      message: 'Check out FII — Factor Impact Intelligence. Institutional-grade stock analysis powered by AI. https://factorimpact.app',
      title: 'Share FII',
    });
  }, []);

  // Subscription
  const tier = useSubscriptionStore((s) => s.tier);
  const subLabel = useSubscriptionStore((s) => s.label);
  const expiresAt = useSubscriptionStore((s) => s.expiresAt);
  const signalViews = useSubscriptionStore((s) => s.signalViews);
  const chat = useSubscriptionStore((s) => s.chat);
  const onDemandAnalyses = useSubscriptionStore((s) => s.onDemandAnalyses);
  const loadSubscription = useSubscriptionStore((s) => s.loadSubscription);
  const loadUsage = useSubscriptionStore((s) => s.loadUsage);

  useEffect(() => {
    loadSubscription();
    loadUsage();
  }, [loadSubscription, loadUsage]);

  // ─── Agent Control state ───
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const data = await getAdminAgents();
      setAgents(data.agents || []);
    } catch {
      // API unavailable — show nothing
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleToggleAgent = useCallback(async (agentId: string, enabled: boolean) => {
    // Optimistic update
    setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, enabled } : a));
    try {
      await updateAdminAgentConfig(agentId, { enabled });
    } catch {
      // Revert on failure
      setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, enabled: !enabled } : a));
      Alert.alert('Error', 'Failed to update agent toggle.');
    }
  }, []);

  const handleChangeSchedule = useCallback(async (agentId: string, schedule: string) => {
    const customSchedule = schedule === 'default' ? null : schedule;
    setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, customSchedule } : a));
    try {
      await updateAdminAgentConfig(agentId, { customSchedule });
    } catch {
      Alert.alert('Error', 'Failed to update schedule.');
      loadAgents(); // Reload to revert
    }
  }, [loadAgents]);

  const handleRunAgent = useCallback(async (agentId: string) => {
    setRunningAgent(agentId);
    try {
      await runAdminAgent(agentId);
      Alert.alert('Triggered', `Agent "${agentId}" has been manually triggered.`);
      // Refresh to show updated lastRun
      setTimeout(() => loadAgents(), 2000);
    } catch {
      Alert.alert('Error', 'Failed to trigger agent.');
    } finally {
      setRunningAgent(null);
    }
  }, [loadAgents]);

  const tierColors: Record<string, string> = { free: '#6B7280', pro: '#60A5FA', premium: '#A78BFA' };
  const tierColor = tierColors[tier] ?? '#6B7280';

  const handleManageSubscription = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else {
      Linking.openURL('https://play.google.com/store/account/subscriptions');
    }
  }, []);

  const handleRestorePurchases = useCallback(() => {
    Alert.alert('Restore Purchases', 'Checking for existing purchases...', [{ text: 'OK' }]);
  }, []);

  const profileColor = RISK_PROFILES.find((p) => p.id === riskProfile)?.color ?? '#60A5FA';
  const initials = 'GU'; // Guest User

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Profile */}
        <View style={styles.profileSection}>
          <View style={[styles.avatar, { borderColor: profileColor }]}>
            <Text style={[styles.avatarText, { color: profileColor }]}>{initials}</Text>
          </View>
          <Text style={styles.userName}>Guest User</Text>
          <Text style={styles.userSubtitle}>Sign in with Google or Apple to sync data</Text>
        </View>

        {/* Subscription */}
        <Text style={styles.sectionHeader}>Subscription</Text>
        <View style={[styles.subCard, { borderColor: tierColor + '40' }]}>
          <View style={styles.subCardHeader}>
            <View style={[styles.tierBadge, { backgroundColor: tierColor + '20' }]}>
              <Ionicons
                name={tier === 'premium' ? 'diamond' : tier === 'pro' ? 'star' : 'person'}
                size={16}
                color={tierColor}
              />
              <Text style={[styles.tierBadgeText, { color: tierColor }]}>
                {subLabel || 'Free'}
              </Text>
            </View>
            {expiresAt ? (
              <Text style={styles.expiresText}>
                Renews {new Date(expiresAt).toLocaleDateString()}
              </Text>
            ) : null}
          </View>

          {/* Usage bars */}
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Signal views</Text>
            <View style={styles.usageBarBg}>
              <View
                style={[
                  styles.usageBarFill,
                  {
                    width: `${Math.min(100, signalViews.limit > 0 ? (signalViews.used / signalViews.limit) * 100 : 0)}%`,
                    backgroundColor: tierColor,
                  },
                ]}
              />
            </View>
            <Text style={styles.usageCount}>
              {signalViews.used}/{signalViews.limit >= 999 ? '\u221E' : signalViews.limit}
            </Text>
          </View>
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Chat</Text>
            <View style={styles.usageBarBg}>
              <View
                style={[
                  styles.usageBarFill,
                  {
                    width: `${Math.min(100, chat.limit > 0 ? (chat.used / chat.limit) * 100 : 0)}%`,
                    backgroundColor: tierColor,
                  },
                ]}
              />
            </View>
            <Text style={styles.usageCount}>
              {chat.used}/{chat.limit >= 999 ? '\u221E' : chat.limit}
            </Text>
          </View>
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>On-demand</Text>
            <View style={styles.usageBarBg}>
              <View
                style={[
                  styles.usageBarFill,
                  {
                    width: `${Math.min(100, onDemandAnalyses.limit > 0 ? (onDemandAnalyses.used / onDemandAnalyses.limit) * 100 : 0)}%`,
                    backgroundColor: tierColor,
                  },
                ]}
              />
            </View>
            <Text style={styles.usageCount}>
              {onDemandAnalyses.used}/{onDemandAnalyses.limit >= 999 ? '\u221E' : onDemandAnalyses.limit}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.subActions}>
            {tier !== 'premium' && (
              <TouchableOpacity
                style={[styles.upgradeButton, { backgroundColor: tierColor }]}
                onPress={() => navigation.navigate('Paywall', {})}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-up-circle" size={16} color="#FFF" />
                <Text style={styles.upgradeButtonText}>Upgrade</Text>
              </TouchableOpacity>
            )}
            {tier !== 'free' && (
              <TouchableOpacity style={styles.manageLink} onPress={handleManageSubscription}>
                <Text style={styles.manageLinkText}>Manage Subscription</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.manageLink} onPress={handleRestorePurchases}>
              <Text style={styles.manageLinkText}>Restore Purchases</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Risk Profile */}
        <Text style={styles.sectionHeader}>Risk Profile</Text>
        <View style={styles.pillRow}>
          {RISK_PROFILES.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.pill, riskProfile === p.id && { borderColor: p.color, backgroundColor: `${p.color}15` }]}
              onPress={() => saveProfile(p.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, riskProfile === p.id && { color: p.color }]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tax Bracket */}
        <Text style={styles.sectionHeader}>Tax Bracket</Text>
        <View style={styles.pillRow}>
          {TAX_BRACKETS.map((b) => (
            <TouchableOpacity
              key={b}
              style={[styles.pill, taxBracket === b && styles.pillActive]}
              onPress={() => saveBracket(b)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, taxBracket === b && styles.pillTextActive]}>
                {b}%
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Notifications */}
        <Text style={styles.sectionHeader}>Notifications</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Daily market briefing</Text>
          <Switch
            value={dailyBriefing}
            onValueChange={(v) => { setDailyBriefing(v); AsyncStorage.setItem('@fii_daily_briefing', v.toString()); }}
            trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(96,165,250,0.3)' }}
            thumbColor={dailyBriefing ? '#60A5FA' : '#888'}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Weekly recap</Text>
          <Switch
            value={weeklyRecap}
            onValueChange={(v) => { setWeeklyRecap(v); AsyncStorage.setItem('@fii_weekly_recap', v.toString()); }}
            trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(96,165,250,0.3)' }}
            thumbColor={weeklyRecap ? '#60A5FA' : '#888'}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Volatility alerts</Text>
          <Switch
            value={volatilityAlerts}
            onValueChange={(v) => { setVolatilityAlerts(v); AsyncStorage.setItem('@fii_volatility_alerts', v.toString()); }}
            trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(96,165,250,0.3)' }}
            thumbColor={volatilityAlerts ? '#60A5FA' : '#888'}
          />
        </View>

        {/* Event Alert Preferences */}
        <Text style={styles.sectionHeader}>Event Alert Preferences</Text>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>P0 Critical</Text>
            <Text style={styles.toggleSublabel}>Signal changes, extreme earnings surprises</Text>
          </View>
          <Switch
            value={preferences.p0Critical}
            onValueChange={(v) => updatePreferences({ p0Critical: v })}
            trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(239,68,68,0.3)' }}
            thumbColor={preferences.p0Critical ? '#EF4444' : '#888'}
          />
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>P1 High</Text>
            <Text style={styles.toggleSublabel}>SEC filings, insider cluster buying, FDA decisions</Text>
          </View>
          <Switch
            value={preferences.p1High}
            onValueChange={(v) => updatePreferences({ p1High: v })}
            trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(251,191,36,0.3)' }}
            thumbColor={preferences.p1High ? '#FBBF24' : '#888'}
          />
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>P2 Medium</Text>
            <Text style={styles.toggleSublabel}>Earnings reminders, macro impacts, analyst changes</Text>
          </View>
          <Switch
            value={preferences.p2Medium}
            onValueChange={(v) => updatePreferences({ p2Medium: v })}
            trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(96,165,250,0.3)' }}
            thumbColor={preferences.p2Medium ? '#60A5FA' : '#888'}
          />
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>P3 Low</Text>
            <Text style={styles.toggleSublabel}>Medium-impact news, technical triggers, weekly summary</Text>
          </View>
          <Switch
            value={preferences.p3Low}
            onValueChange={(v) => updatePreferences({ p3Low: v })}
            trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(107,114,128,0.3)' }}
            thumbColor={preferences.p3Low ? '#6B7280' : '#888'}
          />
        </View>

        {/* Quiet Hours */}
        <Text style={styles.sectionHeader}>Quiet Hours</Text>
        <View style={styles.quietHoursRow}>
          <Ionicons name="moon-outline" size={18} color="rgba(255,255,255,0.5)" />
          <Text style={styles.quietHoursText}>
            No push notifications between {preferences.quietHoursStart}:00 – {preferences.quietHoursEnd}:00
          </Text>
        </View>

        {/* ─── Agent Control ─── */}
        <Text style={styles.sectionHeader}>AI Agent Control</Text>
        {agentsLoading ? (
          <View style={styles.agentLoadingRow}>
            <ActivityIndicator size="small" color="#60A5FA" />
            <Text style={styles.agentLoadingText}>Loading agents...</Text>
          </View>
        ) : agents.length === 0 ? (
          <View style={styles.agentLoadingRow}>
            <Ionicons name="cloud-offline-outline" size={18} color="rgba(255,255,255,0.3)" />
            <Text style={styles.agentLoadingText}>Agent data unavailable</Text>
          </View>
        ) : (
          agents.map((agent) => {
            const agentColor = AGENT_COLORS[agent.id] || '#60A5FA';
            const iconName = (AGENT_ICONS[agent.id] || 'cube') as any;
            const isExpanded = expandedAgent === agent.id;
            const presets = SCHEDULE_PRESETS[agent.id] || [];
            const activeSchedule = agent.customSchedule || 'default';
            const isRunning = runningAgent === agent.id;

            // Format last run info
            let lastRunLabel = 'Never run';
            if (agent.lastRun) {
              const ts = new Date(agent.lastRun.timestamp);
              const diff = Date.now() - ts.getTime();
              const hours = Math.floor(diff / (1000 * 60 * 60));
              if (hours < 1) lastRunLabel = 'Ran just now';
              else if (hours < 24) lastRunLabel = `Ran ${hours}h ago`;
              else lastRunLabel = `Ran ${Math.floor(hours / 24)}d ago`;
              if (agent.lastRun.status === 'error') lastRunLabel += ' (error)';
            }

            // Primary schedule display
            const primaryScheduleKey = Object.keys(agent.scheduleLabels || {})[0];
            const scheduleDisplay = agent.customSchedule
              ? presets.find((p) => p.value === agent.customSchedule)?.label || agent.customSchedule
              : (primaryScheduleKey ? agent.scheduleLabels[primaryScheduleKey] : 'No schedule');

            return (
              <View key={agent.id} style={[styles.agentCard, { borderColor: agent.enabled ? agentColor + '30' : 'rgba(255,255,255,0.06)' }]}>
                {/* Agent header row — tap to expand */}
                <TouchableOpacity
                  style={styles.agentHeaderRow}
                  onPress={() => setExpandedAgent(isExpanded ? null : agent.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.agentIconWrap, { backgroundColor: agentColor + '18' }]}>
                    <Ionicons name={iconName} size={18} color={agentColor} />
                  </View>
                  <View style={styles.agentHeaderText}>
                    <Text style={[styles.agentName, !agent.enabled && styles.agentNameDisabled]}>
                      {agent.name}
                    </Text>
                    <Text style={styles.agentScheduleLabel}>{scheduleDisplay}</Text>
                  </View>
                  <Switch
                    value={agent.enabled}
                    onValueChange={(v) => handleToggleAgent(agent.id, v)}
                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: agentColor + '40' }}
                    thumbColor={agent.enabled ? agentColor : '#666'}
                  />
                </TouchableOpacity>

                {/* Expanded details */}
                {isExpanded && (
                  <View style={styles.agentDetails}>
                    <Text style={styles.agentDescription}>{agent.description}</Text>

                    {/* Last run status */}
                    <View style={styles.agentStatusRow}>
                      <Ionicons
                        name={agent.lastRun?.status === 'error' ? 'alert-circle' : 'checkmark-circle'}
                        size={14}
                        color={agent.lastRun?.status === 'error' ? '#EF4444' : 'rgba(255,255,255,0.3)'}
                      />
                      <Text style={styles.agentStatusText}>{lastRunLabel}</Text>
                      {agent.lastRun?.trigger && (
                        <View style={styles.agentTriggerPill}>
                          <Text style={styles.agentTriggerText}>{agent.lastRun.trigger}</Text>
                        </View>
                      )}
                    </View>

                    {/* Schedule presets */}
                    {presets.length > 0 && (
                      <>
                        <Text style={styles.agentSubHeader}>Schedule</Text>
                        <View style={styles.agentPresetRow}>
                          {presets.map((preset) => (
                            <TouchableOpacity
                              key={preset.value}
                              style={[
                                styles.agentPresetPill,
                                activeSchedule === preset.value && {
                                  borderColor: agentColor + '60',
                                  backgroundColor: agentColor + '12',
                                },
                              ]}
                              onPress={() => handleChangeSchedule(agent.id, preset.value)}
                              activeOpacity={0.7}
                            >
                              <Text style={[
                                styles.agentPresetText,
                                activeSchedule === preset.value && { color: agentColor },
                              ]}>
                                {preset.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}

                    {/* All schedules */}
                    {Object.keys(agent.scheduleLabels || {}).length > 1 && (
                      <>
                        <Text style={styles.agentSubHeader}>All Schedules</Text>
                        {Object.entries(agent.scheduleLabels).map(([key, label]) => (
                          <View key={key} style={styles.agentScheduleDetailRow}>
                            <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.25)" />
                            <Text style={styles.agentScheduleKey}>{key.replace(/_/g, ' ')}</Text>
                            <Text style={styles.agentScheduleValue}>{label}</Text>
                          </View>
                        ))}
                      </>
                    )}

                    {/* Manual run button */}
                    <TouchableOpacity
                      style={[styles.agentRunBtn, { borderColor: agentColor + '40' }]}
                      onPress={() => handleRunAgent(agent.id)}
                      disabled={isRunning || !agent.enabled}
                      activeOpacity={0.7}
                    >
                      {isRunning ? (
                        <ActivityIndicator size="small" color={agentColor} />
                      ) : (
                        <Ionicons name="play" size={14} color={agent.enabled ? agentColor : '#666'} />
                      )}
                      <Text style={[styles.agentRunText, { color: agent.enabled ? agentColor : '#666' }]}>
                        {isRunning ? 'Running...' : 'Run Now'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Community */}
        <Text style={styles.sectionHeader}>Community</Text>
        <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('TrackRecord')} activeOpacity={0.7}>
          <Ionicons name="trophy-outline" size={20} color="#34D399" />
          <Text style={styles.actionText}>Our Track Record</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('ProfileScreen')} activeOpacity={0.7}>
          <Ionicons name="person-outline" size={20} color="#60A5FA" />
          <Text style={styles.actionText}>My Profile</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('Leaderboard')} activeOpacity={0.7}>
          <Ionicons name="podium-outline" size={20} color="#FBBF24" />
          <Text style={styles.actionText}>Leaderboard</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('AIChat', {})} activeOpacity={0.7}>
          <Ionicons name="sparkles-outline" size={20} color="#A78BFA" />
          <Text style={styles.actionText}>AI Chat Assistant</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>

        {/* Data */}
        <Text style={styles.sectionHeader}>Data</Text>
        <TouchableOpacity style={styles.actionRow} onPress={handleExportData} activeOpacity={0.7}>
          <Ionicons name="download-outline" size={20} color="#60A5FA" />
          <Text style={styles.actionText}>Export My Data</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionRow} onPress={handleClearCache} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={20} color="#FBBF24" />
          <Text style={styles.actionText}>Clear Cache</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionRow} onPress={handleResetApp} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={20} color="#EF4444" />
          <Text style={[styles.actionText, { color: '#EF4444' }]}>Reset App</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>

        {/* About */}
        <Text style={styles.sectionHeader}>About</Text>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>FII v1.0.0</Text>
          <Text style={styles.aboutValue}>Built with Claude AI</Text>
        </View>
        <TouchableOpacity style={styles.actionRow} onPress={handleShareApp} activeOpacity={0.7}>
          <Ionicons name="share-social-outline" size={20} color="#60A5FA" />
          <Text style={styles.actionText}>Share FII</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>

        {/* Legal */}
        <Text style={styles.sectionHeader}>Legal</Text>
        <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('PrivacyPolicy')} activeOpacity={0.7}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#60A5FA" />
          <Text style={styles.actionText}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('TermsOfService')} activeOpacity={0.7}>
          <Ionicons name="document-text-outline" size={20} color="#60A5FA" />
          <Text style={styles.actionText}>Terms of Service</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
        <DisclaimerFull />

        {/* Data Sources */}
        <Text style={styles.sectionHeader}>Data Sources</Text>
        <View style={styles.dataSourceCard}>
          <View style={styles.dataSourceRow}>
            <Text style={styles.dataSourceLabel}>Stock Data</Text>
            <Text style={styles.dataSourceValue}>Finnhub.io</Text>
          </View>
          <View style={styles.dataSourceRow}>
            <Text style={styles.dataSourceLabel}>Financial Filings</Text>
            <Text style={styles.dataSourceValue}>SEC EDGAR</Text>
          </View>
          <View style={styles.dataSourceRow}>
            <Text style={styles.dataSourceLabel}>Economic Data</Text>
            <Text style={styles.dataSourceValue}>Federal Reserve Economic Data (FRED)</Text>
          </View>
          <View style={styles.dataSourceRow}>
            <Text style={styles.dataSourceLabel}>Patent Data</Text>
            <Text style={styles.dataSourceValue}>PatentsView (USPTO)</Text>
          </View>
          <View style={styles.dataSourceRow}>
            <Text style={styles.dataSourceLabel}>Government Contracts</Text>
            <Text style={styles.dataSourceValue}>USASpending.gov</Text>
          </View>
          <View style={styles.dataSourceRow}>
            <Text style={styles.dataSourceLabel}>Clinical Trials</Text>
            <Text style={styles.dataSourceValue}>ClinicalTrials.gov (NIH)</Text>
          </View>
          <View style={[styles.dataSourceRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.dataSourceLabel}>AI Analysis</Text>
            <Text style={styles.dataSourceValue}>Anthropic Claude</Text>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  profileSection: { alignItems: 'center', paddingVertical: 20 },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  avatarText: { fontSize: 22, fontWeight: '800' },
  userName: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 10 },
  userSubtitle: { color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 4 },
  sectionHeader: {
    color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 10,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'transparent',
  },
  pillActive: { borderColor: 'rgba(96,165,250,0.4)', backgroundColor: 'rgba(96,165,250,0.1)' },
  pillText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  pillTextActive: { color: '#60A5FA' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 14, marginBottom: 8,
  },
  toggleLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '500' },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 14, marginBottom: 8,
  },
  actionText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '500', flex: 1 },
  aboutRow: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 14, marginBottom: 8,
  },
  aboutLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  aboutValue: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 },
  toggleSublabel: { color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 2 },
  quietHoursRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 14, marginBottom: 8,
  },
  quietHoursText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '500' },

  // Subscription
  subCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  subCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  tierBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  expiresText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  usageLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    width: 74,
  },
  usageBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  usageCount: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    width: 42,
    textAlign: 'right',
  },
  subActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  upgradeButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  manageLink: {},
  manageLinkText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  dataSourceCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  dataSourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  dataSourceLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
  },
  dataSourceValue: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },

  // ─── Agent Control ───
  agentLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  agentLoadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: '500',
  },
  agentCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
    overflow: 'hidden',
  },
  agentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  agentIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentHeaderText: {
    flex: 1,
  },
  agentName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  agentNameDisabled: {
    color: 'rgba(255,255,255,0.35)',
  },
  agentScheduleLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  agentDetails: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  agentDescription: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
    marginBottom: 10,
  },
  agentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  agentStatusText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '500',
  },
  agentTriggerPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 'auto',
  },
  agentTriggerText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  agentSubHeader: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  agentPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  agentPresetPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  agentPresetText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  agentScheduleDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  agentScheduleKey: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  agentScheduleValue: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  agentRunBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  agentRunText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
