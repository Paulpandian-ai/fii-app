import { create } from 'zustand';
import type {
  FullOptimizationResult, ProjectionResult, ScenarioCard,
  RebalanceMove, DiversificationResult, TaxHarvestResult,
  Prescription, ReportCard,
} from '@/types';
import * as api from '@/lib/api';

interface StrategyStore {
  optimization: FullOptimizationResult | null;
  projection: ProjectionResult | null;
  scenarios: ScenarioCard[];
  moves: RebalanceMove[];
  diversification: DiversificationResult | null;
  taxHarvest: TaxHarvestResult | null;
  advice: Prescription[];
  reportCard: ReportCard | null;
  isLoading: boolean;
  loadOptimization: (portfolioValue?: number) => Promise<void>;
  loadProjection: (years: number, portfolioValue?: number) => Promise<void>;
  loadScenarios: () => Promise<void>;
  loadRebalance: () => Promise<void>;
  loadDiversification: () => Promise<void>;
  loadTaxHarvest: (bracket?: number) => Promise<void>;
  loadAdvice: () => Promise<void>;
  loadReportCard: () => Promise<void>;
}

export const useStrategyStore = create<StrategyStore>((set) => ({
  optimization: null,
  projection: null,
  scenarios: [],
  moves: [],
  diversification: null,
  taxHarvest: null,
  advice: [],
  reportCard: null,
  isLoading: false,

  loadOptimization: async (portfolioValue) => {
    set({ isLoading: true });
    try {
      const data = await api.runOptimization(portfolioValue) as FullOptimizationResult;
      set({ optimization: data, isLoading: false });
    } catch { set({ isLoading: false }); }
  },

  loadProjection: async (years, portfolioValue) => {
    try {
      const data = await api.runProjection(years, portfolioValue) as ProjectionResult;
      set({ projection: data });
    } catch { /* ignore */ }
  },

  loadScenarios: async () => {
    try {
      const data = await api.runScenarios() as { scenarios: ScenarioCard[] };
      set({ scenarios: data.scenarios || [] });
    } catch { /* ignore */ }
  },

  loadRebalance: async () => {
    try {
      const data = await api.runRebalance() as { moves: RebalanceMove[] };
      set({ moves: data.moves || [] });
    } catch { /* ignore */ }
  },

  loadDiversification: async () => {
    try {
      const data = await api.runDiversification() as DiversificationResult;
      set({ diversification: data });
    } catch { /* ignore */ }
  },

  loadTaxHarvest: async (bracket = 32) => {
    try {
      const data = await api.runTaxHarvest(bracket) as TaxHarvestResult;
      set({ taxHarvest: data });
    } catch { /* ignore */ }
  },

  loadAdvice: async () => {
    try {
      const data = await api.getAdvice() as { prescriptions: Prescription[] };
      set({ advice: data.prescriptions || [] });
    } catch { /* ignore */ }
  },

  loadReportCard: async () => {
    try {
      const data = await api.getReportCard() as ReportCard;
      set({ reportCard: data });
    } catch { /* ignore */ }
  },
}));
