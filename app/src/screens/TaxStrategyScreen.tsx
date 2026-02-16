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
import { TaxDoctor } from '../components/TaxDoctor';

export const TaxStrategyScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const {
    taxHarvest,
    isTaxLoading,
    taxBracket,
    setTaxBracket,
    loadTaxHarvest,
    hasRun,
  } = useStrategyStore();

  const handleBracketChange = useCallback(
    (bracket: number) => {
      setTaxBracket(bracket);
    },
    [setTaxBracket]
  );

  const handleTaxRefresh = useCallback(
    (bracket: number) => {
      loadTaxHarvest(bracket);
    },
    [loadTaxHarvest]
  );

  // Auto-load if not already loaded
  const handleLoad = useCallback(() => {
    if (!taxHarvest && !isTaxLoading) {
      loadTaxHarvest(taxBracket);
    }
  }, [taxHarvest, isTaxLoading, loadTaxHarvest, taxBracket]);

  React.useEffect(() => {
    handleLoad();
  }, [handleLoad]);

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tax Strategy</Text>
        {isTaxLoading && <ActivityIndicator color="#10B981" size="small" />}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Explanatory header */}
        <View style={styles.explainerCard}>
          <Ionicons name="information-circle" size={20} color="#60A5FA" />
          <Text style={styles.explainerText}>
            FII scans your portfolio for tax-loss harvesting opportunities.
            Select your tax bracket to see potential savings.
          </Text>
        </View>

        {/* Steps guide */}
        <View style={styles.stepsContainer}>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.stepText}>Select your tax bracket below</Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={styles.stepText}>Review positions with unrealized losses</Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <Text style={styles.stepText}>Fill prescriptions to harvest tax savings</Text>
          </View>
        </View>

        <TaxDoctor
          taxHarvest={taxHarvest}
          isLoading={isTaxLoading}
          selectedBracket={taxBracket}
          onBracketChange={handleBracketChange}
          onRefresh={handleTaxRefresh}
        />

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
  explainerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(96,165,250,0.08)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.15)',
  },
  explainerText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  stepsContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 10,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
  },
  stepText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 20,
  },
});
