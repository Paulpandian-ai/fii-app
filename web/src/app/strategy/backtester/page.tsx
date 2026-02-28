'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { CardSkeleton } from '@/components/Skeleton';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { formatPercent, cn } from '@/lib/utils';
import * as api from '@/lib/api';

interface BacktestResult {
  period: string;
  totalSignals: number;
  buyAccuracy: number;
  sellAccuracy: number;
  holdAccuracy: number;
  overallAccuracy: number;
  avgReturn: number;
  benchmarkReturn: number;
  alpha: number;
  signalBreakdown?: Array<{
    signal: string;
    count: number;
    avgReturn: number;
    winRate: number;
  }>;
}

function BacktesterContent() {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'1m' | '3m' | '6m' | '1y'>('3m');

  useEffect(() => {
    setLoading(true);
    api.runBacktest(undefined, period)
      .then((data) => setResult(data as BacktestResult))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return <div className="p-6 space-y-4"><CardSkeleton /><CardSkeleton /></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
      <Link href="/strategy" className="text-fii-accent text-sm hover:underline flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Strategy
      </Link>

      <h2 className="text-xl font-bold text-white">Signal Backtester</h2>
      <p className="text-sm text-fii-text-secondary">
        Test how FII signals have performed against historical market data.
      </p>

      {/* Period Selector */}
      <div className="flex gap-2">
        {(['1m', '3m', '6m', '1y'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'px-4 py-2 text-sm rounded-lg transition-colors',
              period === p ? 'bg-fii-accent/20 text-fii-accent' : 'bg-fii-card text-fii-text-secondary hover:bg-fii-card-hover',
            )}
          >
            {p === '1m' ? '1 Month' : p === '3m' ? '3 Months' : p === '6m' ? '6 Months' : '1 Year'}
          </button>
        ))}
      </div>

      {result ? (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-fii-card rounded-xl border border-fii-border p-4">
              <p className="text-xs text-fii-muted">Overall Accuracy</p>
              <p className="text-2xl font-bold text-white">{(result.overallAccuracy * 100).toFixed(0)}%</p>
            </div>
            <div className="bg-fii-card rounded-xl border border-fii-border p-4">
              <p className="text-xs text-fii-muted">Total Signals</p>
              <p className="text-2xl font-bold text-white">{result.totalSignals}</p>
            </div>
            <div className="bg-fii-card rounded-xl border border-fii-border p-4">
              <p className="text-xs text-fii-muted">Avg Return</p>
              <p className={cn('text-2xl font-bold', result.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatPercent(result.avgReturn)}
              </p>
            </div>
            <div className="bg-fii-card rounded-xl border border-fii-border p-4">
              <p className="text-xs text-fii-muted">Alpha vs S&P 500</p>
              <p className={cn('text-2xl font-bold', result.alpha >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatPercent(result.alpha)}
              </p>
            </div>
          </div>

          {/* Signal Accuracy Bars */}
          <div className="bg-fii-card rounded-xl border border-fii-border p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white">Signal Accuracy</h3>
            {[
              { label: 'BUY Signals', value: result.buyAccuracy, color: '#10B981' },
              { label: 'HOLD Signals', value: result.holdAccuracy, color: '#F59E0B' },
              { label: 'SELL Signals', value: result.sellAccuracy, color: '#EF4444' },
            ].map((bar) => (
              <div key={bar.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-fii-text-secondary">{bar.label}</span>
                  <span className="font-medium" style={{ color: bar.color }}>
                    {(bar.value * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${bar.value * 100}%`, backgroundColor: bar.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Signal Breakdown Table */}
          {result.signalBreakdown && result.signalBreakdown.length > 0 && (
            <div className="bg-fii-card rounded-xl border border-fii-border overflow-hidden">
              <div className="px-4 py-3 border-b border-fii-border">
                <h3 className="text-sm font-semibold text-white">Detailed Breakdown</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-fii-border text-fii-muted text-xs">
                    <th className="text-left py-2 px-4">Signal</th>
                    <th className="text-right py-2 px-4">Count</th>
                    <th className="text-right py-2 px-4">Avg Return</th>
                    <th className="text-right py-2 px-4">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {result.signalBreakdown.map((row) => (
                    <tr key={row.signal} className="border-b border-fii-border">
                      <td className="py-2.5 px-4 font-semibold text-white">{row.signal}</td>
                      <td className="py-2.5 px-4 text-right text-fii-text-secondary">{row.count}</td>
                      <td className={cn('py-2.5 px-4 text-right font-medium', row.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {formatPercent(row.avgReturn)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-white">{(row.winRate * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Benchmark Comparison */}
          <div className="bg-fii-card rounded-xl border border-fii-border p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Benchmark Comparison</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-fii-muted mb-1">FII Signal Returns</p>
                <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-fii-accent"
                    style={{ width: `${Math.min(Math.max(result.avgReturn + 50, 0), 100)}%` }}
                  />
                </div>
                <p className={cn('text-sm font-bold mt-1', result.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {formatPercent(result.avgReturn)}
                </p>
              </div>
              <div>
                <p className="text-xs text-fii-muted mb-1">S&P 500</p>
                <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-fii-muted"
                    style={{ width: `${Math.min(Math.max(result.benchmarkReturn + 50, 0), 100)}%` }}
                  />
                </div>
                <p className={cn('text-sm font-bold mt-1', result.benchmarkReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {formatPercent(result.benchmarkReturn)}
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="py-12 text-center text-fii-muted">
          Add portfolio holdings to run backtests
        </div>
      )}
    </div>
  );
}

export default function BacktesterPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="px-4 lg:px-6 py-3 border-b border-fii-border bg-fii-bg-dark">
        <h1 className="text-lg font-semibold text-white">Signal Backtester</h1>
      </div>
      <ProtectedRoute>
        <BacktesterContent />
      </ProtectedRoute>
      <DisclaimerBanner />
    </div>
  );
}
