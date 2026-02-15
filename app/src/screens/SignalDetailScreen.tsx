import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ScoreRing } from '../components/ScoreRing';
import { SignalBadge } from '../components/SignalBadge';
import { FactorBar } from '../components/FactorBar';

export const SignalDetailScreen: React.FC = () => {
  // Placeholder data — will be populated from signalStore in future prompts
  const analysis = {
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    compositeScore: 8.2,
    signal: 'BUY' as const,
    factors: [
      { name: 'Supply Chain', score: 2.0 },
      { name: 'Macro Environment', score: -1.0 },
      { name: 'Price Performance', score: 1.5 },
      { name: 'Sentiment', score: 1.2 },
      { name: 'Fundamental', score: 1.8 },
      { name: 'SEC Filings', score: 0.5 },
    ],
    summary:
      'NVIDIA maintains a dominant position in the AI accelerator market with its H100 and upcoming B200 GPUs. Data center revenue grew 400%+ YoY, driven by hyperscaler demand and enterprise AI adoption. Supply constraints are easing while ASPs remain elevated. The macro backdrop presents modest headwinds with rate uncertainty, but AI infrastructure spending appears durable across economic scenarios.',
  };

  return (
    <LinearGradient colors={['#0D1B3E', '#1F3864']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ScoreRing score={analysis.compositeScore} size={100} />
          <Text style={styles.ticker}>{analysis.ticker}</Text>
          <Text style={styles.companyName}>{analysis.companyName}</Text>
          <SignalBadge signal={analysis.signal} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6-Factor Analysis</Text>
          {analysis.factors.map((f) => (
            <FactorBar key={f.name} factor={f} />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Summary</Text>
          <Text style={styles.summaryText}>{analysis.summary}</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  ticker: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 16,
  },
  companyName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 12,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  summaryText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 22,
  },
});
