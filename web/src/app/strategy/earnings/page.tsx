'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { CardSkeleton } from '@/components/Skeleton';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { formatCurrency, cn } from '@/lib/utils';
import * as api from '@/lib/api';

interface EarningsEvent {
  ticker: string;
  companyName: string;
  date: string;
  time: 'pre' | 'post' | 'during';
  epsEstimate?: number;
  revenueEstimate?: number;
  previousEps?: number;
  inPortfolio?: boolean;
  inWatchlist?: boolean;
}

function EarningsContent() {
  const [events, setEvents] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'portfolio' | 'watchlist'>('all');

  useEffect(() => {
    setLoading(true);
    api.getEarningsCalendar()
      .then((data) => {
        const items = (data as { earnings?: EarningsEvent[] }).earnings || [];
        setEvents(items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredEvents = events.filter((e) => {
    if (filter === 'portfolio') return e.inPortfolio;
    if (filter === 'watchlist') return e.inWatchlist;
    return true;
  });

  // Group by date
  const grouped = filteredEvents.reduce<Record<string, EarningsEvent[]>>((acc, e) => {
    const dateKey = e.date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(e);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort();

  if (loading) {
    return <div className="p-6 space-y-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
      <Link href="/strategy" className="text-fii-accent text-sm hover:underline flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Strategy
      </Link>

      <h2 className="text-xl font-bold text-white">Earnings Calendar</h2>
      <p className="text-sm text-fii-text-secondary">
        Upcoming earnings dates for stocks in your portfolio and watchlists.
      </p>

      {/* Filters */}
      <div className="flex gap-2">
        {([
          { key: 'all', label: 'All Upcoming' },
          { key: 'portfolio', label: 'My Portfolio' },
          { key: 'watchlist', label: 'My Watchlist' },
        ] as const).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-4 py-2 text-sm rounded-lg transition-colors',
              filter === f.key ? 'bg-fii-accent/20 text-fii-accent' : 'bg-fii-card text-fii-text-secondary hover:bg-fii-card-hover',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Earnings by Date */}
      {sortedDates.length > 0 ? (
        <div className="space-y-4">
          {sortedDates.map((date) => {
            const dateObj = new Date(date);
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const isToday = new Date().toDateString() === dateObj.toDateString();

            return (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-white">{dayName}, {dateStr}</h3>
                  {isToday && (
                    <span className="text-[10px] px-2 py-0.5 bg-fii-accent/20 text-fii-accent rounded-full font-medium">
                      Today
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {grouped[date].map((event) => (
                    <div
                      key={`${event.ticker}-${date}`}
                      className="bg-fii-card rounded-xl border border-fii-border p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'px-2 py-1 rounded text-[10px] font-bold uppercase',
                          event.time === 'pre' ? 'bg-amber-500/20 text-amber-400' :
                          event.time === 'post' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-fii-bg text-fii-muted',
                        )}>
                          {event.time === 'pre' ? 'BMO' : event.time === 'post' ? 'AMC' : 'DMH'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{event.ticker}</span>
                            {event.inPortfolio && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                                Portfolio
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-fii-text-secondary">{event.companyName}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {event.epsEstimate != null && (
                          <p className="text-xs text-fii-text-secondary">
                            EPS Est: <span className="text-white font-medium">{formatCurrency(event.epsEstimate)}</span>
                          </p>
                        )}
                        {event.revenueEstimate != null && (
                          <p className="text-xs text-fii-text-secondary">
                            Rev Est: <span className="text-white font-medium">{formatCurrency(event.revenueEstimate, true)}</span>
                          </p>
                        )}
                        {event.previousEps != null && (
                          <p className="text-[10px] text-fii-muted mt-0.5">
                            Prev EPS: {formatCurrency(event.previousEps)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-12 text-center text-fii-muted">
          {filter === 'all'
            ? 'No upcoming earnings events found'
            : `No upcoming earnings for your ${filter === 'portfolio' ? 'portfolio' : 'watchlist'} stocks`}
        </div>
      )}
    </div>
  );
}

export default function EarningsPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="px-4 lg:px-6 py-3 border-b border-fii-border bg-fii-bg-dark">
        <h1 className="text-lg font-semibold text-white">Earnings Calendar</h1>
      </div>
      <ProtectedRoute>
        <EarningsContent />
      </ProtectedRoute>
      <DisclaimerBanner />
    </div>
  );
}
