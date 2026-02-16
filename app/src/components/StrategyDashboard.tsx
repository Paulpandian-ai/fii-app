import React, { useCallback } from 'react';
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
import type { ReportCard } from '../types';

interface Props {
  reportCard: ReportCard | null;
  isLoading: boolean;
  onRefresh: () => void;
}

const GRADE_COLORS: Record<string, string> = {
  'A+': '#10B981',
  A: '#10B981',
  'A-': '#34D399',
  'B+': '#34D399',
  B: '#FBBF24',
  'B-': '#FBBF24',
  'C+': '#F59E0B',
  C: '#F59E0B',
  'C-': '#F97316',
  D: '#EF4444',
  F: '#EF4444',
};

export const StrategyDashboard: React.FC<Props> = ({
  reportCard,
  isLoading,
  onRefresh,
}) => {
  if (!reportCard && !isLoading) return null;

  const handleShare = useCallback(async () => {
    if (!reportCard) return;
    try {
      let message = 'My FII Strategy Report Card\n\n';
      message += `Overall Grade: ${reportCard.overall} (${reportCard.overallScore}/100)\n\n`;
      for (const g of reportCard.grades) {
        message += `${g.category}: ${g.grade} — ${g.comment}\n`;
      }
      message += '\nRun your own analysis at factorimpact.app';
      await Share.share({ message, title: 'FII Report Card' });
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        Alert.alert('Share failed', 'Could not share your report card');
      }
    }
  }, [reportCard]);

  const overall = reportCard?.overall ?? '?';
  const overallColor = GRADE_COLORS[overall] ?? '#60A5FA';
  const overallScore = reportCard?.overallScore ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="clipboard" size={22} color="#FBBF24" />
        <Text style={styles.sectionTitle}>Strategy Report Card</Text>
      </View>
      <Text style={styles.sectionSubtitle}>
        Your portfolio checkup summary
      </Text>

      {reportCard && (
        <>
          {/* Overall grade hero */}
          <LinearGradient
            colors={['#1A1A2E', '#16213E', '#0F3460']}
            style={styles.overallCard}
          >
            <Text style={styles.overallLabel}>OVERALL GRADE</Text>
            <Text style={[styles.overallGrade, { color: overallColor }]}>
              {overall}
            </Text>
            <Text style={styles.overallScore}>
              {overallScore}/100
            </Text>
          </LinearGradient>

          {/* Category grades */}
          <View style={styles.gradesList}>
            {(reportCard.grades || []).map((g) => {
              const color = GRADE_COLORS[g.grade] ?? '#60A5FA';
              const scorePct = Math.min(100, Math.max(0, g.score ?? 0));
              return (
                <View key={g.category} style={styles.gradeRow}>
                  <View style={styles.gradeLeft}>
                    <Text style={styles.gradeCategory}>{g.category}</Text>
                    <View style={styles.gradeBarTrack}>
                      <View
                        style={[
                          styles.gradeBarFill,
                          {
                            width: `${scorePct}%`,
                            backgroundColor: color,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.gradeComment}>{g.comment}</Text>
                  </View>
                  <View
                    style={[
                      styles.gradeCircle,
                      { borderColor: color },
                    ]}
                  >
                    <Text style={[styles.gradeText, { color }]}>
                      {g.grade}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={onRefresh}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={18} color="#60A5FA" />
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShare}
              activeOpacity={0.7}
            >
              <Ionicons name="share-social" size={18} color="#FFFFFF" />
              <Text style={styles.shareText}>Share Report Card</Text>
            </TouchableOpacity>
          </View>
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
  overallCard: {
    alignItems: 'center',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
  },
  overallLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8,
  },
  overallGrade: {
    fontSize: 64,
    fontWeight: '900',
  },
  overallScore: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  gradesList: {
    gap: 12,
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  gradeLeft: {
    flex: 1,
  },
  gradeCategory: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  gradeBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  gradeBarFill: {
    height: 4,
    borderRadius: 2,
  },
  gradeComment: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    lineHeight: 16,
  },
  gradeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: {
    fontSize: 16,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  refreshButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
    backgroundColor: 'rgba(96,165,250,0.08)',
  },
  refreshText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: '#8B5CF6',
  },
  shareText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
