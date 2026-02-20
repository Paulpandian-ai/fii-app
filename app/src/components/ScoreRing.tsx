import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface ScoreRingProps {
  score: number; // 1–10
  size?: number;
}

const getScoreColor = (score: number): string => {
  if (score <= 3) return '#EF4444';  // red
  if (score <= 6) return '#F59E0B';  // amber
  return '#10B981';                  // green
};

export const ScoreRing: React.FC<ScoreRingProps> = ({ score: rawScore, size = 120 }) => {
  const score = typeof rawScore === 'number' && !Number.isNaN(rawScore) ? rawScore : 0;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 10) * circumference;
  const color = getScoreColor(score);
  const center = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]} accessibilityLabel={`FII Score ${score.toFixed(1)} out of 10`}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${progress} ${circumference - progress}`}
          strokeDashoffset={circumference / 4}
          strokeLinecap="round"
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View style={styles.labelContainer}>
        <Text style={[styles.score, { color, fontSize: size * 0.3 }]}>
          {score.toFixed(1)}
        </Text>
        <Text style={styles.label}>FII Score</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  score: {
    fontWeight: '800',
  },
  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});
