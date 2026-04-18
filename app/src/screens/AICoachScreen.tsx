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
  Animated,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

import { usePortfolioStore } from '../store/portfolioStore';
import { type ChatMsg } from '../store/coachStore';
import { postCoachMessage } from '../services/api';
import { syncService } from '../services/SyncService';

type CoachMode = 'holdings' | 'invest' | 'research' | 'tax' | 'events' | undefined;

const MODE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  holdings: { label: 'Holdings', icon: 'bar-chart-outline', color: '#00C9A7' },
  invest: { label: 'Invest', icon: 'compass-outline', color: '#FBBF24' },
  research: { label: 'Research', icon: 'flask-outline', color: '#60A5FA' },
  tax: { label: 'Tax', icon: 'cash-outline', color: '#14B8A6' },
  events: { label: 'Events', icon: 'calendar-outline', color: '#F59E0B' },
};

const ALL_MODES: CoachMode[] = ['holdings', 'invest', 'research', 'tax', 'events'];

const CHAT_CACHE_PREFIX = '@fii_coach_chat_';

// Regex for tickers — 1-5 uppercase letters that appear as standalone words
const TICKER_RE = /\b([A-Z]{1,5})\b/g;
// Regex for numbers/percentages — highlight in teal
const NUMBER_RE = /(\$[\d,]+\.?\d*|[\d,]+\.?\d*%|\d+\.\d+)/g;

export const AICoachScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'AICoach'>>();

  const initialMode = route.params?.mode as CoachMode;
  const initialTicker = route.params?.ticker;
  const initialMessage = route.params?.initialMessage;

  const holdings = usePortfolioStore((s) => s.holdings);
  const knownTickers = new Set(holdings.map((h) => h.ticker));

  const [mode, setMode] = useState<CoachMode>(initialMode);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [followUpChips, setFollowUpChips] = useState<string[]>([]);
  const [conversationId] = useState(() => `coach_${Date.now()}`);
  const [autoSent, setAutoSent] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  // Typing indicator animation
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!sending) return;
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ]),
      );
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 150);
    const a3 = animate(dot3, 300);
    a1.start();
    a2.start();
    a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [sending, dot1, dot2, dot3]);

  // Cache key per mode
  const cacheKey = `${CHAT_CACHE_PREFIX}${mode || 'general'}`;

  // Load cached chat
  useEffect(() => {
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          setMessages(JSON.parse(cached).slice(-30));
        } else {
          setMessages([{
            role: 'assistant',
            content: getWelcomeMessage(mode, initialTicker),
            timestamp: new Date().toISOString(),
          }]);
        }
      } catch {
        setMessages([{
          role: 'assistant',
          content: getWelcomeMessage(mode, initialTicker),
          timestamp: new Date().toISOString(),
        }]);
      }
    })();
  }, [cacheKey, mode, initialTicker]);

  // Cache on change
  useEffect(() => {
    if (messages.length > 1) {
      AsyncStorage.setItem(cacheKey, JSON.stringify(messages.slice(-30))).catch(() => {});
    }
  }, [messages, cacheKey]);

  // Auto-send initial message on first mount
  useEffect(() => {
    if (initialMessage && !autoSent && messages.length >= 1) {
      setAutoSent(true);
      // Small delay to let welcome message render
      const timer = setTimeout(() => handleSendChat(initialMessage), 400);
      return () => clearTimeout(timer);
    }
  }, [initialMessage, autoSent, messages.length]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  const handleSendChat = useCallback(async (text?: string) => {
    const msg = text || chatInput.trim();
    if (!msg || sending) return;

    const userMsg: ChatMsg = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setSending(true);
    setFollowUpChips([]);
    scrollToBottom();

    try {
      const res = await postCoachMessage(msg, {
        mode: mode || undefined,
        ticker: initialTicker || undefined,
        conversation_id: conversationId,
      });

      const assistantMsg: ChatMsg = {
        role: 'assistant',
        content: res.response || res.reply || "I couldn't generate a response. Please try again.",
        timestamp: new Date().toISOString(),
      };

      if (res.follow_up_suggestions?.length) {
        setFollowUpChips(res.follow_up_suggestions.slice(0, 4));
      } else if (res.follow_ups?.length) {
        setFollowUpChips(res.follow_ups.slice(0, 4));
      }

      setMessages((prev) => {
        const updated = [...prev, assistantMsg];
        syncService.syncToCloud('chat', 'POST', {
          messages: updated.slice(-20),
          context: 'coach',
          mode: mode || 'general',
        });
        return updated;
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I'm having trouble connecting. Please try again in a moment.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }, [chatInput, sending, mode, initialTicker, conversationId, scrollToBottom]);

  const switchMode = useCallback((newMode: CoachMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setFollowUpChips([]);
  }, [mode]);

  // Build header title
  const headerTitle = mode
    ? MODE_CONFIG[mode]?.label
      ? `${MODE_CONFIG[mode].label}${mode === 'research' && initialTicker ? `: ${initialTicker}` : ''}`
      : 'AI Coach'
    : 'AI Coach';

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          {mode && (
            <View style={[styles.modeBadge, { backgroundColor: `${MODE_CONFIG[mode]?.color || '#60A5FA'}20` }]}>
              <Ionicons name={MODE_CONFIG[mode]?.icon as any} size={12} color={MODE_CONFIG[mode]?.color} />
              <Text style={[styles.modeBadgeText, { color: MODE_CONFIG[mode]?.color }]}>
                {MODE_CONFIG[mode]?.label}
              </Text>
            </View>
          )}
        </View>
        {sending && <ActivityIndicator color="#FBBF24" size="small" />}
      </View>

      {/* Mode tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.modeTabsScroll}
        contentContainerStyle={styles.modeTabsContent}
      >
        {ALL_MODES.map((m) => {
          const cfg = MODE_CONFIG[m!];
          const active = m === mode;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.modeTab, active && { backgroundColor: `${cfg.color}18`, borderColor: `${cfg.color}40` }]}
              onPress={() => switchMode(m)}
              activeOpacity={0.7}
            >
              <Ionicons name={cfg.icon as any} size={14} color={active ? cfg.color : 'rgba(255,255,255,0.35)'} />
              <Text style={[styles.modeTabText, active && { color: cfg.color }]}>
                {cfg.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Chat area */}
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
                {msg.role === 'assistant' ? (
                  <FormattedText
                    text={msg.content}
                    knownTickers={knownTickers}
                    onTickerPress={(t) =>
                      navigation.navigate('SignalDetail', { ticker: t })
                    }
                  />
                ) : (
                  <Text style={[styles.bubbleText, styles.bubbleTextUser]}>
                    {msg.content}
                  </Text>
                )}
              </View>
            </View>
          ))}

          {/* Typing indicator */}
          {sending && (
            <View style={[styles.msgRow, styles.msgRowAssistant]}>
              <View style={styles.aiAvatar}>
                <Ionicons name="sparkles" size={14} color="#FBBF24" />
              </View>
              <View style={[styles.bubble, styles.bubbleAssistant]}>
                <View style={styles.typingDots}>
                  <Animated.View style={[styles.dot, { opacity: dot1 }]} />
                  <Animated.View style={[styles.dot, { opacity: dot2 }]} />
                  <Animated.View style={[styles.dot, { opacity: dot3 }]} />
                </View>
              </View>
            </View>
          )}

          {/* Sources pill for last assistant message */}
          {messages.length > 1 && messages[messages.length - 1]?.role === 'assistant' && !sending && mode && (
            <View style={styles.sourcesPill}>
              <Ionicons name="document-text-outline" size={12} color="rgba(255,255,255,0.35)" />
              <Text style={styles.sourcesText}>
                Data: {getSourceLabel(mode)}
              </Text>
            </View>
          )}

          {/* Follow-up chips */}
          {followUpChips.length > 0 && !sending && (
            <View style={styles.followUpRow}>
              {followUpChips.map((chip, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.followUpChip}
                  onPress={() => {
                    setFollowUpChips([]);
                    handleSendChat(chip);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.followUpText} numberOfLines={1}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder={getPlaceholder(mode)}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={chatInput}
            onChangeText={setChatInput}
            multiline
            maxLength={1000}
            editable={!sending}
            onSubmitEditing={() => handleSendChat()}
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
            For educational purposes only. Not financial advice. AI-generated analysis for informational purposes only.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

// ─── Formatted text with bold, bullets, teal numbers, tappable tickers ───

const FormattedText: React.FC<{
  text: string;
  knownTickers: Set<string>;
  onTickerPress: (ticker: string) => void;
}> = ({ text, knownTickers, onTickerPress }) => {
  // Split into lines for basic formatting
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) elements.push(<Text key={`br-${lineIdx}`}>{'\n'}</Text>);

    const trimmed = line.trimStart();
    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ') || /^\d+\.\s/.test(trimmed);
    const isBold = trimmed.startsWith('**') && trimmed.endsWith('**');

    let content = line;
    if (isBullet) {
      content = '  • ' + trimmed.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '');
    }
    if (isBold) {
      content = content.replace(/\*\*/g, '');
    }

    // Split by bold markers within line
    const parts = content.split(/(\*\*[^*]+\*\*)/g);

    parts.forEach((part, partIdx) => {
      const key = `${lineIdx}-${partIdx}`;
      const boldMatch = part.match(/^\*\*(.+)\*\*$/);

      if (boldMatch) {
        elements.push(
          <Text key={key} style={formattedStyles.bold}>{boldMatch[1]}</Text>,
        );
        return;
      }

      // Highlight numbers and tickers
      const tokens = part.split(/((?:\$[\d,]+\.?\d*|[\d,]+\.?\d*%|\d+\.\d+)|\b[A-Z]{1,5}\b)/g);
      tokens.forEach((token, tokIdx) => {
        const tKey = `${key}-${tokIdx}`;
        if (NUMBER_RE.test(token)) {
          NUMBER_RE.lastIndex = 0;
          elements.push(
            <Text key={tKey} style={formattedStyles.number}>{token}</Text>,
          );
        } else if (TICKER_RE.test(token) && knownTickers.has(token)) {
          TICKER_RE.lastIndex = 0;
          elements.push(
            <Text
              key={tKey}
              style={formattedStyles.ticker}
              onPress={() => onTickerPress(token)}
            >
              {token}
            </Text>,
          );
        } else {
          elements.push(<Text key={tKey}>{token}</Text>);
        }
      });
    });
  });

  return <Text style={formattedStyles.base}>{elements}</Text>;
};

const formattedStyles = StyleSheet.create({
  base: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20 },
  bold: { fontWeight: '700', color: '#FFFFFF' },
  number: { color: '#00C9A7', fontWeight: '600' },
  ticker: { color: '#60A5FA', fontWeight: '700', textDecorationLine: 'underline' },
});

// ─── Helpers ───

function getWelcomeMessage(mode: CoachMode, ticker?: string): string {
  switch (mode) {
    case 'holdings':
      return "I'll analyze your holdings with their FII scores, risk factors, and growth factors. What would you like to know?";
    case 'invest':
      return "Let's explore investment ideas based on your portfolio gaps. I'll look at which sectors you're missing and suggest options to consider.";
    case 'research':
      return ticker
        ? `Let's dive deep into ${ticker}. I have its factor analysis, financials, stress tests, and peer comparison ready.`
        : "Search for a stock and I'll provide a full research brief with bull/bear cases, factor analysis, and peer comparison.";
    case 'tax':
      return "I'll walk you through your tax optimization opportunities. I have your unrealized gains/losses and potential harvesting strategies ready. Note: This is tax education, not tax advice.";
    case 'events':
      return "Let's review upcoming events that could affect your portfolio — earnings dates, Fed meetings, and more. I'll explain what each one could mean.";
    default:
      return "Hi! I'm your FII AI Coach. Ask me anything about your portfolio, stocks, or investment strategy.";
  }
}

function getPlaceholder(mode: CoachMode): string {
  switch (mode) {
    case 'holdings':
      return 'Ask about your holdings...';
    case 'invest':
      return 'Ask about investment ideas...';
    case 'research':
      return 'Ask about this stock...';
    case 'tax':
      return 'Ask about tax strategy...';
    case 'events':
      return 'Ask about upcoming events...';
    default:
      return 'Ask anything about your portfolio...';
  }
}

function getSourceLabel(mode: CoachMode): string {
  switch (mode) {
    case 'holdings':
      return 'Portfolio analysis, FII scores';
    case 'invest':
      return 'Gap analysis, sector weights';
    case 'research':
      return 'Factor analysis, financials, peers';
    case 'tax':
      return 'Tax lots, unrealized P&L';
    case 'events':
      return 'Earnings dates, FOMC calendar';
    default:
      return 'Portfolio data';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 8,
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
  headerTitleContainer: { flex: 1 },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 2,
  },
  modeBadgeText: { fontSize: 11, fontWeight: '600' },

  // ─── Mode tabs ───
  modeTabsScroll: { maxHeight: 40, marginBottom: 4 },
  modeTabsContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  modeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modeTabText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontWeight: '600',
  },

  // ─── Chat ───
  chatScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 12,
    maxWidth: '85%',
  },
  msgRowUser: { alignSelf: 'flex-end' },
  msgRowAssistant: { alignSelf: 'flex-start' },
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
  bubbleTextUser: { color: '#FFFFFF' },

  // ─── Typing ───
  typingDots: { flexDirection: 'row', gap: 4, paddingVertical: 4 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },

  // ─── Sources pill ───
  sourcesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginLeft: 36,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sourcesText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
  },

  // ─── Follow-ups ───
  followUpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  followUpChip: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
  },
  followUpText: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: '500',
  },

  // ─── Input ───
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
  sendBtnDisabled: { opacity: 0.3 },
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
});
