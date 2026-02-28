import { create } from 'zustand';
import type { DailyBriefingData, DisciplineScoreData, AchievementsData, WeeklyRecapData, ChatMessage, LearningPath } from '@/types';
import * as api from '@/lib/api';

interface CoachStore {
  daily: DailyBriefingData | null;
  score: DisciplineScoreData | null;
  achievements: AchievementsData | null;
  weekly: WeeklyRecapData | null;
  learningPaths: LearningPath[];
  chatMessages: ChatMessage[];
  isLoading: boolean;
  loadDaily: () => Promise<void>;
  loadScore: () => Promise<void>;
  loadAchievements: () => Promise<void>;
  loadWeekly: () => Promise<void>;
  loadLearningPaths: () => Promise<void>;
  loadAll: () => Promise<void>;
  addChatMessage: (msg: ChatMessage) => void;
}

export const useCoachStore = create<CoachStore>((set, get) => ({
  daily: null,
  score: null,
  achievements: null,
  weekly: null,
  learningPaths: [],
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

  loadLearningPaths: async () => {
    try {
      const data = await api.getUserPreferences() as { learningPaths?: LearningPath[] };
      if (data.learningPaths) set({ learningPaths: data.learningPaths });
    } catch { /* ignore */ }
  },

  loadAll: async () => {
    set({ isLoading: true });
    const { loadDaily, loadScore, loadAchievements, loadWeekly, loadLearningPaths } = get();
    await Promise.allSettled([loadDaily(), loadScore(), loadAchievements(), loadWeekly(), loadLearningPaths()]);
    set({ isLoading: false });
  },

  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
}));
