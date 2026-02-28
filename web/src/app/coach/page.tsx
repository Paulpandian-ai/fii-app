'use client';

import { useEffect, useState, useRef } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useCoachStore } from '@/store/coachStore';
import { CardSkeleton } from '@/components/Skeleton';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import * as api from '@/lib/api';
import type { ChatMessage, StockEvent, DisciplineScoreData } from '@/types';
import { cn, timeAgo } from '@/lib/utils';

const COACH_QUESTIONS = [
  'How am I doing this week?',
  'What should I focus on today?',
  'How can I improve my discipline?',
  'Explain my biggest risk',
];

const PROGRESS_ITEMS: Array<{ label: string; maxKey: keyof DisciplineScoreData['stats']; icon: string; color: string }> = [
  { label: 'Streak', maxKey: 'streak', icon: '🔥', color: '#FBBF24' },
  { label: 'Signal Follow', maxKey: 'signalAlignment', icon: '📊', color: '#10B981' },
  { label: 'Panic Survived', maxKey: 'panicSurvived', icon: '🛡️', color: '#8B5CF6' },
  { label: 'Worst Avoided', maxKey: 'worstAvoided', icon: '🛑', color: '#60A5FA' },
];

function CoachContent() {
  const { daily, score, achievements, weekly, learningPaths, isLoading, loadAll } = useCoachStore();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [marketStories, setMarketStories] = useState<StockEvent[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAll();
    api.getEventsFeed(10).then((data) => {
      const events = (data as { events?: StockEvent[] }).events || [];
      setMarketStories(events.slice(0, 6));
    }).catch(() => {});
  }, [loadAll]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const sendChat = async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text.trim(), timestamp: new Date().toISOString() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    try {
      const response = await api.sendChatMessage(text.trim(), { currentTicker: undefined }) as { reply?: string; response?: string };
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.reply || response.response || 'Let me think about that...',
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setChatMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.', timestamp: new Date().toISOString(),
      }]);
    }
    setChatLoading(false);
  };

  if (isLoading && !daily && !score) {
    return <div className="p-6 space-y-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>;
  }

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full flex flex-col lg:flex-row">
        {/* Left column (60%) */}
        <div className="flex-1 lg:w-[60%] overflow-y-auto p-4 lg:p-6 space-y-6">
          {/* Daily Briefing */}
          {daily && (
            <div className="bg-gradient-to-br from-fii-accent/10 to-blue-600/10 rounded-xl border border-fii-accent/20 p-6">
              <h3 className="text-lg font-semibold text-white mb-1">{daily.greeting}</h3>
              <p className="text-sm text-fii-text-secondary mb-4">{daily.summary}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-fii-bg/50 rounded-lg p-2">
                  <p className="text-[10px] text-fii-muted">Portfolio</p>
                  <p className={cn('text-sm font-bold', daily.stats.portfolioChangePct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {daily.stats.portfolioChangePct >= 0 ? '+' : ''}{daily.stats.portfolioChangePct.toFixed(2)}%
                  </p>
                </div>
                <div className="bg-fii-bg/50 rounded-lg p-2">
                  <p className="text-[10px] text-fii-muted">Signals Changed</p>
                  <p className="text-sm font-bold text-white">{daily.stats.signalsChanged}</p>
                </div>
                <div className="bg-fii-bg/50 rounded-lg p-2">
                  <p className="text-[10px] text-fii-muted">Streak</p>
                  <p className="text-sm font-bold text-fii-accent">{daily.stats.streak} days</p>
                </div>
                <div className="bg-fii-bg/50 rounded-lg p-2">
                  <p className="text-[10px] text-fii-muted">Date</p>
                  <p className="text-sm font-bold text-white">{new Date(daily.date).toLocaleDateString()}</p>
                </div>
              </div>
              {daily.insightOfTheDay && (
                <div className="mt-4 p-3 bg-fii-bg/30 rounded-lg">
                  <p className="text-xs text-fii-accent font-medium mb-1">Insight of the Day</p>
                  <p className="text-sm text-fii-text">{daily.insightOfTheDay}</p>
                </div>
              )}
            </div>
          )}

          {/* Market Context Stories */}
          {marketStories.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Market Context</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {marketStories.map((story, i) => (
                  <div key={i} className="bg-fii-card rounded-xl border border-fii-border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-medium uppercase',
                        story.impact === 'high' ? 'bg-red-500/20 text-red-400' :
                        story.impact === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-fii-bg text-fii-muted',
                      )}>
                        {story.impact}
                      </span>
                      <span className="text-[10px] text-fii-muted">{story.ticker}</span>
                      <span className="text-[10px] text-fii-muted ml-auto">{timeAgo(story.timestamp)}</span>
                    </div>
                    <p className="text-sm text-white font-medium mb-1 line-clamp-2">{story.headline}</p>
                    <p className="text-xs text-fii-text-secondary line-clamp-2">{story.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Learning Paths */}
          {learningPaths.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Learning Paths</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {learningPaths.map((path) => {
                  const completed = path.completedLessonIds.length;
                  const total = path.lessons.length;
                  const progress = total > 0 ? (completed / total) * 100 : 0;
                  return (
                    <div key={path.id} className="bg-fii-card rounded-xl border border-fii-border p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{path.emoji}</span>
                        <h4 className="text-sm font-semibold text-white">{path.title}</h4>
                      </div>
                      <p className="text-xs text-fii-text-secondary mb-3">{path.description}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-fii-accent transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-fii-muted">{completed}/{total}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Weekly Recap */}
          {weekly && (
            <div className="bg-fii-card rounded-xl border border-fii-border p-6">
              <h3 className="text-sm font-semibold text-white mb-3">Weekly Recap</h3>
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div>
                  <p className="text-xs text-fii-muted">Weekly Change</p>
                  <p className={cn('text-lg font-bold', weekly.weeklyChangePct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {weekly.weeklyChangePct >= 0 ? '+' : ''}{weekly.weeklyChangePct.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fii-muted">Signals Changed</p>
                  <p className="text-lg font-bold text-white">{weekly.signalsChanged}</p>
                </div>
                <div>
                  <p className="text-xs text-fii-muted">Discipline</p>
                  <p className="text-lg font-bold text-fii-accent">{weekly.score}</p>
                </div>
              </div>
              {weekly.claudeLine && (
                <p className="text-sm text-fii-text-secondary italic">&ldquo;{weekly.claudeLine}&rdquo;</p>
              )}
            </div>
          )}

          {/* Achievements */}
          {achievements && achievements.badges.length > 0 && (
            <div className="bg-fii-card rounded-xl border border-fii-border p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Achievements</h3>
                <span className="text-xs text-fii-muted">{achievements.totalEarned}/{achievements.totalAvailable}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {achievements.badges.filter((b) => b.earned).map((badge) => (
                  <div key={badge.id} className="flex items-center gap-2 p-2 bg-fii-bg rounded-lg">
                    <span className="text-xl">{badge.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-white">{badge.name}</p>
                      <p className="text-[10px] text-fii-muted">{badge.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Chat (40%) */}
        <div className="lg:w-[40%] flex flex-col border-t lg:border-t-0 lg:border-l border-fii-border bg-fii-bg-dark">
          <div className="px-4 py-3 border-b border-fii-border">
            <h3 className="text-sm font-semibold text-white">Ask Your Coach</h3>
          </div>

          {/* Discipline Score + Progress */}
          {score && (
            <div className="px-4 py-3 border-b border-fii-border space-y-3">
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold" style={{ color: score.levelColor || '#60A5FA' }}>
                  {score.score}
                </div>
                <div>
                  <p className="text-xs text-white font-medium">{score.level}</p>
                  <p className="text-[10px] text-fii-muted">Streak: {score.stats.streak} days</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PROGRESS_ITEMS.map((item) => {
                  const value = score.stats[item.maxKey] ?? 0;
                  return (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className="text-xs">{item.icon}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-fii-muted">{item.label}</span>
                          <span style={{ color: item.color }}>{value}</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(value * 4, 100)}%`, backgroundColor: item.color }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chat messages */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-fii-muted">Ask your coach anything</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {COACH_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendChat(q)}
                      className="px-3 py-1 text-xs bg-fii-card border border-fii-border rounded-full text-fii-text-secondary hover:text-fii-accent hover:border-fii-accent/30 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg) => (
              <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                  msg.role === 'user' ? 'bg-fii-accent text-white rounded-br-sm' : 'bg-fii-card border border-fii-border text-fii-text rounded-bl-sm',
                )}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-fii-card border border-fii-border rounded-2xl rounded-bl-sm px-3 py-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-fii-muted animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-fii-muted animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-fii-muted animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chat input */}
          <form
            onSubmit={(e) => { e.preventDefault(); sendChat(chatInput); }}
            className="p-3 border-t border-fii-border"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 bg-fii-card border border-fii-border rounded-lg text-sm text-white placeholder-fii-muted focus:outline-none focus:ring-1 focus:ring-fii-accent/50"
                disabled={chatLoading}
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading}
                className="px-3 py-2 bg-fii-accent text-white rounded-lg hover:bg-fii-accent-hover transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function CoachPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="px-4 lg:px-6 py-3 border-b border-fii-border bg-fii-bg-dark">
        <h1 className="text-lg font-semibold text-white">Coach</h1>
      </div>
      <ProtectedRoute>
        <CoachContent />
      </ProtectedRoute>
      <DisclaimerBanner />
    </div>
  );
}
