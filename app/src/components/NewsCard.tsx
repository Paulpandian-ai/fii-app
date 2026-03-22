import React from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SwipeHint } from './SwipeHint';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface NewsItem {
  headline: string;
  summary: string;
  source: string;
  datetime: number;
  url: string;
  related?: string;
  category?: string;
}

interface NewsCardProps {
  items: NewsItem[];
}

const formatTimeAgo = (timestamp: number): string => {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp * 1000;
  if (diff < 0) return '';
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const NewsItemRow: React.FC<{ item: NewsItem; isLast: boolean }> = ({ item, isLast }) => {
  const handlePress = () => {
    if (item.url) {
      Linking.openURL(item.url).catch(() => {});
    }
  };

  const relatedTickers = item.related
    ? item.related.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 4)
    : [];

  return (
    <TouchableOpacity
      style={[styles.newsItem, !isLast && styles.newsItemBorder]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.newsAccent} />
      <View style={styles.newsContent}>
        <View style={styles.newsCategoryRow}>
          <Ionicons name="newspaper-outline" size={12} color="#60A5FA" />
          <Text style={styles.newsCategoryText}>
            {item.category === 'general' ? 'MARKET NEWS' : (item.category || 'NEWS').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.newsHeadline} numberOfLines={2}>{item.headline}</Text>
        <View style={styles.newsSourceRow}>
          <Text style={styles.newsSource}>{item.source}</Text>
          {item.datetime > 0 && (
            <Text style={styles.newsTime}>{formatTimeAgo(item.datetime)}</Text>
          )}
        </View>
        {item.summary ? (
          <Text style={styles.newsSummary} numberOfLines={2}>{item.summary}</Text>
        ) : null}
        {relatedTickers.length > 0 && (
          <View style={styles.relatedRow}>
            <Text style={styles.relatedLabel}>Impacts:</Text>
            {relatedTickers.map((t) => (
              <Text key={t} style={styles.relatedTicker}>{t}</Text>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

export const NewsCard: React.FC<NewsCardProps> = ({ items }) => {
  const displayItems = items.slice(0, 3);

  return (
    <View style={styles.cardWrapper}>
      <LinearGradient
        colors={['#0D1B3E', '#162B55']}
        style={styles.card}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <View style={styles.header}>
          <Ionicons name="newspaper" size={18} color="#60A5FA" />
          <Text style={styles.headerText}>Market News</Text>
          <Text style={styles.headerSub}>Real-time</Text>
        </View>

        <View style={styles.newsList}>
          {displayItems.map((item, index) => (
            <NewsItemRow
              key={`news-${index}-${item.datetime}`}
              item={item}
              isLast={index === displayItems.length - 1}
            />
          ))}
        </View>

        <View style={styles.hintContainer}>
          <SwipeHint />
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  cardWrapper: {
    height: SCREEN_HEIGHT,
    width: '100%',
  },
  card: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 90,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 'auto',
  },
  newsList: {
    flex: 1,
    gap: 0,
  },
  newsItem: {
    flexDirection: 'row',
    paddingVertical: 14,
  },
  newsItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  newsAccent: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(96,165,250,0.4)',
    marginRight: 12,
  },
  newsContent: {
    flex: 1,
  },
  newsCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  newsCategoryText: {
    color: '#60A5FA',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  newsHeadline: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginBottom: 4,
  },
  newsSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  newsSource: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '500',
  },
  newsTime: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    fontWeight: '400',
  },
  newsSummary: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
    marginBottom: 4,
  },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  relatedLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '600',
  },
  relatedTicker: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(96,165,250,0.1)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  hintContainer: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
  },
});
