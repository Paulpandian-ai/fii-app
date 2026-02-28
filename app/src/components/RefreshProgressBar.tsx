import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface RefreshProgressBarProps {
  /** Show the progress bar. */
  visible: boolean;
}

/**
 * Thin animated progress bar shown at the very top of the screen during data refresh.
 * Similar to Instagram's loading bar.
 */
export const RefreshProgressBar: React.FC<RefreshProgressBarProps> = ({ visible }) => {
  const widthAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      widthAnim.setValue(0);
      opacityAnim.setValue(1);
      Animated.loop(
        Animated.sequence([
          Animated.timing(widthAnim, { toValue: 0.7, duration: 800, useNativeDriver: false }),
          Animated.timing(widthAnim, { toValue: 0.3, duration: 400, useNativeDriver: false }),
        ]),
      ).start();
    } else {
      Animated.sequence([
        Animated.timing(widthAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
      ]).start();
    }
  }, [visible, widthAnim, opacityAnim]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.bar,
          {
            opacity: opacityAnim,
            width: widthAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 999,
    backgroundColor: 'transparent',
  },
  bar: {
    height: 2,
    backgroundColor: '#60A5FA',
  },
});
