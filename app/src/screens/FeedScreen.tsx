import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, FlatList, StatusBar } from 'react-native';
import type { ViewToken } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { FeedCard } from '../components/FeedCard';
import { useFeedStore } from '../store/feedStore';
import type { FeedItem, Signal } from '../types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Placeholder data for 8 stocks
const PLACEHOLDER_FEED: FeedItem[] = [
  {
    id: '1',
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    compositeScore: 8.2,
    signal: 'BUY',
    insight: 'Dominant AI chip positioning with expanding data center margins and accelerating hyperscaler demand.',
    topFactors: [
      { name: 'Supply Chain', score: 2.0 },
      { name: 'Macro', score: -1.0 },
      { name: 'Performance', score: 1.5 },
    ],
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '2',
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    compositeScore: 6.8,
    signal: 'HOLD',
    insight: 'Strong services growth offsets slowing hardware cycle. Apple Intelligence rollout could be a catalyst.',
    topFactors: [
      { name: 'Performance', score: 1.0 },
      { name: 'Sentiment', score: 0.5 },
      { name: 'Macro', score: -0.5 },
    ],
    updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '3',
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    compositeScore: 4.5,
    signal: 'HOLD',
    insight: 'EV margin pressure persists but Robotaxi optionality and energy storage diversify the thesis.',
    topFactors: [
      { name: 'Sentiment', score: -1.5 },
      { name: 'Performance', score: 0.5 },
      { name: 'Supply Chain', score: 1.0 },
    ],
    updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '4',
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    compositeScore: 7.9,
    signal: 'BUY',
    insight: 'Azure AI revenue growing 50%+ QoQ. Copilot monetization ramping across enterprise suite.',
    topFactors: [
      { name: 'Performance', score: 1.8 },
      { name: 'Macro', score: 0.5 },
      { name: 'Supply Chain', score: 0.8 },
    ],
    updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '5',
    ticker: 'META',
    companyName: 'Meta Platforms, Inc.',
    compositeScore: 7.1,
    signal: 'BUY',
    insight: 'Ad revenue reacceleration and AI-driven content recommendations boosting engagement metrics.',
    topFactors: [
      { name: 'Performance', score: 1.5 },
      { name: 'Sentiment', score: 1.0 },
      { name: 'Macro', score: -0.5 },
    ],
    updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '6',
    ticker: 'AMZN',
    companyName: 'Amazon.com, Inc.',
    compositeScore: 7.5,
    signal: 'BUY',
    insight: 'AWS margin expansion and retail efficiency gains driving best profitability in company history.',
    topFactors: [
      { name: 'Performance', score: 1.2 },
      { name: 'Supply Chain', score: 1.5 },
      { name: 'Macro', score: 0.3 },
    ],
    updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '7',
    ticker: 'INTC',
    companyName: 'Intel Corporation',
    compositeScore: 2.8,
    signal: 'SELL',
    insight: 'Foundry losses mounting with market share erosion in both data center and client segments.',
    topFactors: [
      { name: 'Performance', score: -1.8 },
      { name: 'Supply Chain', score: -1.0 },
      { name: 'Sentiment', score: -1.5 },
    ],
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '8',
    ticker: 'GOOGL',
    companyName: 'Alphabet Inc.',
    compositeScore: 7.3,
    signal: 'BUY',
    insight: 'Search moat intact with Gemini integration. Cloud growing 28% with improving margins.',
    topFactors: [
      { name: 'Performance', score: 1.3 },
      { name: 'Macro', score: 0.5 },
      { name: 'Sentiment', score: 0.8 },
    ],
    updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
];

export const FeedScreen: React.FC = () => {
  const { items, setItems, setCurrentIndex } = useFeedStore();
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // Load placeholder data on mount
    if (items.length === 0) {
      setItems(PLACEHOLDER_FEED);
    }
  }, []);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    [setCurrentIndex]
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const displayItems = items.length > 0 ? items : PLACEHOLDER_FEED;

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <FeedCard
        item={item}
        onPress={() => {
          // Navigation to SignalDetail will be wired in future prompt
        }}
      />
    ),
    []
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: SCREEN_HEIGHT,
      offset: SCREEN_HEIGHT * index,
      index,
    }),
    []
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <FlatList
        ref={flatListRef}
        data={displayItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled={true}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        windowSize={5}
        maxToRenderPerBatch={3}
        initialNumToRender={2}
        removeClippedSubviews={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1B3E',
  },
});
