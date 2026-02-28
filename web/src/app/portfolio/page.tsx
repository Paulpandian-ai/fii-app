'use client';

import { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useWatchlistStore } from '@/store/watchlistStore';
import { SignalBadge } from '@/components/SignalBadge';
import { CardSkeleton, StockRowSkeleton } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { formatCurrency, formatPercent, cn } from '@/lib/utils';
import { useSignalStore } from '@/store/signalStore';
import * as api from '@/lib/api';
import type { TrendingItem } from '@/types';
import { WatchlistSection } from './WatchlistSection';

function PortfolioContent() {
  const {
    holdings, totalValue, totalGainLoss, totalGainLossPercent,
    dailyChange, dailyChangePercent, health,
    isLoading, error, loadPortfolio, loadSummary, loadHealth,
  } = usePortfolioStore();

  const { watchlists, loadWatchlists, activeWatchlistId, setActiveWatchlist, createWatchlist, removeWatchlist } = useWatchlistStore();
  const { signals } = useSignalStore();

  const [trending, setTrending] = useState<TrendingItem[]>([]);
  const [sortCol, setSortCol] = useState<string>('ticker');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [sectorData, setSectorData] = useState<Array<{ sector: string; weight: number; color: string }>>([]);

  useEffect(() => {
    loadPortfolio();
    loadSummary();
    loadHealth();
    loadWatchlists();

    api.getTrending().then((data) => {
      const items = ((data as { items?: TrendingItem[] }).items || []).slice(0, 5);
      setTrending(items);
    }).catch(() => {});
  }, [loadPortfolio, loadSummary, loadHealth, loadWatchlists]);

  // Calculate sector allocation from batch prices
  useEffect(() => {
    if (holdings.length === 0) return;
    const tickers = holdings.map((h) => h.ticker);
    api.getBatchPrices(tickers).then((data) => {
      const prices = (data as { prices: Record<string, { sector?: string }> }).prices || {};
      const sectors: Record<string, number> = {};
      for (const h of holdings) {
        const value = h.totalValue || h.shares * (h.currentPrice || h.avgCost);
        const sector = prices[h.ticker]?.sector || 'Other';
        sectors[sector] = (sectors[sector] || 0) + value;
      }
      const total = Object.values(sectors).reduce((a, b) => a + b, 0);
      const colors = ['#60A5FA', '#34D399', '#FBBF24', '#F97316', '#A78BFA', '#EC4899', '#06B6D4', '#F43F5E', '#14B8A6', '#8B5CF6'];
      setSectorData(
        Object.entries(sectors)
          .sort(([, a], [, b]) => b - a)
          .map(([sector, value], i) => ({
            sector,
            weight: total > 0 ? value / total : 0,
            color: colors[i % colors.length],
          })),
      );
    }).catch(() => {});
  }, [holdings]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const sortedHoldings = [...holdings].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortCol) {
      case 'ticker': return dir * a.ticker.localeCompare(b.ticker);
      case 'value': return dir * ((a.totalValue || 0) - (b.totalValue || 0));
      case 'gainLoss': return dir * ((a.gainLoss || 0) - (b.gainLoss || 0));
      case 'gainLossPercent': return dir * ((a.gainLossPercent || 0) - (b.gainLossPercent || 0));
      case 'price': return dir * ((a.currentPrice || 0) - (b.currentPrice || 0));
      default: return 0;
    }
  });

  const SortIcon = ({ col }: { col: string }) => (
    <span className={cn('ml-1', sortCol === col ? 'text-fii-accent' : 'text-fii-muted')}>
      {sortCol === col ? (sortDir === 'desc' ? '▼' : '▲') : '▽'}
    </span>
  );

  if (isLoading && holdings.length === 0) {
    return (
      <div className="p-6 space-y-4">
        <CardSkeleton />
        <CardSkeleton />
        {Array.from({ length: 5 }).map((_, i) => <StockRowSkeleton key={i} />)}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadPortfolio} />;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
      {/* 1. Portfolio Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2 bg-fii-card rounded-xl border border-fii-border p-6">
          <p className="text-sm text-fii-text-secondary mb-1">Total Portfolio Value</p>
          <p className="text-3xl font-bold text-white">{formatCurrency(totalValue)}</p>
          <div className="flex items-center gap-4 mt-2">
            <span className={cn('text-lg font-semibold', dailyChange >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {dailyChange >= 0 ? '+' : ''}{formatCurrency(dailyChange)}
            </span>
            <span className={cn('text-sm', dailyChangePercent >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              ({formatPercent(dailyChangePercent)})
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-fii-border">
            <div>
              <p className="text-xs text-fii-muted">Total Gain/Loss</p>
              <p className={cn('text-sm font-semibold', totalGainLoss >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatCurrency(totalGainLoss)} ({formatPercent(totalGainLossPercent)})
              </p>
            </div>
            <div>
              <p className="text-xs text-fii-muted">Holdings</p>
              <p className="text-sm font-semibold text-white">{holdings.length}</p>
            </div>
            <div>
              <p className="text-xs text-fii-muted">Best Performer</p>
              <p className="text-sm font-semibold text-emerald-400">
                {holdings.length > 0
                  ? holdings.reduce((best, h) => (h.gainLossPercent || 0) > (best.gainLossPercent || 0) ? h : best, holdings[0]).ticker
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Sector Allocation Donut */}
        <div className="bg-fii-card rounded-xl border border-fii-border p-6">
          <p className="text-sm text-fii-text-secondary mb-3">Sector Allocation</p>
          {sectorData.length > 0 ? (
            <div className="flex flex-col items-center">
              <svg viewBox="0 0 100 100" className="w-28 h-28 mb-3">
                {(() => {
                  let cumulative = 0;
                  return sectorData.map((s, i) => {
                    const startAngle = cumulative * 360;
                    cumulative += s.weight;
                    const endAngle = cumulative * 360;
                    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
                    const startRad = ((startAngle - 90) * Math.PI) / 180;
                    const endRad = ((endAngle - 90) * Math.PI) / 180;
                    const x1 = 50 + 40 * Math.cos(startRad);
                    const y1 = 50 + 40 * Math.sin(startRad);
                    const x2 = 50 + 40 * Math.cos(endRad);
                    const y2 = 50 + 40 * Math.sin(endRad);
                    const ix1 = 50 + 25 * Math.cos(endRad);
                    const iy1 = 50 + 25 * Math.sin(endRad);
                    const ix2 = 50 + 25 * Math.cos(startRad);
                    const iy2 = 50 + 25 * Math.sin(startRad);
                    return (
                      <path
                        key={i}
                        d={`M ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A 25 25 0 ${largeArc} 0 ${ix2} ${iy2} Z`}
                        fill={s.color}
                        opacity={0.85}
                      />
                    );
                  });
                })()}
              </svg>
              <div className="space-y-1 w-full">
                {sectorData.slice(0, 5).map((s) => (
                  <div key={s.sector} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-fii-text-secondary truncate flex-1">{s.sector}</span>
                    <span className="text-white font-medium">{(s.weight * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-fii-muted text-sm">Add holdings to see allocation</div>
          )}
        </div>

        {/* Health Card */}
        <div className="bg-fii-card rounded-xl border border-fii-border p-6">
          <p className="text-sm text-fii-text-secondary mb-3">Portfolio Health</p>
          {health ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="text-4xl font-bold text-white">{health.overallScore}</div>
                <div className={cn(
                  'text-2xl font-bold px-3 py-1 rounded-lg',
                  health.grade === 'A' ? 'bg-emerald-500/20 text-emerald-400' :
                  health.grade === 'B' ? 'bg-blue-500/20 text-blue-400' :
                  health.grade === 'C' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-red-500/20 text-red-400',
                )}>
                  {health.grade}
                </div>
              </div>
              <div className="space-y-2">
                {[health.diversification, health.riskBalance, health.signalAlignment].map((sub, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-fii-text-secondary">{sub.label}</span>
                      <span className="text-white">{sub.score}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full">
                      <div
                        className="h-full rounded-full bg-fii-accent"
                        style={{ width: `${sub.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-fii-muted text-sm">Add holdings to see health score</div>
          )}
        </div>
      </div>

      {/* 2. Holdings Table */}
      <div className="bg-fii-card rounded-xl border border-fii-border overflow-hidden">
        <div className="px-4 py-3 border-b border-fii-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Holdings</h3>
          <span className="text-xs text-fii-muted">{holdings.length} stocks</span>
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-fii-border text-fii-muted text-xs">
                <th className="text-left py-2 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('ticker')}>Ticker<SortIcon col="ticker" /></th>
                <th className="text-left py-2 px-3">Company</th>
                <th className="text-right py-2 px-3">Shares</th>
                <th className="text-right py-2 px-3 cursor-pointer hover:text-white" onClick={() => handleSort('price')}>Price<SortIcon col="price" /></th>
                <th className="text-right py-2 px-3">Cost Basis</th>
                <th className="text-right py-2 px-3 cursor-pointer hover:text-white" onClick={() => handleSort('value')}>Mkt Value<SortIcon col="value" /></th>
                <th className="text-right py-2 px-3 cursor-pointer hover:text-white" onClick={() => handleSort('gainLoss')}>Gain/Loss $<SortIcon col="gainLoss" /></th>
                <th className="text-right py-2 px-3 cursor-pointer hover:text-white" onClick={() => handleSort('gainLossPercent')}>Gain/Loss %<SortIcon col="gainLossPercent" /></th>
                <th className="text-center py-2 px-3">FII</th>
                <th className="text-center py-2 px-3">Signal</th>
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((h) => {
                const sig = signals[h.ticker];
                return (
                  <tr key={h.id} className="border-b border-fii-border hover:bg-fii-card-hover transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-white">{h.ticker}</td>
                    <td className="py-2.5 px-3 text-fii-text-secondary truncate max-w-[160px]">{h.companyName}</td>
                    <td className="py-2.5 px-3 text-right text-white">{h.shares}</td>
                    <td className="py-2.5 px-3 text-right text-white">{formatCurrency(h.currentPrice || 0)}</td>
                    <td className="py-2.5 px-3 text-right text-fii-text-secondary">{formatCurrency(h.avgCost)}</td>
                    <td className="py-2.5 px-3 text-right text-white">{formatCurrency(h.totalValue || 0)}</td>
                    <td className={cn('py-2.5 px-3 text-right font-medium', (h.gainLoss || 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {formatCurrency(h.gainLoss || 0)}
                    </td>
                    <td className={cn('py-2.5 px-3 text-right font-medium', (h.gainLossPercent || 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {formatPercent(h.gainLossPercent || 0)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="font-bold text-sm" style={{ color: sig && sig.score > 6 ? '#10B981' : sig && sig.score > 3 ? '#F59E0B' : '#EF4444' }}>
                        {sig?.score.toFixed(1) ?? '—'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {sig ? <SignalBadge signal={sig.signal} size="sm" /> : <span className="text-fii-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="lg:hidden">
          {sortedHoldings.map((h) => {
            const sig = signals[h.ticker];
            return (
              <div key={h.id} className="p-3 border-b border-fii-border">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{h.ticker}</span>
                    {sig && <SignalBadge signal={sig.signal} size="sm" />}
                  </div>
                  <span className={cn('text-sm font-medium', (h.gainLossPercent || 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {formatPercent(h.gainLossPercent || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-fii-text-secondary">
                  <span>{h.shares} shares @ {formatCurrency(h.avgCost)}</span>
                  <span>{formatCurrency(h.totalValue || 0)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {holdings.length === 0 && (
          <div className="py-12 text-center text-fii-muted text-sm">
            No holdings yet. Add stocks to your portfolio to get started.
          </div>
        )}
      </div>

      {/* 3. Trending Now */}
      {trending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">Trending Now</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {trending.map((t) => (
              <div key={t.ticker} className="flex-shrink-0 w-44 bg-fii-card rounded-xl border border-fii-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-white text-sm">{t.ticker}</span>
                  <SignalBadge signal={t.signal} size="sm" />
                </div>
                <p className={cn('text-sm font-medium', t.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {formatPercent(t.changePercent)}
                </p>
                <p className="text-xs text-fii-muted mt-1">FII Score: {t.score.toFixed(1)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Watchlists */}
      <WatchlistSection
        watchlists={watchlists}
        activeWatchlistId={activeWatchlistId}
        setActiveWatchlist={setActiveWatchlist}
        createWatchlist={createWatchlist}
        removeWatchlist={removeWatchlist}
      />
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="px-4 lg:px-6 py-3 border-b border-fii-border bg-fii-bg-dark">
        <h1 className="text-lg font-semibold text-white">Portfolio</h1>
      </div>
      <ProtectedRoute>
        <PortfolioContent />
      </ProtectedRoute>
      <DisclaimerBanner />
    </div>
  );
}
