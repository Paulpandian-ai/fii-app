import { create } from 'zustand';
import type {
  FullOptimizationResult,
  ProjectionResult,
  ScenarioCard,
  RebalanceMove,
  Achievement,
} from '../types';
import {
  runOptimization,
  runProjection,
  runScenarios,
  runRebalance,
  getAchievements,
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

  // General
  error: string | null;
  hasRun: boolean;

  // Actions
  loadOptimization: (portfolioValue?: number) => Promise<void>;
  loadProjection: (years: number, portfolioValue?: number) => Promise<void>;
  loadScenarios: () => Promise<void>;
  loadRebalance: () => Promise<void>;
  loadAchievements: () => Promise<void>;
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

  runFullSimulation: async (portfolioValue) => {
    const { loadOptimization, loadScenarios, loadRebalance, loadProjection } = get();
    // Run all in parallel
    await Promise.all([
      loadOptimization(portfolioValue),
      loadScenarios(),
      loadRebalance(),
      loadProjection(5, portfolioValue),
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
      error: null,
      hasRun: false,
    }),
}));
