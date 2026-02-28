import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

import { usePortfolioStore } from '../store/portfolioStore';
import { useStrategyStore } from '../store/strategyStore';
import { useSignalStore } from '../store/signalStore';
import { getInsightsFeed } from '../services/api';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { Skeleton } from '../components/Skeleton';

const formatMoney = (v: unknown): string => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export const StrategyScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const holdings = usePortfolioStore((s) => s.holdings);
  const totalValue = usePortfolioStore((s) => s.totalValue);
  const hasPortfolio = holdings.length >= 3;

  const {
    optimization,
    isOptimizing,
    diversification,
    isDiversifying,
    taxHarvest,
    isTaxLoading,
    advice,
    isAdviceLoading,
    reportCard,
    isReportCardLoading,
    moves,
    hasRun,
    error: strategyError,
    runFullSimulation,
  } = useStrategyStore();

  const signals = useSignalStore((s) => s.signals);

  const isAnyLoading =
    isOptimizing || isDiversifying || isTaxLoading || isAdviceLoading || isReportCardLoading;

  // Market pulse state
  const [marketPulse, setMarketPulse] = useState<string>('');
  const [marketPulseExpanded, setMarketPulseExpanded] = useState(false);
  const [marketPulseFull, setMarketPulseFull] = useState<string>('');
  const [pulseLoading, setPulseLoading] = useState(true);

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
          setMarketPulseFull('Markets are active today. Run a full analysis to get personalized insights about your portfolio performance and recommendations.');
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

  // Auto-run simulation if we have portfolio and haven't run yet
  useEffect(() => {
    if (hasPortfolio && !hasRun && !isAnyLoading && !strategyError) {
      const value = totalValue > 0 ? totalValue : 50000;
      runFullSimulation(value);
    }
  }, [hasPortfolio, hasRun, isAnyLoading, strategyError, totalValue, runFullSimulation]);

  // Compute card previews
  const rebalanceCount = moves.length;
  const sharpeImprovement = optimization
    ? ((optimization.optimized?.sharpeRatio ?? 0) - (optimization.currentPortfolio?.sharpeRatio ?? 0))
    : 0;
  const annualImprovement = sharpeImprovement > 0
    ? Math.round(sharpeImprovement * (totalValue > 0 ? totalValue : 50000) * 0.1)
    : 0;

  const taxOpportunities = taxHarvest?.losses?.length ?? 0;
  const taxSavings = taxHarvest?.totalTaxSavings ?? 0;

  const adviceCount = advice.length;
  const topAdvice = advice[0];

  // Compute Strategy Score (0-100)
  const computeStrategyScore = (): number => {
    if (!hasRun) return 0;
    let score = 0;
    let components = 0;

    // Diversification score (0-25)
    if (diversification) {
      score += Math.min(25, (diversification.diversificationScore / 100) * 25);
      components++;
    }

    // Tax efficiency (0-25)
    if (taxHarvest) {
      const taxScore = taxHarvest.losses.length === 0 ? 25 : Math.max(0, 25 - taxHarvest.losses.length * 5);
      score += taxScore;
      components++;
    }

    // Risk management via Sharpe (0-25)
    if (optimization) {
      const currentSharpe = optimization.currentPortfolio?.sharpeRatio ?? 0;
      score += Math.min(25, (currentSharpe / 1.5) * 25);
      components++;
    }

    // Signal alignment (0-25)
    if (holdings.length > 0) {
      const buyCount = holdings.filter((h) => {
        const sig = signals[h.ticker];
        return sig?.signal === 'BUY';
      }).length;
      score += Math.min(25, (buyCount / holdings.length) * 25);
      components++;
    }

    return components > 0 ? Math.round(score) : 0;
  };

  const strategyScore = computeStrategyScore();
  const scoreColor =
    strategyScore >= 75 ? '#10B981' :
    strategyScore >= 50 ? '#60A5FA' :
    strategyScore >= 25 ? '#FBBF24' : '#EF4444';

  const handleShare = useCallback(async () => {
    try {
      let message = `My FII Strategy Score: ${strategyScore}/100\n\n`;
      if (reportCard) {
        message += `Overall Grade: ${reportCard.overall}\n`;
        for (const g of reportCard.grades) {
          message += `${g.category}: ${g.grade}\n`;
        }
      }
      message += '\nRun your own analysis at factorimpact.app';
      await Share.share({ message, title: 'FII Strategy Report' });
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        Alert.alert('Share failed', 'Could not share your report card');
      }
    }
  }, [strategyScore, reportCard]);

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Strategy</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {isAnyLoading && <ActivityIndicator color="#60A5FA" size="small" />}
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>
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

        {/* ═══ MAIN STRATEGY CARDS ═══ */}

        {/* CARD 1: Wealth Advisor */}
        <TouchableOpacity
          style={styles.mainCard}
          onPress={() => navigation.navigate('WealthAdvisor')}
          activeOpacity={0.7}
        >
          <View style={styles.mainCardInner}>
            <View style={styles.mainCardLeft}>
              <View style={[styles.mainCardIcon, { backgroundColor: 'rgba(96,165,250,0.12)' }]}>
                <Text style={{ fontSize: 24 }}>💰</Text>
              </View>
              <View style={styles.mainCardInfo}>
                <Text style={styles.mainCardTitle}>Wealth Advisor</Text>
                <Text style={styles.mainCardPreview} numberOfLines={1}>
                  {isAnyLoading && !hasRun
                    ? 'Analyzing your portfolio...'
                    : rebalanceCount > 0
                    ? `${rebalanceCount} rebalancing opportunit${rebalanceCount === 1 ? 'y' : 'ies'} found`
                    : annualImprovement > 0
                    ? `Your portfolio could improve by ${formatMoney(annualImprovement)}/year`
                    : hasRun
                    ? 'Portfolio analysis ready'
                    : 'Get personalized wealth recommendations'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
          </View>
        </TouchableOpacity>

        {/* CARD 2: Tax Playbook */}
        <TouchableOpacity
          style={styles.mainCard}
          onPress={() => navigation.navigate('TaxPlaybook')}
          activeOpacity={0.7}
        >
          <View style={styles.mainCardInner}>
            <View style={styles.mainCardLeft}>
              <View style={[styles.mainCardIcon, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
                <Text style={{ fontSize: 24 }}>📋</Text>
              </View>
              <View style={styles.mainCardInfo}>
                <Text style={styles.mainCardTitle}>Tax Playbook</Text>
                <Text style={styles.mainCardPreview} numberOfLines={1}>
                  {isTaxLoading
                    ? 'Scanning for tax opportunities...'
                    : taxOpportunities > 0
                    ? `${taxOpportunities} tax-loss harvesting opportunit${taxOpportunities === 1 ? 'y' : 'ies'}`
                    : taxSavings > 0
                    ? `Estimated tax savings: ${formatMoney(taxSavings)}`
                    : hasRun
                    ? 'No harvesting opportunities right now'
                    : 'Find tax-saving opportunities'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
          </View>
        </TouchableOpacity>

        {/* CARD 3: AI Coach */}
        <TouchableOpacity
          style={styles.mainCard}
          onPress={() => navigation.navigate('AICoach')}
          activeOpacity={0.7}
        >
          <View style={styles.mainCardInner}>
            <View style={styles.mainCardLeft}>
              <View style={[styles.mainCardIcon, { backgroundColor: 'rgba(251,191,36,0.12)' }]}>
                <Text style={{ fontSize: 24 }}>🤖</Text>
              </View>
              <View style={styles.mainCardInfo}>
                <Text style={styles.mainCardTitle}>AI Coach</Text>
                <Text style={styles.mainCardPreview} numberOfLines={1}>
                  {isAdviceLoading
                    ? 'Generating insights...'
                    : topAdvice
                    ? `New insight: ${topAdvice.title}`
                    : adviceCount > 0
                    ? `${adviceCount} recommendation${adviceCount !== 1 ? 's' : ''} ready`
                    : hasRun
                    ? 'Weekly portfolio review ready'
                    : 'Get AI-powered portfolio coaching'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
          </View>
        </TouchableOpacity>

        {/* ═══ SECONDARY CARDS (2-column row) ═══ */}
        <View style={styles.secondaryRow}>
          <TouchableOpacity
            style={styles.secondaryCard}
            onPress={() => navigation.navigate('Backtest')}
            activeOpacity={0.7}
          >
            <View style={[styles.secondaryIcon, { backgroundColor: 'rgba(244,114,182,0.12)' }]}>
              <Ionicons name="time-outline" size={20} color="#F472B6" />
            </View>
            <Text style={styles.secondaryTitle}>Signal Backtester</Text>
            <Text style={styles.secondarySubtitle}>See how FII signals performed</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryCard}
            onPress={() => navigation.navigate('EarningsCalendar')}
            activeOpacity={0.7}
          >
            <View style={[styles.secondaryIcon, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
              <Ionicons name="calendar" size={20} color="#3B82F6" />
            </View>
            <Text style={styles.secondaryTitle}>Earnings Calendar</Text>
            <Text style={styles.secondarySubtitle}>Upcoming reports & analysis</Text>
          </TouchableOpacity>
        </View>

        {/* ═══ STRATEGY SCORE ═══ */}
        <View style={styles.scoreContainer}>
          <LinearGradient
            colors={['#1A1A2E', '#16213E', '#0F3460']}
            style={styles.scoreCard}
          >
            <Text style={styles.scoreLabel}>STRATEGY SCORE</Text>

            {/* Score ring */}
            <View style={styles.scoreRingContainer}>
              <View style={[styles.scoreRingOuter, { borderColor: `${scoreColor}30` }]}>
                <View style={[styles.scoreRingInner, { borderColor: scoreColor }]}>
                  <Text style={[styles.scoreValue, { color: scoreColor }]}>
                    {hasRun ? strategyScore : '--'}
                  </Text>
                  <Text style={styles.scoreMax}>/100</Text>
                </View>
              </View>
            </View>

            {/* Score breakdown */}
            {hasRun && (
              <View style={styles.scoreBreakdown}>
                <View style={styles.scoreItem}>
                  <View style={[styles.scoreItemDot, { backgroundColor: '#8B5CF6' }]} />
                  <Text style={styles.scoreItemLabel}>Diversification</Text>
                </View>
                <View style={styles.scoreItem}>
                  <View style={[styles.scoreItemDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.scoreItemLabel}>Tax Efficiency</Text>
                </View>
                <View style={styles.scoreItem}>
                  <View style={[styles.scoreItemDot, { backgroundColor: '#60A5FA' }]} />
                  <Text style={styles.scoreItemLabel}>Risk Management</Text>
                </View>
                <View style={styles.scoreItem}>
                  <View style={[styles.scoreItemDot, { backgroundColor: '#FBBF24' }]} />
                  <Text style={styles.scoreItemLabel}>Signal Alignment</Text>
                </View>
              </View>
            )}

            {!hasRun && !isAnyLoading && (
              <Text style={styles.scoreEmpty}>
                {hasPortfolio
                  ? 'Running analysis...'
                  : 'Add 3+ holdings to see your Strategy Score'}
              </Text>
            )}

            {isAnyLoading && !hasRun && (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Skeleton width="100%" height={12} borderRadius={4} />
                <Skeleton width="80%" height={12} borderRadius={4} />
              </View>
            )}

            {/* Share button */}
            {hasRun && (
              <TouchableOpacity
                style={styles.shareButton}
                onPress={handleShare}
                activeOpacity={0.7}
              >
                <Ionicons name="share-social" size={16} color="#FFFFFF" />
                <Text style={styles.shareText}>Share Report Card</Text>
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>

        <DisclaimerBanner />
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
    backgroundColor: '#10B981',
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

  // ─── Main Strategy Cards ───
  mainCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  mainCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  mainCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  mainCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainCardInfo: {
    flex: 1,
  },
  mainCardTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 3,
  },
  mainCardPreview: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '500',
  },

  // ─── Secondary Cards ───
  secondaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  secondaryCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  secondaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  secondaryTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  secondarySubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '500',
  },

  // ─── Strategy Score ───
  scoreContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  scoreCard: {
    alignItems: 'center',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.12)',
  },
  scoreLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 16,
  },
  scoreRingContainer: {
    marginBottom: 16,
  },
  scoreRingOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRingInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '900',
  },
  scoreMax: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: -2,
  },
  scoreBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 4,
  },
  scoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  scoreItemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  scoreItemLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '500',
  },
  scoreEmpty: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  shareText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
