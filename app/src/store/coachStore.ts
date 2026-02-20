import { create } from 'zustand';
import type {
  DailyBriefingData,
  DisciplineScoreData,
  AchievementsData,
  WeeklyRecapData,
} from '../types';
import {
  getCoachDaily,
  getCoachScore,
  getCoachAchievements,
  postCoachEvent,
  getCoachWeekly,
} from '../services/api';

interface CoachStore {
  daily: DailyBriefingData | null;
  isDailyLoading: boolean;
  dailyDismissed: boolean;

  score: DisciplineScoreData | null;
  isScoreLoading: boolean;

  achievements: AchievementsData | null;
  isAchievementsLoading: boolean;

  weekly: WeeklyRecapData | null;
  isWeeklyLoading: boolean;

  hasLoaded: boolean;

  loadDaily: () => Promise<void>;
  loadScore: () => Promise<void>;
  loadAchievements: () => Promise<void>;
  loadWeekly: () => Promise<void>;
  dismissDaily: () => void;
  logEvent: (event: string, amount?: number) => Promise<void>;
  loadAll: () => Promise<void>;
}

export const useCoachStore = create<CoachStore>((set, get) => ({
  daily: null,
  isDailyLoading: false,
  dailyDismissed: false,

  score: null,
  isScoreLoading: false,

  achievements: null,
  isAchievementsLoading: false,

  weekly: null,
  isWeeklyLoading: false,

  hasLoaded: false,

  loadDaily: async () => {
    set({ isDailyLoading: true });
    try {
      const data = await getCoachDaily();
      set({ daily: data ?? null, isDailyLoading: false });
    } catch (error) {
      console.error('[CoachStore] loadDaily failed:', error);
      set({ isDailyLoading: false });
    }
  },

  loadScore: async () => {
    set({ isScoreLoading: true });
    try {
      const data = await getCoachScore();
      set({ score: data ?? null, isScoreLoading: false });
    } catch (error) {
      console.error('[CoachStore] loadScore failed:', error);
      set({ isScoreLoading: false });
    }
  },

  loadAchievements: async () => {
    set({ isAchievementsLoading: true });
    try {
      const data = await getCoachAchievements();
      set({ achievements: data ?? null, isAchievementsLoading: false });
    } catch (error) {
      console.error('[CoachStore] loadAchievements failed:', error);
      set({ isAchievementsLoading: false });
    }
  },

  loadWeekly: async () => {
    set({ isWeeklyLoading: true });
    try {
      const data = await getCoachWeekly();
      set({ weekly: data ?? null, isWeeklyLoading: false });
    } catch (error) {
      console.error('[CoachStore] loadWeekly failed:', error);
      set({ isWeeklyLoading: false });
    }
  },

  dismissDaily: () => {
    set({ dailyDismissed: true });
    // Log briefing_read event
    get().logEvent('briefing_read');
  },

  logEvent: async (event, amount) => {
    try {
      await postCoachEvent(event, amount);
      // Refresh score after event
      get().loadScore();
      get().loadAchievements();
    } catch (error) {
      console.error('[CoachStore] logEvent failed:', error);
      // silent
    }
  },

  loadAll: async () => {
    const { loadDaily, loadScore, loadAchievements } = get();
    await Promise.all([loadDaily(), loadScore(), loadAchievements()]);
    set({ hasLoaded: true });
  },
}));
