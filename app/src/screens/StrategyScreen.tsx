import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

import { usePortfolioStore } from '../store/portfolioStore';
import { useStrategyStore } from '../store/strategyStore';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';

const GRADE_COLORS: Record<string, string> = {
  'A+': '#10B981',
  A: '#10B981',
  'A-': '#34D399',
  'B+': '#34D399',
  B: '#60A5FA',
  'B-': '#60A5FA',
  'C+': '#FBBF24',
  C: '#FBBF24',
  'C-': '#F59E0B',
  D: '#EF4444',
  F: '#EF4444',
};

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
    hasRun,
    error: strategyError,
    runFullSimulation,
  } = useStrategyStore();

  const isAnyLoading =
    isOptimizing || isDiversifying || isTaxLoading || isAdviceLoading || isReportCardLoading;

  const handleRunSimulation = useCallback(() => {
    const value = totalValue > 0 ? totalValue : 50000;
    runFullSimulation(value);
  }, [totalValue, runFullSimulation]);

  // Compute card summaries
  const sharpe = (optimization?.optimized?.sharpeRatio ?? 0).toFixed(2);
  const targetSharpe = '0.75';
  const simGrade = reportCard?.grades?.find((g) => g.category === 'Optimization')?.grade ?? '--';

  const taxSavings = formatMoney(taxHarvest?.totalTaxSavings ?? 0);
  const taxGrade = reportCard?.grades?.find((g) => g.category === 'Tax Efficiency')?.grade ?? '--';

  const divScore = Math.round(diversification?.diversificationScore ?? 0);
  const divGrade = diversification?.grade ?? reportCard?.grades?.find((g) => g.category === 'Diversification')?.grade ?? '--';

  const adviceCount = advice.length;

  const overall = reportCard?.overall ?? '--';
  const overallColor = GRADE_COLORS[overall] ?? '#60A5FA';
  const overallScore = reportCard?.overallScore ?? 0;

  // Compute improvement summary
  const sharpeImprovement = optimization
    ? ((optimization.optimized?.sharpeRatio ?? 0) - (optimization.currentPortfolio?.sharpeRatio ?? 0)).toFixed(2)
    : '0.00';
  const savingsText = formatMoney(taxHarvest?.totalTaxSavings ?? 0);

  const handleShare = useCallback(async () => {
    if (!reportCard) return;
    try {
      let message = 'My FII Strategy Report Card\n\n';
      message += `Overall Grade: ${reportCard.overall} (${reportCard.overallScore}/100)\n\n`;
      for (const g of reportCard.grades) {
        message += `${g.category}: ${g.grade} — ${g.comment}\n`;
      }
      message += '\nRun your own analysis at factorimpact.app';
      await Share.share({ message, title: 'FII Report Card' });
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        Alert.alert('Share failed', 'Could not share your report card');
      }
    }
  }, [reportCard]);

  interface CardConfig {
    id: string;
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    subtitle: string;
    grade: string;
    screen: keyof RootStackParamList;
  }

  const cards: CardConfig[] = [
    {
      id: 'simulator',
      title: 'Wealth Simulator',
      icon: 'rocket',
      iconColor: '#60A5FA',
      subtitle: `Sharpe: ${sharpe} | Target: ${targetSharpe}`,
      grade: simGrade,
      screen: 'WealthSimulator',
    },
    {
      id: 'tax',
      title: 'Tax Strategy',
      icon: 'receipt',
      iconColor: '#10B981',
      subtitle: `Savings: ${taxSavings} available`,
      grade: taxGrade,
      screen: 'TaxStrategy',
    },
    {
      id: 'xray',
      title: 'Portfolio X-Ray',
      icon: 'scan',
      iconColor: '#8B5CF6',
      subtitle: `Diversification: ${divScore}/100`,
      grade: divGrade,
      screen: 'PortfolioXRay',
    },
    {
      id: 'advisor',
      title: 'AI Advisor',
      icon: 'sparkles',
      iconColor: '#FBBF24',
      subtitle: `${adviceCount} recommendation${adviceCount !== 1 ? 's' : ''} ready`,
      grade: adviceCount > 0 ? '' : '--',
      screen: 'AIAdvisor',
    },
    {
      id: 'backtest',
      title: 'Signal Backtester',
      icon: 'time-outline',
      iconColor: '#F472B6',
      subtitle: 'See how FII signals performed',
      grade: '',
      screen: 'Backtest',
    },
    {
      id: 'earnings',
      title: 'Earnings Calendar',
      icon: 'calendar',
      iconColor: '#3B82F6',
      subtitle: 'Upcoming reports & analysis',
      grade: '',
      screen: 'EarningsCalendar',
    },
  ];

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
        {/* Run Simulation CTA if not run yet */}
        {!hasRun && !isAnyLoading && (
          <View style={styles.ctaContainer}>
            {hasPortfolio ? (
              <TouchableOpacity
                style={styles.ctaButton}
                onPress={handleRunSimulation}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#3B82F6', '#8B5CF6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.ctaGradient}
                >
                  <Ionicons name="flash" size={20} color="#FFFFFF" />
                  <Text style={styles.ctaText}>Run Full Analysis</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <View style={styles.ctaEmptyCard}>
                <Ionicons name="briefcase-outline" size={32} color="rgba(255,255,255,0.3)" />
                <Text style={styles.ctaEmptyTitle}>Add 3+ holdings first</Text>
                <Text style={styles.ctaEmptySubtitle}>
                  Go to Portfolio tab to add holdings, then come back to run analysis.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* 2x2 Card Grid */}
        <View style={styles.cardGrid}>
          {cards.map((card) => {
            const gradeColor = GRADE_COLORS[card.grade] ?? 'rgba(255,255,255,0.3)';
            return (
              <TouchableOpacity
                key={card.id}
                style={styles.card}
                onPress={() => navigation.navigate(card.screen as any)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: `${card.iconColor}15` }]}>
                    <Ionicons name={card.icon} size={22} color={card.iconColor} />
                  </View>
                  {card.grade ? (
                    <View style={[styles.gradeBadge, { borderColor: gradeColor }]}>
                      <Text style={[styles.gradeText, { color: gradeColor }]}>
                        {card.grade}
                      </Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
                  )}
                </View>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {card.subtitle}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Overall Grade Hero */}
        {(hasRun || reportCard) && (
          <View style={styles.overallContainer}>
            <LinearGradient
              colors={['#1A1A2E', '#16213E', '#0F3460']}
              style={styles.overallCard}
            >
              <Text style={styles.overallLabel}>OVERALL STRATEGY GRADE</Text>
              <Text style={[styles.overallGrade, { color: overallColor }]}>
                {overall}
              </Text>
              <Text style={styles.overallScore}>{overallScore}/100</Text>

              {(optimization || taxHarvest) && (
                <Text style={styles.improvementText}>
                  Implementing all suggestions: +{sharpeImprovement} Sharpe, {savingsText} tax savings
                </Text>
              )}

              <TouchableOpacity
                style={styles.shareButton}
                onPress={handleShare}
                activeOpacity={0.7}
              >
                <Ionicons name="share-social" size={16} color="#FFFFFF" />
                <Text style={styles.shareText}>Share Report Card</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        )}

        {/* Loading state when simulation is running */}
        {isAnyLoading && !hasRun && (
          <View style={styles.loadingContainer}>
            <View style={{ width: '100%', paddingHorizontal: 16, gap: 12, marginBottom: 16 }}>
              <Skeleton width="100%" height={80} borderRadius={12} />
              <Skeleton width="100%" height={80} borderRadius={12} />
              <Skeleton width="100%" height={60} borderRadius={12} />
            </View>
            <Text style={styles.loadingText}>Running full analysis...</Text>
            <Text style={styles.loadingSubtext}>
              Optimizing portfolio, scanning taxes, analyzing diversification
            </Text>
          </View>
        )}

        {/* Error state when simulation fails */}
        {strategyError && !isAnyLoading && !hasRun && (
          <ErrorState
            message={strategyError}
            onRetry={handleRunSimulation}
          />
        )}

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
  ctaContainer: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  ctaButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  ctaEmptyCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ctaEmptyTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
  },
  ctaEmptySubtitle: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 10,
  },
  card: {
    width: '47.5%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexGrow: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '500',
  },
  overallContainer: {
    marginHorizontal: 16,
    marginTop: 20,
  },
  overallCard: {
    alignItems: 'center',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.15)',
  },
  overallLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8,
  },
  overallGrade: {
    fontSize: 72,
    fontWeight: '900',
  },
  overallScore: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  improvementText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
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
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#60A5FA',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
  },
  loadingSubtext: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginHorizontal: 40,
    lineHeight: 18,
  },
});
