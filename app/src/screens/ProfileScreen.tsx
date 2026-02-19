import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { UserProfile, RootStackParamList } from '../types';
import { getMyProfile, updateMyProfile } from '../services/api';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';

const RISK_OPTIONS = [
  { id: 'conservative', label: 'Conservative' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'aggressive', label: 'Aggressive' },
] as const;

const getLevelColor = (level: string): string => {
  switch (level?.toLowerCase()) {
    case 'diamond':
      return '#B9F2FF';
    case 'platinum':
      return '#E5E7EB';
    case 'gold':
      return '#FBBF24';
    case 'silver':
      return '#9CA3AF';
    case 'bronze':
      return '#CD7F32';
    default:
      return '#60A5FA';
  }
};

const formatJoinDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const getInitials = (name: string): string => {
  if (!name) return '??';
  return name.substring(0, 2).toUpperCase();
};

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable display name state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const nameInputRef = useRef<TextInput>(null);

  // Risk profile saving
  const [isSavingRisk, setIsSavingRisk] = useState(false);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMyProfile();
      setProfile(data);
      setEditedName(data.displayName ?? '');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Focus the input when editing starts
  useEffect(() => {
    if (isEditingName) {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isEditingName]);

  const handleStartEditName = useCallback(() => {
    if (profile) {
      setEditedName(profile.displayName);
      setIsEditingName(true);
    }
  }, [profile]);

  const handleSaveName = useCallback(async () => {
    const trimmed = editedName.trim();
    if (!trimmed || trimmed === profile?.displayName) {
      setIsEditingName(false);
      return;
    }
    setIsSavingName(true);
    try {
      const updated = await updateMyProfile({ displayName: trimmed });
      setProfile(updated);
      setIsEditingName(false);
    } catch {
      // Revert on failure
      setEditedName(profile?.displayName ?? '');
      setIsEditingName(false);
    } finally {
      setIsSavingName(false);
    }
  }, [editedName, profile]);

  const handleSelectRisk = useCallback(async (riskId: string) => {
    if (!profile || riskId === profile.riskProfile || isSavingRisk) return;
    setIsSavingRisk(true);
    // Optimistic update
    const previousProfile = profile;
    setProfile({ ...profile, riskProfile: riskId });
    try {
      const updated = await updateMyProfile({ riskProfile: riskId });
      setProfile(updated);
    } catch {
      // Revert on failure
      setProfile(previousProfile);
    } finally {
      setIsSavingRisk(false);
    }
  }, [profile, isSavingRisk]);

  // ─── Loading State ───
  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <View style={styles.avatarSkeletonWrap}>
        <Skeleton width={80} height={80} borderRadius={40} />
      </View>
      <Skeleton width={160} height={22} borderRadius={6} />
      <View style={{ height: 8 }} />
      <Skeleton width={120} height={14} borderRadius={4} />
      <View style={{ height: 24 }} />
      <Skeleton width="100%" height={16} borderRadius={4} />
      <View style={{ height: 16 }} />
      <View style={styles.statsGrid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.statCard}>
            <Skeleton width={48} height={28} borderRadius={6} />
            <View style={{ height: 6 }} />
            <Skeleton width={64} height={12} borderRadius={4} />
          </View>
        ))}
      </View>
      <View style={{ height: 24 }} />
      <Skeleton width={100} height={14} borderRadius={4} />
      <View style={{ height: 10 }} />
      <View style={styles.pillRow}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width={100} height={36} borderRadius={18} />
        ))}
      </View>
    </View>
  );

  // ─── Error State ───
  const renderError = () => (
    <ErrorState
      icon="warning"
      message="Couldn't load your profile"
      subtitle={error ?? undefined}
      onRetry={fetchProfile}
    />
  );

  // ─── Profile Content ───
  const renderProfile = () => {
    if (!profile) return null;

    const initials = getInitials(profile.displayName);
    const levelColor = getLevelColor(profile.level);

    return (
      <>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <LinearGradient
            colors={['#1E40AF', '#3B82F6']}
            style={styles.avatarCircle}
          >
            <Text style={styles.avatarInitials}>{initials}</Text>
          </LinearGradient>
        </View>

        {/* Display Name */}
        <View style={styles.nameSection}>
          {isEditingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                ref={nameInputRef}
                style={styles.nameInput}
                value={editedName}
                onChangeText={setEditedName}
                onBlur={handleSaveName}
                onSubmitEditing={handleSaveName}
                returnKeyType="done"
                maxLength={30}
                editable={!isSavingName}
                selectionColor="#60A5FA"
                placeholderTextColor="rgba(255,255,255,0.3)"
                placeholder="Display name"
              />
            </View>
          ) : (
            <View style={styles.nameDisplayRow}>
              <Text style={styles.displayName}>{profile.displayName}</Text>
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleStartEditName}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Join Date */}
        <Text style={styles.joinDate}>
          Joined {formatJoinDate(profile.joinDate)}
        </Text>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {/* Discipline Score */}
          <View style={styles.statCard}>
            <View style={styles.statValueRow}>
              <Text style={styles.statNumber}>{profile.disciplineScore}</Text>
              <View style={[styles.levelBadge, { backgroundColor: `${levelColor}20` }]}>
                <Text style={[styles.levelBadgeText, { color: levelColor }]}>
                  {profile.level}
                </Text>
              </View>
            </View>
            <Text style={styles.statLabel}>discipline score</Text>
          </View>

          {/* Streak */}
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{profile.streakDays}</Text>
            <Text style={styles.statLabel}>day streak</Text>
          </View>

          {/* Badges */}
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{profile.badgeCount}</Text>
            <Text style={styles.statLabel}>badges earned</Text>
          </View>

          {/* Posts */}
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{profile.postCount}</Text>
            <Text style={styles.statLabel}>posts</Text>
          </View>
        </View>

        {/* Risk Profile */}
        <View style={styles.riskSection}>
          <Text style={styles.sectionHeader}>Risk Profile</Text>
          <View style={styles.pillRow}>
            {RISK_OPTIONS.map((option) => {
              const isSelected = profile.riskProfile === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.riskPill,
                    isSelected && styles.riskPillSelected,
                  ]}
                  onPress={() => handleSelectRisk(option.id)}
                  activeOpacity={0.7}
                  disabled={isSavingRisk}
                >
                  <Text
                    style={[
                      styles.riskPillText,
                      isSelected && styles.riskPillTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </>
    );
  };

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Profile</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Body */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {isLoading && renderLoading()}
          {!isLoading && error && renderError()}
          {!isLoading && !error && renderProfile()}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },

  // ─── Header ───
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 36,
  },

  // ─── Scroll ───
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // ─── Loading ───
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 24,
  },
  avatarSkeletonWrap: {
    marginBottom: 16,
  },

  // ─── Avatar ───
  avatarSection: {
    alignItems: 'center',
    paddingTop: 24,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ─── Name ───
  nameSection: {
    alignItems: 'center',
    marginBottom: 4,
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  displayName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  editButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameEditRow: {
    width: '100%',
    paddingHorizontal: 32,
  },
  nameInput: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#60A5FA',
    paddingVertical: 6,
  },

  // ─── Join Date ───
  joinDate: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 28,
  },

  // ─── Stats Grid ───
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 16,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  statNumber: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ─── Risk Profile ───
  riskSection: {
    marginTop: 28,
  },
  sectionHeader: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  riskPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  riskPillSelected: {
    borderColor: 'rgba(96,165,250,0.4)',
    backgroundColor: 'rgba(96,165,250,0.1)',
  },
  riskPillText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  riskPillTextSelected: {
    color: '#60A5FA',
  },
});
