import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

import { useStrategyStore } from '../store/strategyStore';
import { DiversificationCoach } from '../components/DiversificationCoach';
import { StrategyDashboard } from '../components/StrategyDashboard';
import { DisclaimerBanner } from '../components/DisclaimerBanner';

export const AIAdvisorScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const {
    advice,
    isAdviceLoading,
    reportCard,
    isReportCardLoading,
    loadAdvice,
    loadReportCard,
  } = useStrategyStore();

  // Auto-load if not already loaded
  React.useEffect(() => {
    if (!advice.length && !isAdviceLoading) {
      loadAdvice();
    }
    if (!reportCard && !isReportCardLoading) {
      loadReportCard();
    }
  }, [advice.length, isAdviceLoading, loadAdvice, reportCard, isReportCardLoading, loadReportCard]);

  const handleReportCardRefresh = useCallback(() => {
    loadReportCard();
  }, [loadReportCard]);

  const isLoading = isAdviceLoading || isReportCardLoading;

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Advisor</Text>
        {isLoading && <ActivityIndicator color="#8B5CF6" size="small" />}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <DiversificationCoach
          prescriptions={advice}
          isLoading={isAdviceLoading}
        />

        <StrategyDashboard
          reportCard={reportCard}
          isLoading={isReportCardLoading}
          onRefresh={handleReportCardRefresh}
        />

        <DisclaimerBanner />
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  bottomSpacer: {
    height: 20,
  },
});
