import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const StrategyScreen: React.FC = () => {
  return (
    <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Strategy</Text>
        <Text style={styles.subtitle}>
          Sharpe optimization and Monte Carlo simulation for your portfolio.
        </Text>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            Strategy engine coming in Prompt 5
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 8,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 16,
  },
});
