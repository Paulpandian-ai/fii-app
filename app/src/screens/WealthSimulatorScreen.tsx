import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

import { usePortfolioStore } from '../store/portfolioStore';
import { useStrategyStore } from '../store/strategyStore';

import { WealthSimulatorHero } from '../components/WealthSimulatorHero';
import { ScenarioBattles } from '../components/ScenarioBattles';
import { RiskRewardMap } from '../components/RiskRewardMap';
import { BestPortfolio } from '../components/BestPortfolio';
import { RebalancingMoves } from '../components/RebalancingMoves';
import { TimeMachine } from '../components/TimeMachine';
import { BuildPortfolio } from '../components/BuildPortfolio';
import { ShareResults } from '../components/ShareResults';
import { DisclaimerBanner } from '../components/DisclaimerBanner';

type SectionId =
  | 'hero'
  | 'scenarios'
  | 'risk_map'
  | 'best_portfolio'
  | 'rebalancing'
  | 'time_machine'
  | 'build'
  | 'share';

interface SectionItem {
  id: SectionId;
}

const SECTIONS: SectionItem[] = [
  { id: 'hero' },
  { id: 'scenarios' },
  { id: 'risk_map' },
  { id: 'best_portfolio' },
  { id: 'rebalancing' },
  { id: 'time_machine' },
  { id: 'build' },
  { id: 'share' },
];

export const WealthSimulatorScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const listRef = useRef<FlatList>(null);

  const holdings = usePortfolioStore((s) => s.holdings);
  const totalValue = usePortfolioStore((s) => s.totalValue);
  const hasPortfolio = holdings.length >= 3;

  const {
    optimization,
    isOptimizing,
    projection,
    isProjecting,
    scenarios,
    isScenariosLoading,
    moves,
    isRebalancing,
    hasRun,
    runFullSimulation,
    loadProjection,
  } = useStrategyStore();

  const isAnyLoading = isOptimizing || isScenariosLoading || isRebalancing || isProjecting;

  const handleStartSimulation = useCallback(() => {
    const value = totalValue > 0 ? totalValue : 50000;
    runFullSimulation(value);
  }, [totalValue, runFullSimulation]);

  const handleGoToPortfolio = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleYearsChange = useCallback(
    (years: number) => {
      const value = totalValue > 0 ? totalValue : 50000;
      loadProjection(years, value);
    },
    [totalValue, loadProjection]
  );

  const scrollToOptimal = useCallback(() => {
    listRef.current?.scrollToIndex({ index: 3, animated: true });
  }, []);

  const renderSection = useCallback(
    ({ item }: { item: SectionItem }) => {
      switch (item.id) {
        case 'hero':
          return (
            <WealthSimulatorHero
              hasPortfolio={hasPortfolio}
              isRunning={isAnyLoading}
              onStartSimulation={handleStartSimulation}
              onGoToPortfolio={handleGoToPortfolio}
            />
          );
        case 'scenarios':
          if (!hasRun && !isScenariosLoading) return <View />;
          return (
            <ScenarioBattles scenarios={scenarios} isLoading={isScenariosLoading} />
          );
        case 'risk_map':
          if (!optimization) return <View />;
          return (
            <RiskRewardMap
              frontier={optimization.efficientFrontier}
              currentPortfolio={optimization.currentPortfolio}
              optimized={optimization.optimized}
              benchmarks={optimization.benchmarks}
              onTapOptimal={scrollToOptimal}
            />
          );
        case 'best_portfolio':
          if (!optimization) return <View />;
          return (
            <BestPortfolio
              optimized={optimization.optimized}
              currentPortfolio={optimization.currentPortfolio}
              allocation={optimization.allocation}
              moneyLeftOnTable={optimization.moneyLeftOnTable}
              portfolioValue={optimization.portfolioValue}
            />
          );
        case 'rebalancing':
          if (!hasRun && !isRebalancing) return <View />;
          return <RebalancingMoves moves={moves} isLoading={isRebalancing} />;
        case 'time_machine':
          if (!hasRun && !isProjecting) return <View />;
          return (
            <TimeMachine
              projection={projection}
              isLoading={isProjecting}
              onYearsChange={handleYearsChange}
            />
          );
        case 'build':
          return <BuildPortfolio />;
        case 'share':
          return <ShareResults optimization={optimization} projection={projection} />;
        default:
          return <View />;
      }
    },
    [
      hasPortfolio,
      isAnyLoading,
      handleStartSimulation,
      handleGoToPortfolio,
      hasRun,
      scenarios,
      isScenariosLoading,
      optimization,
      moves,
      isRebalancing,
      projection,
      isProjecting,
      handleYearsChange,
      scrollToOptimal,
    ]
  );

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wealth Simulator</Text>
        {isAnyLoading && <ActivityIndicator color="#60A5FA" size="small" />}
      </View>

      <FlatList
        ref={listRef}
        data={SECTIONS}
        keyExtractor={(item) => item.id}
        renderItem={renderSection}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        windowSize={5}
        ListFooterComponent={<DisclaimerBanner />}
      />
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
  listContent: {
    paddingBottom: 40,
  },
});
