import React, { useEffect, useState } from 'react';
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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

import { usePortfolioStore } from '../store/portfolioStore';
import { getInsightsFeed } from '../services/api';
import { DisclaimerFooter } from '../components/DisclaimerFooter';
import { Skeleton } from '../components/Skeleton';
import { LastUpdated } from '../components/LastUpdated';
import { useDataRefresh } from '../hooks/useDataRefresh';

// New wealth management components
import { AiCoachCard } from '../components/AiCoachCard';
import { PortfolioHealthCard } from '../components/PortfolioHealthCard';
import { MonteCarloChart } from '../components/MonteCarloChart';
import { TaxOpportunitiesCard } from '../components/TaxOpportunitiesCard';
import { SectorAllocationChart } from '../components/SectorAllocationChart';
import { InsightsFeed } from '../components/InsightsFeed';

export const StrategyScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const holdings = usePortfolioStore((s) => s.holdings);
  const hasPortfolio = holdings.length >= 3;

  // Shared analytics data for sector chart (avoid double fetch)
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // Market pulse state
  const [marketPulse, setMarketPulse] = useState<string>('');
  const [marketPulseExpanded, setMarketPulseExpanded] = useState(false);
  const [marketPulseFull, setMarketPulseFull] = useState<string>('');
  const [pulseLoading, setPulseLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(0);

  // Market pulse polling every 5min
  useDataRefresh(
    'market-pulse',
    async () => {
      try {
        const data = await getInsightsFeed(1);
        const insight = data?.insights?.[0];
        if (insight) {
          setMarketPulse(insight.title || insight.summary || 'Markets are active today.');
          setMarketPulseFull(
            insight.summary || insight.body || insight.title || 'Markets are active today. Check your portfolio for updates.'
          );
          setLastUpdated(Date.now());
        }
      } catch {}
    },
    300_000,
  );

  // Load market pulse on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getInsightsFeed(1);
        if (!mounted) return;
        const insight = data?.insights?.[0];
        if (insight) {
          setMarketPulse(insight.title || insight.summary || 'Markets are active today.');
          setMarketPulseFull(
            insight.summary || insight.body || insight.title || 'Markets are active today. Check your portfolio for updates.'
          );
        } else {
          setMarketPulse('Markets are active today. Tap to see your portfolio update.');
          setMarketPulseFull('Markets are active today. Run a full analysis to get personalized insights.');
        }
      } catch {
        if (mounted) {
          setMarketPulse('Markets are active today. Tap to see your portfolio update.');
          setMarketPulseFull('Markets are active today. Run a full analysis to get personalized insights.');
        }
      } finally {
        if (mounted) setPulseLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Empty state for no portfolio
  if (!hasPortfolio) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Wealth Advisor</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="analytics-outline" size={48} color="rgba(255,255,255,0.2)" />
          <Text style={styles.emptyTitle}>Add Your Portfolio</Text>
          <Text style={styles.emptySubtitle}>
            Add at least 3 holdings to unlock portfolio analytics, tax insights, Monte Carlo projections, and AI-powered coaching.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarTitle}>Wealth Advisor</Text>
          {lastUpdated > 0 && <LastUpdated timestamp={lastUpdated} />}
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ═══ MARKET PULSE BANNER ═══ */}
        <TouchableOpacity
          style={styles.pulseBanner}
          onPress={() => setMarketPulseExpanded(!marketPulseExpanded)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['rgba(96,165,250,0.12)', 'rgba(139,92,246,0.08)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.pulseGradient}
          >
            <View style={styles.pulseHeader}>
              <View style={styles.pulseDot} />
              <Text style={styles.pulseLabel}>MARKET PULSE</Text>
              <Ionicons
                name={marketPulseExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="rgba(255,255,255,0.4)"
              />
            </View>
            {pulseLoading ? (
              <Skeleton width="100%" height={16} borderRadius={4} />
            ) : (
              <>
                <Text style={styles.pulseText} numberOfLines={marketPulseExpanded ? 6 : 2}>
                  {marketPulseExpanded ? marketPulseFull : marketPulse}
                </Text>
                <Text style={styles.pulseDisclaimer}>
                  For educational purposes only. Not investment advice.
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* ═══ AI COACH CARD ═══ */}
        <AiCoachCard />

        {/* ═══ PORTFOLIO HEALTH ═══ */}
        <PortfolioHealthCard onLoaded={(data) => setAnalyticsData(data)} />

        {/* ═══ MONTE CARLO PROJECTION ═══ */}
        <MonteCarloChart />

        {/* ═══ TAX OPPORTUNITIES ═══ */}
        <TaxOpportunitiesCard />

        {/* ═══ SECTOR ALLOCATION ═══ */}
        <SectorAllocationChart analyticsData={analyticsData} />

        {/* ═══ AI INSIGHTS FEED ═══ */}
        <InsightsFeed />

        {/* ═══ DISCLAIMER FOOTER ═══ */}
        <DisclaimerFooter />
      </ScrollView>
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

  // ─── Empty State ───
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  // ─── Market Pulse ───
  pulseBanner: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 14,
    overflow: 'hidden',
  },
  pulseGradient: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.15)',
  },
  pulseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00C9A7',
  },
  pulseLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    flex: 1,
  },
  pulseText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
  },
  pulseDisclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 9,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
