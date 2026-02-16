import React, { useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ScenarioCard } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 64;

interface Props {
  scenarios: ScenarioCard[];
  isLoading: boolean;
}

export const ScenarioBattles: React.FC<Props> = ({ scenarios, isLoading }) => {
  const scrollRef = useRef<ScrollView>(null);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>What If?</Text>
        <ActivityIndicator color="#60A5FA" style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (!scenarios.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>What If?</Text>
      <Text style={styles.sectionSubtitle}>Scenario battles for your portfolio</Text>

      <ScrollView
        ref={scrollRef}
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + 16}
        decelerationRate="fast"
        contentContainerStyle={styles.carouselContent}
      >
        {scenarios.map((sc) => (
          <View
            key={sc.id}
            style={[styles.card, { borderLeftColor: sc.color }]}
          >
            <View style={styles.cardHeader}>
              <Ionicons
                name={(sc.icon as keyof typeof Ionicons.glyphMap) || 'help-circle'}
                size={22}
                color={sc.color}
              />
              <Text style={styles.cardTitle} numberOfLines={2}>
                {sc.title}
              </Text>
            </View>

            <Text style={styles.cardDescription}>{sc.description}</Text>

            {/* Impact comparison */}
            <View style={styles.impactRow}>
              <View style={styles.impactBlock}>
                <Text style={styles.impactLabel}>Your Portfolio</Text>
                <Text
                  style={[
                    styles.impactValue,
                    { color: sc.portfolioImpact >= 0 ? '#10B981' : '#EF4444' },
                  ]}
                >
                  {sc.portfolioImpact >= 0 ? '+' : ''}
                  {sc.portfolioImpact.toFixed(1)}%
                </Text>
              </View>

              <View style={styles.impactDivider} />

              <View style={styles.impactBlock}>
                <Text style={styles.impactLabel}>S&P 500</Text>
                <Text
                  style={[
                    styles.impactValue,
                    { color: sc.sp500Impact >= 0 ? '#10B981' : '#EF4444' },
                  ]}
                >
                  {sc.sp500Impact >= 0 ? '+' : ''}
                  {sc.sp500Impact.toFixed(1)}%
                </Text>
              </View>
            </View>

            {/* Verdict */}
            <View style={[styles.verdictBadge, { backgroundColor: sc.color + '20' }]}>
              <Text style={[styles.verdictText, { color: sc.color }]}>
                {sc.verdict}
              </Text>
            </View>

            {/* Best/Worst performers */}
            {(sc.bestPerformer || sc.worstPerformer) && (
              <View style={styles.performersRow}>
                {sc.bestPerformer && (
                  <View style={styles.performerChip}>
                    <Ionicons name="arrow-up" size={12} color="#10B981" />
                    <Text style={styles.performerText}>
                      {sc.bestPerformer.ticker} {sc.bestPerformer.impact > 0 ? '+' : ''}
                      {sc.bestPerformer.impact.toFixed(1)}%
                    </Text>
                  </View>
                )}
                {sc.worstPerformer && (
                  <View style={styles.performerChip}>
                    <Ionicons name="arrow-down" size={12} color="#EF4444" />
                    <Text style={styles.performerText}>
                      {sc.worstPerformer.ticker} {sc.worstPerformer.impact > 0 ? '+' : ''}
                      {sc.worstPerformer.impact.toFixed(1)}%
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginHorizontal: 16,
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 16,
  },
  carouselContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  cardDescription: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  impactBlock: {
    flex: 1,
    alignItems: 'center',
  },
  impactLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  impactValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  impactDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  verdictBadge: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  verdictText: {
    fontSize: 13,
    fontWeight: '600',
  },
  performersRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  performerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  performerText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
});
