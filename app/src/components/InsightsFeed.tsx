import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { getCoachInsights } from '../services/api';
import { Skeleton } from './Skeleton';

interface Insight {
  title: string;
  body: string;
  type: string;
  severity?: string;
  ticker?: string;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  risk: { icon: 'shield-outline', color: '#F5A623' },
  opportunity: { icon: 'trending-up', color: '#00C9A7' },
  tax: { icon: 'cash-outline', color: '#60A5FA' },
  diversification: { icon: 'pie-chart-outline', color: '#8B5CF6' },
  performance: { icon: 'analytics-outline', color: '#EC4899' },
};

export const InsightsFeed: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getCoachInsights();
        if (mounted && data?.insights) {
          setInsights(data.insights.slice(0, 5));
        }
      } catch {}
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>AI Insights</Text>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ marginBottom: 8 }}>
            <Skeleton width="100%" height={70} borderRadius={12} />
          </View>
        ))}
      </View>
    );
  }

  if (insights.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>AI Insights</Text>

      {insights.map((insight, i) => {
        const config = TYPE_CONFIG[insight.type] || TYPE_CONFIG.performance;
        return (
          <TouchableOpacity
            key={i}
            style={styles.insightCard}
            onPress={() => navigation.navigate('AICoach')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${config.color}15` }]}>
              <Ionicons name={config.icon as any} size={18} color={config.color} />
            </View>
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle} numberOfLines={1}>{insight.title}</Text>
              <Text style={styles.insightBody} numberOfLines={2}>{insight.body}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
          </TouchableOpacity>
        );
      })}

      <Text style={styles.disclaimer}>
        AI-generated insights for educational purposes only.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  insightBody: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    lineHeight: 17,
  },
  disclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 9,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
});
