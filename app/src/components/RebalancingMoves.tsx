import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RebalanceMove } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 64;

interface Props {
  moves: RebalanceMove[];
  isLoading: boolean;
  onApplyMove?: (move: RebalanceMove) => void;
  onApplyAll?: () => void;
}

export const RebalancingMoves: React.FC<Props> = ({
  moves,
  isLoading,
  onApplyMove,
  onApplyAll,
}) => {
  const scrollRef = useRef<ScrollView>(null);

  if (!moves.length && !isLoading) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Rebalancing Moves</Text>
      <Text style={styles.sectionSubtitle}>
        Swipe through suggested portfolio adjustments
      </Text>

      <ScrollView
        ref={scrollRef}
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + 16}
        decelerationRate="fast"
        contentContainerStyle={styles.carouselContent}
      >
        {moves.map((move, idx) => (
          <View key={`${move.ticker}-${idx}`} style={styles.card}>
            {/* Direction indicator */}
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.directionBadge,
                  move.direction === 'increase'
                    ? styles.directionIncrease
                    : styles.directionDecrease,
                ]}
              >
                <Ionicons
                  name={move.direction === 'increase' ? 'arrow-up' : 'arrow-down'}
                  size={16}
                  color={move.direction === 'increase' ? '#10B981' : '#EF4444'}
                />
              </View>
              <View style={styles.tickerInfo}>
                <Text style={styles.ticker}>{move.ticker}</Text>
                <Text style={styles.companyName} numberOfLines={1}>
                  {move.companyName}
                </Text>
              </View>
              <View style={styles.signalChip}>
                <Text
                  style={[
                    styles.signalText,
                    {
                      color:
                        move.signal === 'BUY'
                          ? '#10B981'
                          : move.signal === 'SELL'
                          ? '#EF4444'
                          : '#FBBF24',
                    },
                  ]}
                >
                  {move.signal}
                </Text>
              </View>
            </View>

            {/* Weight change */}
            <View style={styles.weightRow}>
              <View style={styles.weightBlock}>
                <Text style={styles.weightLabel}>Current</Text>
                <Text style={styles.weightValue}>
                  {move.currentWeight.toFixed(1)}%
                </Text>
              </View>
              <Ionicons
                name="arrow-forward"
                size={18}
                color="rgba(255,255,255,0.3)"
              />
              <View style={styles.weightBlock}>
                <Text style={styles.weightLabel}>Optimal</Text>
                <Text
                  style={[
                    styles.weightValue,
                    {
                      color:
                        move.direction === 'increase' ? '#10B981' : '#EF4444',
                    },
                  ]}
                >
                  {move.optimalWeight.toFixed(1)}%
                </Text>
              </View>
            </View>

            {/* Reason */}
            <Text style={styles.reason}>{move.reason}</Text>

            {/* Apply button */}
            <TouchableOpacity
              style={styles.applyButton}
              onPress={() => {
                if (onApplyMove) {
                  onApplyMove(move);
                } else {
                  Alert.alert(
                    'Apply Move',
                    `${move.direction === 'increase' ? 'Increase' : 'Decrease'} ${move.ticker} from ${move.currentWeight.toFixed(1)}% to ${move.optimalWeight.toFixed(1)}%?`,
                    [{ text: 'Cancel' }, { text: 'Apply', style: 'default' }]
                  );
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.applyButtonText}>Apply This Move</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {/* Apply All button */}
      {moves.length > 1 && (
        <TouchableOpacity
          style={styles.applyAllButton}
          onPress={() => {
            if (onApplyAll) {
              onApplyAll();
            } else {
              Alert.alert(
                'Apply All Moves',
                `Apply all ${moves.length} rebalancing suggestions?`,
                [{ text: 'Cancel' }, { text: 'Apply All', style: 'default' }]
              );
            }
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.applyAllText}>Apply All {moves.length} Moves</Text>
        </TouchableOpacity>
      )}
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
    padding: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  directionBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionIncrease: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  directionDecrease: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  tickerInfo: {
    flex: 1,
  },
  ticker: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  companyName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 1,
  },
  signalChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  signalText: {
    fontSize: 12,
    fontWeight: '700',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    paddingVertical: 12,
  },
  weightBlock: {
    alignItems: 'center',
  },
  weightLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  weightValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  reason: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  applyButton: {
    backgroundColor: 'rgba(96,165,250,0.15)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
  },
  applyButtonText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
  },
  applyAllButton: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyAllText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
