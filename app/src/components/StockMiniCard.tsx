import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { Signal } from '../types';

interface StockMiniCardProps {
  ticker: string;
  companyName: string;
  price: number;
  changePercent: number;
  signal?: Signal | null;
  aiScore?: number | null;
  onPress: () => void;
}

const SIGNAL_COLORS: Record<string, string> = {
  BUY: '#10B981',
  HOLD: '#F59E0B',
  SELL: '#EF4444',
};

export const StockMiniCard: React.FC<StockMiniCardProps> = React.memo(
  ({ ticker, companyName, price, changePercent, signal, aiScore, onPress }) => {
    const isPositive = changePercent >= 0;
    const changeColor = isPositive ? '#10B981' : '#EF4444';
    const signalColor = signal ? SIGNAL_COLORS[signal] || '#6B7280' : '#6B7280';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${ticker} ${signal || ''} ${price}`}
      >
        {/* Signal indicator bar */}
        <View style={[styles.signalBar, { backgroundColor: signalColor }]} />

        <View style={styles.content}>
          {/* Header: ticker + signal badge */}
          <View style={styles.header}>
            <Text style={styles.ticker}>{ticker}</Text>
            {signal && (
              <View style={[styles.signalBadge, { backgroundColor: signalColor }]}>
                <Text style={styles.signalText}>{signal}</Text>
              </View>
            )}
          </View>

          {/* Company name */}
          <Text style={styles.companyName} numberOfLines={1}>
            {companyName}
          </Text>

          {/* Price + change */}
          <View style={styles.priceRow}>
            <Text style={styles.price}>${price.toFixed(2)}</Text>
            <Text style={[styles.change, { color: changeColor }]}>
              {isPositive ? '+' : ''}{changePercent.toFixed(1)}%
            </Text>
          </View>

          {/* AI Score */}
          {aiScore != null && aiScore > 0 && (
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>FII</Text>
              <Text style={styles.scoreValue}>{aiScore.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    width: 140,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    marginRight: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  signalBar: {
    height: 3,
    width: '100%',
  },
  content: {
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  ticker: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  signalBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  signalText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  companyName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  price: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  change: {
    fontSize: 12,
    fontWeight: '700',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  scoreLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '600',
  },
  scoreValue: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
  },
});
