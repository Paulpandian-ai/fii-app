import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types';

// ─── Tier Feature Definitions ───

interface TierFeature {
  label: string;
  key: string;
  included: boolean;
}

interface TierConfig {
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  borderColor: string;
  glowColor: string | null;
  isCurrent: boolean;
  features: TierFeature[];
}

const TIERS: TierConfig[] = [
  {
    name: 'Free',
    monthlyPrice: '$0',
    annualPrice: '$0',
    borderColor: 'rgba(255,255,255,0.15)',
    glowColor: null,
    isCurrent: true,
    features: [
      { label: '15 stocks tracked', key: 'stocks_15', included: true },
      { label: '3 signals per day', key: 'signals_3', included: true },
      { label: '5 portfolio stocks', key: 'portfolio_5', included: true },
      { label: '3 AI chats per day', key: 'chat_3', included: true },
      { label: 'Basic coaching', key: 'basic_coach', included: true },
      { label: 'Charts & technicals', key: 'charts', included: false },
      { label: 'Price alerts', key: 'alerts', included: false },
      { label: 'Community access', key: 'community', included: false },
      { label: 'Wealth Simulator', key: 'wealth_simulator', included: false },
      { label: 'Tax Harvesting', key: 'tax_harvesting', included: false },
      { label: 'Portfolio X-Ray', key: 'xray', included: false },
      { label: 'API access', key: 'api', included: false },
    ],
  },
  {
    name: 'Pro',
    monthlyPrice: '$14.99/mo',
    annualPrice: '$119.99/yr',
    borderColor: '#60A5FA',
    glowColor: '#60A5FA',
    isCurrent: false,
    features: [
      { label: '100 stocks tracked', key: 'stocks_100', included: true },
      { label: 'Unlimited signals', key: 'unlimited_signals', included: true },
      { label: '30 portfolio stocks', key: 'portfolio_30', included: true },
      { label: '10 AI chats per day', key: 'chat_10', included: true },
      { label: 'Charts & technicals', key: 'charts', included: true },
      { label: 'Price alerts', key: 'alerts', included: true },
      { label: 'Community access', key: 'community', included: true },
      { label: 'Wealth Simulator', key: 'wealth_simulator', included: false },
      { label: 'Tax Harvesting', key: 'tax_harvesting', included: false },
      { label: 'Portfolio X-Ray', key: 'xray', included: false },
      { label: 'API access', key: 'api', included: false },
      { label: 'Unlimited AI chat', key: 'unlimited_chat', included: false },
    ],
  },
  {
    name: 'Premium',
    monthlyPrice: '$29.99/mo',
    annualPrice: '$249.99/yr',
    borderColor: '#A78BFA',
    glowColor: '#A78BFA',
    isCurrent: false,
    features: [
      { label: '500+ stocks tracked', key: 'stocks_500', included: true },
      { label: 'Everything in Pro', key: 'everything_pro', included: true },
      { label: 'Wealth Simulator', key: 'wealth_simulator', included: true },
      { label: 'Tax Harvesting', key: 'tax_harvesting', included: true },
      { label: 'Portfolio X-Ray', key: 'xray', included: true },
      { label: 'API access', key: 'api', included: true },
      { label: 'Unlimited AI chat', key: 'unlimited_chat', included: true },
    ],
  },
];

// ─── Component ───

export const PaywallScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Paywall'>>();
  const highlightFeature = route.params?.feature;

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  const handlePurchase = (tier: string) => {
    Alert.alert(
      `Subscribe to ${tier}`,
      'RevenueCat purchase flow would launch here',
    );
  };

  const handleRestore = () => {
    Alert.alert('Restore', 'Checking for existing purchases...');
  };

  const isFeatureHighlighted = (featureKey: string): boolean => {
    if (!highlightFeature) return false;
    const normalized = highlightFeature.toLowerCase().replace(/[\s_-]+/g, '_');
    const keyNormalized = featureKey.toLowerCase().replace(/[\s_-]+/g, '_');
    return keyNormalized.includes(normalized) || normalized.includes(keyNormalized);
  };

  // ─── Billing Toggle ───

  const renderBillingToggle = () => (
    <View style={styles.billingToggleContainer}>
      <TouchableOpacity
        style={[
          styles.billingPill,
          billingCycle === 'monthly' && styles.billingPillActive,
        ]}
        onPress={() => setBillingCycle('monthly')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Monthly billing${billingCycle === 'monthly' ? ', selected' : ''}`}
      >
        <Text
          style={[
            styles.billingPillText,
            billingCycle === 'monthly' && styles.billingPillTextActive,
          ]}
        >
          Monthly
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.billingPill,
          billingCycle === 'annual' && styles.billingPillActive,
        ]}
        onPress={() => setBillingCycle('annual')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Annual billing, save 33%${billingCycle === 'annual' ? ', selected' : ''}`}
      >
        <Text
          style={[
            styles.billingPillText,
            billingCycle === 'annual' && styles.billingPillTextActive,
          ]}
        >
          Annual
        </Text>
        {billingCycle === 'annual' && (
          <View style={styles.saveBadge}>
            <Text style={styles.saveBadgeText}>Save 33%!</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  // ─── Tier Cards ───

  const renderTierCard = (tier: TierConfig, index: number) => {
    const price = billingCycle === 'monthly' ? tier.monthlyPrice : tier.annualPrice;
    const hasGlow = tier.glowColor !== null;

    return (
      <View
        key={tier.name}
        style={[
          styles.tierCard,
          {
            borderColor: tier.borderColor,
            ...(hasGlow
              ? {
                  shadowColor: tier.glowColor!,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.35,
                  shadowRadius: 12,
                  elevation: 8,
                }
              : {}),
          },
        ]}
      >
        {/* Tier header */}
        <View style={styles.tierHeader}>
          <View style={styles.tierNameRow}>
            <Text style={styles.tierName}>{tier.name}</Text>
            {tier.isCurrent && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>CURRENT</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.tierPrice,
              tier.glowColor ? { color: tier.glowColor } : {},
            ]}
          >
            {price}
          </Text>
        </View>

        {/* Feature list */}
        <View style={styles.featureList}>
          {tier.features.map((feature, fIndex) => {
            const highlighted = isFeatureHighlighted(feature.key);
            return (
              <View
                key={feature.key}
                style={[
                  styles.featureRow,
                  highlighted && styles.featureRowHighlighted,
                ]}
              >
                <Ionicons
                  name={feature.included ? 'checkmark-circle' : 'close-circle-outline'}
                  size={18}
                  color={
                    feature.included
                      ? tier.glowColor ?? '#34D399'
                      : 'rgba(255,255,255,0.2)'
                  }
                />
                <Text
                  style={[
                    styles.featureLabel,
                    !feature.included && styles.featureLabelDisabled,
                    highlighted && styles.featureLabelHighlighted,
                  ]}
                >
                  {feature.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // ─── CTA Buttons ───

  const renderCTAButtons = () => (
    <View style={styles.ctaContainer}>
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => handlePurchase('Pro')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Start 7-day free trial for Pro plan"
      >
        <LinearGradient
          colors={['#1E40AF', '#3B82F6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaGradient}
        >
          <Ionicons name="rocket-outline" size={18} color="#FFFFFF" />
          <Text style={styles.ctaText}>Start 7-Day Free Trial</Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => handlePurchase('Premium')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Subscribe to Premium plan"
      >
        <LinearGradient
          colors={['#7C3AED', '#A78BFA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaGradient}
        >
          <Ionicons name="diamond-outline" size={18} color="#FFFFFF" />
          <Text style={styles.ctaText}>Go Premium</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  // ─── Social Proof & Guarantee ───

  const renderFooter = () => (
    <View style={styles.footerContainer}>
      {/* Social Proof */}
      <Text style={styles.socialProof}>
        Join 2,500+ investors using FII Pro
      </Text>

      {/* Money-back guarantee */}
      <View style={styles.guaranteeRow}>
        <Ionicons name="shield-checkmark" size={20} color="#34D399" />
        <Text style={styles.guaranteeText}>
          7-day free trial, cancel anytime
        </Text>
      </View>

      {/* Restore purchases */}
      <TouchableOpacity
        style={styles.restoreButton}
        onPress={handleRestore}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Restore purchases"
      >
        <Text style={styles.restoreText}>Restore Purchases</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Upgrade to Pro</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Body */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {renderBillingToggle()}
          {TIERS.map((tier, index) => renderTierCard(tier, index))}
          {renderCTAButtons()}
          {renderFooter()}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

// ─── Styles ───

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },

  // ─── Header ───
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 36,
  },

  // ─── Scroll ───
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // ─── Billing Toggle ───
  billingToggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
  },
  billingPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  billingPillActive: {
    backgroundColor: 'rgba(96,165,250,0.15)',
  },
  billingPillText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 15,
    fontWeight: '600',
  },
  billingPillTextActive: {
    color: '#60A5FA',
  },
  saveBadge: {
    backgroundColor: 'rgba(52,211,153,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  saveBadgeText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
  },

  // ─── Tier Cards ───
  tierCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 14,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  tierNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  tierPrice: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '700',
  },
  currentBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  currentBadgeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ─── Feature List ───
  featureList: {
    gap: 6,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  featureRowHighlighted: {
    backgroundColor: 'rgba(96,165,250,0.1)',
    shadowColor: '#60A5FA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  featureLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  featureLabelDisabled: {
    color: 'rgba(255,255,255,0.25)',
  },
  featureLabelHighlighted: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // ─── CTA Buttons ───
  ctaContainer: {
    gap: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  ctaButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  // ─── Footer ───
  footerContainer: {
    alignItems: 'center',
    gap: 14,
    paddingBottom: 20,
  },
  socialProof: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  guaranteeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guaranteeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
  },
  restoreButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  restoreText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
