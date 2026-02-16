import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Prescription } from '../types';

interface Props {
  prescriptions: Prescription[];
  isLoading: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: '#EF4444',
  medium: '#FBBF24',
  low: '#10B981',
};

const SEVERITY_BG: Record<string, string> = {
  high: 'rgba(239,68,68,0.1)',
  medium: 'rgba(251,191,36,0.1)',
  low: 'rgba(16,185,129,0.1)',
};

export const DiversificationCoach: React.FC<Props> = ({
  prescriptions,
  isLoading,
}) => {
  if (!prescriptions.length && !isLoading) return null;

  const handleApply = (rx: Prescription) => {
    Alert.alert(
      'Apply Prescription',
      `${rx.prescription}\n\nExpected impact: ${rx.impact}`,
      [{ text: 'Later' }, { text: 'Apply', style: 'default' }]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="fitness" size={22} color="#8B5CF6" />
        <Text style={styles.sectionTitle}>AI Diversification Coach</Text>
      </View>
      <Text style={styles.sectionSubtitle}>
        Personalized prescriptions for your portfolio
      </Text>

      {isLoading ? (
        <ActivityIndicator
          color="#8B5CF6"
          style={{ marginVertical: 30 }}
        />
      ) : (
        <View style={styles.rxList}>
          {prescriptions.map((rx) => {
            const color = SEVERITY_COLORS[rx.severity] ?? '#60A5FA';
            const bg = SEVERITY_BG[rx.severity] ?? 'rgba(96,165,250,0.1)';
            return (
              <View
                key={rx.id}
                style={[styles.rxCard, { borderColor: `${color}30` }]}
              >
                <View style={styles.rxHeader}>
                  <View style={[styles.rxIconWrap, { backgroundColor: bg }]}>
                    <Ionicons
                      name={
                        (rx.icon as keyof typeof Ionicons.glyphMap) ||
                        'medical'
                      }
                      size={20}
                      color={color}
                    />
                  </View>
                  <View style={styles.rxTitleWrap}>
                    <Text style={styles.rxTitle}>{rx.title}</Text>
                    <View
                      style={[
                        styles.severityBadge,
                        { backgroundColor: bg },
                      ]}
                    >
                      <Text style={[styles.severityText, { color }]}>
                        {rx.severity}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.diagnosisBox}>
                  <Text style={styles.diagnosisLabel}>Diagnosis</Text>
                  <Text style={styles.diagnosisText}>{rx.diagnosis}</Text>
                </View>

                <View style={styles.prescriptionBox}>
                  <Text style={styles.prescriptionLabel}>Prescription</Text>
                  <Text style={styles.prescriptionText}>
                    {rx.prescription}
                  </Text>
                </View>

                <Text style={styles.impactText}>
                  Expected impact: {rx.impact}
                </Text>

                <TouchableOpacity
                  style={[styles.applyButton, { borderColor: `${color}40` }]}
                  onPress={() => handleApply(rx)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pulse" size={16} color={color} />
                  <Text style={[styles.applyButtonText, { color }]}>
                    Apply Treatment
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
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
  rxList: {
    gap: 14,
  },
  rxCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
  },
  rxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  rxIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rxTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rxTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  severityBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  diagnosisBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  diagnosisLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  diagnosisText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 18,
  },
  prescriptionBox: {
    backgroundColor: 'rgba(139,92,246,0.06)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  prescriptionLabel: {
    color: '#8B5CF6',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  prescriptionText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    lineHeight: 18,
  },
  impactText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
