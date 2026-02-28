/**
 * SyncService — Write-through sync with local fallback.
 *
 * Strategy:
 * - On write: Update Zustand store immediately (optimistic), then sync to AWS in background.
 *   If AWS fails, queue for retry.
 * - On read: Load from Zustand store first (instant), then fetch from AWS to reconcile.
 *   AWS is source of truth.
 * - On app launch: Fetch all user data from AWS, populate stores.
 * - Offline support: Queue writes when offline, flush when back online.
 */

import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentSession } from './auth';
import {
  getUserPreferences,
  updateUserPreferences,
  getUserCoachProgress,
  updateUserCoachProgress,
  updateUserCoachPath,
  getUserChatHistory,
  saveUserChat,
  getUserSyncStatus,
} from './api';

// ─── Types ───

interface QueuedWrite {
  id: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data: any;
  timestamp: number;
  retries: number;
}

type SyncListener = (status: SyncStatus) => void;

export interface SyncStatus {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  isOnline: boolean;
  isAuthenticated: boolean;
}

// ─── Constants ───

const QUEUE_STORAGE_KEY = '@fii_sync_queue';
const LAST_SYNCED_KEY = '@fii_last_synced';
const MAX_RETRIES = 5;
const RETRY_DELAYS = [2000, 4000, 8000, 16000, 32000]; // exponential backoff

// ─── SyncService ───

class SyncService {
  private writeQueue: QueuedWrite[] = [];
  private isSyncing = false;
  private isOnline = true;
  private isAuthenticated = false;
  private lastSyncedAt: number | null = null;
  private listeners: Set<SyncListener> = new Set();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;

  /**
   * Initialize the sync service. Call once at app startup.
   * Sets up network monitoring, loads pending queue, and triggers initial sync.
   */
  async initialize(): Promise<void> {
    // Load persisted queue
    await this._loadQueue();

    // Load last synced timestamp
    const savedTs = await AsyncStorage.getItem(LAST_SYNCED_KEY).catch(() => null);
    if (savedTs) this.lastSyncedAt = parseInt(savedTs, 10);

    // Check auth state
    try {
      const session = await getCurrentSession();
      this.isAuthenticated = !!session?.idToken;
    } catch {
      this.isAuthenticated = false;
    }

    // Monitor network
    this.netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      const wasOffline = !this.isOnline;
      this.isOnline = !!state.isConnected;
      this._notifyListeners();
      // Flush queue when coming back online
      if (wasOffline && this.isOnline) {
        this.flushQueue();
      }
    });

    // Monitor app state — flush on foreground
    this.appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && this.isOnline && this.writeQueue.length > 0) {
        this.flushQueue();
      }
    });

    // Initial flush if there are pending writes
    if (this.writeQueue.length > 0 && this.isOnline && this.isAuthenticated) {
      this.flushQueue();
    }

    this._notifyListeners();
  }

  /**
   * Clean up listeners and timers.
   */
  destroy(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.listeners.clear();
  }

  /**
   * Update authentication state. Call after login/logout.
   */
  setAuthenticated(isAuth: boolean): void {
    this.isAuthenticated = isAuth;
    this._notifyListeners();
    if (isAuth && this.writeQueue.length > 0) {
      this.flushQueue();
    }
  }

  /**
   * Queue a write operation for background sync to AWS.
   * The caller should have already updated the Zustand store (optimistic update).
   */
  async syncToCloud(endpoint: string, method: 'POST' | 'PUT' | 'DELETE', data: any): Promise<void> {
    if (!this.isAuthenticated) {
      // Not logged in — skip cloud sync, data stays local only
      return;
    }

    const entry: QueuedWrite = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      endpoint,
      method,
      data,
      timestamp: Date.now(),
      retries: 0,
    };

    this.writeQueue.push(entry);
    await this._saveQueue();
    this._notifyListeners();

    // Try to flush immediately if online
    if (this.isOnline) {
      this.flushQueue();
    }
  }

  /**
   * Process all queued writes. Retries with exponential backoff on failure.
   */
  async flushQueue(): Promise<void> {
    if (this.isSyncing || !this.isOnline || !this.isAuthenticated || this.writeQueue.length === 0) {
      return;
    }

    this.isSyncing = true;
    this._notifyListeners();

    // Process queue items sequentially
    const completed: string[] = [];
    const failed: QueuedWrite[] = [];

    for (const entry of [...this.writeQueue]) {
      try {
        await this._executeWrite(entry);
        completed.push(entry.id);
      } catch (error) {
        entry.retries += 1;
        if (entry.retries >= MAX_RETRIES) {
          console.warn(`[SyncService] Dropping write after ${MAX_RETRIES} retries:`, entry.endpoint);
          completed.push(entry.id); // Remove from queue after max retries
        } else {
          failed.push(entry);
        }
      }
    }

    // Update queue
    this.writeQueue = this.writeQueue.filter(
      (e) => !completed.includes(e.id) && !failed.some((f) => f.id === e.id)
    );
    this.writeQueue.push(...failed);
    await this._saveQueue();

    if (completed.length > 0) {
      this.lastSyncedAt = Date.now();
      await AsyncStorage.setItem(LAST_SYNCED_KEY, String(this.lastSyncedAt)).catch(() => {});
    }

    this.isSyncing = false;
    this._notifyListeners();

    // Schedule retry if there are still failed items
    if (failed.length > 0) {
      const maxRetries = Math.max(...failed.map((f) => f.retries));
      const delay = RETRY_DELAYS[Math.min(maxRetries - 1, RETRY_DELAYS.length - 1)];
      this.flushTimer = setTimeout(() => this.flushQueue(), delay);
    }
  }

  /**
   * Fetch all user data from AWS and return it for store population.
   * This is the "initial load" on app startup or after login.
   */
  async fetchAllUserData(): Promise<{
    preferences: any;
    coachProgress: any;
    chatHistory: any;
  }> {
    if (!this.isAuthenticated || !this.isOnline) {
      return { preferences: null, coachProgress: null, chatHistory: null };
    }

    const [preferences, coachProgress, chatHistory] = await Promise.allSettled([
      getUserPreferences(),
      getUserCoachProgress(),
      getUserChatHistory('coach', 20),
    ]);

    this.lastSyncedAt = Date.now();
    await AsyncStorage.setItem(LAST_SYNCED_KEY, String(this.lastSyncedAt)).catch(() => {});
    this._notifyListeners();

    return {
      preferences: preferences.status === 'fulfilled' ? preferences.value : null,
      coachProgress: coachProgress.status === 'fulfilled' ? coachProgress.value : null,
      chatHistory: chatHistory.status === 'fulfilled' ? chatHistory.value : null,
    };
  }

  /**
   * Check if there are pending writes.
   */
  hasPendingSync(): boolean {
    return this.writeQueue.length > 0;
  }

  /**
   * Get current sync status.
   */
  getStatus(): SyncStatus {
    return {
      pendingCount: this.writeQueue.length,
      isSyncing: this.isSyncing,
      lastSyncedAt: this.lastSyncedAt,
      isOnline: this.isOnline,
      isAuthenticated: this.isAuthenticated,
    };
  }

  /**
   * Subscribe to sync status changes.
   */
  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    // Immediately notify with current status
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─── Private Methods ───

  private async _executeWrite(entry: QueuedWrite): Promise<void> {
    const { endpoint, data } = entry;

    // Route to appropriate API function based on endpoint
    if (endpoint === 'preferences') {
      await updateUserPreferences(data);
    } else if (endpoint === 'coach/progress') {
      await updateUserCoachProgress(data);
    } else if (endpoint.startsWith('coach/path/')) {
      const pathId = endpoint.replace('coach/path/', '');
      await updateUserCoachPath(pathId, data);
    } else if (endpoint === 'chat') {
      await saveUserChat(data.messages, data.context);
    } else {
      // Generic — the store-level code handles portfolio and watchlist
      // through existing API calls, not through SyncService queue
      console.warn(`[SyncService] Unknown endpoint: ${endpoint}`);
    }
  }

  private async _loadQueue(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (saved) {
        this.writeQueue = JSON.parse(saved);
      }
    } catch {
      this.writeQueue = [];
    }
  }

  private async _saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.writeQueue));
    } catch {
      // Silent fail — queue will be rebuilt on next write
    }
  }

  private _notifyListeners(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch {
        // Don't let listener errors break sync
      }
    }
  }
}

// Singleton instance
export const syncService = new SyncService();
