import { create } from 'zustand';
import type { DailyBriefingData, DisciplineScoreData, AchievementsData, WeeklyRecapData, ChatMessage } from '@/types';
import * as api from '@/lib/api';

interface CoachStore {
  daily: DailyBriefingData | null;
  score: DisciplineScoreData | null;
  achievements: AchievementsData | null;
  weekly: WeeklyRecapData | null;
  chatMessages: ChatMessage[];
  isLoading: boolean;
  loadDaily: () => Promise<void>;
  loadScore: () => Promise<void>;
  loadAchievements: () => Promise<void>;
  loadWeekly: () => Promise<void>;
  loadAll: () => Promise<void>;
  addChatMessage: (msg: ChatMessage) => void;
}

export const useCoachStore = create<CoachStore>((set, get) => ({
  daily: null,
  score: null,
  achievements: null,
  weekly: null,
  chatMessages: [],
  isLoading: false,

  loadDaily: async () => {
    try {
      const data = await api.getCoachDaily() as DailyBriefingData;
      set({ daily: data });
    } catch { /* ignore */ }
  },

  loadScore: async () => {
    try {
      const data = await api.getCoachScore() as DisciplineScoreData;
      set({ score: data });
    } catch { /* ignore */ }
  },

  loadAchievements: async () => {
    try {
      const data = await api.getCoachAchievements() as AchievementsData;
      set({ achievements: data });
    } catch { /* ignore */ }
  },

  loadWeekly: async () => {
    try {
      const data = await api.getCoachWeekly() as WeeklyRecapData;
      set({ weekly: data });
    } catch { /* ignore */ }
  },

  loadAll: async () => {
    set({ isLoading: true });
    const { loadDaily, loadScore, loadAchievements, loadWeekly } = get();
    await Promise.allSettled([loadDaily(), loadScore(), loadAchievements(), loadWeekly()]);
    set({ isLoading: false });
  },

  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
}));
