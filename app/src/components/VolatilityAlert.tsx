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
  spyDropPct: number;
  estimatedLoss: number;
  onStayCourse: () => void;
  onReviewLater: () => void;
  onReviewHoldings: () => void;
}

const formatMoney = (v: unknown): string => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  const abs = Math.abs(n);
  if (abs >= 1000000) return `$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
};

export const VolatilityAlert: React.FC<Props> = ({
  visible,
  spyDropPct,
  estimatedLoss,
  onStayCourse,
  onReviewLater,
  onReviewHoldings,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        <LinearGradient
          colors={['#0D1B3E', '#162544', '#1A2D5A']}
          style={styles.container}
        >
          {/* Calm header - not alarming */}
          <View style={styles.headerIcon}>
            <Ionicons name="shield" size={36} color="#60A5FA" />
          </View>

          <Text style={styles.title}>Market Update</Text>
          <Text style={styles.dropText}>
            S&P 500 is down {Math.abs(spyDropPct ?? 0).toFixed(1)}% today
          </Text>
          <Text style={styles.lossText}>
            Your portfolio: estimated -{formatMoney(estimatedLoss)}
          </Text>

          {/* Historical context */}
          <View style={styles.contextCard}>
            <Text style={styles.contextTitle}>Historical perspective:</Text>
            <Text style={styles.contextBody}>
              In the last 20 years, there have been 47 days like today.{'\n'}
              Average recovery: 23 trading days.
            </Text>
          </View>

          {/* FII signals message */}
          <View style={styles.signalCard}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.signalText}>
              Your FII signals haven't changed. Your analysis is still valid.
            </Text>
          </View>

          {/* Action buttons */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onStayCourse}
            activeOpacity={0.8}
          >
            <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Stay the Course</Text>
            <Text style={styles.scoreBonus}>+5 discipline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onReviewLater}
            activeOpacity={0.7}
          >
            <Ionicons name="time" size={18} color="#FBBF24" />
            <Text style={styles.secondaryButtonText}>Review in 24 Hours</Text>
            <Text style={styles.scoreBonusSmall}>+2</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tertiaryButton}
            onPress={onReviewHoldings}
            activeOpacity={0.7}
          >
            <Text style={styles.tertiaryButtonText}>Review My Holdings</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  container: {
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.2)',
  },
  headerIcon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(96,165,250,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  dropText: {
    color: '#60A5FA',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  lossText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  contextCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  contextTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  contextBody: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 20,
  },
  signalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.15)',
  },
  signalText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  scoreBonus: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
  },
  secondaryButtonText: {
    color: '#FBBF24',
    fontSize: 15,
    fontWeight: '600',
  },
  scoreBonusSmall: {
    color: 'rgba(251,191,36,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  tertiaryButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  tertiaryButtonText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: '500',
  },
});
