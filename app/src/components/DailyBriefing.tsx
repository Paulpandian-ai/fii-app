import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { DailyBriefingData } from '../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  briefing: DailyBriefingData;
  onDismiss: () => void;
}

const getTimeGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const formatMoney = (v: unknown): string => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  const abs = Math.abs(n);
  if (abs >= 1000000) return `$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
};

export const DailyBriefing: React.FC<Props> = ({ briefing, onDismiss }) => {
  const [expanded, setExpanded] = useState(false);

  const changePct = briefing.stats?.portfolioChangePct ?? 0;
  const changeDollar = briefing.stats?.portfolioChange ?? 0;
  const isPositive = changeDollar >= 0;

  // Use greeting from API or generate time-based one
  const greetingName = briefing.greeting?.replace(/^(Good\s+(morning|afternoon|evening)),?\s*/i, '') || '';
  const timeGreeting = getTimeGreeting();
  const displayGreeting = greetingName ? `${timeGreeting}, ${greetingName}` : timeGreeting;

  // Portfolio status one-liner
  const portfolioStatus = isPositive
    ? `Your portfolio is up ${formatMoney(changeDollar)} (+${changePct.toFixed(1)}%) today`
    : `Your portfolio is down ${formatMoney(changeDollar)} (${changePct.toFixed(1)}%) today`;

  // Insight of the day — use API field or fallback to summary
  const insight = briefing.insightOfTheDay || briefing.summary || '';

  // Full briefing text for expanded view
  const fullBriefing = briefing.fullBriefing || briefing.summary || '';

  const handleToggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0F3460', '#16213E', '#1A1A2E']}
        style={styles.card}
      >
        {/* Personalized greeting */}
        <Text style={styles.greeting}>{displayGreeting}</Text>

        {/* Portfolio status one-liner */}
        <View style={styles.statusRow}>
          <Ionicons
            name={isPositive ? 'trending-up' : 'trending-down'}
            size={16}
            color={isPositive ? '#10B981' : '#EF4444'}
          />
          <Text style={[styles.statusText, { color: isPositive ? '#10B981' : '#EF4444' }]}>
            {portfolioStatus}
          </Text>
        </View>

        {/* AI insight of the day */}
        <View style={styles.insightContainer}>
          <Ionicons name="bulb-outline" size={16} color="#FBBF24" style={{ marginTop: 2 }} />
          <Text style={styles.insightText}>{insight}</Text>
        </View>

        {/* Tap to expand */}
        {fullBriefing && fullBriefing !== insight && (
          <TouchableOpacity onPress={handleToggleExpand} activeOpacity={0.7}>
            <View style={styles.expandRow}>
              <Text style={styles.expandText}>
                {expanded ? 'Show less' : 'Tap for full briefing'}
              </Text>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="rgba(255,255,255,0.4)"
              />
            </View>
          </TouchableOpacity>
        )}

        {/* Expanded full briefing */}
        {expanded && (
          <Text style={styles.fullBriefing}>{fullBriefing}</Text>
        )}

        {/* Dismiss button */}
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={onDismiss}
          activeOpacity={0.8}
        >
          <Text style={styles.dismissText}>Got it!</Text>
        </TouchableOpacity>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>For educational purposes only</Text>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.15)',
  },
  greeting: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  insightContainer: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(251,191,36,0.06)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.1)',
    marginBottom: 12,
  },
  insightText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    marginBottom: 8,
  },
  expandText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
  },
  fullBriefing: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  dismissButton: {
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    paddingVertical: 14,
  },
  dismissText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  disclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 10,
  },
});
