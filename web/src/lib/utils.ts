import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1e9) {
    return `$${(value / 1e9).toFixed(1)}B`;
  }
  if (compact && Math.abs(value) >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`;
  }
  if (compact && Math.abs(value) >= 1e3) {
    return `$${(value / 1e3).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function getScoreColor(score: number): string {
  if (score <= 3) return '#EF4444';
  if (score <= 6) return '#F59E0B';
  return '#10B981';
}

export function getSignalColor(signal: string): { bg: string; text: string } {
  switch (signal) {
    case 'BUY': return { bg: '#10B981', text: '#FFFFFF' };
    case 'SELL': return { bg: '#EF4444', text: '#FFFFFF' };
    default: return { bg: '#F59E0B', text: '#000000' };
  }
}

export function getConfidenceColor(confidence: string): string {
  switch (confidence) {
    case 'HIGH': return '#10B981';
    case 'LOW': return '#EF4444';
    default: return '#F59E0B';
  }
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
