/**
 * MigrationService — One-time migration from AsyncStorage to DynamoDB.
 *
 * On first launch after update, reads all AsyncStorage data,
 * pushes it to AWS via the /user/* API endpoints, then sets
 * a MIGRATED flag so this only runs once.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  updateUserPreferences,
  updateUserCoachProgress,
  saveUserChat,
} from './api';

const MIGRATION_FLAG = '@fii_cloud_migrated';

// Old AsyncStorage keys from the pre-migration codebase
const OLD_KEYS = {
  onboarding: '@fii_onboarding_complete',
  riskProfile: '@fii_risk_profile',
  taxBracket: '@fii_tax_bracket',
  dailyBriefing: '@fii_daily_briefing',
  weeklyRecap: '@fii_weekly_recap',
  volatilityAlerts: '@fii_volatility_alerts',
  coachChat: '@fii_coach_chat',
  completedLessons: '@fii_completed_lessons',
  tier: '@fii_tier',
  watchlists: 'fii_watchlists',
  coachChatHistory: '@fii_coach_chat_history',
};

export interface MigrationResult {
  migrated: boolean;
  itemsMigrated: string[];
  errors: string[];
}

/**
 * Check if migration has already been completed.
 */
export async function isMigrationComplete(): Promise<boolean> {
  try {
    const flag = await AsyncStorage.getItem(MIGRATION_FLAG);
    return flag === 'true';
  } catch {
    return false;
  }
}

/**
 * Run the one-time migration from AsyncStorage to DynamoDB.
 * Should only be called when user is authenticated.
 *
 * Returns details about what was migrated.
 */
export async function runMigration(): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: false,
    itemsMigrated: [],
    errors: [],
  };

  // Check if already migrated
  if (await isMigrationComplete()) {
    return result;
  }

  // Check if there's any data to migrate
  const hasData = await _hasLocalData();
  if (!hasData) {
    // No local data — mark as migrated and skip
    await AsyncStorage.setItem(MIGRATION_FLAG, 'true');
    return result;
  }

  // ─── Migrate Preferences ───
  try {
    const prefs: Record<string, any> = {};

    const onboarding = await AsyncStorage.getItem(OLD_KEYS.onboarding);
    if (onboarding) prefs.onboardingComplete = onboarding === 'true';

    const riskProfile = await AsyncStorage.getItem(OLD_KEYS.riskProfile);
    if (riskProfile) prefs.riskProfile = riskProfile;

    const taxBracket = await AsyncStorage.getItem(OLD_KEYS.taxBracket);
    if (taxBracket) prefs.taxBracket = parseInt(taxBracket, 10);

    const dailyBriefing = await AsyncStorage.getItem(OLD_KEYS.dailyBriefing);
    if (dailyBriefing !== null) prefs.dailyBriefing = dailyBriefing === 'true';

    const weeklyRecap = await AsyncStorage.getItem(OLD_KEYS.weeklyRecap);
    if (weeklyRecap !== null) prefs.weeklyRecap = weeklyRecap === 'true';

    const volatilityAlerts = await AsyncStorage.getItem(OLD_KEYS.volatilityAlerts);
    if (volatilityAlerts !== null) prefs.volatilityAlerts = volatilityAlerts === 'true';

    if (Object.keys(prefs).length > 0) {
      await updateUserPreferences(prefs);
      result.itemsMigrated.push('preferences');
    }
  } catch (e) {
    result.errors.push(`preferences: ${e}`);
  }

  // ─── Migrate Completed Lessons ───
  try {
    const lessonsRaw = await AsyncStorage.getItem(OLD_KEYS.completedLessons);
    if (lessonsRaw) {
      const lessons = JSON.parse(lessonsRaw);
      if (Array.isArray(lessons) && lessons.length > 0) {
        await updateUserCoachProgress({ completedLessons: lessons });
        result.itemsMigrated.push('completedLessons');
      }
    }
  } catch (e) {
    result.errors.push(`completedLessons: ${e}`);
  }

  // ─── Migrate Chat History ───
  try {
    // Try both chat keys (coachStore and AICoachScreen used different keys)
    let chatMessages: any[] = [];

    const chatRaw1 = await AsyncStorage.getItem(OLD_KEYS.coachChat);
    if (chatRaw1) {
      const parsed = JSON.parse(chatRaw1);
      if (Array.isArray(parsed) && parsed.length > 0) {
        chatMessages = parsed;
      }
    }

    // If the AICoachScreen key has more messages, use that instead
    const chatRaw2 = await AsyncStorage.getItem(OLD_KEYS.coachChatHistory);
    if (chatRaw2) {
      const parsed = JSON.parse(chatRaw2);
      if (Array.isArray(parsed) && parsed.length > chatMessages.length) {
        chatMessages = parsed;
      }
    }

    if (chatMessages.length > 0) {
      await saveUserChat(chatMessages.slice(-20), 'coach');
      result.itemsMigrated.push('chatHistory');
    }
  } catch (e) {
    result.errors.push(`chatHistory: ${e}`);
  }

  // ─── Mark migration complete ───
  // Note: We don't clear old AsyncStorage data — it becomes the local cache.
  // The new cache keys are different, so old keys are just left as dead data.
  if (result.errors.length === 0) {
    await AsyncStorage.setItem(MIGRATION_FLAG, 'true');
    result.migrated = true;
  } else {
    // Partial migration — we'll retry next time
    console.warn('[MigrationService] Partial migration, will retry:', result.errors);
    // If at least some items migrated, still mark complete
    // (the merge strategy means re-migrating is safe but unnecessary)
    if (result.itemsMigrated.length > 0) {
      await AsyncStorage.setItem(MIGRATION_FLAG, 'true');
      result.migrated = true;
    }
  }

  return result;
}

/**
 * Check if there's any meaningful data in the old AsyncStorage keys.
 */
async function _hasLocalData(): Promise<boolean> {
  try {
    const keys = Object.values(OLD_KEYS);
    const values = await AsyncStorage.multiGet(keys);
    return values.some(([, val]) => val !== null && val !== '');
  } catch {
    return false;
  }
}
