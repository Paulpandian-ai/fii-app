import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 64;

interface Props {
  onCardsRead?: () => void;
}

// SPY crash/recovery data (approximate)
const SPY_DATA = [
  100, 102, 97, 88, 76, 68, 66, 70, 75, 82, 90, 95, 100, 105, 108,
];

// Missing best days data
const MISSING_DAYS_DATA: Record<number, number> = {
  0: 45000,
  5: 30000,
  10: 22000,
  15: 16000,
  20: 12000,
  25: 10000,
  30: 9000,
};

export const MarketContextCards: React.FC<Props> = ({ onCardsRead }) => {
  const [missedDays, setMissedDays] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const cardsSeenRef = useRef(new Set<number>([0]));
  const [savedCards, setSavedCards] = useState(new Set<string>());
  const [allRead, setAllRead] = useState(false);

  const handleScroll = (e: any) => {
    const offset = e.nativeEvent.contentOffset.x;
    const idx = Math.round(offset / (CARD_WIDTH + 16));
    setCurrentIndex(idx);
    cardsSeenRef.current.add(idx);
    if (cardsSeenRef.current.size >= cards.length) {
      setAllRead(true);
      if (onCardsRead) onCardsRead();
    }
  };

  const handleSave = useCallback((cardId: string) => {
    setSavedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }, []);

  const handleShare = useCallback(async (title: string, body: string) => {
    try {
      await Share.share({
        message: `${title}\n\n${body}\n\nShared from FII App`,
      });
    } catch {
      // Share cancelled
    }
  }, []);

  // Interpolate missing days value
  const getMissingValue = (days: number): number => {
    const keys = Object.keys(MISSING_DAYS_DATA).map(Number).sort((a, b) => a - b);
    for (let i = 0; i < keys.length - 1; i++) {
      if (days >= keys[i] && days <= keys[i + 1]) {
        const ratio = (days - keys[i]) / (keys[i + 1] - keys[i]);
        return Math.round(
          MISSING_DAYS_DATA[keys[i]] +
            ratio * (MISSING_DAYS_DATA[keys[i + 1]] - MISSING_DAYS_DATA[keys[i]])
        );
      }
    }
    return MISSING_DAYS_DATA[30] ?? 9000;
  };

  const formatMoney = (v: number) => {
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  // SPY chart path
  const chartW = CARD_WIDTH - 32;
  const chartH = 80;
  const spyPath = SPY_DATA.map((v, i) => {
    const x = (i / (SPY_DATA.length - 1)) * chartW;
    const y = chartH - ((v - 60) / 50) * chartH;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const renderCardActions = (cardId: string, title: string, body: string) => (
    <View style={styles.cardActions}>
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => handleSave(cardId)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={savedCards.has(cardId) ? 'bookmark' : 'bookmark-outline'}
          size={16}
          color={savedCards.has(cardId) ? '#FBBF24' : 'rgba(255,255,255,0.4)'}
        />
        <Text style={[styles.actionText, savedCards.has(cardId) && { color: '#FBBF24' }]}>
          {savedCards.has(cardId) ? 'Saved' : 'Save'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => handleShare(title, body)}
        activeOpacity={0.7}
      >
        <Ionicons name="share-outline" size={16} color="rgba(255,255,255,0.4)" />
        <Text style={styles.actionText}>Share</Text>
      </TouchableOpacity>
    </View>
  );

  const cards = [
    // Card 1: What happened today — Market Recap
    {
      id: 'recap',
      element: (
        <View key="recap" style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTag}>
              <Text style={styles.cardTagText}>TODAY</Text>
            </View>
            <Ionicons name="newspaper" size={18} color="#60A5FA" />
            <Text style={styles.cardTitle}>What Happened Today</Text>
          </View>
          <Text style={styles.cardBody}>
            Markets opened lower on mixed earnings, but recovered mid-day.
            Tech led gains (+0.8%), while energy lagged. The Fed held rates
            steady — no surprise. Bond yields ticked down.
          </Text>
          <View style={styles.miniStats}>
            <View style={styles.miniStat}>
              <Text style={[styles.miniStatValue, { color: '#10B981' }]}>+0.3%</Text>
              <Text style={styles.miniStatLabel}>S&P 500</Text>
            </View>
            <View style={styles.miniStat}>
              <Text style={[styles.miniStatValue, { color: '#10B981' }]}>+0.8%</Text>
              <Text style={styles.miniStatLabel}>NASDAQ</Text>
            </View>
            <View style={styles.miniStat}>
              <Text style={[styles.miniStatValue, { color: '#EF4444' }]}>-0.1%</Text>
              <Text style={styles.miniStatLabel}>DOW</Text>
            </View>
          </View>
          {renderCardActions('recap', 'What Happened Today', 'Markets opened lower on mixed earnings but recovered mid-day.')}
        </View>
      ),
    },
    // Card 2: The Panic Tax
    {
      id: 'panic',
      element: (
        <View key="panic" style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardTag, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
              <Text style={[styles.cardTagText, { color: '#EF4444' }]}>LESSON</Text>
            </View>
            <Ionicons name="warning" size={18} color="#EF4444" />
            <Text style={styles.cardTitle}>The Panic Tax</Text>
          </View>
          <Text style={styles.cardBody}>
            Investors who sold during the 2020 COVID crash lost 34%.{'\n'}
            Those who held recovered in 5 months.
          </Text>
          <View style={styles.chartContainer}>
            <Svg width={chartW} height={chartH + 20}>
              <Path d={spyPath} stroke="#60A5FA" strokeWidth={2} fill="none" />
              <SvgText
                x={chartW * 0.37}
                y={chartH + 14}
                fill="#FBBF24"
                fontSize={9}
                fontWeight="700"
                textAnchor="middle"
              >
                YOU ARE HERE
              </SvgText>
              <Line
                x1={chartW * 0.37}
                y1={chartH - 5}
                x2={chartW * 0.37}
                y2={chartH + 3}
                stroke="#FBBF24"
                strokeWidth={1}
                strokeDasharray="3,2"
              />
            </Svg>
          </View>
          {renderCardActions('panic', 'The Panic Tax', 'Investors who sold during the 2020 COVID crash lost 34%. Those who held recovered in 5 months.')}
        </View>
      ),
    },
    // Card 3: FII Signal Spotlight
    {
      id: 'spotlight',
      element: (
        <View key="spotlight" style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardTag, { backgroundColor: 'rgba(96,165,250,0.1)' }]}>
              <Text style={[styles.cardTagText, { color: '#60A5FA' }]}>SPOTLIGHT</Text>
            </View>
            <Ionicons name="flashlight" size={18} color="#60A5FA" />
            <Text style={styles.cardTitle}>FII Signal Spotlight</Text>
          </View>
          <Text style={styles.cardBody}>
            Why did NVDA get a BUY signal this week?
          </Text>
          <View style={styles.spotlightDetails}>
            <View style={styles.spotlightRow}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
              <Text style={styles.spotlightText}>Strong supply chain resilience (8.2/10)</Text>
            </View>
            <View style={styles.spotlightRow}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
              <Text style={styles.spotlightText}>Technical momentum above 50-day SMA</Text>
            </View>
            <View style={styles.spotlightRow}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
              <Text style={styles.spotlightText}>Earnings beat 4 consecutive quarters</Text>
            </View>
            <View style={styles.spotlightRow}>
              <Ionicons name="alert-circle" size={14} color="#F59E0B" />
              <Text style={styles.spotlightText}>High valuation (P/E: 65x) — use caution</Text>
            </View>
          </View>
          {renderCardActions('spotlight', 'FII Signal Spotlight: NVDA', 'NVDA got a BUY signal due to strong supply chain resilience and technical momentum.')}
        </View>
      ),
    },
    // Card 4: Myth Buster
    {
      id: 'myth',
      element: (
        <View key="myth" style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardTag, { backgroundColor: 'rgba(139,92,246,0.1)' }]}>
              <Text style={[styles.cardTagText, { color: '#8B5CF6' }]}>MYTH</Text>
            </View>
            <Ionicons name="close-circle" size={18} color="#8B5CF6" />
            <Text style={styles.cardTitle}>Myth Buster</Text>
          </View>
          <View style={styles.mythContainer}>
            <View style={styles.mythSection}>
              <View style={styles.mythLabel}>
                <Ionicons name="close" size={14} color="#EF4444" />
                <Text style={styles.mythLabelText}>MYTH</Text>
              </View>
              <Text style={styles.mythText}>
                "You need to time the market to make money"
              </Text>
            </View>
            <View style={styles.mythDivider} />
            <View style={styles.mythSection}>
              <View style={styles.mythLabel}>
                <Ionicons name="checkmark" size={14} color="#10B981" />
                <Text style={[styles.mythLabelText, { color: '#10B981' }]}>FACT</Text>
              </View>
              <Text style={styles.mythText}>
                Time IN the market beats timing the market. A $10K investment in S&P 500 in 2000 is worth ~$64K today — despite 3 major crashes.
              </Text>
            </View>
          </View>
          {renderCardActions('myth', 'Myth Buster', 'Myth: You need to time the market. Fact: Time IN the market beats timing the market.')}
        </View>
      ),
    },
    // Card 5: Time > Timing (interactive)
    {
      id: 'timing',
      element: (
        <View key="timing" style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardTag, { backgroundColor: 'rgba(139,92,246,0.1)' }]}>
              <Text style={[styles.cardTagText, { color: '#8B5CF6' }]}>INTERACTIVE</Text>
            </View>
            <Ionicons name="time" size={18} color="#8B5CF6" />
            <Text style={styles.cardTitle}>Time {'>'} Timing</Text>
          </View>
          <Text style={styles.cardBody}>
            If you invested $10K in 2010:
          </Text>
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>
              Missed best {Math.round(missedDays)} days:
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={30}
              step={1}
              value={missedDays}
              onValueChange={setMissedDays}
              minimumTrackTintColor="#8B5CF6"
              maximumTrackTintColor="rgba(255,255,255,0.1)"
              thumbTintColor="#8B5CF6"
            />
            <Text style={styles.sliderResult}>
              {formatMoney(getMissingValue(Math.round(missedDays)))}
            </Text>
            <View style={styles.sliderScale}>
              <Text style={styles.sliderScaleText}>0 days: $45K</Text>
              <Text style={styles.sliderScaleText}>10 days: $22K</Text>
              <Text style={styles.sliderScaleText}>30 days: $9K</Text>
            </View>
          </View>
          {renderCardActions('timing', 'Time > Timing', 'Missing the best 10 days in the market could cut your returns by half.')}
        </View>
      ),
    },
    // Card 6: Factor Deep Dive
    {
      id: 'factor',
      element: (
        <View key="factor" style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardTag, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
              <Text style={[styles.cardTagText, { color: '#10B981' }]}>LEARN</Text>
            </View>
            <Ionicons name="layers" size={18} color="#10B981" />
            <Text style={styles.cardTitle}>Factor: Supply Chain</Text>
          </View>
          <Text style={styles.cardBody}>
            FII's Supply Chain factor measures how resilient a company's supply network is. Companies with diversified suppliers tend to weather disruptions better.
          </Text>
          <View style={styles.factorExample}>
            <Text style={styles.factorExampleTitle}>Real example:</Text>
            <Text style={styles.factorExampleBody}>
              During the 2021 chip shortage, companies with high Supply Chain scores (8+) dropped only 5% vs 18% for those scoring below 4.
            </Text>
          </View>
          {renderCardActions('factor', 'Factor Deep Dive: Supply Chain', 'FII Supply Chain factor measures supply network resilience.')}
        </View>
      ),
    },
    // Card 7: This Week in History
    {
      id: 'history',
      element: (
        <View key="history" style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardTag, { backgroundColor: 'rgba(251,191,36,0.1)' }]}>
              <Text style={[styles.cardTagText, { color: '#FBBF24' }]}>HISTORY</Text>
            </View>
            <Ionicons name="hourglass" size={18} color="#FBBF24" />
            <Text style={styles.cardTitle}>This Week in History</Text>
          </View>
          <Text style={styles.cardBody}>
            Feb 27, 2007 — The Shanghai Composite dropped 8.8% in a single day, triggering a global sell-off. The S&P 500 fell 3.5%.
          </Text>
          <View style={styles.historyLesson}>
            <Ionicons name="school-outline" size={14} color="#60A5FA" />
            <Text style={styles.historyLessonText}>
              Lesson: Global markets are interconnected. Diversification across geographies helps cushion localized shocks.
            </Text>
          </View>
          {renderCardActions('history', 'This Week in History', 'Feb 27, 2007 — Shanghai crash triggered global sell-off.')}
        </View>
      ),
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Market Stories</Text>
      <Text style={styles.sectionSubtitle}>Swipe for today's insights</Text>

      <ScrollView
        ref={scrollRef}
        horizontal={true}
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + 16}
        decelerationRate="fast"
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={200}
      >
        {cards.map(c => c.element)}
      </ScrollView>

      {/* Page dots */}
      <View style={styles.dots}>
        {cards.map((c, i) => (
          <View
            key={`dot-${c.id}`}
            style={[
              styles.dot,
              currentIndex === i && styles.dotActive,
              cardsSeenRef.current.has(i) && currentIndex !== i && styles.dotRead,
            ]}
          />
        ))}
      </View>

      {/* All read message */}
      {allRead && (
        <Text style={styles.allReadText}>New stories tomorrow</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginHorizontal: 16,
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 14,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  cardTag: {
    backgroundColor: 'rgba(96,165,250,0.1)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardTagText: {
    color: '#60A5FA',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  cardBody: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
  },
  // Chart styles
  chartContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 12,
  },
  // Mini stats row
  miniStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingVertical: 12,
  },
  miniStat: {
    alignItems: 'center',
  },
  miniStatValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  miniStatLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },
  // Spotlight details
  spotlightDetails: {
    gap: 8,
  },
  spotlightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  spotlightText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  // Myth buster
  mythContainer: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  mythSection: {
    padding: 14,
  },
  mythLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  mythLabelText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  mythText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 20,
  },
  mythDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 14,
  },
  // Slider styles
  sliderContainer: {
    alignItems: 'center',
  },
  sliderLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginBottom: 4,
  },
  slider: {
    width: '100%',
    height: 36,
  },
  sliderResult: {
    color: '#8B5CF6',
    fontSize: 32,
    fontWeight: '900',
    marginVertical: 4,
  },
  sliderScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 4,
  },
  sliderScaleText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
  },
  // Factor deep dive
  factorExample: {
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.1)',
  },
  factorExampleTitle: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  factorExampleBody: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
  },
  // History lesson
  historyLesson: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(96,165,250,0.06)',
    borderRadius: 10,
    padding: 12,
  },
  historyLessonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  // Dots
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dotActive: {
    backgroundColor: '#60A5FA',
    width: 18,
    borderRadius: 3,
  },
  dotRead: {
    backgroundColor: 'rgba(96,165,250,0.35)',
  },
  allReadText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
