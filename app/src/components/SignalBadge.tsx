import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ScoreLabel } from '../types';
import { SCORE_COLORS, getScoreLabel } from '../utils/scoreColors';

interface SignalBadgeProps {
  scoreLabel?: ScoreLabel;
  score?: number;
}

export const SignalBadge: React.FC<SignalBadgeProps> = React.memo(({ scoreLabel, score }) => {
  const label = scoreLabel ?? (score != null ? getScoreLabel(score) : 'Neutral');
  const bgColor = SCORE_COLORS[label] || SCORE_COLORS.Neutral;

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
});

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
    color: '#FFFFFF',
  },
});
