import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, RebalanceMove } from '../types';

import { usePortfolioStore } from '../store/portfolioStore';
import { useStrategyStore } from '../store/strategyStore';
import { useSignalStore } from '../store/signalStore';
import { getAdvice, getScreener } from '../services/api';
import { RebalancingMoves } from '../components/RebalancingMoves';
import { TimeMachine } from '../components/TimeMachine';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const formatMoney = (v: unknown): string => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

const formatPercent = (v: unknown): string => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
};

interface BuyRecommendation {
  ticker: string;
  companyName: string;
  score: number;
  sector: string;
  reason: string;
}

interface BeyondStocksSuggestion {
  ticker: string;
  name: string;
  category: string;
  reason: string;
  icon: string;
  color: string;
}

export const WealthAdvisorScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const holdings = usePortfolioStore((s) => s.holdings);
  const totalValue = usePortfolioStore((s) => s.totalValue);
  const hasPortfolio = holdings.length >= 3;

  const {
    optimization,
    isOptimizing,
    projection,
    isProjecting,
    scenarios,
    moves,
    isRebalancing,
    diversification,
    advice,
    hasRun,
    error: strategyError,
    runFullSimulation,
    loadProjection,
  } = useStrategyStore();

  const signals = useSignalStore((s) => s.signals);

  const isAnyLoading = isOptimizing || isRebalancing || isProjecting;

  // Buy recommendations state
  const [buyRecs, setBuyRecs] = useState<BuyRecommendation[]>([]);
  const [buyLoading, setBuyLoading] = useState(false);

  // Auto-run if portfolio exists but hasn't been analyzed
  useEffect(() => {
    if (hasPortfolio && !hasRun && !isAnyLoading && !strategyError) {
      const value = totalValue > 0 ? totalValue : 50000;
      runFullSimulation(value);
    }
  }, [hasPortfolio, hasRun, isAnyLoading, strategyError, totalValue, runFullSimulation]);

  // Load buy recommendations based on portfolio gaps
  useEffect(() => {
    if (!hasPortfolio || buyRecs.length > 0 || buyLoading) return;
    let mounted = true;
    setBuyLoading(true);
    (async () => {
      try {
        const data = await getScreener({ sortBy: 'aiScore', sortDir: 'desc', limit: '20', minScore: '7' });
        if (!mounted) return;
        const holdingTickers = new Set(holdings.map((h) => h.ticker));
        const holdingSectors = new Set(holdings.map((h) => {
          const sig = signals[h.ticker];
          return (sig as any)?.sector || '';
        }).filter(Boolean));

        const recs = (data?.results || [])
          .filter((r: any) => !holdingTickers.has(r.ticker))
          .slice(0, 3)
          .map((r: any) => ({
            ticker: r.ticker,
            companyName: r.companyName,
            score: r.aiScore ?? r.score ?? 0,
            sector: r.sector || 'Unknown',
            reason: holdingSectors.has(r.sector)
              ? `High FII score (${r.aiScore ?? r.score ?? 0}/10) — strengthens ${r.sector} position`
              : `High FII score (${r.aiScore ?? r.score ?? 0}/10) — adds ${r.sector} diversification`,
          }));
        setBuyRecs(recs);
      } catch {
        // silent
      } finally {
        if (mounted) setBuyLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [hasPortfolio, holdings, signals, buyRecs.length, buyLoading]);

  const handleYearsChange = useCallback(
    (years: number) => {
      const value = totalValue > 0 ? totalValue : 50000;
      loadProjection(years, value);
    },
    [totalValue, loadProjection]
  );

  // Compute portfolio intelligence
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];

  if (hasRun && optimization) {
    const currentSharpe = optimization.currentPortfolio?.sharpeRatio ?? 0;
    if (currentSharpe > 0.5) strengths.push('Strong risk-adjusted returns (Sharpe > 0.5)');
    if (currentSharpe <= 0.3) weaknesses.push('Low risk-adjusted returns — consider rebalancing');

    const sectorCount = new Set(diversification?.sectors?.map((s) => s.sector) || []).size;
    if (sectorCount >= 5) strengths.push(`Diversified across ${sectorCount} sectors`);
    if (sectorCount < 3) weaknesses.push(`Concentrated in only ${sectorCount} sector${sectorCount === 1 ? '' : 's'}`);

    const buyCount = holdings.filter((h) => signals[h.ticker]?.signal === 'BUY').length;
    if (buyCount > holdings.length * 0.6) strengths.push(`${buyCount} of ${holdings.length} holdings have BUY signals`);

    const sellCount = holdings.filter((h) => signals[h.ticker]?.signal === 'SELL').length;
    if (sellCount > 0) weaknesses.push(`${sellCount} holding${sellCount !== 1 ? 's' : ''} with SELL signal — review positions`);

    if (diversification && diversification.diversificationScore < 50) {
      opportunities.push('Improve diversification — consider international or bond exposure');
    }
    if (moves.length > 0) {
      opportunities.push(`${moves.length} rebalancing move${moves.length !== 1 ? 's' : ''} could improve your portfolio`);
    }
  }

  // Beyond Stocks suggestions
  const beyondStocks: BeyondStocksSuggestion[] = [];
  if (hasRun) {
    beyondStocks.push({
      ticker: 'AGG',
      name: 'iShares Core US Aggregate Bond',
      category: 'Bond Allocation',
      reason: 'Consider 20% bond allocation for portfolio stability during market volatility.',
      icon: 'shield-checkmark',
      color: '#60A5FA',
    });
    beyondStocks.push({
      ticker: 'VXUS',
      name: 'Vanguard Total International Stock',
      category: 'International Exposure',
      reason: 'Add international diversification to reduce US-only concentration risk.',
      icon: 'globe',
      color: '#8B5CF6',
    });
    beyondStocks.push({
      ticker: 'GLD',
      name: 'SPDR Gold Shares',
      category: 'Inflation Hedge',
      reason: 'Gold as a hedge against inflation and market uncertainty.',
      icon: 'diamond',
      color: '#FBBF24',
    });

    // Conditionally add cash suggestion based on scenarios
    const hasHighVolatility = scenarios.some((s) =>
      s.title?.toLowerCase().includes('recession') || s.title?.toLowerCase().includes('adverse')
    );
    if (hasHighVolatility) {
      beyondStocks.push({
        ticker: 'CASH',
        name: 'Cash Reserve',
        category: 'Cash Position',
        reason: 'Market volatility is elevated — consider keeping 10% in cash for opportunities.',
        icon: 'wallet',
        color: '#10B981',
      });
    }
  }

  if (!hasPortfolio) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Wealth Advisor</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 48 }}>💰</Text>
          <Text style={styles.emptyTitle}>Add Your Portfolio First</Text>
          <Text style={styles.emptySubtitle}>
            Add at least 3 holdings in the Portfolio tab to get personalized wealth recommendations.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wealth Advisor</Text>
        {isAnyLoading && <ActivityIndicator color="#60A5FA" size="small" />}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ═══ 2A. PORTFOLIO INTELLIGENCE BRIEFING ═══ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Portfolio Intelligence</Text>
          <Text style={styles.sectionSubtitle}>AI-generated analysis of your current holdings</Text>

          {isAnyLoading && !hasRun ? (
            <View style={{ gap: 10 }}>
              <Skeleton width="100%" height={60} borderRadius={12} />
              <Skeleton width="100%" height={60} borderRadius={12} />
              <Skeleton width="100%" height={60} borderRadius={12} />
            </View>
          ) : hasRun ? (
            <View style={styles.briefingContainer}>
              {strengths.length > 0 && (
                <View style={[styles.briefingCard, { borderLeftColor: '#10B981' }]}>
                  <View style={styles.briefingHeader}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={[styles.briefingLabel, { color: '#10B981' }]}>Strengths</Text>
                  </View>
                  {strengths.map((s, i) => (
                    <Text key={i} style={styles.briefingText}>• {s}</Text>
                  ))}
                </View>
              )}

              {weaknesses.length > 0 && (
                <View style={[styles.briefingCard, { borderLeftColor: '#EF4444' }]}>
                  <View style={styles.briefingHeader}>
                    <Ionicons name="alert-circle" size={18} color="#EF4444" />
                    <Text style={[styles.briefingLabel, { color: '#EF4444' }]}>Weaknesses</Text>
                  </View>
                  {weaknesses.map((w, i) => (
                    <Text key={i} style={styles.briefingText}>• {w}</Text>
                  ))}
                </View>
              )}

              {opportunities.length > 0 && (
                <View style={[styles.briefingCard, { borderLeftColor: '#60A5FA' }]}>
                  <View style={styles.briefingHeader}>
                    <Ionicons name="bulb" size={18} color="#60A5FA" />
                    <Text style={[styles.briefingLabel, { color: '#60A5FA' }]}>Opportunities</Text>
                  </View>
                  {opportunities.map((o, i) => (
                    <Text key={i} style={styles.briefingText}>• {o}</Text>
                  ))}
                </View>
              )}

              <Text style={styles.aiDisclaimer}>
                For educational purposes only. Not investment advice.
              </Text>
            </View>
          ) : null}
        </View>

        {/* ═══ 2B. REBALANCING RECOMMENDATIONS ═══ */}
        <RebalancingMoves moves={moves} isLoading={isRebalancing} />

        {/* ═══ 2C. WHAT SHOULD I BUY NEXT? ═══ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What Should I Buy Next?</Text>
          <Text style={styles.sectionSubtitle}>
            Stocks that could improve your portfolio based on gaps and FII scores
          </Text>

          {buyLoading ? (
            <View style={{ gap: 10 }}>
              <Skeleton width="100%" height={80} borderRadius={12} />
              <Skeleton width="100%" height={80} borderRadius={12} />
            </View>
          ) : buyRecs.length > 0 ? (
            <View style={styles.buyRecsContainer}>
              {buyRecs.map((rec) => (
                <TouchableOpacity
                  key={rec.ticker}
                  style={styles.buyRecCard}
                  onPress={() => navigation.navigate('SignalDetail', { ticker: rec.ticker, feedItemId: rec.ticker })}
                  activeOpacity={0.7}
                >
                  <View style={styles.buyRecHeader}>
                    <View>
                      <Text style={styles.buyRecTicker}>{rec.ticker}</Text>
                      <Text style={styles.buyRecName} numberOfLines={1}>{rec.companyName}</Text>
                    </View>
                    <View style={styles.buyRecScoreBadge}>
                      <Text style={styles.buyRecScoreText}>{rec.score}</Text>
                      <Text style={styles.buyRecScoreLabel}>FII</Text>
                    </View>
                  </View>
                  <Text style={styles.buyRecSector}>{rec.sector}</Text>
                  <Text style={styles.buyRecReason}>{rec.reason}</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.aiDisclaimer}>
                For educational purposes only. Not investment advice.
              </Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>
              Add more holdings to get buy recommendations based on portfolio gaps.
            </Text>
          )}
        </View>

        {/* ═══ 2D. BEYOND STOCKS ═══ */}
        {beyondStocks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Beyond Stocks</Text>
            <Text style={styles.sectionSubtitle}>
              Diversify with bonds, international, and alternative assets
            </Text>

            <View style={styles.beyondContainer}>
              {beyondStocks.map((item) => (
                <View key={item.ticker} style={styles.beyondCard}>
                  <View style={styles.beyondHeader}>
                    <View style={[styles.beyondIcon, { backgroundColor: `${item.color}18` }]}>
                      <Ionicons name={item.icon as any} size={18} color={item.color} />
                    </View>
                    <View style={styles.beyondInfo}>
                      <Text style={styles.beyondCategory}>{item.category}</Text>
                      <Text style={styles.beyondTicker}>{item.ticker} — {item.name}</Text>
                    </View>
                  </View>
                  <Text style={styles.beyondReason}>{item.reason}</Text>
                </View>
              ))}
              <Text style={styles.aiDisclaimer}>
                For educational purposes only. Not investment advice.
              </Text>
            </View>
          </View>
        )}

        {/* ═══ 2E. TIME MACHINE ═══ */}
        <TimeMachine
          projection={projection}
          isLoading={isProjecting}
          onYearsChange={handleYearsChange}
        />

        {/* Scenario quick-access */}
        {scenarios.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Stress Scenarios</Text>
            <Text style={styles.sectionSubtitle}>How would your portfolio handle these events?</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 0, gap: 12 }}
            >
              {scenarios.slice(0, 4).map((scenario) => (
                <View key={scenario.id} style={styles.scenarioCard}>
                  <Text style={styles.scenarioIcon}>{scenario.icon}</Text>
                  <Text style={styles.scenarioTitle} numberOfLines={1}>{scenario.title}</Text>
                  <Text
                    style={[
                      styles.scenarioImpact,
                      { color: scenario.portfolioImpact < 0 ? '#EF4444' : '#10B981' },
                    ]}
                  >
                    {scenario.portfolioImpact >= 0 ? '+' : ''}{(scenario.portfolioImpact * 100).toFixed(1)}%
                  </Text>
                  <Text style={styles.scenarioVerdict} numberOfLines={2}>{scenario.verdict}</Text>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.aiDisclaimer}>
              For educational purposes only. Not investment advice.
            </Text>
          </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    gap: 12,
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
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // ─── Section ───
  section: {
    marginHorizontal: 16,
    marginTop: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },

  // ─── Portfolio Intelligence ───
  briefingContainer: {
    gap: 10,
  },
  briefingCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
  },
  briefingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  briefingLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  briefingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 2,
  },

  // ─── Buy Recommendations ───
  buyRecsContainer: {
    gap: 10,
  },
  buyRecCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  buyRecHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  buyRecTicker: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  buyRecName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
    maxWidth: 200,
  },
  buyRecScoreBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  buyRecScoreText: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: '800',
  },
  buyRecScoreLabel: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '600',
    marginTop: -1,
  },
  buyRecSector: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  buyRecReason: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 18,
  },

  // ─── Beyond Stocks ───
  beyondContainer: {
    gap: 10,
  },
  beyondCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  beyondHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  beyondIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beyondInfo: {
    flex: 1,
  },
  beyondCategory: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  beyondTicker: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  beyondReason: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 18,
  },

  // ─── Scenarios ───
  scenarioCard: {
    width: SCREEN_WIDTH * 0.4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  scenarioIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  scenarioTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  scenarioImpact: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  scenarioVerdict: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    lineHeight: 15,
  },

  // ─── Empty State ───
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 20,
  },

  // ─── Shared ───
  aiDisclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
