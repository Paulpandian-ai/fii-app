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

const TAX_BRACKETS = [10, 12, 22, 24, 32, 35, 37];
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
        <DisclaimerFull />
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
});
