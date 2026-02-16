import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  hasPortfolio: boolean;
  isRunning: boolean;
  onStartSimulation: () => void;
  onGoToPortfolio: () => void;
}

export const WealthSimulatorHero: React.FC<Props> = ({
  hasPortfolio,
  isRunning,
  onStartSimulation,
  onGoToPortfolio,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const star1 = useRef(new Animated.Value(0)).current;
  const star2 = useRef(new Animated.Value(0)).current;
  const star3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulsing button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Twinkling stars
    const twinkle = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.2,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();

    twinkle(star1, 0);
    twinkle(star2, 500);
    twinkle(star3, 1000);
  }, []);

  return (
    <LinearGradient
      colors={['#1A1A2E', '#16213E', '#0F3460']}
      style={styles.container}
    >
      {/* Subtle star particles */}
      <Animated.View style={[styles.star, { top: 20, left: 30, opacity: star1 }]} />
      <Animated.View style={[styles.star, { top: 50, right: 50, opacity: star2 }]} />
      <Animated.View style={[styles.star, { top: 35, left: '60%', opacity: star3 }]} />
      <Animated.View style={[styles.starSmall, { top: 65, left: '25%', opacity: star2 }]} />
      <Animated.View style={[styles.starSmall, { top: 15, right: '30%', opacity: star1 }]} />

      <Text style={styles.title}>Wealth Simulator</Text>
      <Text style={styles.subtitle}>
        Run 10,000 possible futures for your portfolio
      </Text>

      {hasPortfolio ? (
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.button, isRunning && styles.buttonRunning]}
            onPress={onStartSimulation}
            disabled={isRunning}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={isRunning ? ['#374151', '#4B5563'] : ['#10B981', '#059669']}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.buttonText}>
                {isRunning ? 'Running Simulation...' : 'Start Simulation'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <TouchableOpacity
          style={styles.lockedContainer}
          onPress={onGoToPortfolio}
          activeOpacity={0.7}
        >
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockText}>Add 3+ stocks to unlock</Text>
          <Text style={styles.lockLink}>Go to Portfolio →</Text>
        </TouchableOpacity>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 28,
    marginHorizontal: 16,
    marginTop: 8,
    overflow: 'hidden',
    minHeight: 180,
  },
  star: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  starSmall: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    marginBottom: 24,
    lineHeight: 20,
  },
  button: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonRunning: {
    shadowColor: '#4B5563',
    shadowOpacity: 0.2,
  },
  buttonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  lockedContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  lockIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  lockText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginBottom: 4,
  },
  lockLink: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
  },
});
