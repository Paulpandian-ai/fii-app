import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TaxHarvestResult } from '../types';

const TAX_BRACKETS = [10, 12, 22, 24, 32, 35, 37];

interface Props {
  taxHarvest: TaxHarvestResult | null;
  isLoading: boolean;
  selectedBracket: number;
  onBracketChange: (bracket: number) => void;
  onRefresh: (bracket: number) => void;
}

const formatMoney = (v: unknown): string => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export const TaxDoctor: React.FC<Props> = ({
  taxHarvest,
  isLoading,
  selectedBracket,
  onBracketChange,
  onRefresh,
}) => {
  if (!taxHarvest && !isLoading) return null;

  const handleBracketSelect = useCallback(
    (bracket: number) => {
      onBracketChange(bracket);
      onRefresh(bracket);
    },
    [onBracketChange, onRefresh]
  );

  const handleFillPrescription = useCallback(
    (ticker: string) => {
      Alert.alert(
        'Fill Prescription',
        `Harvest tax losses from ${ticker}?\nThis would realize the loss for tax purposes and swap into a similar position.`,
        [{ text: 'Cancel' }, { text: 'Harvest', style: 'destructive' }]
      );
    },
    []
  );

  const losses = taxHarvest?.losses ?? [];
  const totalSavings = taxHarvest?.totalTaxSavings ?? 0;
  const totalLoss = taxHarvest?.totalUnrealizedLoss ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="medkit" size={22} color="#10B981" />
        <Text style={styles.sectionTitle}>Tax Doctor</Text>
      </View>
      <Text style={styles.sectionSubtitle}>
        Tax-loss harvesting opportunities
      </Text>

      {/* Bracket selector */}
      <Text style={styles.bracketLabel}>Your Tax Bracket</Text>
      <View style={styles.bracketRow}>
        {TAX_BRACKETS.map((b) => (
          <TouchableOpacity
            key={b}
            style={[
              styles.bracketPill,
              selectedBracket === b && styles.bracketPillActive,
            ]}
            onPress={() => handleBracketSelect(b)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.bracketPillText,
                selectedBracket === b && styles.bracketPillTextActive,
              ]}
            >
              {b}%
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator
          color="#10B981"
          style={{ marginVertical: 30 }}
        />
      ) : (
        <>
          {/* Summary card */}
          {losses.length > 0 && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Unrealized Loss</Text>
                <Text style={[styles.summaryValue, { color: '#EF4444' }]}>
                  {formatMoney(totalLoss)}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Estimated Tax Savings</Text>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>
                  {formatMoney(totalSavings)}
                </Text>
              </View>
            </View>
          )}

          {/* Loss prescription cards */}
          {losses.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle" size={32} color="#10B981" />
              <Text style={styles.emptyTitle}>Clean Bill of Health</Text>
              <Text style={styles.emptyText}>
                No tax-loss harvesting opportunities found. Your portfolio
                positions are all in the green!
              </Text>
            </View>
          ) : (
            <View style={styles.lossList}>
              {losses.map((loss) => (
                <View key={loss.ticker} style={styles.lossCard}>
                  <View style={styles.lossHeader}>
                    <View style={styles.rxBadge}>
                      <Text style={styles.rxText}>Rx</Text>
                    </View>
                    <View style={styles.lossInfo}>
                      <Text style={styles.lossTicker}>{loss.ticker}</Text>
                      <Text style={styles.lossName} numberOfLines={1}>
                        {loss.companyName}
                      </Text>
                    </View>
                    <View style={styles.lossAmounts}>
                      <Text style={styles.lossAmount}>
                        {formatMoney(loss.unrealizedLoss)}
                      </Text>
                      <Text style={styles.savingsAmount}>
                        Save {formatMoney(loss.taxSavings)}
                      </Text>
                    </View>
                  </View>

                  {/* Cost basis vs current */}
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>
                      Cost: {formatMoney(loss.costBasis)}
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={14}
                      color="rgba(255,255,255,0.3)"
                    />
                    <Text style={styles.costLabel}>
                      Now: {formatMoney(loss.currentValue)}
                    </Text>
                  </View>

                  {/* Replacement suggestions */}
                  {loss.replacements && loss.replacements.length > 0 && (
                    <View style={styles.replacementsContainer}>
                      <Text style={styles.replacementsLabel}>
                        Wash-sale safe swaps:
                      </Text>
                      <View style={styles.replacementChips}>
                        {loss.replacements.slice(0, 3).map((r) => (
                          <View key={r.ticker} style={styles.replacementChip}>
                            <Text style={styles.replacementTicker}>
                              {r.ticker}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Fill prescription button */}
                  <TouchableOpacity
                    style={styles.fillButton}
                    onPress={() => handleFillPrescription(loss.ticker)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="bandage" size={16} color="#10B981" />
                    <Text style={styles.fillButtonText}>
                      Fill Prescription
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  bracketLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  bracketRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  bracketPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bracketPillActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: 'rgba(16,185,129,0.4)',
  },
  bracketPillText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  bracketPillTextActive: {
    color: '#10B981',
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 12,
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  emptyTitle: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  lossList: {
    gap: 12,
  },
  lossCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.15)',
  },
  lossHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  rxBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rxText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '800',
  },
  lossInfo: {
    flex: 1,
  },
  lossTicker: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  lossName: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 1,
  },
  lossAmounts: {
    alignItems: 'flex-end',
  },
  lossAmount: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '800',
  },
  savingsAmount: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    paddingVertical: 6,
  },
  costLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  replacementsContainer: {
    marginBottom: 10,
  },
  replacementsLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  replacementChips: {
    flexDirection: 'row',
    gap: 6,
  },
  replacementChip: {
    backgroundColor: 'rgba(96,165,250,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.2)',
  },
  replacementTicker: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
  },
  fillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  fillButtonText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
  },
});
