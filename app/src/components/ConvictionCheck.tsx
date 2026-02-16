import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  ticker: string;
  dropPct: number;
  historicalRecovery: number;
  fiiScore: number;
  signal: string;
  onHold: () => void;
  onSellAnyway: () => void;
}

export const ConvictionCheck: React.FC<Props> = ({
  visible,
  ticker,
  dropPct,
  historicalRecovery,
  fiiScore,
  signal,
  onHold,
  onSellAnyway,
}) => {
  const isBuyOrHold = signal === 'BUY' || signal === 'STRONG BUY' || signal === 'HOLD';
  const signalColor = isBuyOrHold ? '#10B981' : '#EF4444';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        <LinearGradient
          colors={['#1A1A2E', '#16213E']}
          style={styles.container}
        >
          <View style={styles.handle} />

          <Text style={styles.title}>
            Quick check before you sell {ticker}:
          </Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              {ticker} is down {Math.abs(dropPct ?? 0).toFixed(1)}% from its recent high.
            </Text>
            <Text style={styles.infoText}>
              Historically, holding through similar dips yielded +{(historicalRecovery ?? 0).toFixed(0)}% over the next 6 months.
            </Text>
            <Text style={styles.infoText}>
              Your FII score for {ticker} is {(fiiScore ?? 0).toFixed(1)}/10 ({signal}).
            </Text>
          </View>

          {/* Signal-based recommendation */}
          <View
            style={[
              styles.recommendCard,
              { borderColor: `${signalColor}30`, backgroundColor: `${signalColor}08` },
            ]}
          >
            <Ionicons
              name={isBuyOrHold ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={signalColor}
            />
            <Text style={[styles.recommendText, { color: signalColor }]}>
              {isBuyOrHold
                ? 'FII still rates this positively. Consider holding.'
                : 'FII agrees — this might be a good exit point.'}
            </Text>
          </View>

          {/* Action buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.holdButton}
              onPress={onHold}
              activeOpacity={0.8}
            >
              <Ionicons name="shield-checkmark" size={18} color="#FFFFFF" />
              <Text style={styles.holdButtonText}>I'll Hold</Text>
              <Text style={styles.scoreText}>+3</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sellButton}
              onPress={onSellAnyway}
              activeOpacity={0.7}
            >
              <Text style={styles.sellButtonText}>Sell Anyway</Text>
              <Text style={styles.scorePenalty}>-5</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.disclaimer}>
            Non-blocking — you can always proceed with your decision.
          </Text>
        </LinearGradient>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    marginBottom: 14,
  },
  infoText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 20,
  },
  recommendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
  },
  recommendText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  holdButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
  },
  holdButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  scoreText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  sellButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  sellButtonText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  scorePenalty: {
    color: 'rgba(239,68,68,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  disclaimer: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
