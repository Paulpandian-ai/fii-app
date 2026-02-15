import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Signal } from '../types';

interface SignalBadgeProps {
  signal: Signal;
}

const SIGNAL_COLORS: Record<Signal, { bg: string; text: string }> = {
  BUY: { bg: '#10B981', text: '#FFFFFF' },
  HOLD: { bg: '#F59E0B', text: '#000000' },
  SELL: { bg: '#EF4444', text: '#FFFFFF' },
};

export const SignalBadge: React.FC<SignalBadgeProps> = ({ signal }) => {
  const colors = SIGNAL_COLORS[signal];

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{signal}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'center',
  },
  text: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
