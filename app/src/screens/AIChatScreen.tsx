import React, { useState, useRef, useEffect } from 'react';
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { sendChatMessage } from '../services/api';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const SUGGESTED_QUESTIONS = [
  'What does the FII score mean?',
  'Is now a good time to buy tech stocks?',
  'Explain factor investing to me',
  'What affects supply chain scores?',
];

export const AIChatScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'AIChat'>>();
  const currentTicker = route.params?.ticker;

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [sessionId] = useState(() => `s_${Date.now()}`);

  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: currentTicker
        ? `Hi! I'm your FII AI assistant. Ask me anything about ${currentTicker} or investing in general.`
        : "Hi! I'm your FII AI assistant. Ask me about any stock, your portfolio, or investing concepts.",
      timestamp: new Date().toISOString(),
    }]);
  }, [currentTicker]);

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || sending) return;

    const userMsg: ChatMsg = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    scrollToBottom();

    try {
      const res = await sendChatMessage(msg, { currentTicker, sessionId });
      const assistantMsg: ChatMsg = {
        role: 'assistant',
        content: res.reply || res.response || 'I couldn\'t generate a response. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Sorry, I\'m having trouble connecting. Please try again in a moment.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="sparkles" size={16} color="#60A5FA" />
          <Text style={styles.headerTitle}>
            FII AI {currentTicker ? `· ${currentTicker}` : ''}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
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
                  <Ionicons name="sparkles" size={14} color="#60A5FA" />
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
                <Ionicons name="sparkles" size={14} color="#60A5FA" />
              </View>
              <View style={[styles.bubble, styles.bubbleAssistant]}>
                <View style={styles.typingDots}>
                  <View style={[styles.dot, styles.dot1]} />
                  <View style={[styles.dot, styles.dot2]} />
                  <View style={[styles.dot, styles.dot3]} />
                </View>
              </View>
            </View>
          )}

          {messages.length <= 1 && (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionsLabel}>Try asking:</Text>
              {SUGGESTED_QUESTIONS.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={styles.suggestionChip}
                  onPress={() => handleSend(q)}
                >
                  <Text style={styles.suggestionText}>{q}</Text>
                  <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask about stocks, signals, factors..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!input.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons name="send" size={18} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={12} color="rgba(255,255,255,0.2)" />
          <Text style={styles.disclaimerText}>
            AI responses are educational only, not investment advice.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },

  msgRow: { flexDirection: 'row', marginBottom: 12, maxWidth: '85%' },
  msgRowUser: { alignSelf: 'flex-end' },
  msgRowAssistant: { alignSelf: 'flex-start' },

  aiAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(96,165,250,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 8, marginTop: 4,
  },

  bubble: { borderRadius: 16, padding: 12, maxWidth: '100%' },
  bubbleUser: { backgroundColor: '#60A5FA', borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: 'rgba(255,255,255,0.06)', borderBottomLeftRadius: 4 },
  bubbleText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20 },
  bubbleTextUser: { color: '#FFFFFF' },

  typingDots: { flexDirection: 'row', gap: 4, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },

  suggestions: { marginTop: 16 },
  suggestionsLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 12, marginBottom: 8 },
  suggestionChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
    padding: 12, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  suggestionText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, flex: 1 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  textInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, color: '#FFFFFF', fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#60A5FA',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },

  disclaimer: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    justifyContent: 'center', paddingBottom: 24, paddingTop: 4,
  },
  disclaimerText: { color: 'rgba(255,255,255,0.2)', fontSize: 10 },
});
