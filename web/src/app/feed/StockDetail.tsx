'use client';

import { useEffect, useState } from 'react';
import { ScoreRing } from '@/components/ScoreRing';
import { SignalBadge } from '@/components/SignalBadge';
import { CardSkeleton } from '@/components/Skeleton';
import { formatCurrency, formatPercent, getScoreColor, getConfidenceColor, cn } from '@/lib/utils';
import * as api from '@/lib/api';
import type { FeedItem, PriceData, FullAnalysis, FactorAnalysis, FundamentalAnalysis } from '@/types';

interface StockDetailProps {
  item: FeedItem;
  priceData?: PriceData;
}

export function StockDetail({ item, priceData }: StockDetailProps) {
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [factors, setFactors] = useState<FactorAnalysis | null>(null);
  const [fundamentals, setFundamentals] = useState<FundamentalAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setExpanded(false);

    const load = async () => {
      const results = await Promise.allSettled([
        api.getSignalDetail(item.ticker),
        api.getFactors(item.ticker),
        api.getFundamentals(item.ticker),
      ]);

      if (cancelled) return;

      if (results[0].status === 'fulfilled') setAnalysis(results[0].value as FullAnalysis);
      if (results[1].status === 'fulfilled') setFactors(results[1].value as FactorAnalysis);
      if (results[2].status === 'fulfilled') setFundamentals(results[2].value as FundamentalAnalysis);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [item.ticker]);

  const price = priceData?.price ?? 0;
  const changePercent = priceData?.changePercent ?? 0;
  const confidence = analysis?.confidence || item.confidence || 'MEDIUM';

  if (loading) {
    return (
      <div className="flex-1 p-6 space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const dimensionScores = factors?.dimensionScores;
  const dimensions = dimensionScores
    ? [
        { key: 'Technical', value: dimensionScores.technical, color: '#60A5FA' },
        { key: 'Fundamental', value: dimensionScores.fundamental, color: '#34D399' },
        { key: 'Sentiment', value: dimensionScores.sentiment, color: '#FBBF24' },
        { key: 'Macro/Geo', value: dimensionScores.macroGeo, color: '#F97316' },
        { key: 'Supply Chain', value: dimensionScores.supplyChain, color: '#A78BFA' },
        ...(dimensionScores.altData != null
          ? [{ key: 'Alt Data', value: dimensionScores.altData, color: '#EC4899' }]
          : []),
      ]
    : [];

  return (
    <div className="flex-1 p-6 space-y-6 animate-fade-in">
      {/* Header: Score + Signal + Price */}
      <div className="flex items-start gap-6">
        <ScoreRing score={item.compositeScore} size={96} strokeWidth={6} />
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold text-white">{item.ticker}</h2>
            <SignalBadge signal={item.signal} size="lg" />
          </div>
          <p className="text-fii-text-secondary text-sm mb-2">{item.companyName}</p>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-white">
              {price > 0 ? formatCurrency(price) : '—'}
            </span>
            {price > 0 && (
              <span className={cn('text-lg font-semibold', changePercent >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatPercent(changePercent)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Confidence */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-fii-text-secondary">Confidence</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: getConfidenceColor(confidence), backgroundColor: `${getConfidenceColor(confidence)}15` }}>
            {confidence}
          </span>
        </div>
      </div>

      {/* Sub-metrics grid */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Technical', value: dimensionScores?.technical?.toFixed(1) ?? '—', sub: '/10' },
          { label: 'Health', value: fundamentals?.grade ?? '—', sub: '' },
          { label: 'P/E', value: priceData?.trailingPE?.toFixed(1) ?? '—', sub: '' },
          { label: 'RSI', value: analysis?.technicalAnalysis?.rsi?.toFixed(0) ?? '—', sub: '' },
          { label: 'Fair Price', value: fundamentals?.dcf?.fairValue ? formatCurrency(fundamentals.dcf.fairValue) : '—', sub: '' },
          { label: 'Z-Score', value: fundamentals?.zScore?.value?.toFixed(2) ?? '—', sub: '' },
        ].map((metric) => (
          <div key={metric.label} className="bg-fii-card rounded-lg p-3 border border-fii-border">
            <p className="text-[10px] text-fii-muted uppercase tracking-wider">{metric.label}</p>
            <p className="text-lg font-bold text-white mt-0.5">
              {metric.value}
              <span className="text-xs text-fii-muted font-normal">{metric.sub}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Factor Breakdown */}
      {dimensions.length > 0 && (
        <div className="bg-fii-card rounded-xl border border-fii-border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Factor Breakdown</h3>
          {dimensions.map((dim) => (
            <div key={dim.key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-fii-text-secondary">{dim.key}</span>
                <span className="font-medium" style={{ color: dim.color }}>
                  {dim.value.toFixed(1)}/10
                </span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(dim.value / 10) * 100}%`,
                    backgroundColor: dim.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Insight */}
      {(analysis?.insight || item.insight) && (
        <div className="bg-fii-card rounded-xl border border-fii-border p-4">
          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-fii-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            AI Analysis
          </h3>
          <p className="text-fii-text-secondary text-sm leading-relaxed">
            {analysis?.insight || item.insight}
          </p>
          {analysis?.reasoning && (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 text-xs text-fii-accent hover:underline"
              >
                {expanded ? 'Show less' : 'Tap for full analysis'}
              </button>
              {expanded && (
                <p className="mt-2 text-fii-text-secondary text-sm leading-relaxed animate-fade-in">
                  {analysis.reasoning}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Top Factors */}
      {item.topFactors && item.topFactors.length > 0 && (
        <div className="bg-fii-card rounded-xl border border-fii-border p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Key Factors</h3>
          <div className="flex flex-wrap gap-2">
            {item.topFactors.map((f, i) => (
              <span
                key={i}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium border',
                  f.score > 0
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : f.score < 0
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-white/5 text-fii-text-secondary border-fii-border',
                )}
              >
                {f.name} {f.score > 0 ? '+' : ''}{f.score.toFixed(1)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
