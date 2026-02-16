import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { FullOptimizationResult, ProjectionResult } from '../types';

interface Props {
  optimization: FullOptimizationResult | null;
  projection: ProjectionResult | null;
}

export const ShareResults: React.FC<Props> = ({ optimization, projection }) => {
  if (!optimization) return null;

  const handleShare = async () => {
    try {
      const opt = optimization.optimized;
      const curr = optimization.currentPortfolio;
      const stats = projection?.finalStats;

      let message = `My FII Wealth Simulation\n\n`;
      message += `Portfolio Sharpe Ratio: ${opt.sharpeRatio.toFixed(2)}\n`;
      message += `Expected Return: ${opt.expectedReturn.toFixed(1)}%\n`;
      message += `Risk: ${opt.expectedVolatility.toFixed(1)}%\n`;

      if (stats) {
        message += `\nMonte Carlo (${projection!.years}yr):\n`;
        message += `  Best: $${stats.best.toLocaleString()}\n`;
        message += `  Likely: $${stats.likely.toLocaleString()}\n`;
        message += `  Worst: $${stats.worst.toLocaleString()}\n`;
      }

      message += `\nRun your own simulation at factorimpact.app`;

      await Share.share({
        message,
        title: 'FII Wealth Simulation',
      });
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        Alert.alert('Share failed', 'Could not share your simulation results');
      }
    }
  };

  const opt = optimization.optimized;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Share Your Simulation</Text>

      <TouchableOpacity onPress={handleShare} activeOpacity={0.8}>
        <LinearGradient
          colors={['#1A1A2E', '#16213E', '#0F3460']}
          style={styles.shareCard}
        >
          <Text style={styles.cardBrand}>FII WEALTH SIMULATOR</Text>

          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Sharpe</Text>
              <Text style={[styles.statValue, { color: '#FBBF24' }]}>
                {opt.sharpeRatio.toFixed(2)}
              </Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Return</Text>
              <Text style={[styles.statValue, { color: '#10B981' }]}>
                {opt.expectedReturn.toFixed(1)}%
              </Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Risk</Text>
              <Text style={[styles.statValue, { color: '#60A5FA' }]}>
                {opt.expectedVolatility.toFixed(1)}%
              </Text>
            </View>
          </View>

          {projection?.finalStats && (
            <Text style={styles.mcLine}>
              Monte Carlo median ({projection.years}yr): $
              {projection.finalStats.likely.toLocaleString()}
            </Text>
          )}

          <Text style={styles.ctaLine}>Run your own at factorimpact.app</Text>

          <View style={styles.shareIconRow}>
            <Ionicons name="share-social" size={20} color="#60A5FA" />
            <Text style={styles.shareText}>Tap to share</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginHorizontal: 16,
    marginBottom: 100,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  shareCard: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.2)',
  },
  cardBrand: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statBlock: {
    alignItems: 'center',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  mcLine: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  ctaLine: {
    color: 'rgba(96,165,250,0.6)',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  shareIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
  },
});
