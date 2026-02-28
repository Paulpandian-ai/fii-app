import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';

interface PriceFlashProps {
  /** Current price — flash triggers when this changes. */
  price: number | null | undefined;
  /** Previous price for comparison. */
  previousPrice: number | null | undefined;
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Wraps children with a brief color flash animation when the price changes.
 * Green flash for price increase, red flash for price decrease.
 */
export const PriceFlash: React.FC<PriceFlashProps> = ({
  price,
  previousPrice,
  children,
  style,
}) => {
  const flashAnim = useRef(new Animated.Value(0)).current;
  const directionRef = useRef<'up' | 'down' | null>(null);
  const prevPriceRef = useRef(previousPrice ?? price);

  useEffect(() => {
    if (price == null || prevPriceRef.current == null) {
      prevPriceRef.current = price;
      return;
    }

    if (price !== prevPriceRef.current) {
      directionRef.current = price > prevPriceRef.current ? 'up' : 'down';
      prevPriceRef.current = price;

      flashAnim.setValue(1);
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: false,
      }).start();
    }
  }, [price, flashAnim]);

  const backgroundColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      'rgba(0,0,0,0)',
      directionRef.current === 'up'
        ? 'rgba(16,185,129,0.2)'
        : 'rgba(239,68,68,0.2)',
    ],
  });

  return (
    <Animated.View style={[styles.wrapper, style, { backgroundColor }]}>
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 6,
  },
});
