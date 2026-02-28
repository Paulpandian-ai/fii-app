import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem } from '../types';
import { ScoreRing } from './ScoreRing';
import { SignalBadge } from './SignalBadge';
import { SwipeHint } from './SwipeHint';
import { Skeleton } from './Skeleton';
import { getPrice, getSignalDetail, getTechnicals, getFundamentals, getFactors, getFairPrice, getInsightsForTicker } from '../services/api';
import { usePortfolioStore } from '../store/portfolioStore';
import { useWatchlistStore } from '../store/watchlistStore';
import { useSignalStore } from '../store/signalStore';
import type { EnrichmentData } from '../store/signalStore';

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

const formatMarketCap = (cap: number): string => {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return '--';
};

// Dimension label & color map
const DIMENSIONS: { key: string; label: string; icon: string; color: string }[] = [
  { key: 'technical', label: 'Technical', icon: 'analytics', color: '#60A5FA' },
  { key: 'fundamental', label: 'Fundamental', icon: 'document-text', color: '#34D399' },
  { key: 'sentiment', label: 'Sentiment', icon: 'chatbubbles', color: '#FBBF24' },
  { key: 'macroGeo', label: 'Macro/Geo', icon: 'globe', color: '#F97316' },
  { key: 'supplyChain', label: 'Supply Chain', icon: 'git-network', color: '#A78BFA' },
];

/** Inline skeleton for metric values while loading */
const MetricSkeleton: React.FC = () => (
  <Skeleton width={36} height={16} borderRadius={4} />
);

const FeedCardInner: React.FC<FeedCardProps> = ({ item, onPress }) => {
  const score = safeNum(item.compositeScore);

  const ownedShares = usePortfolioStore((s) => s.getSharesForTicker)(item.ticker);
  const isBookmarked = useWatchlistStore((s) => s.isInAnyWatchlist)(item.ticker);
  const addTicker = useWatchlistStore((s) => s.addTicker);
  const removeTicker = useWatchlistStore((s) => s.removeTicker);
  const activeWatchlistId = useWatchlistStore((s) => s.activeWatchlistId);

  // ─── Read enrichment cache from Zustand (persists across unmounts) ───
  const cached = useSignalStore((s) => s.enrichmentCache[item.ticker]);
  const setEnrichment = useSignalStore((s) => s.setEnrichment);
  const hasCache = cached != null;

  const toggleBookmark = useCallback(() => {
    if (isBookmarked) {
      removeTicker(activeWatchlistId, item.ticker);
    } else {
      addTicker(activeWatchlistId, item.ticker, item.companyName);
    }
  }, [isBookmarked, item.ticker, item.companyName, activeWatchlistId, addTicker, removeTicker]);

  // ─── Price data (initialized from cache if available) ───
  const [price, setPrice] = useState<number | null>(cached?.price ?? null);
  const [changePercent, setChangePercent] = useState<number>(cached?.changePercent ?? 0);
  const [change, setChange] = useState<number>(cached?.change ?? 0);
  const [marketCap, setMarketCap] = useState<number>(cached?.marketCap ?? 0);
  const [w52Low, setW52Low] = useState<number | null>(cached?.w52Low ?? null);
  const [w52High, setW52High] = useState<number | null>(cached?.w52High ?? null);
  const [sector, setSector] = useState<string | null>(cached?.sector ?? null);

  // ─── Signal-enriched data (initialized from cache) ───
  const [techScore, setTechScore] = useState<number | null>(cached?.techScore ?? null);
  const [techTrend, setTechTrend] = useState<string | null>(cached?.techTrend ?? null);
  const [rsi, setRsi] = useState<number | null>(cached?.rsi ?? null);
  const [healthGrade, setHealthGrade] = useState<string | null>(cached?.healthGrade ?? null);
  const [peRatio, setPeRatio] = useState<number | null>(cached?.peRatio ?? null);
  const [forwardPE, setForwardPE] = useState<number | null>(cached?.forwardPE ?? null);
  const [negativeEarnings, setNegativeEarnings] = useState<boolean>(cached?.negativeEarnings ?? false);
  const [fairValueUpside, setFairValueUpside] = useState<number | null>(cached?.fairValueUpside ?? null);
  const [fairPriceDollars, setFairPriceDollars] = useState<number | null>(cached?.fairPriceDollars ?? null);
  const [fairPriceLabel, setFairPriceLabel] = useState<string | null>(cached?.fairPriceLabel ?? null);
  const [zScore, setZScore] = useState<number | null>(cached?.zScore ?? null);
  const [fScoreVal, setFScoreVal] = useState<number | null>(cached?.fScoreVal ?? null);
  const [dimensionScores, setDimensionScores] = useState<Record<string, number>>(cached?.dimensionScores ?? {});
  const [enrichedFactors, setEnrichedFactors] = useState<{ name: string; score: number }[]>(cached?.enrichedFactors ?? []);
  const [enrichedInsight, setEnrichedInsight] = useState<string | null>(cached?.enrichedInsight ?? null);

  // ─── AI Agent insight ───
  const [aiHeadline, setAiHeadline] = useState<string | null>(cached?.aiHeadline ?? null);
  const [aiAction, setAiAction] = useState<string | null>(cached?.aiAction ?? null);

  // dataLoaded = true if we have cache OR fresh API data has arrived
  const [dataLoaded, setDataLoaded] = useState(hasCache);

  // Track collected data for cache write
  const enrichmentRef = useRef<Partial<EnrichmentData>>({});

  useEffect(() => {
    let mounted = true;

    // Call ALL endpoints in parallel — use enriched signal as primary,
    // dedicated endpoints as fallbacks for any missing data.
    Promise.allSettled([
      getPrice(item.ticker),                    // [0]
      getSignalDetail(item.ticker),             // [1]
      getTechnicals(item.ticker),               // [2] fallback for technicals
      getFundamentals(item.ticker),             // [3] fallback for fundamentals
      getFactors(item.ticker),                  // [4] fallback for factors/dimensions
      getInsightsForTicker(item.ticker, 1),     // [5]
      getFairPrice(item.ticker),               // [6] fair price estimate
    ]).then(([priceR, signalR, techR, fundR, factorR, insightR, fairPriceR]) => {
      if (!mounted) return;

      // Filter out error responses (HTTP 200 with {error: "..."}) — treat as null
      const _ok = (r: PromiseSettledResult<any>) => {
        if (r.status !== 'fulfilled') return null;
        const v = r.value;
        return (v && !v.error) ? v : null;
      };
      // Price endpoint never returns {error} — always trust it
      const priceData = priceR.status === 'fulfilled' ? priceR.value : null;
      const sig = _ok(signalR);
      const tech = _ok(techR);
      const fund = _ok(fundR);
      const factors = _ok(factorR);
      const insightData = insightR.status === 'fulfilled' ? insightR.value : null;

      // Even when signal/fund have error, extract any partial data they contain
      const sigRaw = signalR.status === 'fulfilled' ? signalR.value : null;
      const fundRaw = fundR.status === 'fulfilled' ? fundR.value : null;

      // Collect enrichment data for cache
      const ed: Partial<EnrichmentData> = {};

      // ── Price ──
      if (priceData) {
        const rawPrice = priceData.price;
        // Accept both number and string (DynamoDB Decimal → string via default=str)
        const p = rawPrice != null ? safeNum(rawPrice) : 0;
        const priceVal = p > 0 ? p : null;
        setPrice(priceVal);
        ed.price = priceVal;
        const ch = safeNum(priceData.change);
        setChange(ch);
        ed.change = ch;
        const cp = safeNum(priceData.changePercent || priceData.change_percent);
        setChangePercent(cp);
        ed.changePercent = cp;
        if (safeNum(priceData.marketCap) > 0) { const mc = safeNum(priceData.marketCap); setMarketCap(mc); ed.marketCap = mc; }
        if (safeNum(priceData.fiftyTwoWeekLow) > 0) { const lo = safeNum(priceData.fiftyTwoWeekLow); setW52Low(lo); ed.w52Low = lo; }
        if (safeNum(priceData.fiftyTwoWeekHigh) > 0) { const hi = safeNum(priceData.fiftyTwoWeekHigh); setW52High(hi); ed.w52High = hi; }
        if (priceData.sector) { setSector(priceData.sector); ed.sector = priceData.sector; }
      }

      // ── Technical Score: signal → technicals endpoint ──
      const ta = sig?.technicalAnalysis || {};
      const ts = sig?.technicalScore ?? ta.technicalScore ?? tech?.technicalScore;
      if (ts != null) { const v = safeNum(ts); setTechScore(v); ed.techScore = v; }

      // ── RSI: signal.technicalAnalysis → technicals endpoint ──
      const rsiVal = ta.rsi ?? tech?.rsi;
      if (rsiVal != null) { const v = safeNum(rsiVal); setRsi(v); ed.rsi = v; }

      // ── Trend: signal → technicals endpoint ──
      const trend = ta.signals?.trend ?? tech?.signals?.trend;
      if (trend) { setTechTrend(trend); ed.techTrend = trend; }

      // ── Health Grade: signal → fundamentals endpoint (also check raw) ──
      const grade = sig?.fundamentalGrade ?? fund?.grade ?? fundRaw?.grade;
      if (grade && grade !== 'N/A') { setHealthGrade(grade); ed.healthGrade = grade; }

      // ── P/E Ratio (trailing TTM): signal → fundamentals.ratios → price endpoint ──
      const pe = sig?.peRatio ?? sig?.ratios?.peRatio ?? fund?.ratios?.peRatio
        ?? fundRaw?.ratios?.peRatio ?? priceData?.trailingPE;
      if (pe != null && pe !== 0) {
        const v = safeNum(pe);
        setPeRatio(v);
        ed.peRatio = v;
        // Flag negative earnings (P/E < 0 means company is losing money)
        const isNegEarnings = v < 0 || sig?.negativeEarnings || sig?.ratios?.negativeEarnings
          || fund?.ratios?.negativeEarnings || fundRaw?.ratios?.negativeEarnings;
        if (isNegEarnings) { setNegativeEarnings(true); ed.negativeEarnings = true; }
      }
      // ── Forward P/E (NTM) as secondary metric ──
      const fpe = sig?.forwardPE ?? sig?.ratios?.forwardPE ?? fund?.ratios?.forwardPE
        ?? fundRaw?.ratios?.forwardPE ?? priceData?.forwardPE;
      if (fpe != null && fpe > 0) { const v = safeNum(fpe); setForwardPE(v); ed.forwardPE = v; }

      // ── Fair Value Upside: signal → fundamentals.dcf.upside ──
      const fvu = sig?.fairValueUpside ?? sig?.fairPriceUpside ?? fund?.dcf?.upside;
      if (fvu != null) { const v = safeNum(fvu); setFairValueUpside(v); ed.fairValueUpside = v; }

      // ── Fair Price (dollar amount): signal → fair-price endpoint ──
      const fpData = fairPriceR?.status === 'fulfilled' ? fairPriceR.value : null;
      const fp = sig?.fairPrice ?? fpData?.fairPrice;
      if (fp != null && fp > 0) { const v = safeNum(fp); setFairPriceDollars(v); ed.fairPriceDollars = v; }
      const fpLabel = sig?.fairPriceLabel ?? fpData?.label;
      if (fpLabel) { setFairPriceLabel(fpLabel); ed.fairPriceLabel = fpLabel; }
      // If we got fair price upside from this endpoint but not from fundamentals
      if (fvu == null) {
        const fpUpside = sig?.fairPriceUpside ?? fpData?.upside;
        if (fpUpside != null) { const v = safeNum(fpUpside); setFairValueUpside(v); ed.fairValueUpside = v; }
      }

      // ── Z-Score: signal → fundamentals.zScore.value ──
      const z = sig?.zScore ?? fund?.zScore?.value;
      if (z != null) { const v = safeNum(z); setZScore(v); ed.zScore = v; }

      // ── F-Score: signal → fundamentals.fScore.value ──
      const f = sig?.fScore ?? fund?.fScore?.value;
      if (f != null) { const v = safeNum(f); setFScoreVal(v); ed.fScoreVal = v; }

      // ── Dimension Scores: signal → factors endpoint (also check raw for partial) ──
      const factorsRaw = factorR.status === 'fulfilled' ? factorR.value : null;
      const dims = sig?.dimensionScores ?? factors?.dimensionScores ?? factorsRaw?.dimensionScores;
      if (dims && typeof dims === 'object' && Object.keys(dims).length > 0) { setDimensionScores(dims); ed.dimensionScores = dims; }

      // ── Factor pills: signal → factors endpoint → feedItem.topFactors ──
      const pos = sig?.topPositive ?? factors?.topPositive ?? factorsRaw?.topPositive ?? [];
      const neg = sig?.topNegative ?? factors?.topNegative ?? factorsRaw?.topNegative ?? [];
      const allFactors = [
        ...pos.map((f: any) => ({ name: f.factorName || f.name, score: safeNum(f.normalizedScore ?? f.score) })),
        ...neg.map((f: any) => ({ name: f.factorName || f.name, score: safeNum(f.normalizedScore ?? f.score) })),
      ].filter((f: any) => f.name).slice(0, 4);
      if (allFactors.length > 0) { setEnrichedFactors(allFactors); ed.enrichedFactors = allFactors; }

      // ── Insight from signal ──
      if (sig?.insight) { setEnrichedInsight(sig.insight); ed.enrichedInsight = sig.insight; }
      else if (sigRaw?.insight) { setEnrichedInsight(sigRaw.insight); ed.enrichedInsight = sigRaw.insight; }

      // ── AI Agent Insight ──
      if (insightData) {
        const insights = insightData.insights || [];
        if (insights.length > 0) {
          const latest = insights[0];
          if (latest.headline) { setAiHeadline(latest.headline); ed.aiHeadline = latest.headline; }
          if (latest.action) { setAiAction(latest.action); ed.aiAction = latest.action; }
        }
      }

      setDataLoaded(true);

      // ── Save enrichment data to Zustand cache ──
      setEnrichment(item.ticker, {
        price: ed.price ?? null,
        change: ed.change ?? 0,
        changePercent: ed.changePercent ?? 0,
        marketCap: ed.marketCap ?? 0,
        w52Low: ed.w52Low ?? null,
        w52High: ed.w52High ?? null,
        sector: ed.sector ?? null,
        techScore: ed.techScore ?? null,
        techTrend: ed.techTrend ?? null,
        rsi: ed.rsi ?? null,
        healthGrade: ed.healthGrade ?? null,
        peRatio: ed.peRatio ?? null,
        forwardPE: ed.forwardPE ?? null,
        negativeEarnings: ed.negativeEarnings ?? false,
        fairValueUpside: ed.fairValueUpside ?? null,
        fairPriceDollars: ed.fairPriceDollars ?? null,
        fairPriceLabel: ed.fairPriceLabel ?? null,
        zScore: ed.zScore ?? null,
        fScoreVal: ed.fScoreVal ?? null,
        dimensionScores: ed.dimensionScores ?? {},
        enrichedFactors: ed.enrichedFactors ?? [],
        enrichedInsight: ed.enrichedInsight ?? null,
        aiHeadline: ed.aiHeadline ?? null,
        aiAction: ed.aiAction ?? null,
        cachedAt: Date.now(),
      });
    });
    return () => { mounted = false; };
  }, [item.ticker]);

  const confidence = item.confidence;
  const isPositive = change >= 0;

  // Whether to show skeleton (first load, no cache)
  const showSkeleton = !dataLoaded && !hasCache;

  // Derived colors
  const gradeColor = healthGrade
    ? (healthGrade.startsWith('A') || healthGrade.startsWith('B')
      ? '#10B981' : healthGrade.startsWith('C') ? '#F59E0B' : '#EF4444')
    : 'rgba(255,255,255,0.3)';

  const trendColor = techTrend
    ? (techTrend.includes('bullish') ? '#10B981' : techTrend.includes('bearish') ? '#EF4444' : '#94A3B8')
    : 'rgba(255,255,255,0.3)';

  // 52-week range position (0-1)
  const rangePosition = (price != null && w52Low != null && w52High != null && w52High > w52Low)
    ? Math.max(0, Math.min(1, (price - w52Low) / (w52High - w52Low)))
    : null;

  // RSI color
  const rsiColor = rsi != null
    ? (rsi >= 70 ? '#EF4444' : rsi <= 30 ? '#10B981' : '#94A3B8')
    : 'rgba(255,255,255,0.3)';

  // Fair value / fair price color
  const fvColor = fairPriceLabel
    ? (fairPriceLabel === 'undervalued' ? '#10B981' : fairPriceLabel === 'overvalued' ? '#EF4444' : '#F59E0B')
    : fairValueUpside != null
      ? (fairValueUpside > 10 ? '#10B981' : fairValueUpside < -10 ? '#EF4444' : '#F59E0B')
      : 'rgba(255,255,255,0.3)';

  // Z-Score color
  const zColor = zScore != null
    ? (zScore > 2.99 ? '#10B981' : zScore < 1.81 ? '#EF4444' : '#F59E0B')
    : 'rgba(255,255,255,0.3)';

  // Best factors to display
  const displayFactors = enrichedFactors.length > 0
    ? enrichedFactors
    : (Array.isArray(item.topFactors) ? item.topFactors.slice(0, 4) : []);

  // Best insight text
  const insightText = aiHeadline || enrichedInsight || item.insight || '';

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      style={styles.cardWrapper}
      accessibilityRole="button"
      accessibilityLabel={`View ${item.signal} signal for ${item.ticker}`}
    >
      <LinearGradient
        colors={['#0D1B3E', '#1F3864']}
        style={styles.card}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        {/* ── Top Row: bookmark + sector + timestamp ── */}
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.bookmarkBtn} onPress={toggleBookmark} accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}>
            <Ionicons
              name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={isBookmarked ? '#60A5FA' : 'rgba(255,255,255,0.4)'}
            />
          </TouchableOpacity>
          <View style={styles.topRowRight}>
            {sector && (
              <View style={styles.sectorPill}>
                <Text style={styles.sectorText} numberOfLines={1}>{sector}</Text>
              </View>
            )}
            <Text style={styles.timestamp}>{formatTimeAgo(item.updatedAt)}</Text>
          </View>
        </View>

        {/* ── Score Dial ── */}
        <View style={styles.scoreContainer}>
          <ScoreRing score={score} size={110} />
        </View>

        {/* ── Ticker & Company ── */}
        <Text style={styles.ticker}>{item.ticker}</Text>
        <Text style={styles.companyName} numberOfLines={1}>{item.companyName}</Text>

        {/* ── Portfolio badge ── */}
        {ownedShares > 0 && (
          <View style={styles.ownedBadge}>
            <Ionicons name="briefcase" size={11} color="#60A5FA" />
            <Text style={styles.ownedText}>You own {ownedShares} shares</Text>
          </View>
        )}

        {/* ── Price Row + Market Cap ── */}
        <View style={styles.priceRow}>
          {showSkeleton && price == null ? (
            <Skeleton width={90} height={24} borderRadius={6} />
          ) : (
            <Text style={styles.price}>
              {price != null ? `$${price.toFixed(2)}` : '--'}
            </Text>
          )}
          <View style={[styles.changePill, { backgroundColor: isPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }]}>
            <Ionicons name={isPositive ? 'caret-up' : 'caret-down'} size={12} color={isPositive ? '#10B981' : '#EF4444'} />
            {showSkeleton ? (
              <Skeleton width={50} height={14} borderRadius={4} />
            ) : (
              <Text style={[styles.changeText, { color: isPositive ? '#10B981' : '#EF4444' }]}>
                {dataLoaded ? `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%` : '--'}
              </Text>
            )}
          </View>
          {marketCap > 0 && (
            <Text style={styles.marketCapText}>{formatMarketCap(marketCap)}</Text>
          )}
        </View>

        {/* ── 52-Week Range Bar ── */}
        {rangePosition != null && (
          <View style={styles.rangeContainer}>
            <Text style={styles.rangeLabel}>52W</Text>
            <Text style={styles.rangeLow}>${w52Low!.toFixed(0)}</Text>
            <View style={styles.rangeBarBg}>
              <View style={[styles.rangeBarFill, { width: `${rangePosition * 100}%` }]} />
              <View style={[styles.rangeMarker, { left: `${rangePosition * 100}%` }]} />
            </View>
            <Text style={styles.rangeHigh}>${w52High!.toFixed(0)}</Text>
          </View>
        )}

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

        {/* ── Metrics Grid (2 rows x 3 columns) ── */}
        <View style={styles.metricsGrid}>
          {/* Row 1 */}
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Ionicons name="analytics-outline" size={13} color="#60A5FA" />
              {showSkeleton && techScore == null ? <MetricSkeleton /> : (
                <Text style={styles.metricValue}>{techScore != null ? techScore.toFixed(1) : '--'}</Text>
              )}
              <Text style={styles.metricLabel}>Technical</Text>
              {techTrend && <Text style={[styles.metricSub, { color: trendColor }]} numberOfLines={1}>{techTrend}</Text>}
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="shield-checkmark-outline" size={13} color={gradeColor} />
              {showSkeleton && !healthGrade ? <MetricSkeleton /> : (
                <Text style={[styles.metricValue, { color: gradeColor }]}>{healthGrade || '--'}</Text>
              )}
              <Text style={styles.metricLabel}>Health</Text>
              {fScoreVal != null && <Text style={styles.metricSub}>F-Score {fScoreVal}/9</Text>}
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="bar-chart-outline" size={13} color={negativeEarnings ? '#EF4444' : peRatio != null && peRatio > 100 ? '#F59E0B' : 'rgba(255,255,255,0.5)'} />
              {showSkeleton && peRatio == null ? <MetricSkeleton /> : (
                <Text style={[styles.metricValue, negativeEarnings ? { color: '#EF4444' } : peRatio != null && peRatio > 100 ? { color: '#F59E0B' } : {}]}>
                  {negativeEarnings ? 'N/A' : peRatio != null && peRatio > 0 ? peRatio.toFixed(1) : '--'}
                </Text>
              )}
              <Text style={styles.metricLabel}>P/E</Text>
              {negativeEarnings ? (
                <Text style={[styles.metricSub, { color: '#EF4444' }]}>Loss</Text>
              ) : forwardPE != null && forwardPE > 0 ? (
                <Text style={styles.metricSub}>Fwd {forwardPE.toFixed(1)}</Text>
              ) : null}
            </View>
          </View>
          {/* Divider */}
          <View style={styles.metricsRowDivider} />
          {/* Row 2 */}
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Ionicons name="speedometer-outline" size={13} color={rsiColor} />
              {showSkeleton && rsi == null ? <MetricSkeleton /> : (
                <Text style={[styles.metricValue, { color: rsiColor }]}>{rsi != null ? rsi.toFixed(0) : '--'}</Text>
              )}
              <Text style={styles.metricLabel}>RSI</Text>
              {rsi != null && <Text style={[styles.metricSub, { color: rsiColor }]}>{rsi >= 70 ? 'overbought' : rsi <= 30 ? 'oversold' : 'neutral'}</Text>}
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="trending-up-outline" size={13} color={fvColor} />
              {showSkeleton && fairPriceDollars == null && fairValueUpside == null ? <MetricSkeleton /> : (
                <Text style={[styles.metricValue, { color: fvColor }]}>
                  {fairPriceDollars != null ? `$${fairPriceDollars >= 1000 ? `${(fairPriceDollars / 1000).toFixed(1)}K` : fairPriceDollars.toFixed(0)}` : fairValueUpside != null ? `${fairValueUpside > 0 ? '+' : ''}${fairValueUpside.toFixed(0)}%` : '--'}
                </Text>
              )}
              <Text style={styles.metricLabel}>Fair Price</Text>
              {fairPriceLabel && <Text style={[styles.metricSub, { color: fvColor }]}>{fairPriceLabel}</Text>}
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="pulse-outline" size={13} color={zColor} />
              {showSkeleton && zScore == null ? <MetricSkeleton /> : (
                <Text style={[styles.metricValue, { color: zColor }]}>{zScore != null ? zScore.toFixed(1) : '--'}</Text>
              )}
              <Text style={styles.metricLabel}>Z-Score</Text>
              {zScore != null && <Text style={[styles.metricSub, { color: zColor }]}>{zScore > 2.99 ? 'safe' : zScore < 1.81 ? 'distress' : 'grey zone'}</Text>}
            </View>
          </View>
        </View>

        {/* ── Dimension Score Bars (skeleton while loading) ── */}
        {showSkeleton && Object.keys(dimensionScores).length === 0 ? (
          <View style={styles.dimensionContainer}>
            {DIMENSIONS.map((dim) => (
              <View key={dim.key} style={styles.dimensionRow}>
                <Ionicons name={dim.icon as any} size={10} color={dim.color} />
                <Text style={styles.dimensionLabel}>{dim.label}</Text>
                <Skeleton width={'100%' as any} height={4} borderRadius={2} />
                <Skeleton width={22} height={10} borderRadius={2} />
              </View>
            ))}
          </View>
        ) : Object.keys(dimensionScores).length > 0 ? (
          <View style={styles.dimensionContainer}>
            {DIMENSIONS.map((dim) => {
              const val = dimensionScores[dim.key];
              if (val == null) return null;
              const pct = Math.max(0, Math.min(100, (val / 10) * 100));
              return (
                <View key={dim.key} style={styles.dimensionRow}>
                  <Ionicons name={dim.icon as any} size={10} color={dim.color} />
                  <Text style={styles.dimensionLabel}>{dim.label}</Text>
                  <View style={styles.dimensionBarBg}>
                    <View style={[styles.dimensionBarFill, { width: `${pct}%`, backgroundColor: dim.color }]} />
                  </View>
                  <Text style={[styles.dimensionValue, { color: dim.color }]}>{val.toFixed(1)}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* ── AI Insight ── */}
        {showSkeleton && !insightText ? (
          <View style={{ marginBottom: 8, alignItems: 'center' }}>
            <Skeleton width={280} height={14} borderRadius={4} />
            <View style={{ height: 4 }} />
            <Skeleton width={220} height={14} borderRadius={4} />
          </View>
        ) : aiHeadline ? (
          <View style={styles.aiInsightBox}>
            <View style={styles.aiInsightHeader}>
              <Ionicons name="sparkles" size={12} color="#A78BFA" />
              <Text style={styles.aiInsightLabel}>AI AGENT</Text>
              {aiAction && (
                <View style={[styles.aiActionPill, { backgroundColor: (SIGNAL_COLORS[aiAction] || '#F59E0B') + '20' }]}>
                  <Text style={[styles.aiActionText, { color: SIGNAL_COLORS[aiAction] || '#F59E0B' }]}>{aiAction}</Text>
                </View>
              )}
            </View>
            <Text style={styles.aiInsightHeadline} numberOfLines={2}>{aiHeadline}</Text>
          </View>
        ) : insightText ? (
          <Text style={styles.insight} numberOfLines={2}>{insightText}</Text>
        ) : null}

        {/* ── Factor Pills ── */}
        {displayFactors.length > 0 && (
          <View style={styles.factorsRow}>
            {displayFactors.map((f, i) => {
              const fScore = f.score ?? 0;
              const fColor = fScore >= 0.5 ? '#10B981' : fScore <= -0.5 ? '#EF4444' : '#F59E0B';
              return (
                <View key={f.name || `f-${i}`} style={[styles.factorPill, { borderColor: fColor + '50' }]}>
                  <Text style={[styles.factorName, { color: fColor }]}>{f.name}</Text>
                  <Text style={[styles.factorScore, { color: fColor }]}>
                    {fScore >= 0 ? '+' : ''}{fScore.toFixed(1)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── CTA ── */}
        <TouchableOpacity style={styles.ctaButton} onPress={onPress} activeOpacity={0.8}>
          <Ionicons name="arrow-forward-circle" size={18} color="#60A5FA" />
          <Text style={styles.ctaText}>Tap for full analysis</Text>
        </TouchableOpacity>

        {/* ── Disclaimer ── */}
        <Text style={styles.disclaimer}>
          Not financial advice. AI-generated analysis for informational purposes only.
          {fairPriceDollars != null ? ' Fair value is a model estimate.' : ''}
        </Text>

        {/* ── Swipe hint ── */}
        <View style={styles.hintContainer}>
          <SwipeHint />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

export const FeedCard = React.memo(FeedCardInner, (prev, next) =>
  prev.item.id === next.item.id && prev.item.ticker === next.item.ticker
);

const styles = StyleSheet.create({
  cardWrapper: {
    height: SCREEN_HEIGHT,
    width: '100%',
  },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
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
  topRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bookmarkBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  sectorPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sectorText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 100,
  },
  timestamp: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '500',
  },

  // Score
  scoreContainer: { marginBottom: 10 },

  // Ticker
  ticker: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: 2,
  },
  companyName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
    maxWidth: 280,
    textAlign: 'center',
  },

  // Owned badge
  ownedBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(96,165,250,0.12)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10, marginTop: 4, gap: 4,
  },
  ownedText: { color: '#60A5FA', fontSize: 11, fontWeight: '600' },

  // Price row
  priceRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 8, gap: 8,
  },
  price: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  changePill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, gap: 3,
  },
  changeText: { fontSize: 13, fontWeight: '700' },
  marketCapText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12, fontWeight: '600',
    marginLeft: 2,
  },

  // 52-week range
  rangeContainer: {
    flexDirection: 'row', alignItems: 'center',
    width: '100%', maxWidth: 320,
    marginTop: 6, gap: 5,
  },
  rangeLabel: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 9, fontWeight: '700',
  },
  rangeLow: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '600' },
  rangeHigh: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '600' },
  rangeBarBg: {
    flex: 1, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  rangeBarFill: {
    height: '100%', borderRadius: 2,
    backgroundColor: 'rgba(96,165,250,0.4)',
  },
  rangeMarker: {
    position: 'absolute', top: -3, width: 10, height: 10,
    borderRadius: 5, backgroundColor: '#60A5FA',
    marginLeft: -5,
  },

  // Signal
  signalRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 8, marginBottom: 8, gap: 8,
  },
  confidencePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  confidenceText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  // Metrics grid (2 rows of 3)
  metricsGrid: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 8,
    paddingHorizontal: 4,
    width: '100%',
    maxWidth: 320,
    marginBottom: 8,
  },
  metricsRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  metricsRowDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 6,
    marginHorizontal: 10,
  },
  metricItem: { flex: 1, alignItems: 'center', gap: 1 },
  metricValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  metricLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9, fontWeight: '600', letterSpacing: 0.5,
  },
  metricSub: {
    fontSize: 8, fontWeight: '600',
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'capitalize',
  },
  metricDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.08)' },

  // Dimension bars
  dimensionContainer: {
    width: '100%', maxWidth: 320,
    marginBottom: 8, gap: 3,
  },
  dimensionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  dimensionLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9, fontWeight: '600',
    width: 68,
  },
  dimensionBarBg: {
    flex: 1, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  dimensionBarFill: { height: '100%', borderRadius: 2 },
  dimensionValue: { fontSize: 9, fontWeight: '700', width: 22, textAlign: 'right' },

  // AI Insight
  insight: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12, fontWeight: '400',
    textAlign: 'center', lineHeight: 17,
    paddingHorizontal: 12, maxWidth: 320, marginBottom: 8,
  },
  aiInsightBox: {
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    width: '100%', maxWidth: 320, marginBottom: 8,
  },
  aiInsightHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3,
  },
  aiInsightLabel: { color: '#A78BFA', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  aiActionPill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, marginLeft: 'auto' },
  aiActionText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  aiInsightHeadline: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500', lineHeight: 17 },

  // Factor pills
  factorsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    flexWrap: 'wrap', gap: 5, marginBottom: 10,
  },
  factorPill: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3, gap: 4,
  },
  factorName: { fontSize: 10, fontWeight: '600' },
  factorScore: { fontSize: 10, fontWeight: '800' },

  // CTA
  ctaButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(96,165,250,0.12)',
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 24, borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)', gap: 8, marginBottom: 6,
  },
  ctaText: { color: '#60A5FA', fontSize: 13, fontWeight: '700' },

  // Disclaimer
  disclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 9, textAlign: 'center',
    paddingHorizontal: 32, lineHeight: 12,
  },

  // Swipe hint
  hintContainer: { position: 'absolute', bottom: 30, alignSelf: 'center' },
});
