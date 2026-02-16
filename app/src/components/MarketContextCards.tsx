import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
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

  const handleScroll = (e: any) => {
    const offset = e.nativeEvent.contentOffset.x;
    const idx = Math.round(offset / (CARD_WIDTH + 16));
    setCurrentIndex(idx);
    cardsSeenRef.current.add(idx);
    if (cardsSeenRef.current.size >= 5 && onCardsRead) {
      onCardsRead();
    }
  };

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

  const cards = [
    // Card 1: Panic Tax
    <View key="panic" style={styles.card}>
      <View style={styles.cardHeader}>
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
          {/* "YOU ARE HERE" marker at dip */}
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
    </View>,

    // Card 2: Time > Timing
    <View key="timing" style={styles.card}>
      <View style={styles.cardHeader}>
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
    </View>,

    // Card 3: Average Investor Gap
    <View key="gap" style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="bar-chart" size={18} color="#FBBF24" />
        <Text style={styles.cardTitle}>The Average Investor Gap</Text>
      </View>
      <Text style={styles.cardBody}>
        The gap is behavior, not intelligence.
      </Text>
      <View style={styles.barComparison}>
        <View style={styles.barItem}>
          <View style={[styles.bar, { height: 80, backgroundColor: '#EF4444' }]} />
          <Text style={styles.barLabel}>3.6%/yr</Text>
          <Text style={styles.barCaption}>Avg Investor</Text>
        </View>
        <View style={styles.barItem}>
          <View style={[styles.bar, { height: 140, backgroundColor: '#10B981' }]} />
          <Text style={styles.barLabel}>10.2%/yr</Text>
          <Text style={styles.barCaption}>S&P 500</Text>
        </View>
        <View style={styles.barItem}>
          <View style={[styles.bar, { height: 155, backgroundColor: '#60A5FA' }]} />
          <Text style={styles.barLabel}>12.5%/yr</Text>
          <Text style={styles.barCaption}>Disciplined</Text>
        </View>
      </View>
    </View>,

    // Card 4: Corrections are Normal
    <View key="corrections" style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="shield-checkmark" size={18} color="#10B981" />
        <Text style={styles.cardTitle}>Corrections are Normal</Text>
      </View>
      <Text style={styles.cardBody}>
        The S&P 500 drops 10%+ once per year on average.{'\n'}
        It has ALWAYS recovered.
      </Text>
      <View style={styles.timeline}>
        {[
          { year: '2018', drop: '-20%', recovery: '4 mo' },
          { year: '2020', drop: '-34%', recovery: '5 mo' },
          { year: '2022', drop: '-25%', recovery: '10 mo' },
        ].map((event) => (
          <View key={event.year} style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <Text style={styles.timelineYear}>{event.year}</Text>
            <Text style={styles.timelineDrop}>{event.drop}</Text>
            <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.3)" />
            <Text style={styles.timelineRecovery}>Recovered: {event.recovery}</Text>
          </View>
        ))}
      </View>
    </View>,

    // Card 5: Your FII Edge
    <View key="edge" style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="sparkles" size={18} color="#60A5FA" />
        <Text style={styles.cardTitle}>Your FII Edge</Text>
      </View>
      <Text style={styles.cardBody}>
        FII users who follow signals outperform by an estimated 2.3% annually.
      </Text>
      <View style={styles.edgeCard}>
        <Text style={styles.edgeValue}>+2.3%</Text>
        <Text style={styles.edgeLabel}>estimated annual outperformance</Text>
      </View>
      <Text style={styles.disclaimer}>
        Simulated for MVP — based on backtested signal performance.
      </Text>
    </View>,
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Market Context</Text>
      <Text style={styles.sectionSubtitle}>Swipe for behavioral insights</Text>

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
        {cards}
      </ScrollView>

      {/* Page dots */}
      <View style={styles.dots}>
        {cards.map((_, i) => (
          <View
            key={`dot-${i}`}
            style={[
              styles.dot,
              currentIndex === i && styles.dotActive,
            ]}
          />
        ))}
      </View>
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
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  cardBody: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  chartContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 12,
  },
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
  barComparison: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 24,
    height: 180,
    paddingTop: 10,
  },
  barItem: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: 44,
    borderRadius: 8,
    marginBottom: 8,
  },
  barLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  barCaption: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },
  timeline: {
    gap: 10,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 10,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  timelineYear: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    width: 40,
  },
  timelineDrop: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
    width: 40,
  },
  timelineRecovery: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
  edgeCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(96,165,250,0.08)',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.15)',
  },
  edgeValue: {
    color: '#60A5FA',
    fontSize: 40,
    fontWeight: '900',
  },
  edgeLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 4,
  },
  disclaimer: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
  },
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
});
