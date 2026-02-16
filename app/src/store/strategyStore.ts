import { create } from 'zustand';
import type {
  FullOptimizationResult,
  ProjectionResult,
  ScenarioCard,
  RebalanceMove,
  Achievement,
  DiversificationResult,
  TaxHarvestResult,
  Prescription,
  ReportCard,
} from '../types';
import {
  runOptimization,
  runProjection,
  runScenarios,
  runRebalance,
  getAchievements,
  runDiversification,
  runTaxHarvest,
  getAdvice,
  getReportCard,
} from '../services/api';

interface StrategyStore {
  // Optimization
  optimization: FullOptimizationResult | null;
  isOptimizing: boolean;

  // Projection (Time Machine)
  projection: ProjectionResult | null;
  isProjecting: boolean;

  // Scenarios
  scenarios: ScenarioCard[];
  isScenariosLoading: boolean;

  // Rebalancing
  moves: RebalanceMove[];
  isRebalancing: boolean;

  // Achievements
  achievements: Achievement[];

  // Diversification X-Ray
  diversification: DiversificationResult | null;
  isDiversifying: boolean;

  // Tax Doctor
  taxHarvest: TaxHarvestResult | null;
  isTaxLoading: boolean;
  taxBracket: number;

  // AI Advice
  advice: Prescription[];
  isAdviceLoading: boolean;

  // Report Card
  reportCard: ReportCard | null;
  isReportCardLoading: boolean;

  // General
  error: string | null;
  hasRun: boolean;

  // Actions
  loadOptimization: (portfolioValue?: number) => Promise<void>;
  loadProjection: (years: number, portfolioValue?: number) => Promise<void>;
  loadScenarios: () => Promise<void>;
  loadRebalance: () => Promise<void>;
  loadAchievements: () => Promise<void>;
  loadDiversification: () => Promise<void>;
  loadTaxHarvest: (bracket?: number) => Promise<void>;
  loadAdvice: () => Promise<void>;
  loadReportCard: () => Promise<void>;
  setTaxBracket: (bracket: number) => void;
  runFullSimulation: (portfolioValue?: number) => Promise<void>;
  clear: () => void;
}

export const useStrategyStore = create<StrategyStore>((set, get) => ({
  optimization: null,
  isOptimizing: false,
  projection: null,
  isProjecting: false,
  scenarios: [],
  isScenariosLoading: false,
  moves: [],
  isRebalancing: false,
  achievements: [],
  diversification: null,
  isDiversifying: false,
  taxHarvest: null,
  isTaxLoading: false,
  taxBracket: 24,
  advice: [],
  isAdviceLoading: false,
  reportCard: null,
  isReportCardLoading: false,
  error: null,
  hasRun: false,

  loadOptimization: async (portfolioValue) => {
    set({ isOptimizing: true, error: null });
    try {
      const data = await runOptimization(portfolioValue);
      if (data.error) {
        set({ isOptimizing: false, error: data.error });
      } else {
        set({ optimization: data, isOptimizing: false, hasRun: true });
      }
    } catch {
      set({ isOptimizing: false, error: 'Optimization failed' });
    }
  },

  loadProjection: async (years, portfolioValue) => {
    set({ isProjecting: true });
    try {
      const data = await runProjection(years, portfolioValue);
      set({ projection: data, isProjecting: false });
    } catch {
      set({ isProjecting: false, error: 'Projection failed' });
    }
  },

  loadScenarios: async () => {
    set({ isScenariosLoading: true });
    try {
      const data = await runScenarios();
      set({ scenarios: data.scenarios || [], isScenariosLoading: false });
    } catch {
      set({ isScenariosLoading: false });
    }
  },

  loadRebalance: async () => {
    set({ isRebalancing: true });
    try {
      const data = await runRebalance();
      set({ moves: data.moves || [], isRebalancing: false });
    } catch {
      set({ isRebalancing: false });
    }
  },

  loadAchievements: async () => {
    try {
      const data = await getAchievements();
      set({ achievements: data.achievements || [] });
    } catch {
      // silent
    }
  },

  loadDiversification: async () => {
    set({ isDiversifying: true });
    try {
      const data = await runDiversification();
      set({ diversification: data, isDiversifying: false });
    } catch {
      set({ isDiversifying: false });
    }
  },

  loadTaxHarvest: async (bracket) => {
    const b = bracket ?? get().taxBracket;
    set({ isTaxLoading: true });
    try {
      const data = await runTaxHarvest(b);
      set({ taxHarvest: data, isTaxLoading: false });
    } catch {
      set({ isTaxLoading: false });
    }
  },

  loadAdvice: async () => {
    set({ isAdviceLoading: true });
    try {
      const data = await getAdvice();
      set({ advice: data.prescriptions || [], isAdviceLoading: false });
    } catch {
      set({ isAdviceLoading: false });
    }
  },

  loadReportCard: async () => {
    set({ isReportCardLoading: true });
    try {
      const data = await getReportCard();
      set({ reportCard: data, isReportCardLoading: false });
    } catch {
      set({ isReportCardLoading: false });
    }
  },

  setTaxBracket: (bracket) => set({ taxBracket: bracket }),

  runFullSimulation: async (portfolioValue) => {
    const {
      loadOptimization,
      loadScenarios,
      loadRebalance,
      loadProjection,
      loadDiversification,
      loadTaxHarvest,
      loadAdvice,
    } = get();
    // Run all in parallel
    await Promise.all([
      loadOptimization(portfolioValue),
      loadScenarios(),
      loadRebalance(),
      loadProjection(5, portfolioValue),
      loadDiversification(),
      loadTaxHarvest(),
      loadAdvice(),
    ]);
  },

  clear: () =>
    set({
      optimization: null,
      isOptimizing: false,
      projection: null,
      isProjecting: false,
      scenarios: [],
      isScenariosLoading: false,
      moves: [],
      isRebalancing: false,
      diversification: null,
      isDiversifying: false,
      taxHarvest: null,
      isTaxLoading: false,
      advice: [],
      isAdviceLoading: false,
      reportCard: null,
      isReportCardLoading: false,
      error: null,
      hasRun: false,
    }),
}));
