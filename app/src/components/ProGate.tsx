import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../types';
import { useSubscriptionStore } from '../store/subscriptionStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ProGateProps {
  children: React.ReactNode;
  feature: string;
  requiredTier?: 'pro' | 'premium';
}

/**
 * Wraps premium features with a lock overlay when user's tier is insufficient.
 * If tier is sufficient, renders children normally.
 */
export const ProGate: React.FC<ProGateProps> = ({ children, feature, requiredTier = 'pro' }) => {
  const navigation = useNavigation<Nav>();
  const tier = useSubscriptionStore((s) => s.tier);

  const tierOrder = { free: 0, pro: 1, premium: 2 };
  const hasAccess = (tierOrder[tier] ?? 0) >= (tierOrder[requiredTier] ?? 1);

  const handleUpgrade = useCallback(() => {
    navigation.navigate('Paywall', { feature });
  }, [navigation, feature]);

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      {/* Blurred content preview */}
      <View style={styles.blurredContent} pointerEvents="none">
        <View style={styles.blurOverlay} />
        {children}
      </View>

      {/* Lock overlay */}
      <View style={styles.lockOverlay}>
        <View style={styles.lockBadge}>
          <Ionicons
            name="lock-closed"
            size={28}
            color={requiredTier === 'premium' ? '#A78BFA' : '#60A5FA'}
          />
        </View>
        <Text style={styles.lockTitle}>
          {requiredTier === 'premium' ? 'Premium Feature' : 'Pro Feature'}
        </Text>
        <Text style={styles.lockDesc}>
          Upgrade to {requiredTier === 'premium' ? 'Premium' : 'Pro'} to unlock {feature}
        </Text>
        <TouchableOpacity
          style={[
            styles.upgradeBtn,
            { backgroundColor: requiredTier === 'premium' ? '#A78BFA' : '#60A5FA' },
          ]}
          onPress={handleUpgrade}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-up-circle" size={18} color="#FFF" />
          <Text style={styles.upgradeBtnText}>
            Upgrade to {requiredTier === 'premium' ? 'Premium' : 'Pro'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

/**
 * Convenience wrapper that requires Premium tier.
 */
export const PremiumGate: React.FC<Omit<ProGateProps, 'requiredTier'>> = (props) => (
  <ProGate {...props} requiredTier="premium" />
);

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 16,
  },
  blurredContent: {
    opacity: 0.3,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 27, 62, 0.6)',
    zIndex: 1,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    padding: 20,
  },
  lockBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  lockTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  lockDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  upgradeBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
