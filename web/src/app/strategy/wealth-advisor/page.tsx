'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useStrategyStore } from '@/store/strategyStore';
import { CardSkeleton } from '@/components/Skeleton';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { formatCurrency, formatPercent, cn } from '@/lib/utils';

function WealthAdvisorContent() {
  const {
    optimization, projection, scenarios, moves,
    isLoading, loadOptimization, loadProjection, loadScenarios, loadRebalance,
  } = useStrategyStore();

  const [activeTab, setActiveTab] = useState<'optimize' | 'project' | 'scenarios' | 'rebalance'>('optimize');

  useEffect(() => {
    loadOptimization();
    loadProjection(5);
    loadScenarios();
    loadRebalance();
  }, [loadOptimization, loadProjection, loadScenarios, loadRebalance]);

  if (isLoading && !optimization) {
    return <div className="p-6 space-y-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
      {/* Back link */}
      <Link href="/strategy" className="text-fii-accent text-sm hover:underline flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Strategy
      </Link>

      <h2 className="text-xl font-bold text-white">Wealth Advisor</h2>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {[
          { key: 'optimize', label: 'Optimization' },
          { key: 'project', label: 'Projection' },
          { key: 'scenarios', label: 'Stress Tests' },
          { key: 'rebalance', label: 'Rebalance' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={cn(
              'px-4 py-2 text-sm rounded-lg transition-colors flex-shrink-0',
              activeTab === tab.key ? 'bg-fii-accent/20 text-fii-accent' : 'bg-fii-card text-fii-text-secondary hover:bg-fii-card-hover',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Optimization */}
      {activeTab === 'optimize' && optimization && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-fii-card rounded-xl border border-fii-border p-4">
              <p className="text-xs text-fii-muted">Expected Return</p>
              <p className="text-2xl font-bold text-emerald-400">{formatPercent(optimization.optimized.expectedReturn * 100)}</p>
            </div>
            <div className="bg-fii-card rounded-xl border border-fii-border p-4">
              <p className="text-xs text-fii-muted">Volatility</p>
              <p className="text-2xl font-bold text-amber-400">{formatPercent(optimization.optimized.expectedVolatility * 100)}</p>
            </div>
            <div className="bg-fii-card rounded-xl border border-fii-border p-4">
              <p className="text-xs text-fii-muted">Sharpe Ratio</p>
              <p className="text-2xl font-bold text-fii-accent">{optimization.optimized.sharpeRatio.toFixed(2)}</p>
            </div>
          </div>

          {/* Allocation */}
          {optimization.allocation && (
            <div className="bg-fii-card rounded-xl border border-fii-border p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Optimal Allocation</h3>
              <div className="space-y-2">
                {optimization.allocation.slice(0, 10).map((a) => (
                  <div key={a.ticker} className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white w-16">{a.ticker}</span>
                    <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-fii-accent"
                        style={{ width: `${a.weight * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-fii-text-secondary w-12 text-right">
                      {(a.weight * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Projection */}
      {activeTab === 'project' && projection && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-fii-card rounded-xl border border-fii-border p-4">
              <p className="text-xs text-fii-muted">Best Case (P95)</p>
              <p className="text-2xl font-bold text-emerald-400">{formatCurrency(projection.finalStats.best)}</p>
            </div>
            <div className="bg-fii-card rounded-xl border border-fii-border p-4">
              <p className="text-xs text-fii-muted">Likely (P50)</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(projection.finalStats.likely)}</p>
            </div>
            <div className="bg-fii-card rounded-xl border border-fii-border p-4">
              <p className="text-xs text-fii-muted">Worst Case (P5)</p>
              <p className="text-2xl font-bold text-red-400">{formatCurrency(projection.finalStats.worst)}</p>
            </div>
          </div>
          <div className="bg-fii-card rounded-xl border border-fii-border p-4">
            <p className="text-xs text-fii-muted mb-2">
              {projection.years}-year projection from {formatCurrency(projection.initialValue)} initial value
            </p>
            <p className="text-sm text-fii-text-secondary">
              Annual return: {formatPercent(projection.annualReturn * 100)} | Volatility: {formatPercent(projection.annualVolatility * 100)} |
              Loss probability: {(projection.finalStats.lossProbability * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      )}

      {/* Scenarios */}
      {activeTab === 'scenarios' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scenarios.map((s) => (
            <div key={s.id} className="bg-fii-card rounded-xl border border-fii-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{s.icon}</span>
                <h3 className="text-white font-semibold text-sm">{s.title}</h3>
              </div>
              <p className="text-xs text-fii-text-secondary mb-3">{s.description}</p>
              <div className="flex items-center gap-4 mb-2">
                <div>
                  <p className="text-[10px] text-fii-muted">Your Portfolio</p>
                  <p className={cn('text-lg font-bold', s.portfolioImpact >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {formatPercent(s.portfolioImpact)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-fii-muted">S&P 500</p>
                  <p className={cn('text-lg font-bold', s.sp500Impact >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {formatPercent(s.sp500Impact)}
                  </p>
                </div>
              </div>
              <p className="text-xs font-medium" style={{ color: s.verdictColor || '#94A3B8' }}>
                {s.verdict}
              </p>
            </div>
          ))}
          {scenarios.length === 0 && (
            <div className="col-span-2 py-12 text-center text-fii-muted">
              Add portfolio holdings to run stress tests
            </div>
          )}
        </div>
      )}

      {/* Rebalance */}
      {activeTab === 'rebalance' && (
        <div className="space-y-3">
          {moves.map((m) => (
            <div key={m.ticker} className="bg-fii-card rounded-xl border border-fii-border p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-white">{m.ticker}</span>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    m.direction === 'increase' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400',
                  )}>
                    {m.direction === 'increase' ? '↑ Increase' : '↓ Decrease'}
                  </span>
                </div>
                <p className="text-xs text-fii-text-secondary">{m.reason}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-fii-muted">{(m.currentWeight * 100).toFixed(1)}% → {(m.optimalWeight * 100).toFixed(1)}%</p>
              </div>
            </div>
          ))}
          {moves.length === 0 && (
            <div className="py-12 text-center text-fii-muted">
              Your portfolio is well-balanced or add holdings to get rebalancing suggestions
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WealthAdvisorPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="px-4 lg:px-6 py-3 border-b border-fii-border bg-fii-bg-dark">
        <h1 className="text-lg font-semibold text-white">Wealth Advisor</h1>
      </div>
      <ProtectedRoute>
        <WealthAdvisorContent />
      </ProtectedRoute>
      <DisclaimerBanner />
    </div>
  );
}
