import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem } from '../types';
import { ScoreRing } from './ScoreRing';
import { SignalBadge } from './SignalBadge';
import { SwipeHint } from './SwipeHint';
import { getPrice, getTechnicals, getFundamentals } from '../services/api';
import { usePortfolioStore } from '../store/portfolioStore';
import { useWatchlistStore } from '../store/watchlistStore';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FeedCardProps {
  item: FeedItem;
  onPress?: () => void;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: '#10B981',
  MEDIUM: '#F59E0B',
  LOW: '#EF4444',
};

const SIGNAL_COLORS: Record<string, string> = {
  BUY: '#10B981',
  HOLD: '#F59E0B',
  SELL: '#EF4444',
};

const safeNum = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatTimeAgo = (isoDate: string | undefined | null): string => {
  if (!isoDate) return 'Updated recently';
  const diff = Date.now() - new Date(isoDate).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'Updated recently';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Updated just now';
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
};

export const FeedCard: React.FC<FeedCardProps> = ({ item, onPress }) => {
  const topFactors = Array.isArray(item.topFactors) ? item.topFactors.slice(0, 3) : [];
  const score = safeNum(item.compositeScore);

  const ownedShares = usePortfolioStore((s) => s.getSharesForTicker)(item.ticker);
  const isBookmarked = useWatchlistStore((s) => s.isInAnyWatchlist)(item.ticker);
  const addTicker = useWatchlistStore((s) => s.addTicker);
  const removeTicker = useWatchlistStore((s) => s.removeTicker);
  const activeWatchlistId = useWatchlistStore((s) => s.activeWatchlistId);

  const toggleBookmark = useCallback(() => {
    if (isBookmarked) {
      removeTicker(activeWatchlistId, item.ticker);
    } else {
      addTicker(activeWatchlistId, item.ticker, item.companyName);
    }
  }, [isBookmarked, item.ticker, item.companyName, activeWatchlistId, addTicker, removeTicker]);

  const [price, setPrice] = useState<number | null>(null);
  const [changePercent, setChangePercent] = useState<number>(0);
  const [change, setChange] = useState<number>(0);
  const [techScore, setTechScore] = useState<number | null>(null);
  const [techTrend, setTechTrend] = useState<string | null>(null);
  const [healthGrade, setHealthGrade] = useState<string | null>(null);
  const [peRatio, setPeRatio] = useState<number | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      getPrice(item.ticker),
      getTechnicals(item.ticker),
      getFundamentals(item.ticker),
    ]).then(([priceResult, techResult, healthResult]) => {
      if (!mounted) return;
      // Price
      if (priceResult.status === 'fulfilled' && priceResult.value) {
        const d = priceResult.value;
        const p = typeof d.price === 'number' && Number.isFinite(d.price) ? d.price : null;
        setPrice(p);
        setChange(safeNum(d.change));
        setChangePercent(safeNum(d.changePercent || d.change_percent));
      }
      // Technicals
      if (techResult.status === 'fulfilled' && techResult.value) {
        const d = techResult.value;
        if (d.indicatorCount > 0) {
          setTechScore(safeNum(d.technicalScore));
          setTechTrend(d.signals?.trend || null);
        }
      }
      // Fundamentals
      if (healthResult.status === 'fulfilled' && healthResult.value) {
        const d = healthResult.value;
        if (d.grade && d.grade !== 'N/A') setHealthGrade(d.grade);
        if (d.peRatio || d.analysis?.peRatio) setPeRatio(safeNum(d.peRatio || d.analysis?.peRatio));
      }
      setDataLoaded(true);
    });
    return () => { mounted = false; };
  }, [item.ticker]);

  const confidence = item.confidence;
  const signalColor = SIGNAL_COLORS[item.signal] || '#F59E0B';
  const isPositive = change >= 0;

  // Derive health grade color
  const gradeColor = healthGrade
    ? (healthGrade.startsWith('A') || healthGrade.startsWith('B')
      ? '#10B981' : healthGrade.startsWith('C') ? '#F59E0B' : '#EF4444')
    : 'rgba(255,255,255,0.3)';

  // Tech trend color
  const trendColor = techTrend
    ? (techTrend.includes('bullish') ? '#10B981' : techTrend.includes('bearish') ? '#EF4444' : '#94A3B8')
    : 'rgba(255,255,255,0.3)';

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      style={styles.cardWrapper}
      accessibilityRole="button"
      accessibilityLabel={`View ${item.signal} signal details for ${item.ticker}, ${item.companyName}, score ${score.toFixed(1)}`}
    >
      <LinearGradient
        colors={['#0D1B3E', '#1F3864']}
        style={styles.card}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        {/* ── Top Row: bookmark + timestamp ── */}
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.bookmarkBtn} onPress={toggleBookmark} accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}>
            <Ionicons
              name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={isBookmarked ? '#60A5FA' : 'rgba(255,255,255,0.4)'}
            />
          </TouchableOpacity>
          <Text style={styles.timestamp}>{formatTimeAgo(item.updatedAt)}</Text>
        </View>

        {/* ── Score Dial ── */}
        <View style={styles.scoreContainer}>
          <ScoreRing score={score} size={120} />
        </View>

        {/* ── Ticker & Company ── */}
        <Text style={styles.ticker}>{item.ticker}</Text>
        <Text style={styles.companyName} numberOfLines={1}>{item.companyName}</Text>

        {/* ── Portfolio badge (conditional but doesn't affect layout) ── */}
        {ownedShares > 0 && (
          <View style={styles.ownedBadge}>
            <Ionicons name="briefcase" size={11} color="#60A5FA" />
            <Text style={styles.ownedText}>You own {ownedShares} shares</Text>
          </View>
        )}

        {/* ── Price Row (ALWAYS shown) ── */}
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {price != null ? `$${price.toFixed(2)}` : '--'}
          </Text>
          <View style={[styles.changePill, { backgroundColor: isPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }]}>
            <Ionicons
              name={isPositive ? 'caret-up' : 'caret-down'}
              size={12}
              color={isPositive ? '#10B981' : '#EF4444'}
            />
            <Text style={[styles.changeText, { color: isPositive ? '#10B981' : '#EF4444' }]}>
              {dataLoaded ? `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%` : '--'}
            </Text>
          </View>
        </View>

        {/* ── Signal Badge + Confidence ── */}
        <View style={styles.signalRow}>
          <SignalBadge signal={item.signal || 'HOLD'} />
          {confidence && (
            <View style={[styles.confidencePill, { backgroundColor: (CONFIDENCE_COLORS[confidence] || '#F59E0B') + '30' }]}>
              <Text style={[styles.confidenceText, { color: CONFIDENCE_COLORS[confidence] || '#F59E0B' }]}>
                {confidence}
              </Text>
            </View>
          )}
        </View>

        {/* ── Metrics Row (ALWAYS shown — 3 columns) ── */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Ionicons name="analytics-outline" size={14} color="#60A5FA" />
            <Text style={styles.metricValue}>
              {techScore != null ? techScore.toFixed(1) : '--'}
            </Text>
            <Text style={styles.metricLabel}>Technical</Text>
            {techTrend && (
              <Text style={[styles.metricSub, { color: trendColor }]} numberOfLines={1}>
                {techTrend}
              </Text>
            )}
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Ionicons name="shield-checkmark-outline" size={14} color={gradeColor} />
            <Text style={[styles.metricValue, { color: gradeColor }]}>
              {healthGrade || '--'}
            </Text>
            <Text style={styles.metricLabel}>Health</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Ionicons name="bar-chart-outline" size={14} color="rgba(255,255,255,0.5)" />
            <Text style={styles.metricValue}>
              {peRatio != null && peRatio > 0 ? peRatio.toFixed(1) : '--'}
            </Text>
            <Text style={styles.metricLabel}>P/E</Text>
          </View>
        </View>

        {/* ── AI Insight (ALWAYS shown) ── */}
        <Text style={styles.insight} numberOfLines={2}>
          {item.insight || `AI analysis for ${item.ticker} — tap for full details.`}
        </Text>

        {/* ── Top Factor Pills (ALWAYS shown — use placeholders) ── */}
        <View style={styles.factorsRow}>
          {topFactors.length > 0 ? (
            topFactors.map((f, i) => {
              const fScore = f.score ?? 0;
              const fColor = fScore >= 1 ? '#10B981' : fScore <= -1 ? '#EF4444' : '#F59E0B';
              return (
                <View key={f.name || `f-${i}`} style={[styles.factorPill, { borderColor: fColor + '60' }]}>
                  <Text style={[styles.factorName, { color: fColor }]}>{f.name}</Text>
                  <Text style={[styles.factorScore, { color: fColor }]}>
                    {fScore >= 0 ? '+' : ''}{fScore.toFixed(1)}
                  </Text>
                </View>
              );
            })
          ) : (
            <>
              <View style={[styles.factorPill, { borderColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={styles.factorPlaceholder}>Tap for factors</Text>
              </View>
            </>
          )}
        </View>

        {/* ── Tap for full analysis CTA ── */}
        <TouchableOpacity style={styles.ctaButton} onPress={onPress} activeOpacity={0.8}>
          <Ionicons name="arrow-forward-circle" size={18} color="#60A5FA" />
          <Text style={styles.ctaText}>Tap for full analysis</Text>
        </TouchableOpacity>

        {/* ── Disclaimer ── */}
        <Text style={styles.disclaimer}>
          Not financial advice. AI-generated analysis for informational purposes only.
        </Text>

        {/* ── Swipe hint ── */}
        <View style={styles.hintContainer}>
          <SwipeHint />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardWrapper: {
    height: SCREEN_HEIGHT,
    width: '100%',
  },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // Top row
  topRow: {
    position: 'absolute',
    top: 54,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bookmarkBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timestamp: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '500',
  },

  // Score
  scoreContainer: {
    marginBottom: 16,
  },

  // Ticker
  ticker: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 2,
  },
  companyName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '400',
    marginTop: 2,
    maxWidth: 280,
    textAlign: 'center',
  },

  // Owned badge
  ownedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(96,165,250,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
    gap: 4,
  },
  ownedText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
  },

  // Price
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
  },
  price: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 3,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Signal
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 14,
    gap: 8,
  },
  confidencePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Metrics row
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    paddingHorizontal: 6,
    width: '100%',
    maxWidth: 320,
    marginBottom: 14,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  metricSub: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  metricDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  // Insight
  insight: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
    maxWidth: 320,
    marginBottom: 12,
  },

  // Factor pills
  factorsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  factorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
  },
  factorName: {
    fontSize: 11,
    fontWeight: '600',
  },
  factorScore: {
    fontSize: 11,
    fontWeight: '800',
  },
  factorPlaceholder: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontWeight: '500',
  },

  // CTA button
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(96,165,250,0.12)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)',
    gap: 8,
    marginBottom: 10,
  },
  ctaText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '700',
  },

  // Disclaimer
  disclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 9,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 13,
  },

  // Swipe hint
  hintContainer: {
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
  },
});
