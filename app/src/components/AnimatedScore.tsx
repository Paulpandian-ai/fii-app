import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

interface AnimatedScoreProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  style?: TextStyle;
  duration?: number;
}

/**
 * Animated score display that smoothly transitions between values.
 * Uses opacity fade for the transition effect.
 */
export const AnimatedScore: React.FC<AnimatedScoreProps> = React.memo(({
  value,
  decimals = 1,
  prefix = '',
  suffix = '',
  style,
  duration = 400,
}) => {
  const opacity = useRef(new Animated.Value(1)).current;
  const displayValue = useRef(value);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      // Fade out, update, fade in
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: duration / 2,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: duration / 2,
          useNativeDriver: true,
        }),
      ]).start();

      // Update display value at the midpoint
      setTimeout(() => {
        displayValue.current = value;
      }, duration / 2);

      prevValue.current = value;
    }
  }, [value, duration, opacity]);

  displayValue.current = value;
  const formatted = `${prefix}${value.toFixed(decimals)}${suffix}`;

  return (
    <Animated.Text style={[styles.text, style, { opacity }]}>
      {formatted}
    </Animated.Text>
  );
});

const styles = StyleSheet.create({
  text: {
    fontVariant: ['tabular-nums'],
  },
});
