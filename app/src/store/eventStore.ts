import { create } from 'zustand';
import {
  getEventsForTicker,
  getEventsFeed,
  getSignalHistory,
  getAlerts,
  getNotificationPreferences,
  saveNotificationPreferences,
} from '../services/api';
import type {
  StockEvent,
  EventAlert,
  SignalHistoryPoint,
  NotificationPreferences,
} from '../types';

interface EventStore {
  // Event timeline per ticker
  tickerEvents: Record<string, StockEvent[]>;
  isLoadingEvents: boolean;

  // Global event feed
  feedEvents: StockEvent[];
  isLoadingFeed: boolean;

  // Alerts
  alerts: EventAlert[];
  isLoadingAlerts: boolean;
  unreadCount: number;

  // Signal history per ticker
  signalHistory: Record<string, SignalHistoryPoint[]>;
  isLoadingHistory: boolean;

  // Notification preferences
  preferences: NotificationPreferences;
  isLoadingPrefs: boolean;

  // Live event banner
  liveBannerEvent: StockEvent | null;
  showLiveBanner: boolean;

  // Actions
  loadEventsForTicker: (ticker: string, type?: string, impact?: string) => Promise<void>;
  loadEventsFeed: () => Promise<void>;
  loadAlerts: () => Promise<void>;
  loadSignalHistory: (ticker: string, days?: number) => Promise<void>;
  loadPreferences: () => Promise<void>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  setLiveBannerEvent: (event: StockEvent | null) => void;
  dismissLiveBanner: () => void;
}

const DEFAULT_PREFS: NotificationPreferences = {
  p0Critical: true,
  p1High: true,
  p2Medium: true,
  p3Low: false,
  quietHoursStart: 22,
  quietHoursEnd: 7,
  watchedTickers: [],
  mutedTickers: [],
};

export const useEventStore = create<EventStore>((set, get) => ({
  tickerEvents: {},
  isLoadingEvents: false,
  feedEvents: [],
  isLoadingFeed: false,
  alerts: [],
  isLoadingAlerts: false,
  unreadCount: 0,
  signalHistory: {},
  isLoadingHistory: false,
  preferences: DEFAULT_PREFS,
  isLoadingPrefs: false,
  liveBannerEvent: null,
  showLiveBanner: false,

  loadEventsForTicker: async (ticker, type, impact) => {
    set({ isLoadingEvents: true });
    try {
      const params: Record<string, string> = {};
      if (type) params.type = type;
      if (impact) params.impact = impact;
      const data = await getEventsForTicker(ticker, params);
      set((state) => ({
        tickerEvents: {
          ...state.tickerEvents,
          [ticker]: data.events || [],
        },
        isLoadingEvents: false,
      }));
    } catch {
      set({ isLoadingEvents: false });
    }
  },

  loadEventsFeed: async () => {
    set({ isLoadingFeed: true });
    try {
      const data = await getEventsFeed(50);
      const events: StockEvent[] = data.events || [];
      set({ feedEvents: events, isLoadingFeed: false });

      // Check for high-impact events to show as live banner
      const highImpact = events.find(
        (e) => e.impact === 'high' && _isRecent(e.timestamp, 30),
      );
      if (highImpact) {
        set({ liveBannerEvent: highImpact, showLiveBanner: true });
      }
    } catch {
      set({ isLoadingFeed: false });
    }
  },

  loadAlerts: async () => {
    set({ isLoadingAlerts: true });
    try {
      const data = await getAlerts(20);
      const alertsList: EventAlert[] = data.alerts || [];
      const unread = alertsList.filter((a) => !a.read).length;
      set({ alerts: alertsList, unreadCount: unread, isLoadingAlerts: false });
    } catch {
      set({ isLoadingAlerts: false });
    }
  },

  loadSignalHistory: async (ticker, days = 30) => {
    set({ isLoadingHistory: true });
    try {
      const data = await getSignalHistory(ticker, days);
      set((state) => ({
        signalHistory: {
          ...state.signalHistory,
          [ticker]: data.history || [],
        },
        isLoadingHistory: false,
      }));
    } catch {
      set({ isLoadingHistory: false });
    }
  },

  loadPreferences: async () => {
    set({ isLoadingPrefs: true });
    try {
      const data = await getNotificationPreferences();
      set({
        preferences: { ...DEFAULT_PREFS, ...data },
        isLoadingPrefs: false,
      });
    } catch {
      set({ isLoadingPrefs: false });
    }
  },

  updatePreferences: async (prefs) => {
    const current = get().preferences;
    const updated = { ...current, ...prefs };
    set({ preferences: updated });
    try {
      await saveNotificationPreferences(updated);
    } catch {
      // Revert on failure
      set({ preferences: current });
    }
  },

  setLiveBannerEvent: (event) => {
    set({ liveBannerEvent: event, showLiveBanner: event !== null });
  },

  dismissLiveBanner: () => {
    set({ showLiveBanner: false });
  },
}));

/** Check if a timestamp is within N minutes of now. */
function _isRecent(timestamp: string, minutes: number): boolean {
  try {
    const eventTime = new Date(timestamp).getTime();
    const now = Date.now();
    return now - eventTime < minutes * 60 * 1000;
  } catch {
    return false;
  }
}
