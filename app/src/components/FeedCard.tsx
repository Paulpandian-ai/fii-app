import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { FeedItem } from '../types';
import { ScoreRing } from './ScoreRing';
import { SignalBadge } from './SignalBadge';
import { FactorBar } from './FactorBar';
import { SwipeHint } from './SwipeHint';
import { getPrice } from '../services/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FeedCardProps {
  item: FeedItem;
  onPress?: () => void;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: '#10B981',
  MEDIUM: '#F59E0B',
  LOW: '#EF4444',
};

const formatTimeAgo = (isoDate: string): string => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Updated just now';
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
};

export const FeedCard: React.FC<FeedCardProps> = ({ item, onPress }) => {
  const topFactors = item.topFactors.slice(0, 3);
  const [priceData, setPriceData] = useState<{
    price: number;
    change: number;
    changePercent: number;
  } | null>(null);

  useEffect(() => {
    getPrice(item.ticker)
      .then((data) => {
        setPriceData({
          price: data.price,
          change: data.change,
          changePercent: data.changePercent || data.change_percent || 0,
        });
      })
      .catch(() => {});
  }, [item.ticker]);

  const confidence = item.confidence;

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      style={styles.cardWrapper}
    >
      <LinearGradient
        colors={['#0D1B3E', '#1F3864']}
        style={styles.card}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        {/* Timestamp */}
        <Text style={styles.timestamp}>{formatTimeAgo(item.updatedAt)}</Text>

        {/* Score Ring */}
        <View style={styles.scoreContainer}>
          <ScoreRing score={item.compositeScore} size={130} />
        </View>

        {/* Ticker & Company */}
        <Text style={styles.ticker}>{item.ticker}</Text>
        <Text style={styles.companyName}>{item.companyName}</Text>

        {/* Price */}
        {priceData && (
          <View style={styles.priceRow}>
            <Text style={styles.price}>${priceData.price.toFixed(2)}</Text>
            <Text
              style={[
                styles.priceChange,
                { color: priceData.change >= 0 ? '#10B981' : '#EF4444' },
              ]}
            >
              {priceData.change >= 0 ? '+' : ''}
              {priceData.changePercent.toFixed(1)}%
            </Text>
          </View>
        )}

        {/* Signal Badge + Confidence */}
        <View style={styles.signalRow}>
          <SignalBadge signal={item.signal} />
          {confidence && (
            <View
              style={[
                styles.confidencePill,
                { backgroundColor: (CONFIDENCE_COLORS[confidence] || '#F59E0B') + '30' },
              ]}
            >
              <Text
                style={[
                  styles.confidenceText,
                  { color: CONFIDENCE_COLORS[confidence] || '#F59E0B' },
                ]}
              >
                {confidence}
              </Text>
            </View>
          )}
        </View>

        {/* Insight */}
        <Text style={styles.insight} numberOfLines={2}>
          {item.insight}
        </Text>

        {/* Factor Bars (compact) */}
        <View style={styles.factorsRow}>
          {topFactors.map((f, i) => (
            <React.Fragment key={f.name}>
              {i > 0 && <Text style={styles.separator}>|</Text>}
              <FactorBar factor={f} compact />
            </React.Fragment>
          ))}
        </View>

        {/* Tap hint */}
        <View style={styles.tapHint}>
          <Text style={styles.tapHintText}>Tap for full analysis</Text>
        </View>

        {/* Swipe hint */}
        <View style={styles.hintContainer}>
          <SwipeHint />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardWrapper: {
    height: SCREEN_HEIGHT,
    width: '100%',
  },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  timestamp: {
    position: 'absolute',
    top: 60,
    right: 20,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '500',
  },
  scoreContainer: {
    marginBottom: 24,
  },
  ticker: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: 2,
  },
  companyName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    fontWeight: '400',
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
    gap: 8,
  },
  price: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  priceChange: {
    fontSize: 14,
    fontWeight: '600',
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 16,
    gap: 10,
  },
  confidencePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  insight: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
    maxWidth: 320,
  },
  factorsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  separator: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 14,
    marginHorizontal: 6,
  },
  tapHint: {
    marginTop: 20,
  },
  tapHintText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    fontWeight: '500',
  },
  hintContainer: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
});
