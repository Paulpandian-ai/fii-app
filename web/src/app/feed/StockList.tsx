'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent, getScoreColor } from '@/lib/utils';
import { SignalBadge } from '@/components/SignalBadge';
import type { FeedItem, PriceData } from '@/types';

interface StockListProps {
  items: FeedItem[];
  priceData: Record<string, PriceData>;
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
}

export function StockList({ items, priceData, selectedTicker, onSelect }: StockListProps) {
  const prevPrices = useRef<Record<string, number>>({});
  const [flashTickers, setFlashTickers] = useState<Record<string, 'up' | 'down'>>({});

  useEffect(() => {
    const newFlashes: Record<string, 'up' | 'down'> = {};
    for (const [ticker, data] of Object.entries(priceData)) {
      const prev = prevPrices.current[ticker];
      if (prev != null && data.price !== prev) {
        newFlashes[ticker] = data.price > prev ? 'up' : 'down';
      }
      prevPrices.current[ticker] = data.price;
    }
    if (Object.keys(newFlashes).length > 0) {
      setFlashTickers(newFlashes);
      const timer = setTimeout(() => setFlashTickers({}), 1000);
      return () => clearTimeout(timer);
    }
  }, [priceData]);

  return (
    <div>
      {items.map((item) => {
        const price = priceData[item.ticker];
        const isSelected = selectedTicker === item.ticker;
        const changePercent = price?.changePercent ?? 0;
        const changeColor = changePercent >= 0 ? 'text-emerald-400' : 'text-red-400';
        const flash = flashTickers[item.ticker];

        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.ticker)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 border-b border-fii-border transition-colors text-left',
              isSelected
                ? 'bg-fii-accent/5 border-l-2 border-l-fii-accent'
                : 'hover:bg-fii-card/50',
              flash === 'up' && 'animate-pulse-green',
              flash === 'down' && 'animate-pulse-red',
            )}
          >
            {/* Score badge */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
              style={{ backgroundColor: `${getScoreColor(item.compositeScore)}20`, color: getScoreColor(item.compositeScore) }}
            >
              {item.compositeScore.toFixed(1)}
            </div>

            {/* Stock info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-sm">{item.ticker}</span>
                <SignalBadge signal={item.signal} size="sm" />
              </div>
              <p className="text-fii-text-secondary text-xs truncate">
                {item.companyName}
              </p>
            </div>

            {/* Price info */}
            <div className="text-right flex-shrink-0">
              <p className="text-white text-sm font-medium">
                {price ? formatCurrency(price.price) : '—'}
              </p>
              <p className={cn('text-xs', changeColor)}>
                {price ? formatPercent(changePercent) : '—'}
              </p>
            </div>
          </button>
        );
      })}
      {items.length === 0 && (
        <div className="p-8 text-center text-fii-muted text-sm">
          No stocks found
        </div>
      )}
    </div>
  );
}
