import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, Prescription } from '../types';

import { useStrategyStore } from '../store/strategyStore';
import { usePortfolioStore } from '../store/portfolioStore';
import { useCoachStore, type ChatMsg } from '../store/coachStore';
import { getCoachWeekly, getAdvice, sendChatMessage } from '../services/api';
import { syncService } from '../services/SyncService';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { Skeleton } from '../components/Skeleton';

const SEVERITY_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  high: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: '#EF4444', badge: '#EF4444' },
  medium: { bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)', text: '#FBBF24', badge: '#FBBF24' },
  low: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', text: '#10B981', badge: '#10B981' },
};

const ASK_FII_SUGGESTIONS = [
  'Should I sell any of my stocks?',
  "What's my biggest risk right now?",
  'How would a recession affect my portfolio?',
  'Am I diversified enough?',
];

const CHAT_CACHE_KEY = '@fii_coach_chat_screen_cache';

export const AICoachScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const holdings = usePortfolioStore((s) => s.holdings);
  const hasPortfolio = holdings.length >= 3;

  const {
    advice,
    isAdviceLoading,
    reportCard,
    loadAdvice,
    loadReportCard,
  } = useStrategyStore();

  const weekly = useCoachStore((s) => s.weekly);

  const [activeTab, setActiveTab] = useState<'review' | 'prescriptions' | 'ask'>('review');

  // Weekly review state
  const [weeklyData, setWeeklyData] = useState<any>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);

  // Chat state
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);
  const [sessionId] = useState(() => `coach_${Date.now()}`);

  // Load weekly review
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getCoachWeekly();
        if (mounted && data) setWeeklyData(data);
      } catch {
        // silent
      } finally {
        if (mounted) setWeeklyLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Load advice if not loaded
  useEffect(() => {
    if (!advice.length && !isAdviceLoading) {
      loadAdvice();
    }
    if (!reportCard) {
      loadReportCard();
    }
  }, [advice.length, isAdviceLoading, loadAdvice, reportCard, loadReportCard]);

  // Load chat history from local cache, then reconcile from cloud
  useEffect(() => {
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(CHAT_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as ChatMsg[];
          setMessages(parsed.slice(-20));
        } else {
          setMessages([{
            role: 'assistant',
            content: "Hi! I'm your FII AI Coach. Ask me anything about your portfolio, market conditions, or investment strategy. I'll use your holdings and FII data to give personalized answers.",
            timestamp: new Date().toISOString(),
          }]);
        }
      } catch {
        setMessages([{
          role: 'assistant',
          content: "Hi! I'm your FII AI Coach. Ask me anything about your portfolio.",
          timestamp: new Date().toISOString(),
        }]);
      }
    })();
  }, []);

  // Cache chat history locally on change + sync to cloud
  useEffect(() => {
    if (messages.length > 1) {
      const trimmed = messages.slice(-20);
      AsyncStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(trimmed)).catch(() => {});
    }
  }, [messages]);

  const scrollToBottom = () => {
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleSendChat = async (text?: string) => {
    const msg = text || chatInput.trim();
    if (!msg || sending) return;

    const userMsg: ChatMsg = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setSending(true);
    scrollToBottom();

    try {
      const res = await sendChatMessage(msg, {
        sessionId,
      });
      const assistantMsg: ChatMsg = {
        role: 'assistant',
        content: res.reply || res.response || "I couldn't generate a response. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => {
        const updated = [...prev, assistantMsg];
        // Sync conversation to cloud after each assistant reply
        syncService.syncToCloud('chat', 'POST', {
          messages: updated.slice(-20),
          context: 'coach',
        });
        return updated;
      });
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting. Please try again in a moment.",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  const tabs = [
    { id: 'review' as const, label: 'Weekly Review', icon: 'newspaper' as const },
    { id: 'prescriptions' as const, label: 'Prescriptions', icon: 'medical' as const },
    { id: 'ask' as const, label: 'Ask FII', icon: 'chatbubbles' as const },
  ];

  // Limit to 5 active prescriptions
  const activePrescriptions = advice.slice(0, 5);

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Coach</Text>
        {(isAdviceLoading || weeklyLoading) && <ActivityIndicator color="#FBBF24" size="small" />}
      </View>

      {/* Tab selector */}
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.id ? '#FBBF24' : 'rgba(255,255,255,0.4)'}
            />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ═══ 4A. WEEKLY PORTFOLIO REVIEW ═══ */}
      {activeTab === 'review' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Weekly Portfolio Review</Text>
            <Text style={styles.sectionSubtitle}>
              Auto-generated every Monday based on your portfolio
            </Text>

            {weeklyLoading ? (
              <View style={{ gap: 12 }}>
                <Skeleton width="100%" height={120} borderRadius={14} />
                <Skeleton width="100%" height={80} borderRadius={14} />
              </View>
            ) : weeklyData ? (
              <View style={styles.reviewContainer}>
                {/* Summary card */}
                <View style={styles.reviewCard}>
                  <View style={styles.reviewCardHeader}>
                    <Text style={{ fontSize: 24 }}>📊</Text>
                    <Text style={styles.reviewCardTitle}>This Week's Summary</Text>
                  </View>

                  {/* Weekly stats */}
                  <View style={styles.reviewStats}>
                    <View style={styles.reviewStat}>
                      <Text style={styles.reviewStatLabel}>Portfolio Change</Text>
                      <Text
                        style={[
                          styles.reviewStatValue,
                          {
                            color: (weeklyData.weeklyChangePct ?? 0) >= 0 ? '#10B981' : '#EF4444',
                          },
                        ]}
                      >
                        {(weeklyData.weeklyChangePct ?? 0) >= 0 ? '+' : ''}
                        {(weeklyData.weeklyChangePct ?? 0).toFixed(2)}%
                      </Text>
                    </View>
                    <View style={styles.reviewStatDivider} />
                    <View style={styles.reviewStat}>
                      <Text style={styles.reviewStatLabel}>Signals Changed</Text>
                      <Text style={styles.reviewStatValue}>
                        {weeklyData.signalsChanged ?? 0}
                      </Text>
                    </View>
                    <View style={styles.reviewStatDivider} />
                    <View style={styles.reviewStat}>
                      <Text style={styles.reviewStatLabel}>Coach Score</Text>
                      <Text style={[styles.reviewStatValue, { color: '#FBBF24' }]}>
                        {weeklyData.score ?? '--'}
                      </Text>
                    </View>
                  </View>

                  {/* AI commentary */}
                  {weeklyData.claudeLine && (
                    <View style={styles.aiCommentary}>
                      <View style={styles.aiCommentaryHeader}>
                        <Ionicons name="sparkles" size={14} color="#60A5FA" />
                        <Text style={styles.aiCommentaryLabel}>AI Analysis</Text>
                      </View>
                      <Text style={styles.aiCommentaryText}>{weeklyData.claudeLine}</Text>
                    </View>
                  )}

                  {weeklyData.signalChangesText && (
                    <Text style={styles.signalChangesText}>{weeklyData.signalChangesText}</Text>
                  )}
                </View>

                {/* What to watch */}
                <View style={styles.watchSection}>
                  <Text style={styles.watchTitle}>What to Watch This Week</Text>
                  <View style={styles.watchItems}>
                    <View style={styles.watchItem}>
                      <Ionicons name="eye-outline" size={16} color="#60A5FA" />
                      <Text style={styles.watchItemText}>
                        Monitor holdings with recent signal changes
                      </Text>
                    </View>
                    <View style={styles.watchItem}>
                      <Ionicons name="trending-up" size={16} color="#10B981" />
                      <Text style={styles.watchItemText}>
                        Check earnings calendar for your holdings
                      </Text>
                    </View>
                    <View style={styles.watchItem}>
                      <Ionicons name="shield-checkmark" size={16} color="#FBBF24" />
                      <Text style={styles.watchItemText}>
                        Review any rebalancing recommendations
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.reviewCard}>
                <View style={styles.reviewCardHeader}>
                  <Text style={{ fontSize: 24 }}>📊</Text>
                  <Text style={styles.reviewCardTitle}>Weekly Review</Text>
                </View>
                <Text style={styles.reviewPlaceholder}>
                  {hasPortfolio
                    ? 'Your weekly review will appear here every Monday. Check back soon!'
                    : 'Add holdings to your portfolio to get a personalized weekly review.'}
                </Text>
              </View>
            )}

            <Text style={styles.aiDisclaimer}>
              For educational purposes only. Not investment advice.
            </Text>
          </View>

          <DisclaimerBanner />
        </ScrollView>
      )}

      {/* ═══ 4B. PRESCRIPTIONS ═══ */}
      {activeTab === 'prescriptions' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prescriptions</Text>
            <Text style={styles.sectionSubtitle}>
              Specific, actionable recommendations for your portfolio
            </Text>

            {isAdviceLoading && !advice.length ? (
              <View style={{ gap: 10 }}>
                <Skeleton width="100%" height={120} borderRadius={14} />
                <Skeleton width="100%" height={120} borderRadius={14} />
                <Skeleton width="100%" height={120} borderRadius={14} />
              </View>
            ) : activePrescriptions.length > 0 ? (
              <View style={styles.prescriptionsContainer}>
                {activePrescriptions.map((rx) => {
                  const colors = SEVERITY_COLORS[rx.severity] || SEVERITY_COLORS.low;
                  return (
                    <View
                      key={rx.id}
                      style={[
                        styles.prescriptionCard,
                        { backgroundColor: colors.bg, borderColor: colors.border },
                      ]}
                    >
                      {/* Priority badge */}
                      <View style={styles.prescriptionHeader}>
                        <View style={[styles.priorityBadge, { backgroundColor: colors.badge }]}>
                          <Text style={styles.priorityText}>
                            {rx.severity.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.prescriptionTitle} numberOfLines={1}>
                          {rx.title}
                        </Text>
                      </View>

                      {/* Diagnosis */}
                      <View style={styles.prescriptionSection}>
                        <Text style={styles.prescriptionLabel}>DIAGNOSIS</Text>
                        <Text style={styles.prescriptionText}>{rx.diagnosis}</Text>
                      </View>

                      {/* Prescription */}
                      <View style={styles.prescriptionSection}>
                        <Text style={styles.prescriptionLabel}>PRESCRIPTION</Text>
                        <Text style={styles.prescriptionText}>{rx.prescription}</Text>
                      </View>

                      {/* Expected Impact */}
                      <View style={styles.prescriptionSection}>
                        <Text style={styles.prescriptionLabel}>EXPECTED IMPACT</Text>
                        <Text style={[styles.prescriptionText, { color: '#10B981' }]}>
                          {rx.impact}
                        </Text>
                      </View>

                      {/* Apply button */}
                      <TouchableOpacity
                        style={styles.applyTreatmentButton}
                        activeOpacity={0.7}
                        onPress={() => {
                          // Navigate to relevant screen based on prescription
                          navigation.navigate('WealthAdvisor');
                        }}
                      >
                        <Ionicons name="checkmark-circle" size={16} color="#60A5FA" />
                        <Text style={styles.applyTreatmentText}>Apply Treatment</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.noPrescriptions}>
                <Ionicons name="checkmark-circle" size={40} color="#10B981" />
                <Text style={styles.noPrescriptionsTitle}>All Clear!</Text>
                <Text style={styles.noPrescriptionsSubtitle}>
                  {hasPortfolio
                    ? 'No active prescriptions right now. Your portfolio looks healthy!'
                    : 'Add holdings to get AI-powered portfolio prescriptions.'}
                </Text>
              </View>
            )}

            <Text style={styles.aiDisclaimer}>
              For educational purposes only. Not investment advice.
            </Text>
          </View>

          <DisclaimerBanner />
        </ScrollView>
      )}

      {/* ═══ 4C. ASK FII ═══ */}
      {activeTab === 'ask' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            ref={chatScrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.chatScrollContent}
            onContentSizeChange={scrollToBottom}
          >
            {messages.map((msg, idx) => (
              <View
                key={idx}
                style={[
                  styles.msgRow,
                  msg.role === 'user' ? styles.msgRowUser : styles.msgRowAssistant,
                ]}
              >
                {msg.role === 'assistant' && (
                  <View style={styles.aiAvatar}>
                    <Ionicons name="sparkles" size={14} color="#FBBF24" />
                  </View>
                )}
                <View
                  style={[
                    styles.bubble,
                    msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                  ]}
                >
                  <Text style={[styles.bubbleText, msg.role === 'user' && styles.bubbleTextUser]}>
                    {msg.content}
                  </Text>
                </View>
              </View>
            ))}

            {sending && (
              <View style={[styles.msgRow, styles.msgRowAssistant]}>
                <View style={styles.aiAvatar}>
                  <Ionicons name="sparkles" size={14} color="#FBBF24" />
                </View>
                <View style={[styles.bubble, styles.bubbleAssistant]}>
                  <View style={styles.typingDots}>
                    <View style={[styles.dot, { opacity: 0.4 }]} />
                    <View style={[styles.dot, { opacity: 0.6 }]} />
                    <View style={[styles.dot, { opacity: 0.8 }]} />
                  </View>
                </View>
              </View>
            )}

            {/* Suggested questions */}
            {messages.length <= 1 && (
              <View style={styles.suggestions}>
                <Text style={styles.suggestionsLabel}>Ask about your portfolio:</Text>
                {ASK_FII_SUGGESTIONS.map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={styles.suggestionChip}
                    onPress={() => handleSendChat(q)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.suggestionText}>{q}</Text>
                    <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.3)" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Input bar */}
          <View style={styles.inputBar}>
            <TextInput
              style={styles.textInput}
              placeholder="Ask anything about your portfolio..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={chatInput}
              onChangeText={setChatInput}
              multiline
              maxLength={1000}
              editable={!sending}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!chatInput.trim() || sending) && styles.sendBtnDisabled]}
              onPress={() => handleSendChat()}
              disabled={!chatInput.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.chatDisclaimer}>
            <Ionicons name="information-circle-outline" size={12} color="rgba(255,255,255,0.2)" />
            <Text style={styles.chatDisclaimerText}>
              For educational purposes only. Not investment advice.
            </Text>
          </View>
        </KeyboardAvoidingView>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    gap: 12,
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
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // ─── Tab Bar ───
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: 'rgba(251,191,36,0.15)',
  },
  tabText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FBBF24',
  },

  // ─── Section ───
  section: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },

  // ─── Weekly Review ───
  reviewContainer: {
    gap: 16,
  },
  reviewCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  reviewCardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  reviewStats: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  reviewStat: {
    flex: 1,
    alignItems: 'center',
  },
  reviewStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  reviewStatLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  reviewStatValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  aiCommentary: {
    backgroundColor: 'rgba(96,165,250,0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  aiCommentaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  aiCommentaryLabel: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  aiCommentaryText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    lineHeight: 20,
  },
  signalChangesText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    lineHeight: 18,
  },
  reviewPlaceholder: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: 10,
  },

  // ─── Watch Section ───
  watchSection: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
  },
  watchTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  watchItems: {
    gap: 10,
  },
  watchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  watchItemText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  // ─── Prescriptions ───
  prescriptionsContainer: {
    gap: 12,
  },
  prescriptionCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  prescriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  priorityBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  priorityText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  prescriptionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  prescriptionSection: {
    marginBottom: 10,
  },
  prescriptionLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  prescriptionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 19,
  },
  applyTreatmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(96,165,250,0.12)',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)',
  },
  applyTreatmentText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
  },
  noPrescriptions: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
  },
  noPrescriptionsTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
  },
  noPrescriptionsSubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  // ─── Ask FII Chat ───
  chatScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 12,
    maxWidth: '85%',
  },
  msgRowUser: {
    alignSelf: 'flex-end',
  },
  msgRowAssistant: {
    alignSelf: 'flex-start',
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(251,191,36,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 4,
  },
  bubble: {
    borderRadius: 16,
    padding: 12,
    maxWidth: '100%',
  },
  bubbleUser: {
    backgroundColor: '#60A5FA',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  suggestions: {
    marginTop: 16,
  },
  suggestionsLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    marginBottom: 8,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  suggestionText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    flex: 1,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.3,
  },
  chatDisclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
    paddingBottom: 24,
    paddingTop: 4,
  },
  chatDisclaimerText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
  },

  // ─── Shared ───
  aiDisclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    marginTop: 10,
    fontStyle: 'italic',
  },
});
