import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sendChatMessage } from '../services/api';
import { useCoachStore } from '../store/coachStore';

const DAILY_SUGGESTIONS = [
  ['What does P/E ratio mean?', 'Is my portfolio diversified enough?', "What's happening in the market today?"],
  ['Explain my FII score for NVDA', 'What are the risks to my portfolio?', 'How do I read a candlestick chart?'],
  ['What is dollar-cost averaging?', 'Should I rebalance my portfolio?', 'How do dividends work?'],
  ['What is a bear market?', 'How do interest rates affect stocks?', 'What does beta mean?'],
  ['How does tax-loss harvesting work?', 'What is the Sharpe ratio?', 'When should I sell a stock?'],
  ['What is market capitalization?', 'How do I analyze earnings?', 'What drives stock prices?'],
  ['What is an ETF?', 'How do supply chains affect stocks?', 'What is sector rotation?'],
];

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const AskCoach: React.FC = () => {
  const { chatMessages, addChatMessage, isChatLoading, setChatLoading, logEvent } = useCoachStore();
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [sessionId] = useState(() => `coach_${Date.now()}`);

  // Pick daily suggestions based on day of year
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const suggestions = DAILY_SUGGESTIONS[dayOfYear % DAILY_SUGGESTIONS.length];

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleSend = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isChatLoading) return;

    const userMsg: ChatMsg = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    addChatMessage(userMsg);
    setInput('');
    setChatLoading(true);
    setExpanded(true);
    scrollToBottom();

    try {
      const res = await sendChatMessage(msg, { sessionId });
      const reply: ChatMsg = {
        role: 'assistant',
        content: res.reply || res.response || "I couldn't generate a response. Please try again.",
        timestamp: new Date().toISOString(),
      };
      addChatMessage(reply);
      logEvent('coach_question');
    } catch {
      addChatMessage({
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting. Please try again in a moment.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setChatLoading(false);
      scrollToBottom();
    }
  }, [input, isChatLoading, addChatMessage, setChatLoading, sessionId, logEvent]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="chatbubbles" size={20} color="#60A5FA" />
        <Text style={styles.sectionTitle}>Ask Your Coach</Text>
      </View>

      <View style={[styles.chatCard, expanded && styles.chatCardExpanded]}>
        {/* Chat messages */}
        {expanded && chatMessages.length > 0 && (
          <ScrollView
            ref={scrollRef}
            style={styles.chatMessages}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={scrollToBottom}
          >
            {chatMessages.map((msg, idx) => (
              <View
                key={idx}
                style={[
                  styles.msgRow,
                  msg.role === 'user' ? styles.msgRowUser : styles.msgRowAssistant,
                ]}
              >
                {msg.role === 'assistant' && (
                  <View style={styles.aiAvatar}>
                    <Ionicons name="school" size={12} color="#60A5FA" />
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
            {isChatLoading && (
              <View style={[styles.msgRow, styles.msgRowAssistant]}>
                <View style={styles.aiAvatar}>
                  <Ionicons name="school" size={12} color="#60A5FA" />
                </View>
                <View style={[styles.bubble, styles.bubbleAssistant]}>
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* Suggested questions (show when no messages or collapsed) */}
        {(!expanded || chatMessages.length === 0) && (
          <View style={styles.suggestions}>
            {suggestions.map((q) => (
              <TouchableOpacity
                key={q}
                style={styles.suggestionChip}
                onPress={() => handleSend(q)}
                activeOpacity={0.7}
              >
                <Text style={styles.suggestionText}>{q}</Text>
                <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask me anything about investing..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={input}
            onChangeText={setInput}
            onFocus={() => setExpanded(true)}
            multiline
            maxLength={500}
            editable={!isChatLoading}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isChatLoading) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!input.trim() || isChatLoading}
          >
            {isChatLoading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons name="send" size={16} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={11} color="rgba(255,255,255,0.2)" />
          <Text style={styles.disclaimerText}>AI responses are educational only, not investment advice.</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  chatCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.1)',
  },
  chatCardExpanded: {
    minHeight: 300,
  },

  // Chat messages
  chatMessages: {
    maxHeight: 280,
    padding: 14,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 10,
    maxWidth: '85%',
  },
  msgRowUser: {
    alignSelf: 'flex-end',
  },
  msgRowAssistant: {
    alignSelf: 'flex-start',
  },
  aiAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(96,165,250,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    marginTop: 2,
  },
  bubble: {
    borderRadius: 14,
    padding: 10,
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

  // Suggestions
  suggestions: {
    padding: 14,
    gap: 6,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  suggestionText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    flex: 1,
  },

  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 14,
    maxHeight: 80,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#60A5FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.3,
  },

  // Disclaimer
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
    paddingBottom: 10,
    paddingTop: 2,
  },
  disclaimerText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
  },
});
