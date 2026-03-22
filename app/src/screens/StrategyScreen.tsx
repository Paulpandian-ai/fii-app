import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

import { usePortfolioStore } from '../store/portfolioStore';
import {
  getAdvisorHoldings,
  getAdvisorInvestmentIdeas,
  getAdvisorEvents,
  getPortfolioAnalytics,
  getScreener,
} from '../services/api';
import { Skeleton } from '../components/Skeleton';
import { BacktestCard } from '../components/BacktestCard';

const ACCENT = {
  holdings: '#00C9A7',
  invest: '#FBBF24',
  research: '#60A5FA',
  events: '#F59E0B',
};

const PRIORITY_DOT: Record<string, string> = {
  high: '#EF4444',
  critical: '#EF4444',
  medium: '#FBBF24',
  low: '#34D399',
};

const RECENT_RESEARCH_KEY = '@fii_recent_research';

// ─── Score Bar component ───
const ScoreBar: React.FC<{ score: number; maxScore?: number }> = ({ score, maxScore = 10 }) => {
  const pct = Math.min(Math.max((score / maxScore) * 100, 0), 100);
  const color = score >= 7 ? '#00C9A7' : score >= 5 ? '#FBBF24' : '#F59E0B';
  return (
    <View style={scoreBarStyles.track}>
      <View style={[scoreBarStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
};
const scoreBarStyles = StyleSheet.create({
  track: { width: 60, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
  fill: { height: 4, borderRadius: 2 },
});

// ─── Card wrapper with left accent bar ───
const AdvisorCard: React.FC<{
  accent: string;
  children: React.ReactNode;
  style?: any;
}> = ({ accent, children, style }) => (
  <View style={[styles.card, style]}>
    <View style={[styles.cardAccent, { backgroundColor: accent }]} />
    <View style={styles.cardContent}>{children}</View>
  </View>
);

export const StrategyScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const holdings = usePortfolioStore((s) => s.holdings);
  const hasPortfolio = holdings.length >= 3;

  // Data states
  const [holdingsData, setHoldingsData] = useState<any>(null);
  const [investData, setInvestData] = useState<any>(null);
  const [eventsData, setEventsData] = useState<any>(null);
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // Loading states
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [loadingInvest, setLoadingInvest] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Research search state
  const [searchQuery, setSearchQuery] = useState('');
  const [allStocks, setAllStocks] = useState<Array<{ ticker: string; companyName: string; aiScore?: number; scoreLabel?: string }>>([]);
  const [recentResearch, setRecentResearch] = useState<string[]>([]);

  // Load recent research tickers from storage
  useEffect(() => {
    AsyncStorage.getItem(RECENT_RESEARCH_KEY)
      .then((v) => { if (v) setRecentResearch(JSON.parse(v)); })
      .catch(() => {});
  }, []);

  // Load all stocks for search
  useEffect(() => {
    (async () => {
      try {
        const data = await getScreener({ limit: '600' });
        setAllStocks(data?.results || data?.items || []);
      } catch {}
    })();
  }, []);

  const loadAllData = useCallback(async () => {
    if (!hasPortfolio) return;

    const loaders = [
      async () => {
        try {
          const d = await getAdvisorHoldings();
          setHoldingsData(d);
        } catch {} finally { setLoadingHoldings(false); }
      },
      async () => {
        try {
          const d = await getAdvisorInvestmentIdeas();
          setInvestData(d);
        } catch {} finally { setLoadingInvest(false); }
      },
      async () => {
        try {
          const d = await getAdvisorEvents();
          setEventsData(d);
        } catch {} finally { setLoadingEvents(false); }
      },
      async () => {
        try {
          const d = await getPortfolioAnalytics();
          setAnalyticsData(d);
        } catch {} finally { setLoadingAnalytics(false); }
      },
    ];

    await Promise.allSettled(loaders.map((fn) => fn()));
  }, [hasPortfolio]);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoadingHoldings(true);
    setLoadingInvest(true);
    setLoadingEvents(true);
    setLoadingAnalytics(true);
    await loadAllData();
    setRefreshing(false);
  }, [loadAllData]);

  // Search filter
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allStocks
      .filter(
        (s) =>
          s.ticker.toLowerCase().includes(q) ||
          (s.companyName || '').toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [searchQuery, allStocks]);

  const openResearch = useCallback(
    (ticker: string) => {
      // Save to recents
      const updated = [ticker, ...recentResearch.filter((t) => t !== ticker)].slice(0, 5);
      setRecentResearch(updated);
      AsyncStorage.setItem(RECENT_RESEARCH_KEY, JSON.stringify(updated)).catch(() => {});
      setSearchQuery('');

      navigation.navigate('AICoach', {
        mode: 'research',
        ticker,
        initialMessage: `Give me a full analysis of ${ticker}`,
      });
    },
    [navigation, recentResearch],
  );

  const openCoachMode = useCallback(
    (mode: 'holdings' | 'invest' | 'tax' | 'events', initialMessage: string) => {
      navigation.navigate('AICoach', { mode, initialMessage });
    },
    [navigation],
  );

  // ─── Derived display data ───
  const holdingsSummary = holdingsData?.portfolio_summary;
  const holdingsList = holdingsData?.holdings_analysis || [];
  const totalValue = holdingsSummary?.total_value || 0;
  const totalPnlPct = holdingsSummary?.total_pnl_pct || 0;

  const gapSectors = investData?.suggestions?.fill_gaps || [];
  const missingSectors = gapSectors.slice(0, 2).map((g: any) => g.sector).join(', ');
  const topPicks = gapSectors
    .slice(0, 2)
    .map((g: any) => `${g.suggested_ticker || g.ticker || '?'} (${g.fii_score || '?'})`)
    .join(', ');

  const upcomingEvents = eventsData?.upcoming_events || [];

  const analytics = analyticsData || {};
  const risk = analytics.risk_metrics || {};
  const div = analytics.diversification || {};
  const sharpe = risk.sharpe_ratio?.value ?? risk.sharpe_ratio;
  const beta = risk.portfolio_beta;
  const maxDrawdown = risk.max_drawdown?.pct ?? risk.max_drawdown;
  const divScore = div.score;
  const divRating = div.rating;

  // ─── Empty state ───
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
            Add stocks to your portfolio to unlock your personal wealth advisor
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Wealth Advisor</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C9A7" />
        }
      >
        {/* ═══ 1. MY HOLDINGS CARD ═══ */}
        <AdvisorCard accent={ACCENT.holdings}>
          <View style={styles.cardHeader}>
            <Ionicons name="bar-chart-outline" size={18} color={ACCENT.holdings} />
            <Text style={styles.cardTitle}>My Holdings</Text>
          </View>

          {loadingHoldings ? (
            <View style={{ gap: 8 }}>
              <Skeleton width="60%" height={14} borderRadius={4} />
              <Skeleton width="100%" height={40} borderRadius={6} />
              <Skeleton width="100%" height={40} borderRadius={6} />
            </View>
          ) : (
            <>
              <Text style={styles.cardSubtitle}>
                {holdingsList.length} stock{holdingsList.length !== 1 ? 's' : ''} · ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} · {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(1)}%
              </Text>

              {holdingsList.slice(0, 5).map((h: any) => (
                <View key={h.ticker} style={styles.holdingRow}>
                  <Text style={styles.holdingTicker}>{h.ticker}</Text>
                  <Text style={styles.holdingPrice}>
                    ${(h.current_price || h.current_value / (h.shares || 1) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </Text>
                  <ScoreBar score={h.fii_score || 5} />
                  <Text style={[styles.holdingScore, {
                    color: (h.fii_score || 5) >= 7 ? '#00C9A7' : (h.fii_score || 5) >= 5 ? '#FBBF24' : '#F59E0B',
                  }]}>
                    {h.fii_score || '--'} {h.signal || ''}
                  </Text>
                </View>
              ))}

              {/* Insights */}
              {holdingsSummary?.biggest_risk && (
                <View style={styles.insightRow}>
                  <Ionicons name="warning-outline" size={14} color="#F59E0B" />
                  <Text style={styles.insightText}>{holdingsSummary.biggest_risk}</Text>
                </View>
              )}
              {holdingsSummary?.biggest_opportunity && (
                <View style={styles.insightRow}>
                  <Ionicons name="bulb-outline" size={14} color="#00C9A7" />
                  <Text style={styles.insightText}>{holdingsSummary.biggest_opportunity}</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.askAiButton}
                onPress={() => openCoachMode('holdings', 'Analyze my current holdings')}
                activeOpacity={0.7}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#60A5FA" />
                <Text style={styles.askAiText}>Ask AI about my holdings</Text>
                <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            </>
          )}
        </AdvisorCard>

        {/* ═══ 2. INVESTMENT IDEAS CARD ═══ */}
        <AdvisorCard accent={ACCENT.invest}>
          <View style={styles.cardHeader}>
            <Ionicons name="compass-outline" size={18} color={ACCENT.invest} />
            <Text style={styles.cardTitle}>Investment Ideas</Text>
          </View>

          {loadingInvest ? (
            <View style={{ gap: 8 }}>
              <Skeleton width="70%" height={14} borderRadius={4} />
              <Skeleton width="90%" height={14} borderRadius={4} />
            </View>
          ) : (
            <>
              <Text style={styles.cardSubtitle}>Based on your portfolio gaps</Text>

              {missingSectors ? (
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLabel}>Missing: </Text>{missingSectors}
                </Text>
              ) : null}
              {topPicks ? (
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLabel}>Top picks: </Text>{topPicks}
                </Text>
              ) : null}

              <TouchableOpacity
                style={styles.askAiButton}
                onPress={() =>
                  openCoachMode('invest', 'What stocks should I consider for diversification?')
                }
                activeOpacity={0.7}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#60A5FA" />
                <Text style={styles.askAiText}>Explore investment ideas</Text>
                <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            </>
          )}
        </AdvisorCard>

        {/* ═══ 3. STOCK RESEARCH CARD ═══ */}
        <AdvisorCard accent={ACCENT.research}>
          <View style={styles.cardHeader}>
            <Ionicons name="flask-outline" size={18} color={ACCENT.research} />
            <Text style={styles.cardTitle}>Stock Research</Text>
          </View>
          <Text style={styles.cardSubtitle}>Deep dive into any stock</Text>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={16} color="rgba(255,255,255,0.3)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search a stock to research..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="characters"
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            )}
          </View>

          {/* Search results */}
          {searchResults.length > 0 && (
            <View style={styles.searchResults}>
              {searchResults.map((s) => (
                <TouchableOpacity
                  key={s.ticker}
                  style={styles.searchResultRow}
                  onPress={() => openResearch(s.ticker)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.searchResultTicker}>{s.ticker}</Text>
                  <Text style={styles.searchResultName} numberOfLines={1}>
                    {s.companyName}
                  </Text>
                  {s.aiScore != null && (
                    <Text style={[styles.searchResultScore, {
                      color: s.aiScore >= 7 ? '#00C9A7' : s.aiScore >= 5 ? '#FBBF24' : '#F59E0B',
                    }]}>
                      {s.aiScore}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Recent research */}
          {searchResults.length === 0 && recentResearch.length > 0 && (
            <View style={styles.recentRow}>
              <Text style={styles.recentLabel}>Recent: </Text>
              {recentResearch.map((t, i) => (
                <React.Fragment key={t}>
                  {i > 0 && <Text style={styles.recentSep}> · </Text>}
                  <TouchableOpacity onPress={() => openResearch(t)}>
                    <Text style={styles.recentTicker}>{t}</Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
          )}
        </AdvisorCard>

        {/* ═══ 3.5. REPORT CRITIC CARD ═══ */}
        <AdvisorCard accent="#8B5CF6">
          <View style={styles.cardHeader}>
            <Ionicons name="search-outline" size={18} color="#8B5CF6" />
            <Text style={styles.cardTitle}>Analyst Report Critic</Text>
            <View style={{ backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#8B5CF6' }}>NEW</Text>
            </View>
          </View>
          <Text style={styles.cardSubtitle}>
            Paste any analyst report and get an independent second opinion powered by FII's 6-factor analysis
          </Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', marginTop: 4, marginBottom: 10 }}>
            "Is the analyst missing something?"
          </Text>
          <TouchableOpacity
            style={styles.askAiButton}
            onPress={() => navigation.navigate('ReportCritique')}
            activeOpacity={0.7}
          >
            <Ionicons name="flask-outline" size={16} color="#60A5FA" />
            <Text style={styles.askAiText}>Critique a Report</Text>
            <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        </AdvisorCard>

        {/* ═══ 4.5. BACKTEST CARD ═══ */}
        <BacktestCard />

        {/* ═══ 5. EVENTS TO WATCH CARD ═══ */}
        <AdvisorCard accent={ACCENT.events}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={18} color={ACCENT.events} />
            <Text style={styles.cardTitle}>Events to Watch</Text>
          </View>

          {loadingEvents ? (
            <View style={{ gap: 8 }}>
              <Skeleton width="100%" height={18} borderRadius={4} />
              <Skeleton width="100%" height={18} borderRadius={4} />
              <Skeleton width="80%" height={18} borderRadius={4} />
            </View>
          ) : upcomingEvents.length > 0 ? (
            <>
              {upcomingEvents.slice(0, 4).map((evt: any, i: number) => {
                const priority = evt.priority || evt.potential_impact || 'medium';
                const dotColor = PRIORITY_DOT[priority] || PRIORITY_DOT.medium;
                return (
                  <View key={i} style={styles.eventRow}>
                    <Text style={styles.eventDate}>
                      {evt.date ? new Date(evt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                    </Text>
                    <Text style={styles.eventTitle} numberOfLines={1}>
                      {evt.title}
                      {evt.ticker ? ` (${evt.ticker})` : ''}
                    </Text>
                    <View style={[styles.priorityDot, { backgroundColor: dotColor }]} />
                  </View>
                );
              })}

              <TouchableOpacity
                style={styles.askAiButton}
                onPress={() =>
                  openCoachMode('events', 'Walk me through upcoming events for my portfolio')
                }
                activeOpacity={0.7}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#60A5FA" />
                <Text style={styles.askAiText}>What do these events mean?</Text>
                <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.cardSubtitle}>No upcoming events in the next 30 days</Text>
          )}
        </AdvisorCard>

        {/* ═══ 6. PORTFOLIO HEALTH CARD ═══ */}
        <AdvisorCard accent="rgba(255,255,255,0.15)">
          <View style={styles.cardHeader}>
            <Ionicons name="fitness-outline" size={18} color="rgba(255,255,255,0.6)" />
            <Text style={styles.cardTitle}>Portfolio Health</Text>
          </View>

          {loadingAnalytics ? (
            <View style={{ gap: 8 }}>
              <Skeleton width="100%" height={16} borderRadius={4} />
              <Skeleton width="100%" height={16} borderRadius={4} />
              <Skeleton width="100%" height={16} borderRadius={4} />
            </View>
          ) : (
            <View style={styles.healthGrid}>
              {divScore != null && (
                <View style={styles.healthRow}>
                  <Text style={styles.healthLabel}>Diversification</Text>
                  <View style={styles.healthBarTrack}>
                    <View
                      style={[
                        styles.healthBarFill,
                        {
                          width: `${Math.min(divScore, 100)}%`,
                          backgroundColor: divScore >= 70 ? '#00C9A7' : divScore >= 40 ? '#FBBF24' : '#F59E0B',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.healthValue}>{divScore}/100</Text>
                  <Text style={styles.healthRating}>{divRating || ''}</Text>
                </View>
              )}
              {sharpe != null && (
                <View style={styles.healthRow}>
                  <Text style={styles.healthLabel}>Sharpe Ratio</Text>
                  <Text style={styles.healthValue}>
                    {typeof sharpe === 'number' ? sharpe.toFixed(2) : sharpe}
                  </Text>
                  <Text style={styles.healthRating}>
                    {(typeof sharpe === 'number' ? sharpe : 0) >= 1 ? 'Good' : (typeof sharpe === 'number' ? sharpe : 0) >= 0.5 ? 'Fair' : 'Low'}
                  </Text>
                </View>
              )}
              {maxDrawdown != null && (
                <View style={styles.healthRow}>
                  <Text style={styles.healthLabel}>Max Drawdown</Text>
                  <Text style={styles.healthValue}>
                    {typeof maxDrawdown === 'number' ? `${maxDrawdown.toFixed(1)}%` : maxDrawdown}
                  </Text>
                  <Text style={styles.healthRating}>
                    {Math.abs(typeof maxDrawdown === 'number' ? maxDrawdown : 0) > 20 ? 'Significant' : 'Moderate'}
                  </Text>
                </View>
              )}
              {beta != null && (
                <View style={styles.healthRow}>
                  <Text style={styles.healthLabel}>Beta</Text>
                  <Text style={styles.healthValue}>
                    {typeof beta === 'number' ? beta.toFixed(2) : beta}
                  </Text>
                  <Text style={styles.healthRating}>
                    {(typeof beta === 'number' ? beta : 1) < 0.8 ? 'Defensive' : (typeof beta === 'number' ? beta : 1) > 1.2 ? 'Aggressive' : 'Balanced'}
                  </Text>
                </View>
              )}
            </View>
          )}
        </AdvisorCard>

        {/* ═══ DISCLAIMER FOOTER ═══ */}
        <View style={styles.disclaimerFooter}>
          <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.2)" />
          <Text style={styles.disclaimerText}>
            Educational analysis only. Not investment advice.
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  scrollContent: { paddingBottom: 40 },

  // ─── Empty ───
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginTop: 16 },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  // ─── Card ───
  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cardAccent: {
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginBottom: 10,
  },

  // ─── Holdings rows ───
  holdingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  holdingTicker: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    width: 44,
  },
  holdingPrice: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    width: 64,
    textAlign: 'right',
  },
  holdingScore: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },

  // ─── Insight rows ───
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  insightText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    flex: 1,
  },

  // ─── Detail lines ───
  detailLine: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginBottom: 4,
    lineHeight: 18,
  },
  detailLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
  },

  // ─── Ask AI button ───
  askAiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(96,165,250,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.15)',
  },
  askAiText: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // ─── Search ───
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 0,
  },
  searchResults: {
    marginBottom: 4,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  searchResultTicker: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    width: 50,
  },
  searchResultName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    flex: 1,
  },
  searchResultScore: {
    fontSize: 13,
    fontWeight: '700',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  recentLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },
  recentSep: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 12,
  },
  recentTicker: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
  },

  // ─── Events ───
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  eventDate: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    width: 52,
    fontWeight: '600',
  },
  eventTitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    flex: 1,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // ─── Health ───
  healthGrid: { gap: 10 },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  healthLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    width: 100,
  },
  healthBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  healthBarFill: {
    height: 4,
    borderRadius: 2,
  },
  healthValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    width: 48,
    textAlign: 'right',
  },
  healthRating: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    width: 72,
    textAlign: 'right',
  },

  // ─── Disclaimer ───
  disclaimerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  disclaimerText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 11,
    fontStyle: 'italic',
  },
});
