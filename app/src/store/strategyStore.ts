import { create } from 'zustand';
import type { StrategyResult, OptimizationResult, MonteCarloPoint } from '../types';

interface StrategyStore {
  result: StrategyResult | null;
  isRunning: boolean;
  error: string | null;
  setResult: (result: StrategyResult) => void;
  setRunning: (running: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useStrategyStore = create<StrategyStore>((set) => ({
  result: null,
  isRunning: false,
  error: null,

  setResult: (result) => set({ result, isRunning: false, error: null }),

  setRunning: (isRunning) => set({ isRunning }),

  setError: (error) => set({ error, isRunning: false }),

  clear: () => set({ result: null, isRunning: false, error: null }),
}));
