'use client';

import { cn } from '@/lib/utils';
import type { Signal } from '@/types';

const SIGNAL_STYLES: Record<Signal, string> = {
  BUY: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  HOLD: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  SELL: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function SignalBadge({
  signal,
  size = 'md',
  className,
}: {
  signal: Signal;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClass = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-3 py-1',
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-center font-bold rounded border',
        SIGNAL_STYLES[signal],
        sizeClass,
        className,
      )}
    >
      {signal}
    </span>
  );
}
