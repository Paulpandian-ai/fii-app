import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSubscriptionStatus, getSubscriptionUsage } from '../services/api';

export type Tier = 'free' | 'pro' | 'premium';
export type BillingCycle = 'monthly' | 'annual';

export interface UsageBucket {
  used: number;
  limit: number;
}

export interface SubscriptionState {
  tier: Tier;
  label: string;
  expiresAt: string;
  source: string;
  trialUsed: boolean;
  // Usage
  signalViews: UsageBucket;
  chat: UsageBucket;
  onDemandAnalyses: UsageBucket;
  // Loading
  loading: boolean;
  // Actions
  loadSubscription: () => Promise<void>;
  loadUsage: () => Promise<void>;
  setTier: (tier: Tier) => void;
  incrementUsage: (type: 'signalViews' | 'chat' | 'onDemandAnalyses') => void;
  canAccess: (feature: string) => boolean;
  requiredTierFor: (feature: string) => Tier;
}

const TIER_ORDER: Record<Tier, number> = { free: 0, pro: 1, premium: 2 };

const PRO_FEATURES = new Set([
  'charts', 'alerts', 'communityPosting', 'savedScreeners',
  'unlimitedSignals', 'advancedCoach',
]);

const PREMIUM_FEATURES = new Set([
  'wealthSimulator', 'taxHarvesting', 'xray', 'apiAccess',
  'unlimitedChat', 'unlimitedOnDemand', 'advancedCharts',
  'prioritySupport', 'earlyAccess',
]);

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  tier: 'free',
  label: 'Free',
  expiresAt: '',
  source: '',
  trialUsed: false,
  signalViews: { used: 0, limit: 3 },
  chat: { used: 0, limit: 3 },
  onDemandAnalyses: { used: 0, limit: 0 },
  loading: false,

  loadSubscription: async () => {
    set({ loading: true });
    try {
      const data = await getSubscriptionStatus();
      set({
        tier: data?.tier ?? 'free',
        label: data?.label ?? 'Free',
        expiresAt: data?.expiresAt ?? '',
        source: data?.source ?? '',
        trialUsed: data?.trialUsed ?? false,
      });
      await AsyncStorage.setItem('@fii_tier', data?.tier ?? 'free');
    } catch (error) {
      console.error('[SubscriptionStore] loadSubscription failed:', error);
      // Fall back to cached tier
      const cached = await AsyncStorage.getItem('@fii_tier');
      if (cached) set({ tier: cached as Tier });
    } finally {
      set({ loading: false });
    }
  },

  loadUsage: async () => {
    try {
      const data = await getSubscriptionUsage();
      set({
        signalViews: data?.signalViews ?? { used: 0, limit: 3 },
        chat: data?.chat ?? { used: 0, limit: 3 },
        onDemandAnalyses: data?.onDemandAnalyses ?? { used: 0, limit: 0 },
      });
    } catch (error) {
      console.error('[SubscriptionStore] loadUsage failed:', error);
      // Keep existing usage data
    }
  },

  setTier: (tier: Tier) => set({ tier }),

  incrementUsage: (type) => {
    const bucket = get()[type];
    set({ [type]: { ...bucket, used: bucket.used + 1 } } as any);
  },

  canAccess: (feature: string): boolean => {
    const { tier } = get();
    if (PREMIUM_FEATURES.has(feature)) return TIER_ORDER[tier] >= 2;
    if (PRO_FEATURES.has(feature)) return TIER_ORDER[tier] >= 1;
    return true;
  },

  requiredTierFor: (feature: string): Tier => {
    if (PREMIUM_FEATURES.has(feature)) return 'premium';
    if (PRO_FEATURES.has(feature)) return 'pro';
    return 'free';
  },
}));
