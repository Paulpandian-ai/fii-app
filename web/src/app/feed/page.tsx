'use client';

import { useEffect, useState, useCallback } from 'react';
import { useFeedStore } from '@/store/feedStore';
import * as api from '@/lib/api';
import { dataRefreshManager } from '@/lib/DataRefreshManager';
import type { FeedItem, PriceData } from '@/types';
import { StockList } from './StockList';
import { StockDetail } from './StockDetail';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { StockRowSkeleton } from '@/components/Skeleton';
import { cn } from '@/lib/utils';

export default function FeedPage() {
  const { items, setItems, setLoading, isLoading, setError, error } = useFeedStore();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'price' | 'change'>('score');
  const [priceData, setPriceData] = useState<Record<string, PriceData>>({});
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getFeed() as { items: FeedItem[] };
      const feedItems = (data.items || []).filter(
        (item: FeedItem) => item.type !== 'educational' && item.ticker,
      );
      setItems(feedItems);
      setLastUpdated(new Date().toLocaleTimeString());

      // Check if market is open
      const now = new Date();
      const day = now.getUTCDay();
      const etHour = (now.getUTCHours() - 5 + 24) % 24;
      const etMin = now.getUTCMinutes();
      const totalMin = etHour * 60 + etMin;
      setIsLive(day > 0 && day < 6 && totalMin >= 570 && totalMin <= 960);

      // Auto-select first stock on desktop
      if (feedItems.length > 0 && !selectedTicker) {
        setSelectedTicker(feedItems[0].ticker);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [setItems, setLoading, setError, selectedTicker]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Subscribe to price updates
  useEffect(() => {
    if (items.length === 0) return;
    const tickers = items.map((i) => i.ticker).slice(0, 50);

    const unsub = dataRefreshManager.subscribe(
      'feed-prices',
      async () => {
        try {
          const data = await api.getBatchPrices(tickers) as { prices: Record<string, PriceData> };
          if (data.prices) {
            setPriceData((prev) => ({ ...prev, ...data.prices }));
            setLastUpdated(new Date().toLocaleTimeString());
          }
        } catch { /* ignore */ }
      },
      30_000,
    );
    return unsub;
  }, [items]);

  const filteredItems = items
    .filter((item) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.ticker.toLowerCase().includes(q) ||
        item.companyName.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'score':
          return b.compositeScore - a.compositeScore;
        case 'change': {
          const ac = priceData[a.ticker]?.changePercent ?? 0;
          const bc = priceData[b.ticker]?.changePercent ?? 0;
          return bc - ac;
        }
        case 'price': {
          const ap = priceData[a.ticker]?.price ?? 0;
          const bp = priceData[b.ticker]?.price ?? 0;
          return bp - ap;
        }
        default:
          return 0;
      }
    });

  const selectedItem = items.find((i) => i.ticker === selectedTicker) || null;

  const handleSelect = (ticker: string) => {
    setSelectedTicker(ticker);
    // Open mobile slide-over on small screens
    if (window.innerWidth < 1024) {
      setMobileDetailOpen(true);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-fii-border bg-fii-bg-dark">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white">Feed</h1>
          {isLive && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Live</span>
            </div>
          )}
        </div>
        {lastUpdated && (
          <span className="text-xs text-fii-muted">Updated {lastUpdated}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: Stock List */}
        <div className="w-full lg:w-[40%] xl:w-[35%] flex flex-col border-r border-fii-border overflow-hidden">
          {/* Search & Sort */}
          <div className="p-3 space-y-2 border-b border-fii-border">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fii-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search stocks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-fii-card border border-fii-border rounded-lg text-sm text-white placeholder-fii-muted focus:outline-none focus:ring-1 focus:ring-fii-accent/50"
              />
            </div>
            <div className="flex gap-1">
              {(['score', 'price', 'change'] as const).map((sort) => (
                <button
                  key={sort}
                  onClick={() => setSortBy(sort)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    sortBy === sort
                      ? 'bg-fii-accent/20 text-fii-accent'
                      : 'bg-fii-card text-fii-text-secondary hover:bg-fii-card-hover'
                  }`}
                >
                  {sort === 'score' ? 'FII Score' : sort === 'price' ? 'Price' : 'Change %'}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && items.length === 0 ? (
              Array.from({ length: 10 }).map((_, i) => <StockRowSkeleton key={i} />)
            ) : error ? (
              <div className="p-4 text-center">
                <p className="text-red-400 text-sm mb-2">{error}</p>
                <button onClick={loadFeed} className="text-fii-accent text-sm hover:underline">
                  Retry
                </button>
              </div>
            ) : (
              <StockList
                items={filteredItems}
                priceData={priceData}
                selectedTicker={selectedTicker}
                onSelect={handleSelect}
              />
            )}
          </div>
        </div>

        {/* Right panel: Stock Detail (desktop only) */}
        <div className="hidden lg:flex flex-1 overflow-y-auto">
          {selectedItem ? (
            <StockDetail
              item={selectedItem}
              priceData={priceData[selectedItem.ticker]}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-fii-muted">
              <p>Select a stock to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile stock detail slide-over */}
      {mobileDetailOpen && selectedItem && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-fii-bg animate-slide-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-fii-border bg-fii-bg-dark">
            <button
              onClick={() => setMobileDetailOpen(false)}
              className="flex items-center gap-1 text-fii-accent text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <span className="text-white font-semibold">{selectedItem.ticker}</span>
            <div className="w-12" />
          </div>
          <div className="flex-1 overflow-y-auto">
            <StockDetail
              item={selectedItem}
              priceData={priceData[selectedItem.ticker]}
            />
          </div>
        </div>
      )}

      <DisclaimerBanner />
    </div>
  );
}
