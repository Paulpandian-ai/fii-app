'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useStrategyStore } from '@/store/strategyStore';
import { CardSkeleton } from '@/components/Skeleton';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { formatCurrency, cn } from '@/lib/utils';

const TAX_BRACKETS = [
  { rate: 10, label: '10%' },
  { rate: 12, label: '12%' },
  { rate: 22, label: '22%' },
  { rate: 24, label: '24%' },
  { rate: 32, label: '32%' },
  { rate: 35, label: '35%' },
  { rate: 37, label: '37%' },
];

function TaxPlaybookContent() {
  const { taxHarvest, loadTaxHarvest } = useStrategyStore();
  const [bracket, setBracket] = useState(32);

  useEffect(() => {
    loadTaxHarvest(bracket);
  }, [bracket, loadTaxHarvest]);

  if (!taxHarvest) {
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

      <h2 className="text-xl font-bold text-white">Tax Playbook</h2>

      {/* Tax Bracket Selector */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-fii-text-secondary self-center mr-2">Tax bracket:</span>
        {TAX_BRACKETS.map((b) => (
          <button
            key={b.rate}
            onClick={() => setBracket(b.rate)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-full transition-colors',
              bracket === b.rate ? 'bg-fii-accent/20 text-fii-accent' : 'bg-fii-card text-fii-text-secondary',
            )}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-fii-card rounded-xl border border-fii-border p-4">
          <p className="text-xs text-fii-muted">Total Unrealized Loss</p>
          <p className="text-2xl font-bold text-red-400">{formatCurrency(taxHarvest.totalUnrealizedLoss)}</p>
        </div>
        <div className="bg-fii-card rounded-xl border border-fii-border p-4">
          <p className="text-xs text-fii-muted">Potential Tax Savings</p>
          <p className="text-2xl font-bold text-emerald-400">{formatCurrency(taxHarvest.totalTaxSavings)}</p>
        </div>
        <div className="bg-fii-card rounded-xl border border-fii-border p-4">
          <p className="text-xs text-fii-muted">Opportunities Found</p>
          <p className="text-2xl font-bold text-white">{taxHarvest.losses.length}</p>
        </div>
      </div>

      {/* Loss Harvest Opportunities */}
      <div className="space-y-3">
        {taxHarvest.losses.map((loss) => (
          <div key={loss.ticker} className="bg-fii-card rounded-xl border border-fii-border p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="font-semibold text-white">{loss.ticker}</h4>
                <p className="text-xs text-fii-text-secondary">{loss.companyName}</p>
              </div>
              <div className="text-right">
                <p className="text-red-400 font-semibold">{formatCurrency(loss.unrealizedLoss)}</p>
                <p className="text-xs text-emerald-400">Save {formatCurrency(loss.taxSavings)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-fii-muted">Shares</p>
                <p className="text-white">{loss.shares}</p>
              </div>
              <div>
                <p className="text-fii-muted">Cost Basis</p>
                <p className="text-white">{formatCurrency(loss.costBasis)}</p>
              </div>
              <div>
                <p className="text-fii-muted">Current Value</p>
                <p className="text-white">{formatCurrency(loss.currentValue)}</p>
              </div>
            </div>
            {loss.replacements.length > 0 && (
              <div className="mt-3 pt-3 border-t border-fii-border">
                <p className="text-[10px] text-fii-muted uppercase tracking-wider mb-1">Replacement Options</p>
                <div className="flex gap-2">
                  {loss.replacements.map((r) => (
                    <span key={r.ticker} className="px-2 py-1 bg-fii-bg rounded text-xs text-fii-accent">
                      {r.ticker}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {taxHarvest.losses.length === 0 && (
          <div className="py-12 text-center text-fii-muted">
            No tax-loss harvesting opportunities found in your portfolio
          </div>
        )}
      </div>
    </div>
  );
}

export default function TaxPlaybookPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="px-4 lg:px-6 py-3 border-b border-fii-border bg-fii-bg-dark">
        <h1 className="text-lg font-semibold text-white">Tax Playbook</h1>
      </div>
      <ProtectedRoute>
        <TaxPlaybookContent />
      </ProtectedRoute>
      <DisclaimerBanner />
    </div>
  );
}
