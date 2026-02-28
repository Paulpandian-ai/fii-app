'use client';

import { useEffect, useState, useCallback } from 'react';
import * as api from '@/lib/api';
import { useWatchlistStore } from '@/store/watchlistStore';
import { SignalBadge } from '@/components/SignalBadge';
import { StockRowSkeleton } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { formatCurrency, formatPercent, cn } from '@/lib/utils';
import type { ScreenerResult, ScreenerTemplate } from '@/types';

const SORT_OPTIONS = [
  { value: 'ai_score', label: 'FII Score' },
  { value: 'price', label: 'Price' },
  { value: 'change_percent', label: 'Daily Change' },
  { value: 'pe_ratio', label: 'P/E Ratio' },
];

export default function ScreenerPage() {
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [templates, setTemplates] = useState<ScreenerTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('ai_score');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [activeTemplate, setActiveTemplate] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'watchlist'>('all');

  const { isInAnyWatchlist, addTicker, removeTicker, watchlists } = useWatchlistStore();

  const loadScreener = useCallback(async (params: Record<string, string> = {}) => {
    setLoading(true);
    setError(null);
    try {
      const [screenerData, templateData] = await Promise.allSettled([
        api.getScreener({ sort: sortBy, direction: sortDir, search: searchQuery, ...params }),
        templates.length === 0 ? api.getScreenerTemplates() : Promise.resolve({ templates }),
      ]);

      if (screenerData.status === 'fulfilled') {
        const data = screenerData.value as { results: ScreenerResult[] };
        setResults(data.results || []);
      } else {
        setError('Failed to load screener data');
      }

      if (templateData.status === 'fulfilled') {
        const data = templateData.value as { templates: ScreenerTemplate[] };
        if (data.templates) setTemplates(data.templates);
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  }, [sortBy, sortDir, searchQuery, templates]);

  useEffect(() => {
    loadScreener();
  }, [sortBy, sortDir]);

  const handleSearch = () => {
    loadScreener();
  };

  const handleTemplateClick = (template: ScreenerTemplate) => {
    setActiveTemplate(template.id);
    loadScreener(template.filters);
  };

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const toggleWatchlist = async (ticker: string, companyName: string) => {
    if (isInAnyWatchlist(ticker)) {
      const wl = watchlists.find((w) => w.items.some((i) => i.ticker === ticker));
      if (wl) await removeTicker(wl.id, ticker);
    } else {
      const wl = watchlists[0];
      if (wl) await addTicker(wl.id, ticker, companyName);
    }
  };

  const filteredResults = filterMode === 'watchlist'
    ? results.filter((r) => isInAnyWatchlist(r.ticker))
    : results;

  const SortIcon = ({ col }: { col: string }) => (
    <span className={cn('ml-1 inline-block', sortBy === col ? 'text-fii-accent' : 'text-fii-muted')}>
      {sortBy === col ? (sortDir === 'desc' ? '▼' : '▲') : '▽'}
    </span>
  );

  return (
    <div className="h-screen flex flex-col">
      <div className="px-4 lg:px-6 py-3 border-b border-fii-border bg-fii-bg-dark">
        <h1 className="text-lg font-semibold text-white">Screener</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fii-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by ticker or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 bg-fii-card border border-fii-border rounded-lg text-sm text-white placeholder-fii-muted focus:outline-none focus:ring-1 focus:ring-fii-accent/50"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFilterMode('all')}
              className={cn('px-3 py-1.5 text-xs rounded-full transition-colors', filterMode === 'all' ? 'bg-fii-accent/20 text-fii-accent' : 'bg-fii-card text-fii-text-secondary')}
            >
              All Stocks
            </button>
            <button
              onClick={() => setFilterMode('watchlist')}
              className={cn('px-3 py-1.5 text-xs rounded-full transition-colors', filterMode === 'watchlist' ? 'bg-fii-accent/20 text-fii-accent' : 'bg-fii-card text-fii-text-secondary')}
            >
              My Watchlist
            </button>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-fii-card border border-fii-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none lg:hidden"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Templates */}
        {templates.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTemplateClick(t)}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 text-xs rounded-full border transition-colors',
                  activeTemplate === t.id
                    ? 'bg-fii-accent/20 text-fii-accent border-fii-accent/30'
                    : 'bg-fii-card text-fii-text-secondary border-fii-border hover:border-fii-accent/30',
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* Results Table (desktop) */}
        {loading ? (
          <div className="space-y-0">
            {Array.from({ length: 10 }).map((_, i) => <StockRowSkeleton key={i} />)}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => loadScreener()} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-fii-border text-fii-muted text-xs">
                    <th className="text-left py-2 px-2 w-8"></th>
                    <th className="text-left py-2 px-2 cursor-pointer hover:text-white" onClick={() => handleSort('ticker')}>
                      Ticker<SortIcon col="ticker" />
                    </th>
                    <th className="text-left py-2 px-2">Company</th>
                    <th className="text-right py-2 px-2 cursor-pointer hover:text-white" onClick={() => handleSort('price')}>
                      Price<SortIcon col="price" />
                    </th>
                    <th className="text-right py-2 px-2 cursor-pointer hover:text-white" onClick={() => handleSort('change_percent')}>
                      Change %<SortIcon col="change_percent" />
                    </th>
                    <th className="text-right py-2 px-2 cursor-pointer hover:text-white" onClick={() => handleSort('ai_score')}>
                      FII Score<SortIcon col="ai_score" />
                    </th>
                    <th className="text-center py-2 px-2">Signal</th>
                    <th className="text-right py-2 px-2 cursor-pointer hover:text-white" onClick={() => handleSort('pe_ratio')}>
                      P/E<SortIcon col="pe_ratio" />
                    </th>
                    <th className="text-left py-2 px-2">Sector</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((stock) => (
                    <tr
                      key={stock.ticker}
                      className="border-b border-fii-border hover:bg-fii-card/50 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleWatchlist(stock.ticker, stock.companyName); }}
                          className={cn('text-lg', isInAnyWatchlist(stock.ticker) ? 'text-fii-yellow' : 'text-fii-muted hover:text-fii-yellow')}
                        >
                          {isInAnyWatchlist(stock.ticker) ? '★' : '☆'}
                        </button>
                      </td>
                      <td className="py-2.5 px-2 font-semibold text-white">{stock.ticker}</td>
                      <td className="py-2.5 px-2 text-fii-text-secondary truncate max-w-[200px]">{stock.companyName}</td>
                      <td className="py-2.5 px-2 text-right text-white">{formatCurrency(stock.price)}</td>
                      <td className={cn('py-2.5 px-2 text-right font-medium', stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {formatPercent(stock.changePercent)}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className="font-bold" style={{ color: stock.aiScore > 6 ? '#10B981' : stock.aiScore > 3 ? '#F59E0B' : '#EF4444' }}>
                          {stock.aiScore.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <SignalBadge signal={stock.signal} size="sm" />
                      </td>
                      <td className="py-2.5 px-2 text-right text-fii-text-secondary">
                        {stock.peRatio?.toFixed(1) ?? '—'}
                      </td>
                      <td className="py-2.5 px-2 text-fii-text-secondary text-xs">{stock.sector}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-2">
              {filteredResults.map((stock) => (
                <div key={stock.ticker} className="bg-fii-card rounded-lg border border-fii-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleWatchlist(stock.ticker, stock.companyName)}
                        className={cn('text-lg', isInAnyWatchlist(stock.ticker) ? 'text-fii-yellow' : 'text-fii-muted')}
                      >
                        {isInAnyWatchlist(stock.ticker) ? '★' : '☆'}
                      </button>
                      <span className="font-semibold text-white">{stock.ticker}</span>
                      <SignalBadge signal={stock.signal} size="sm" />
                    </div>
                    <span className="text-xs font-bold" style={{ color: stock.aiScore > 6 ? '#10B981' : stock.aiScore > 3 ? '#F59E0B' : '#EF4444' }}>
                      {stock.aiScore.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-fii-text-secondary truncate">{stock.companyName}</span>
                    <div className="text-right">
                      <span className="text-sm text-white">{formatCurrency(stock.price)}</span>
                      <span className={cn('ml-2 text-xs', stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {formatPercent(stock.changePercent)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredResults.length === 0 && (
              <div className="py-12 text-center text-fii-muted">No results found</div>
            )}
          </>
        )}
      </div>

      <DisclaimerBanner />
    </div>
  );
}
