import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import type { ViewToken } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FeedCard } from '../components/FeedCard';
import { SearchOverlay } from '../components/SearchOverlay';
import { SwipeHint } from '../components/SwipeHint';
import { useFeedStore } from '../store/feedStore';
import { getFeed } from '../services/api';
import type { FeedItem, FeedEntry, EducationalCard, RootStackParamList } from '../types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const isEducationalCard = (entry: FeedEntry): entry is EducationalCard => {
  return entry.type === 'educational';
};

export const FeedScreen: React.FC = () => {
  const { setItems, setCurrentIndex, isLoading, setLoading, setError } = useFeedStore();
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [searchVisible, setSearchVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    loadFeed();
  }, []);

  const loadFeed = async () => {
    setLoading(true);
    try {
      const data = await getFeed();
      const feedItems: FeedItem[] = [];
      const allEntries: FeedEntry[] = [];

      for (const entry of data.items || data.feed || []) {
        if (entry.type === 'educational') {
          allEntries.push(entry as EducationalCard);
        } else {
          const feedItem: FeedItem = {
            id: entry.id || entry.ticker,
            type: 'signal',
            ticker: entry.ticker,
            companyName: entry.companyName || entry.company_name || '',
            compositeScore: entry.compositeScore || entry.composite_score || 5,
            signal: entry.signal || 'HOLD',
            confidence: entry.confidence,
            insight: entry.insight || '',
            topFactors: entry.topFactors || entry.top_factors || [],
            updatedAt: entry.updatedAt || entry.updated_at || new Date().toISOString(),
          };
          feedItems.push(feedItem);
          allEntries.push(feedItem);
        }
      }

      setItems(feedItems);
      setFeed(allEntries);
    } catch {
      setError('Failed to load feed');
    } finally {
      setLoading(false);
    }
  };

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

  const handleCardPress = useCallback((item: FeedEntry) => {
    if (!isEducationalCard(item)) {
      navigation.navigate('SignalDetail', { ticker: item.ticker, feedItemId: item.id });
    }
  }, [navigation]);

  const handleSearchSelect = useCallback((ticker: string) => {
    setSearchVisible(false);
    navigation.navigate('SignalDetail', { ticker, feedItemId: ticker });
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: FeedEntry }) => {
      if (isEducationalCard(item)) {
        return (
          <View style={styles.cardWrapper}>
            <LinearGradient
              colors={['#1a237e', '#4a148c']}
              style={styles.eduCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.eduIcon}>
                <Ionicons name="school-outline" size={32} color="#B39DDB" />
              </View>
              <Text style={styles.eduLabel}>Did You Know?</Text>
              <Text style={styles.eduTitle}>{item.title}</Text>
              <Text style={styles.eduBody}>{item.body}</Text>
              <View style={styles.eduHint}>
                <SwipeHint />
              </View>
            </LinearGradient>
          </View>
        );
      }
      return (
        <FeedCard
          item={item}
          onPress={() => handleCardPress(item)}
        />
      );
    },
    [handleCardPress]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: SCREEN_HEIGHT,
      offset: SCREEN_HEIGHT * index,
      index,
    }),
    []
  );

  if (isLoading && feed.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#60A5FA" />
          <Text style={styles.loadingText}>Loading signals...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Search button */}
      <TouchableOpacity style={styles.searchBtn} onPress={() => setSearchVisible(true)}>
        <Ionicons name="search" size={22} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={feed}
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

      <SearchOverlay
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        onSelectTicker={handleSearchSelect}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1B3E',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    marginTop: 16,
  },
  searchBtn: {
    position: 'absolute',
    top: 54,
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardWrapper: {
    height: SCREEN_HEIGHT,
    width: '100%',
  },
  eduCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  eduIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(179,157,219,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  eduLabel: {
    color: '#B39DDB',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  eduTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 32,
  },
  eduBody: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  eduHint: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
});
