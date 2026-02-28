'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useStrategyStore } from '@/store/strategyStore';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { cn } from '@/lib/utils';

const STRATEGY_CARDS = [
  {
    title: 'Wealth Advisor',
    description: 'Portfolio optimization, Monte Carlo projections, and efficient frontier analysis',
    href: '/strategy/wealth-advisor',
    icon: '💰',
    color: 'from-emerald-500/20 to-emerald-700/10',
  },
  {
    title: 'Tax Playbook',
    description: 'Tax-loss harvesting opportunities and tax-efficient portfolio moves',
    href: '/strategy/tax-playbook',
    icon: '📋',
    color: 'from-blue-500/20 to-blue-700/10',
  },
  {
    title: 'AI Coach',
    description: 'Ask FII anything about your portfolio, markets, or investing strategy',
    href: '/strategy/ai-coach',
    icon: '🤖',
    color: 'from-purple-500/20 to-purple-700/10',
  },
];

const SECONDARY_CARDS = [
  {
    title: 'Signal Backtester',
    description: 'Test FII signals against historical performance',
    icon: '📊',
    href: '/strategy/backtester',
  },
  {
    title: 'Earnings Calendar',
    description: 'Upcoming earnings dates for your watchlist',
    icon: '📅',
    href: '/strategy/earnings',
  },
];

function StrategyContent() {
  const { reportCard, loadReportCard } = useStrategyStore();

  useEffect(() => {
    loadReportCard();
  }, [loadReportCard]);

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
      {/* Market Pulse Banner */}
      <div className="bg-gradient-to-r from-fii-accent/10 to-blue-600/10 rounded-xl border border-fii-accent/20 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-lg font-semibold text-white">Market Pulse</h2>
        </div>
        <p className="text-sm text-fii-text-secondary">
          AI-powered portfolio strategy tools to optimize your investments, minimize taxes, and grow wealth.
        </p>
      </div>

      {/* Primary Strategy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STRATEGY_CARDS.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group bg-fii-card rounded-xl border border-fii-border hover:border-fii-accent/30 transition-all p-6"
          >
            <div className={cn('w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-2xl mb-4', card.color)}>
              {card.icon}
            </div>
            <h3 className="text-white font-semibold mb-1 group-hover:text-fii-accent transition-colors">
              {card.title}
            </h3>
            <p className="text-xs text-fii-text-secondary leading-relaxed">
              {card.description}
            </p>
          </Link>
        ))}
      </div>

      {/* Secondary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECONDARY_CARDS.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group flex items-center gap-4 bg-fii-card rounded-xl border border-fii-border hover:border-fii-accent/30 transition-all p-4"
          >
            <div className="text-2xl">{card.icon}</div>
            <div>
              <h3 className="text-white font-semibold text-sm group-hover:text-fii-accent transition-colors">
                {card.title}
              </h3>
              <p className="text-xs text-fii-text-secondary">{card.description}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Strategy Score / Report Card */}
      {reportCard && (
        <div className="bg-fii-card rounded-xl border border-fii-border p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Strategy Report Card</h3>
          <div className="flex items-center gap-4 mb-4">
            <div className={cn(
              'text-4xl font-bold px-4 py-2 rounded-xl',
              reportCard.overall === 'A' ? 'bg-emerald-500/20 text-emerald-400' :
              reportCard.overall === 'B' ? 'bg-blue-500/20 text-blue-400' :
              reportCard.overall === 'C' ? 'bg-amber-500/20 text-amber-400' :
              'bg-red-500/20 text-red-400',
            )}>
              {reportCard.overall}
            </div>
            <div>
              <p className="text-white font-semibold">Overall Score: {reportCard.overallScore}/100</p>
              <p className="text-xs text-fii-text-secondary">Based on your portfolio strategy</p>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {reportCard.grades.map((g) => (
              <div key={g.category} className="bg-fii-bg rounded-lg p-3">
                <p className="text-xs text-fii-muted">{g.category}</p>
                <p className="text-lg font-bold text-white">{g.grade}</p>
                <p className="text-[10px] text-fii-text-secondary truncate">{g.comment}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StrategyPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="px-4 lg:px-6 py-3 border-b border-fii-border bg-fii-bg-dark">
        <h1 className="text-lg font-semibold text-white">Strategy</h1>
      </div>
      <ProtectedRoute>
        <StrategyContent />
      </ProtectedRoute>
      <DisclaimerBanner />
    </div>
  );
}
