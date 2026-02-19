import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { getDiscussion, createPost, reactToPost } from '../services/api';
import type { DiscussionPost, RootStackParamList } from '../types';

// ─── Constants ───

const MAX_CHARS = 500;

const SENTIMENT_OPTIONS: { key: DiscussionPost['sentiment']; label: string; color: string }[] = [
  { key: 'bullish', label: 'Bullish', color: '#10B981' },
  { key: 'bearish', label: 'Bearish', color: '#EF4444' },
  { key: 'neutral', label: 'Neutral', color: 'rgba(255,255,255,0.3)' },
];

const SENTIMENT_COLORS: Record<DiscussionPost['sentiment'], string> = {
  bullish: '#10B981',
  bearish: '#EF4444',
  neutral: 'rgba(255,255,255,0.3)',
};

// ─── Helpers ───

function formatTimeAgo(ts: string): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ─── Component ───

interface DiscussionScreenProps {
  route: { params: { ticker: string } };
  navigation: any;
}

export const DiscussionScreen: React.FC<DiscussionScreenProps> = ({ route, navigation }) => {
  const { ticker } = route.params;

  // ─── State ───
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Composer state
  const [content, setContent] = useState('');
  const [sentiment, setSentiment] = useState<DiscussionPost['sentiment']>('neutral');
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const flatListRef = useRef<FlatList>(null);

  // ─── Data Loading ───

  const loadPosts = useCallback(async () => {
    try {
      const result = await getDiscussion(ticker);
      setPosts(result.posts ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load discussion');
    }
  }, [ticker]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadPosts();
      setLoading(false);
    };
    init();
  }, [loadPosts]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  }, [loadPosts]);

  // ─── Reactions ───

  const handleReaction = useCallback(
    async (postId: string, reaction: 'bull' | 'bear') => {
      try {
        await reactToPost(ticker, postId, reaction);
        // Optimistic update
        setPosts((prev) =>
          prev.map((p) => {
            if (p.postId !== postId) return p;
            return {
              ...p,
              bulls: reaction === 'bull' ? (p.bulls ?? 0) + 1 : p.bulls,
              bears: reaction === 'bear' ? (p.bears ?? 0) + 1 : p.bears,
            };
          }),
        );
      } catch {
        Alert.alert('Error', 'Could not register reaction. Please try again.');
      }
    },
    [ticker],
  );

  // ─── Post Submission ───

  const handleSubmit = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setSubmitFeedback(null);

    try {
      await createPost(ticker, trimmed, sentiment);
      setContent('');
      setSentiment('neutral');
      setSubmitFeedback({ type: 'success', message: 'Post submitted!' });
      await loadPosts();
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (e: any) {
      setSubmitFeedback({ type: 'error', message: e?.message ?? 'Failed to submit post' });
    } finally {
      setSubmitting(false);
      // Clear feedback after 3 seconds
      setTimeout(() => setSubmitFeedback(null), 3000);
    }
  }, [content, sentiment, submitting, ticker, loadPosts]);

  // ─── Render Helpers ───

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={styles.title} numberOfLines={1}>
          Discussion: {ticker}
        </Text>
        {!loading && !error && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{posts.length}</Text>
          </View>
        )}
      </View>
      <View style={{ width: 36 }} />
    </View>
  );

  const renderPostCard = ({ item }: { item: DiscussionPost }) => {
    const sentimentColor = SENTIMENT_COLORS[item.sentiment] ?? 'rgba(255,255,255,0.3)';

    return (
      <View style={styles.postCard}>
        {/* Header row */}
        <View style={styles.postHeader}>
          <View style={styles.postAuthorRow}>
            <Text style={styles.postDisplayName}>{item.displayName ?? 'Anonymous'}</Text>
            <Text style={styles.postTimestamp}>{formatTimeAgo(item.timestamp)}</Text>
          </View>
          <View style={[styles.sentimentBadge, { backgroundColor: sentimentColor }]}>
            <Text style={styles.sentimentBadgeText}>
              {item.sentiment.charAt(0).toUpperCase() + item.sentiment.slice(1)}
            </Text>
          </View>
        </View>

        {/* Content */}
        <Text style={styles.postContent}>{item.content}</Text>

        {/* Reaction buttons */}
        <View style={styles.reactionRow}>
          <TouchableOpacity
            style={styles.reactionBtn}
            onPress={() => handleReaction(item.postId, 'bull')}
            activeOpacity={0.7}
          >
            <Ionicons name="trending-up" size={18} color="#10B981" />
            <Text style={[styles.reactionCount, { color: '#10B981' }]}>
              {(item.bulls ?? 0).toFixed(0)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reactionBtn}
            onPress={() => handleReaction(item.postId, 'bear')}
            activeOpacity={0.7}
          >
            <Ionicons name="trending-down" size={18} color="#EF4444" />
            <Text style={[styles.reactionCount, { color: '#EF4444' }]}>
              {(item.bears ?? 0).toFixed(0)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderComposer = () => {
    const remaining = MAX_CHARS - content.length;
    const canSubmit = content.trim().length > 0 && !submitting;

    return (
      <View style={styles.composerContainer}>
        {/* Feedback message */}
        {submitFeedback && (
          <View
            style={[
              styles.feedbackBar,
              { backgroundColor: submitFeedback.type === 'success' ? '#10B981' : '#EF4444' },
            ]}
          >
            <Text style={styles.feedbackText}>{submitFeedback.message}</Text>
          </View>
        )}

        {/* Sentiment toggles */}
        <View style={styles.sentimentRow}>
          {SENTIMENT_OPTIONS.map((opt) => {
            const selected = sentiment === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.sentimentToggle,
                  selected && { backgroundColor: opt.color, borderColor: opt.color },
                ]}
                onPress={() => setSentiment(opt.key)}
                disabled={submitting}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.sentimentToggleText,
                    selected && { color: opt.key === 'neutral' ? '#FFF' : '#FFF' },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Input row */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            placeholder="Share your thoughts..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={content}
            onChangeText={(text) => setContent(text.slice(0, MAX_CHARS))}
            maxLength={MAX_CHARS}
            multiline
            editable={!submitting}
          />
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.7}
          >
            {submitting ? (
              <Ionicons name="hourglass-outline" size={20} color="rgba(255,255,255,0.5)" />
            ) : (
              <Ionicons name="send" size={20} color={canSubmit ? '#FFF' : 'rgba(255,255,255,0.3)'} />
            )}
          </TouchableOpacity>
        </View>

        {/* Character counter */}
        <Text style={[styles.charCounter, remaining < 50 && { color: '#EF4444' }]}>
          {remaining} characters remaining
        </Text>
      </View>
    );
  };

  // ─── Loading State ───

  if (loading) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <SafeAreaView style={styles.safe}>
          {renderHeader()}
          <View style={styles.skeletons}>
            <Skeleton width="100%" height={100} borderRadius={12} />
            <View style={{ height: 12 }} />
            <Skeleton width="100%" height={100} borderRadius={12} />
            <View style={{ height: 12 }} />
            <Skeleton width="100%" height={100} borderRadius={12} />
            <View style={{ height: 12 }} />
            <Skeleton width="100%" height={100} borderRadius={12} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ─── Error State ───

  if (error) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <SafeAreaView style={styles.safe}>
          {renderHeader()}
          <ErrorState
            icon="warning"
            message={error}
            subtitle="Could not load discussion threads."
            onRetry={async () => {
              setLoading(true);
              setError(null);
              await loadPosts();
              setLoading(false);
            }}
            retryLabel="Try Again"
          />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ─── Main Render ───

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {renderHeader()}

          <FlatList
            ref={flatListRef}
            data={posts}
            keyExtractor={(item) => item.postId}
            renderItem={renderPostCard}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubble-outline" size={48} color="rgba(255,255,255,0.15)" />
                <Text style={styles.emptyTitle}>No posts yet</Text>
                <Text style={styles.emptySubtitle}>Be the first to share your thoughts on {ticker}</Text>
              </View>
            }
            ListFooterComponent={<DisclaimerBanner />}
            showsVerticalScrollIndicator={false}
          />

          {renderComposer()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

// ─── Styles ───

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  countBadge: {
    marginLeft: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },

  // Skeleton loading
  skeletons: {
    padding: 16,
  },

  // Post list
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },

  // Post card
  postCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  postAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  postDisplayName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  postTimestamp: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginLeft: 8,
  },
  sentimentBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  sentimentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  postContent: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 10,
  },

  // Reactions
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  reactionCount: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
    textAlign: 'center',
  },

  // Composer
  composerContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  feedbackBar: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  sentimentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  sentimentToggle: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  sentimentToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: '#FFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  submitBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  charCounter: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
    textAlign: 'right',
  },
});

export default DiscussionScreen;
