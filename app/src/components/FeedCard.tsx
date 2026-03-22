import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem } from '../types';
import { ScoreRing } from './ScoreRing';
import { SignalBadge } from './SignalBadge';
import { SwipeHint } from './SwipeHint';
import { Skeleton } from './Skeleton';
import { MiniRadarChart } from './MiniRadarChart';
import { getPrice, getSignalDetail, getTechnicals, getFundamentals, getFactors, getFairPrice, getInsightsForTicker, getStressTestAll } from '../services/api';
import { usePortfolioStore } from '../store/portfolioStore';
import { useWatchlistStore } from '../store/watchlistStore';
import { useSignalStore } from '../store/signalStore';
import type { EnrichmentData } from '../store/signalStore';
import { getScoreColor, getScoreLabel } from '../utils/scoreColors';
import type { FactorPercentiles } from './FactorRadarChart';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FeedCardProps {
  item: FeedItem;
  onPress?: () => void;
}

const safeNum = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatMarketCap = (cap: number): string => {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return '';
};

/** Compute health grade from current_ratio + debt_to_equity */
const computeHealthGrade = (
  existingGrade: string | null,
  peRatio: number | null,
  zScore: number | null,
  fScore: number | null,
): string => {
  if (existingGrade && existingGrade !== 'N/A') return existingGrade;
  // Derive from available data
  let points = 0;
  let count = 0;
  if (zScore != null) {
    count++;
    if (zScore > 2.99) points += 2;
    else if (zScore > 1.81) points += 1;
  }
  if (fScore != null) {
    count++;
    if (fScore >= 7) points += 2;
    else if (fScore >= 4) points += 1;
  }
  if (count === 0) return '—';
  const avg = points / count;
  if (avg >= 1.8) return 'A';
  if (avg >= 1.4) return 'B+';
  if (avg >= 1.0) return 'B';
  if (avg >= 0.6) return 'C+';
  if (avg >= 0.3) return 'C';
  return 'D';
};

/** Build AI insight from score_drivers data */
const buildInsightFromDrivers = (drivers: any[]): string => {
  if (!Array.isArray(drivers) || drivers.length === 0) return '';
  const positive = drivers
    .filter((d: any) => d.direction === 'positive')
    .sort((a: any, b: any) => Math.abs(b.magnitude ?? 0) - Math.abs(a.magnitude ?? 0));
  const negative = drivers
    .filter((d: any) => d.direction === 'negative')
    .sort((a: any, b: any) => Math.abs(b.magnitude ?? 0) - Math.abs(a.magnitude ?? 0));

  const topPositive = positive[0];
  const topNegative = negative[0];

  const posText = topPositive?.description || 'No major positive factors';
  const negText = topNegative ? `Risk: ${topNegative.description}` : '';

  return negText ? `${posText}. ${negText}.` : `${posText}.`;
};

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

  // ─── Price data ───
  const [price, setPrice] = useState<number | null>(cached?.price ?? null);
  const [changePercent, setChangePercent] = useState<number>(cached?.changePercent ?? 0);
  const [change, setChange] = useState<number>(cached?.change ?? 0);
  const [marketCap, setMarketCap] = useState<number>(cached?.marketCap ?? 0);
  const [w52Low, setW52Low] = useState<number | null>(cached?.w52Low ?? null);
  const [w52High, setW52High] = useState<number | null>(cached?.w52High ?? null);
  const [sector, setSector] = useState<string | null>(cached?.sector ?? null);

  // ─── Signal-enriched data ───
  const [techScore, setTechScore] = useState<number | null>(cached?.techScore ?? null);
  const [rsi, setRsi] = useState<number | null>(cached?.rsi ?? null);
  const [healthGrade, setHealthGrade] = useState<string | null>(cached?.healthGrade ?? null);
  const [peRatio, setPeRatio] = useState<number | null>(cached?.peRatio ?? null);
  const [forwardPE, setForwardPE] = useState<number | null>(cached?.forwardPE ?? null);
  const [negativeEarnings, setNegativeEarnings] = useState<boolean>(cached?.negativeEarnings ?? false);
  const [fairPriceDollars, setFairPriceDollars] = useState<number | null>(cached?.fairPriceDollars ?? null);
  const [fairPriceLabel, setFairPriceLabel] = useState<string | null>(cached?.fairPriceLabel ?? null);
  const [fairValueUpside, setFairValueUpside] = useState<number | null>(cached?.fairValueUpside ?? null);
  const [zScore, setZScore] = useState<number | null>(cached?.zScore ?? null);
  const [fScoreVal, setFScoreVal] = useState<number | null>(cached?.fScoreVal ?? null);
  const [enrichedFactors, setEnrichedFactors] = useState<{ name: string; score: number }[]>(cached?.enrichedFactors ?? []);
  const [enrichedInsight, setEnrichedInsight] = useState<string | null>(cached?.enrichedInsight ?? null);

  // ─── Factor percentiles for radar chart ───
  const [factorPercentiles, setFactorPercentiles] = useState<FactorPercentiles | null>(
    (cached as any)?.factorPercentiles ?? null,
  );
  const [percentileRank, setPercentileRank] = useState<number | null>(
    (cached as any)?.percentileRank ?? null,
  );

  // ─── Score drivers for AI insight ───
  const [scoreDrivers, setScoreDrivers] = useState<any[]>((cached as any)?.scoreDrivers ?? []);

  // ─── AI Agent insight ───
  const [aiHeadline, setAiHeadline] = useState<string | null>(cached?.aiHeadline ?? null);

  // ─── Beta from financials ───
  const [beta, setBeta] = useState<number | null>((cached as any)?.beta ?? null);

  // ─── Sector percentile for peer ranking ───
  const [sectorPercentile, setSectorPercentile] = useState<number | null>((cached as any)?.sectorPercentile ?? null);

  // ─── Stress test data ───
  const [stressData, setStressData] = useState<any | null>((cached as any)?.stressData ?? null);

  const [dataLoaded, setDataLoaded] = useState(hasCache);

  useEffect(() => {
    let mounted = true;

    Promise.allSettled([
      getPrice(item.ticker),
      getSignalDetail(item.ticker),
      getTechnicals(item.ticker),
      getFundamentals(item.ticker),
      getFactors(item.ticker),
      getInsightsForTicker(item.ticker, 1),
      getFairPrice(item.ticker),
      getStressTestAll(item.ticker),
    ]).then(([priceR, signalR, techR, fundR, factorR, insightR, fairPriceR, stressR]) => {
      if (!mounted) return;

      const _ok = (r: PromiseSettledResult<any>) => {
        if (r.status !== 'fulfilled') return null;
        const v = r.value;
        return (v && !v.error) ? v : null;
      };
      const priceData = priceR.status === 'fulfilled' ? priceR.value : null;
      const sig = _ok(signalR);
      const tech = _ok(techR);
      const fund = _ok(fundR);
      const factors = _ok(factorR);
      const insightData = insightR.status === 'fulfilled' ? insightR.value : null;

      const sigRaw = signalR.status === 'fulfilled' ? signalR.value : null;
      const fundRaw = fundR.status === 'fulfilled' ? fundR.value : null;
      const factorsRaw = factorR.status === 'fulfilled' ? factorR.value : null;

      const ed: Partial<EnrichmentData> & Record<string, any> = {};

      // ── Price ──
      if (priceData) {
        const p = safeNum(priceData.price);
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
        // Beta from price endpoint
        if (priceData.beta) { const b = safeNum(priceData.beta); setBeta(b); ed.beta = b; }
      }

      // ── Technical Score ──
      const ta = sig?.technicalAnalysis || {};
      const ts = sig?.technicalScore ?? ta.technicalScore ?? tech?.technicalScore;
      if (ts != null) { const v = safeNum(ts); setTechScore(v); ed.techScore = v; }

      // ── RSI ──
      const rsiVal = ta.rsi ?? tech?.rsi;
      if (rsiVal != null) { const v = safeNum(rsiVal); setRsi(v); ed.rsi = v; }

      // ── Health Grade ──
      const grade = sig?.fundamentalGrade ?? fund?.grade ?? fundRaw?.grade;
      if (grade && grade !== 'N/A') { setHealthGrade(grade); ed.healthGrade = grade; }

      // ── P/E Ratio ──
      const pe = sig?.peRatio ?? sig?.ratios?.peRatio ?? fund?.ratios?.peRatio
        ?? fundRaw?.ratios?.peRatio ?? priceData?.trailingPE;
      if (pe != null && pe !== 0) {
        const v = safeNum(pe);
        setPeRatio(v);
        ed.peRatio = v;
        const isNegEarnings = v < 0 || sig?.negativeEarnings || sig?.ratios?.negativeEarnings
          || fund?.ratios?.negativeEarnings || fundRaw?.ratios?.negativeEarnings;
        if (isNegEarnings) { setNegativeEarnings(true); ed.negativeEarnings = true; }
      }
      const fpe = sig?.forwardPE ?? sig?.ratios?.forwardPE ?? fund?.ratios?.forwardPE
        ?? fundRaw?.ratios?.forwardPE ?? priceData?.forwardPE;
      if (fpe != null && fpe > 0) { const v = safeNum(fpe); setForwardPE(v); ed.forwardPE = v; }

      // ── Fair Value ──
      const fvu = sig?.fairValueUpside ?? sig?.fairPriceUpside ?? fund?.dcf?.upside;
      if (fvu != null) { const v = safeNum(fvu); setFairValueUpside(v); ed.fairValueUpside = v; }
      const fpData = fairPriceR?.status === 'fulfilled' ? fairPriceR.value : null;
      const fp = sig?.fairPrice ?? fpData?.fairPrice;
      if (fp != null && fp > 0) { const v = safeNum(fp); setFairPriceDollars(v); ed.fairPriceDollars = v; }
      const fpLabel = sig?.fairPriceLabel ?? fpData?.label;
      if (fpLabel) { setFairPriceLabel(fpLabel); ed.fairPriceLabel = fpLabel; }
      if (fvu == null) {
        const fpUpside = sig?.fairPriceUpside ?? fpData?.upside;
        if (fpUpside != null) { const v = safeNum(fpUpside); setFairValueUpside(v); ed.fairValueUpside = v; }
      }

      // ── Z-Score ──
      const z = sig?.zScore ?? fund?.zScore?.value;
      if (z != null) { const v = safeNum(z); setZScore(v); ed.zScore = v; }

      // ── F-Score ──
      const f = sig?.fScore ?? fund?.fScore?.value;
      if (f != null) { const v = safeNum(f); setFScoreVal(v); ed.fScoreVal = v; }

      // ── Beta ──
      const betaVal = sig?.beta ?? fund?.beta ?? fundRaw?.beta ?? priceData?.beta;
      if (betaVal != null) { const v = safeNum(betaVal); setBeta(v); ed.beta = v; }

      // ── Factor Percentiles ──
      const fpctls = sig?.factor_percentiles ?? factors?.factor_percentiles ?? factorsRaw?.factor_percentiles;
      if (fpctls && typeof fpctls === 'object') {
        const parsed: FactorPercentiles = {
          supply_chain_upstream: safeNum(fpctls.supply_chain_upstream ?? 50),
          supply_chain_downstream: safeNum(fpctls.supply_chain_downstream ?? 50),
          geopolitical: safeNum(fpctls.geopolitical ?? 50),
          monetary: safeNum(fpctls.monetary ?? 50),
          correlations: safeNum(fpctls.correlations ?? 50),
          performance: safeNum(fpctls.performance ?? 50),
        };
        setFactorPercentiles(parsed);
        ed.factorPercentiles = parsed;
      }

      // ── Percentile rank ──
      const pRank = sig?.percentile_rank ?? sig?.percentileRank;
      if (pRank != null) {
        const v = safeNum(pRank);
        setPercentileRank(v);
        ed.percentileRank = v;
      }

      // ── Sector percentile ──
      const sPctl = sig?.sector_percentile ?? sig?.sectorPercentile;
      if (sPctl != null) {
        const v = safeNum(sPctl);
        setSectorPercentile(v);
        ed.sectorPercentile = v;
      }

      // ── Stress test data ──
      const stressResult = stressR?.status === 'fulfilled' ? stressR.value : null;
      if (stressResult && !stressResult.error && stressResult.scenarios) {
        setStressData(stressResult);
        ed.stressData = stressResult;
      }

      // ── Score drivers (for AI insight) ──
      const drivers = sig?.score_drivers ?? sig?.scoreDrivers;
      if (drivers) {
        try {
          const driverArr = typeof drivers === 'string' ? JSON.parse(drivers) : drivers;
          if (Array.isArray(driverArr) && driverArr.length > 0) {
            setScoreDrivers(driverArr);
            ed.scoreDrivers = driverArr;
          }
        } catch {}
      }

      // ── Factor pills ──
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
        }
      }

      setDataLoaded(true);

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

  const isPositive = change >= 0;
  const showSkeleton = !dataLoaded && !hasCache;

  // Computed health grade
  const displayHealthGrade = computeHealthGrade(healthGrade, peRatio, zScore, fScoreVal);

  const gradeColor = displayHealthGrade && displayHealthGrade !== '—'
    ? (displayHealthGrade.startsWith('A') || displayHealthGrade.startsWith('B')
      ? '#00C9A7' : displayHealthGrade.startsWith('C') ? '#8E8E93' : '#F5A623')
    : 'rgba(255,255,255,0.3)';

  // Score label + color
  const scoreLabel = getScoreLabel(score);
  const scoreColor = getScoreColor(score);

  // Best factors to display
  const displayFactors = enrichedFactors.length > 0
    ? enrichedFactors
    : (Array.isArray(item.topFactors) ? item.topFactors.slice(0, 4) : []);

  // AI Insight: prefer score_drivers-based insight, then aiHeadline, then enrichedInsight
  const driverInsight = scoreDrivers.length > 0 ? buildInsightFromDrivers(scoreDrivers) : '';
  const insightText = driverInsight || enrichedInsight || item.insight || '';

  // Radar chart scores
  const radarScores = factorPercentiles ? {
    supply_chain_upstream: factorPercentiles.supply_chain_upstream,
    supply_chain_downstream: factorPercentiles.supply_chain_downstream,
    geopolitical: factorPercentiles.geopolitical,
    monetary: factorPercentiles.monetary,
    correlations: factorPercentiles.correlations,
    risk_performance: factorPercentiles.performance,
  } : {
    supply_chain_upstream: 50,
    supply_chain_downstream: 50,
    geopolitical: 50,
    monetary: 50,
    correlations: 50,
    risk_performance: 50,
  };

  // 52-week range position
  const w52Position = (w52Low != null && w52High != null && price != null && w52High > w52Low)
    ? Math.min(100, Math.max(0, ((price - w52Low) / (w52High - w52Low)) * 100))
    : null;

  // Factor bar data
  const factorBarData = factorPercentiles ? [
    { key: 'sc_up', label: 'SC Upstream', percentile: factorPercentiles.supply_chain_upstream },
    { key: 'sc_down', label: 'SC Downstream', percentile: factorPercentiles.supply_chain_downstream },
    { key: 'geo', label: 'Geopolitical', percentile: factorPercentiles.geopolitical },
    { key: 'monetary', label: 'Monetary', percentile: factorPercentiles.monetary },
    { key: 'corr', label: 'Correlations', percentile: factorPercentiles.correlations },
    { key: 'risk', label: 'Risk & Perf', percentile: factorPercentiles.performance },
  ] : null;

  // Map factor percentiles to raw scores (1-10) from score_drivers if available
  const factorScoreMap: Record<string, number> = {};
  if (scoreDrivers.length > 0) {
    const factorKeywords: Record<string, string[]> = {
      sc_up: ['supply chain upstream', 'sc upstream', 'supply_chain_upstream'],
      sc_down: ['supply chain downstream', 'sc downstream', 'supply_chain_downstream'],
      geo: ['geopolitical', 'geo'],
      monetary: ['monetary'],
      corr: ['correlation', 'correlations'],
      risk: ['risk', 'performance', 'risk_performance'],
    };
    for (const driver of scoreDrivers) {
      const desc = (driver.factor || driver.description || '').toLowerCase();
      for (const [key, keywords] of Object.entries(factorKeywords)) {
        if (keywords.some(kw => desc.includes(kw)) && !factorScoreMap[key]) {
          factorScoreMap[key] = Math.min(10, Math.max(1, Math.round(Math.abs(driver.magnitude ?? 5))));
        }
      }
    }
  }

  // Stress test scenarios
  const stressScenarios = stressData?.scenarios as any[] | undefined;
  const stressModerate = stressScenarios?.find((s: any) => s.scenarioKey === 'moderate');
  const stressRecession = stressScenarios?.find((s: any) => s.scenarioKey === 'recession');
  const stressSevere = stressScenarios?.find((s: any) => s.scenarioKey === 'severe' || s.scenarioKey === 'severely_adverse');
  const hasStressData = stressModerate || stressRecession || stressSevere;

  // Sector rank approximation
  const sectorRankApprox = sectorPercentile != null
    ? { rank: Math.max(1, Math.round((100 - sectorPercentile) * 62 / 100)), total: 62 }
    : null;

  // Fair price as small text under price
  const fairPriceText = fairPriceDollars != null
    ? `$${fairPriceDollars >= 1000 ? `${(fairPriceDollars / 1000).toFixed(1)}K` : fairPriceDollars.toFixed(2)}`
    : null;

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      style={styles.cardWrapper}
      accessibilityRole="button"
      accessibilityLabel={`View FII Score for ${item.ticker}`}
    >
      <LinearGradient
        colors={['#0D1B3E', '#1F3864']}
        style={styles.card}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        {/* ── Header: Ticker + Radar + Price ── */}
        <View style={styles.headerSection}>
          <View style={styles.headerLeft}>
            <View style={styles.tickerRow}>
              <Text style={styles.ticker}>{item.ticker}</Text>
              <TouchableOpacity style={styles.bookmarkBtn} onPress={toggleBookmark}>
                <Ionicons
                  name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={18}
                  color={isBookmarked ? '#60A5FA' : 'rgba(255,255,255,0.4)'}
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.companyName} numberOfLines={1}>{item.companyName}</Text>
            {sector && <Text style={styles.sectorText} numberOfLines={1}>{sector}</Text>}
            <View style={styles.scoreRow}>
              <Text style={[styles.scoreValue, { color: scoreColor }]}>{score.toFixed(1)}/10</Text>
              <Text style={[styles.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
            </View>
            {percentileRank != null && (
              <Text style={styles.percentileText}>Top {Math.round(100 - percentileRank)}th percentile</Text>
            )}
          </View>

          <View style={styles.headerCenter}>
            <MiniRadarChart scores={radarScores} size={100} />
          </View>

          <View style={styles.headerRight}>
            {showSkeleton && price == null ? (
              <Skeleton width={80} height={22} borderRadius={6} />
            ) : (
              <Text style={styles.price}>
                {price != null ? `$${price.toFixed(2)}` : '—'}
              </Text>
            )}
            <View style={[styles.changePill, { backgroundColor: isPositive ? 'rgba(0,201,167,0.15)' : 'rgba(245,166,35,0.15)' }]}>
              <Ionicons name={isPositive ? 'caret-up' : 'caret-down'} size={10} color={isPositive ? '#00C9A7' : '#F5A623'} />
              {showSkeleton ? (
                <Skeleton width={42} height={12} borderRadius={4} />
              ) : (
                <Text style={[styles.changeText, { color: isPositive ? '#00C9A7' : '#F5A623' }]}>
                  {dataLoaded ? `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%` : '—'}
                </Text>
              )}
            </View>
            {fairPriceText && (
              <Text style={styles.fairPriceSmall}>{fairPriceText}</Text>
            )}
          </View>
        </View>

        {/* ── Portfolio badge ── */}
        {ownedShares > 0 && (
          <View style={styles.ownedBadge}>
            <Ionicons name="briefcase" size={11} color="#60A5FA" />
            <Text style={styles.ownedText}>You own {ownedShares} shares</Text>
          </View>
        )}

        {/* ── Metrics Row (5 columns) ── */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            {showSkeleton && techScore == null ? <MetricSkeleton /> : (
              <Text style={styles.metricValue}>{techScore != null ? techScore.toFixed(1) : '—'}</Text>
            )}
            <Text style={styles.metricLabel}>Technical</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            {showSkeleton && !healthGrade ? <MetricSkeleton /> : (
              <Text style={[styles.metricValue, { color: gradeColor }]}>{displayHealthGrade}</Text>
            )}
            <Text style={styles.metricLabel}>Health</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            {showSkeleton && peRatio == null ? <MetricSkeleton /> : (
              <Text style={[styles.metricValue, negativeEarnings ? { color: '#F5A623' } : {}]}>
                {negativeEarnings ? '—' : peRatio != null && peRatio > 0 ? peRatio.toFixed(1) : '—'}
              </Text>
            )}
            <Text style={styles.metricLabel}>P/E</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            {showSkeleton && beta == null ? <MetricSkeleton /> : (
              <Text style={styles.metricValue}>{beta != null ? beta.toFixed(2) : '—'}</Text>
            )}
            <Text style={styles.metricLabel}>Beta</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            {showSkeleton && rsi == null ? <MetricSkeleton /> : (
              <Text style={[styles.metricValue, rsi != null ? { color: rsi >= 70 ? '#F5A623' : rsi <= 30 ? '#4A90D9' : '#8E8E93' } : {}]}>
                {rsi != null ? rsi.toFixed(1) : '—'}
              </Text>
            )}
            <Text style={styles.metricLabel}>RSI</Text>
          </View>
        </View>

        {/* ── 52-Week Range ── */}
        {w52Position != null && w52Low != null && w52High != null && (
          <View style={styles.rangeRow}>
            <Text style={styles.rangeLabel}>52W</Text>
            <Text style={styles.rangeValue}>${w52Low.toFixed(0)}</Text>
            <View style={styles.rangeTrack}>
              <View style={[styles.rangeFill, { width: `${w52Position}%` }]} />
              <View style={[styles.rangeDot, { left: `${w52Position}%`, backgroundColor: w52Position >= 50 ? '#00C9A7' : '#F5A623' }]} />
            </View>
            <Text style={styles.rangeValue}>${w52High.toFixed(0)}</Text>
            <Text style={[styles.rangePercent, { color: w52Position >= 50 ? '#00C9A7' : '#F5A623' }]}>
              {w52Position.toFixed(0)}%
            </Text>
          </View>
        )}

        {/* ── Factor Score Bars ── */}
        {factorBarData && (
          <View style={styles.factorBarsContainer}>
            {factorBarData.map((f) => {
              const pctl = f.percentile;
              const barColor = pctl >= 60 ? '#00C9A7' : pctl >= 40 ? '#F5A623' : '#E8634A';
              const rawScore = factorScoreMap[f.key] || Math.max(1, Math.min(10, Math.round(pctl / 10)));
              return (
                <View key={f.key} style={styles.factorBarRow}>
                  <Text style={styles.factorBarLabel}>{f.label}</Text>
                  <View style={styles.factorBarTrack}>
                    <View style={[styles.factorBarFill, { width: `${pctl}%`, backgroundColor: barColor }]} />
                  </View>
                  <Text style={[styles.factorBarPctl, { color: barColor }]}>{pctl}p</Text>
                  <Text style={styles.factorBarScore}>{rawScore}/10</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Stress Test Summary ── */}
        {hasStressData && (
          <View style={styles.stressRow}>
            <Text style={styles.stressIcon}>🛡️</Text>
            {stressModerate && (
              <Text style={[styles.stressText, { color: '#F5A623' }]}>
                {safeNum(stressModerate.estimated_impact).toFixed(0)}% pullback
              </Text>
            )}
            {stressModerate && (stressRecession || stressSevere) && (
              <Text style={styles.stressDivider}>|</Text>
            )}
            {stressRecession && (
              <Text style={[styles.stressText, { color: '#F5A623' }]}>
                {safeNum(stressRecession.estimated_impact).toFixed(0)}% recession
              </Text>
            )}
            {stressRecession && stressSevere && (
              <Text style={styles.stressDivider}>|</Text>
            )}
            {stressSevere && (
              <Text style={[styles.stressText, { color: '#E8634A' }]}>
                {safeNum(stressSevere.estimated_impact).toFixed(0)}% severe
              </Text>
            )}
          </View>
        )}

        {/* ── Sector Rank ── */}
        {sectorPercentile != null && sector && (
          <View style={styles.peerRankRow}>
            <Text style={styles.peerRankText}>
              📊 Ranked #{sectorRankApprox?.rank ?? '—'} of {sectorRankApprox?.total ?? '—'} in {sector}
            </Text>
          </View>
        )}

        {/* ── AI Insight (from score_drivers) ── */}
        {showSkeleton && !insightText ? (
          <View style={styles.insightBox}>
            <Skeleton width={280} height={14} borderRadius={4} />
            <View style={{ height: 4 }} />
            <Skeleton width={220} height={14} borderRadius={4} />
          </View>
        ) : insightText ? (
          <View style={styles.insightBox}>
            <View style={styles.insightHeader}>
              <Ionicons name="sparkles" size={12} color="#00C9A7" />
              <Text style={styles.insightLabel}>AI Insight</Text>
            </View>
            <Text style={styles.insightText} numberOfLines={3}>{insightText}</Text>
          </View>
        ) : null}

        {/* ── Score Driver Chips ── */}
        {displayFactors.length > 0 && (
          <View style={styles.factorsRow}>
            {displayFactors.map((f, i) => {
              const fScore = f.score ?? 0;
              const isPos = fScore >= 0;
              const fColor = isPos ? '#00C9A7' : '#F5A623';
              return (
                <View key={f.name || `f-${i}`} style={[styles.factorChip, { borderColor: fColor + '40' }]}>
                  <Text style={[styles.factorArrow, { color: fColor }]}>{isPos ? '↗' : '↘'}</Text>
                  <Text style={[styles.factorName, { color: fColor }]}>{f.name}</Text>
                  <Text style={[styles.factorScore, { color: fColor }]}>
                    {isPos ? '+' : ''}{fScore.toFixed(1)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── CTA ── */}
        <TouchableOpacity style={styles.ctaButton} onPress={onPress} activeOpacity={0.8}>
          <Text style={styles.ctaText}>Tap for full analysis</Text>
          <Ionicons name="arrow-forward" size={14} color="#60A5FA" />
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
    paddingHorizontal: 16,
    paddingTop: 90,
    paddingBottom: 40,
  },

  // ── Header section ──
  headerSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  headerCenter: {
    marginHorizontal: 4,
  },
  headerRight: {
    alignItems: 'flex-end',
    minWidth: 85,
  },
  tickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ticker: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  bookmarkBtn: {
    padding: 4,
  },
  companyName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '400',
    marginTop: 1,
  },
  sectorText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 6,
  },
  scoreValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  scoreLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  percentileText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },

  // ── Price (right side) ──
  price: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
    marginTop: 4,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  fairPriceSmall: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 3,
  },

  // ── Owned badge ──
  ownedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(96,165,250,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 10,
    gap: 4,
    alignSelf: 'flex-start',
  },
  ownedText: { color: '#60A5FA', fontSize: 11, fontWeight: '600' },

  // ── Metrics Row ──
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // ── AI Insight ──
  insightBox: {
    backgroundColor: 'rgba(0,201,167,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,201,167,0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  insightLabel: {
    color: '#00C9A7',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  insightText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
  },

  // ── Factor chips ──
  factorsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  factorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  factorArrow: {
    fontSize: 12,
    fontWeight: '700',
  },
  factorName: {
    fontSize: 10,
    fontWeight: '600',
  },
  factorScore: {
    fontSize: 10,
    fontWeight: '800',
  },

  // ── 52-Week Range ──
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    gap: 6,
  },
  rangeLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  rangeValue: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '600',
  },
  rangeTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    position: 'relative',
  },
  rangeFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
  },
  rangeDot: {
    position: 'absolute',
    top: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    marginLeft: -4,
  },
  rangePercent: {
    fontSize: 10,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'right',
  },

  // ── Factor Score Bars ──
  factorBarsContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    gap: 2,
  },
  factorBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
  },
  factorBarLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontWeight: '600',
    width: 80,
  },
  factorBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  factorBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  factorBarPctl: {
    fontSize: 9,
    fontWeight: '700',
    width: 28,
    textAlign: 'right',
  },
  factorBarScore: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    fontWeight: '700',
    width: 28,
    textAlign: 'right',
  },

  // ── Stress Test ──
  stressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
    gap: 4,
  },
  stressIcon: {
    fontSize: 11,
  },
  stressText: {
    fontSize: 11,
    fontWeight: '600',
  },
  stressDivider: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 11,
  },

  // ── Peer Rank ──
  peerRankRow: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  peerRankText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '500',
  },

  // ── CTA ──
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(96,165,250,0.12)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)',
    gap: 8,
    marginBottom: 8,
  },
  ctaText: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Disclaimer ──
  disclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 9,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 12,
  },

  // ── Swipe hint ──
  hintContainer: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
  },
});
