import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';

interface LastUpdatedProps {
  timestamp: number;
}

/**
 * Subtle "Updated Xs ago" text that re-renders every second.
 */
export const LastUpdated: React.FC<LastUpdatedProps> = ({ timestamp }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!timestamp) return null;

  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  let label: string;
  if (seconds < 5) {
    label = 'Just now';
  } else if (seconds < 60) {
    label = `Updated ${seconds}s ago`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    label = `Updated ${mins}m ago`;
  } else {
    const hrs = Math.floor(seconds / 3600);
    label = `Updated ${hrs}h ago`;
  }

  return <Text style={styles.text}>{label}</Text>;
};

const styles = StyleSheet.create({
  text: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
});
