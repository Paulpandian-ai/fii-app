import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SwipeHintProps {
  text?: string;
}

export const SwipeHint: React.FC<SwipeHintProps> = ({
  text = 'Tap for full analysis',
}) => {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -8,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [translateY]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{text}</Text>
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Ionicons name="chevron-up" size={20} color="rgba(255,255,255,0.5)" />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  text: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
});
