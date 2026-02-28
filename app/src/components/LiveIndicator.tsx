import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { dataRefreshManager } from '../services/DataRefreshManager';

interface LiveIndicatorProps {
  /** Override market-open status (e.g. for Screener which shows "Live" when actively polling). */
  forceActive?: boolean;
}

/**
 * Shows a small dot + label indicating live data status.
 * Green dot + "Live" during market hours, gray dot + "Market Closed" otherwise.
 */
export const LiveIndicator: React.FC<LiveIndicatorProps> = ({ forceActive }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isActive = forceActive ?? dataRefreshManager.isMarketOpen;

  useEffect(() => {
    if (!isActive) {
      pulseAnim.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isActive, pulseAnim]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: isActive ? '#10B981' : '#6B7280', opacity: pulseAnim },
        ]}
      />
      <Text style={[styles.label, { color: isActive ? '#10B981' : '#6B7280' }]}>
        {isActive ? 'Live' : 'Market Closed'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
