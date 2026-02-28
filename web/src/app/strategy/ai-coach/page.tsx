'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import * as api from '@/lib/api';
import type { ChatMessage } from '@/types';
import { cn } from '@/lib/utils';

const SUGGESTED_QUESTIONS = [
  'What should I do with my portfolio today?',
  'Which of my holdings look risky?',
  'Explain the FII scoring methodology',
  'How can I improve my portfolio diversification?',
  'What are the best tax strategies for this year?',
];

function AIChatContent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await api.sendChatMessage(text.trim()) as { reply?: string; response?: string };
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.reply || response.response || 'I apologize, I could not generate a response.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-fii-border">
        <Link href="/strategy" className="text-fii-accent text-sm hover:underline flex items-center gap-1 mb-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Strategy
        </Link>
        <h2 className="text-xl font-bold text-white">Ask FII</h2>
        <p className="text-xs text-fii-text-secondary">AI-powered investment advice tailored to your portfolio</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full space-y-6">
            <div className="w-16 h-16 rounded-full bg-fii-accent/10 flex items-center justify-center">
              <span className="text-3xl">🤖</span>
            </div>
            <div className="text-center">
              <h3 className="text-white font-semibold mb-1">How can I help?</h3>
              <p className="text-sm text-fii-text-secondary">Ask me anything about investing, your portfolio, or market analysis</p>
            </div>
            <div className="flex flex-wrap gap-2 max-w-lg justify-center">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="px-3 py-1.5 text-xs bg-fii-card border border-fii-border rounded-full text-fii-text-secondary hover:text-fii-accent hover:border-fii-accent/30 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                msg.role === 'user'
                  ? 'bg-fii-accent text-white rounded-br-sm'
                  : 'bg-fii-card border border-fii-border text-fii-text rounded-bl-sm',
              )}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-fii-card border border-fii-border rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-fii-muted animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-fii-muted animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-2 h-2 rounded-full bg-fii-muted animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-fii-border">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask FII anything..."
            className="flex-1 px-4 py-2.5 bg-fii-card border border-fii-border rounded-lg text-sm text-white placeholder-fii-muted focus:outline-none focus:ring-1 focus:ring-fii-accent/50"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-4 py-2.5 bg-fii-accent text-white rounded-lg font-medium hover:bg-fii-accent-hover transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AICoachPage() {
  return (
    <div className="h-screen flex flex-col">
      <ProtectedRoute>
        <AIChatContent />
      </ProtectedRoute>
      <DisclaimerBanner />
    </div>
  );
}
