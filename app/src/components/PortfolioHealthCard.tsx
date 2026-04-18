import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getPortfolioAnalytics } from '../services/api';
import { Skeleton } from './Skeleton';

interface MetricInfo {
  title: string;
  value: string;
  subtitle: string;
  rating: string;
  ratingColor: string;
  explanation: string;
  calculation: string;
  goodVsBad: string;
  benchmark: string;
  analogy: string;
}

interface Props {
  onLoaded?: (data: any) => void;
}

export const PortfolioHealthCard: React.FC<Props> = ({ onLoaded }) => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<MetricInfo | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getPortfolioAnalytics();
        if (mounted) {
          setAnalytics(data);
          onLoaded?.(data);
        }
      } catch {}
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Portfolio Health</Text>
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.metricCard}>
              <Skeleton width="60%" height={12} borderRadius={4} />
              <Skeleton width="80%" height={24} borderRadius={4} />
              <Skeleton width="100%" height={8} borderRadius={4} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (!analytics || !analytics.risk_metrics) {
    return null;
  }

  const risk = analytics.risk_metrics || {};
  const div = analytics.diversification || {};
  const sharpe = risk.sharpe_ratio || {};
  const drawdown = risk.max_drawdown || {};
  const beta = risk.portfolio_beta;

  const metrics: MetricInfo[] = [
    {
      title: 'Diversification',
      value: `${div.score ?? '--'}/100`,
      subtitle: div.rating || 'N/A',
      rating: div.score >= 70 ? 'Good' : div.score >= 40 ? 'Fair' : 'Low',
      ratingColor: div.score >= 70 ? '#00C9A7' : div.score >= 40 ? '#F5A623' : '#F5A623',
      explanation: 'Diversification measures how spread out your investments are across different stocks and sectors. Higher diversification reduces the impact of any single stock dropping.',
      calculation: 'Combines position concentration (30%), sector spread (30%), stock correlation (20%), and number of holdings (20%) into a 0-100 score.',
      goodVsBad: 'Above 70: Well diversified. 40-70: Moderate concentration. Below 40: Highly concentrated — a single stock or sector could significantly impact returns.',
      benchmark: `Your score: ${div.score}/100. ${div.rating || ''}`,
      analogy: 'Think of it like a balanced diet — eating only pizza may taste great, but a variety of foods keeps you healthier long-term.',
    },
    {
      title: 'Risk-Return',
      value: sharpe.value != null ? `${sharpe.value}` : '--',
      subtitle: sharpe.benchmark != null ? `vs ${sharpe.benchmark} S&P` : 'Sharpe Ratio',
      rating: sharpe.rating || 'N/A',
      ratingColor: (sharpe.value ?? 0) >= 1.0 ? '#00C9A7' : (sharpe.value ?? 0) >= 0.5 ? '#60A5FA' : '#F5A623',
      explanation: 'The Sharpe ratio measures how much return you get for each unit of risk. A higher number means your portfolio is being efficiently rewarded for the volatility it takes on.',
      calculation: '(Portfolio annualized return - Risk-free rate) / Portfolio annualized volatility. Risk-free rate comes from 3-month Treasury bills.',
      goodVsBad: 'Above 1.0: Strong risk-adjusted returns. 0.5-1.0: Acceptable. Below 0.5: Returns may not justify the risk taken.',
      benchmark: sharpe.benchmark != null ? `Your Sharpe: ${sharpe.value} vs S&P 500: ${sharpe.benchmark}` : `Your Sharpe: ${sharpe.value}`,
      analogy: 'Like miles per gallon in a car — it measures how much "performance" you get per unit of "fuel" (risk) you burn.',
    },
    {
      title: 'Max Drawdown',
      value: drawdown.pct != null ? `${drawdown.pct}%` : '--',
      subtitle: drawdown.start && drawdown.end ? `${drawdown.start.slice(5)} to ${drawdown.end.slice(5)}` : 'Peak to trough',
      rating: (drawdown.pct ?? 0) > -15 ? 'Moderate' : 'Significant',
      ratingColor: (drawdown.pct ?? 0) > -15 ? '#60A5FA' : '#F5A623',
      explanation: 'Max drawdown is the largest peak-to-trough decline your portfolio experienced. It shows the worst-case scenario that actually happened.',
      calculation: 'Tracks the cumulative portfolio value over time and finds the biggest drop from any peak to the following trough.',
      goodVsBad: 'Above -10%: Low drawdown. -10% to -20%: Moderate. Below -20%: Significant — may take considerable time to recover.',
      benchmark: `Your max drawdown: ${drawdown.pct}%${drawdown.days_to_recover ? `. Recovery: ${drawdown.days_to_recover} days` : ''}`,
      analogy: 'Like the deepest pothole on a road trip — it tells you the worst bump you experienced, even if the overall journey was smooth.',
    },
    {
      title: 'Portfolio Beta',
      value: beta != null ? `${beta}` : '--',
      subtitle: beta != null ? `${beta > 1 ? '+' : ''}${((beta - 1) * 100).toFixed(0)}% vs market` : 'Market sensitivity',
      rating: beta != null ? (beta <= 1.0 ? 'Defensive' : beta <= 1.3 ? 'Moderate' : 'Aggressive') : 'N/A',
      ratingColor: beta != null ? (beta <= 1.0 ? '#00C9A7' : beta <= 1.3 ? '#60A5FA' : '#F5A623') : '#60A5FA',
      explanation: 'Beta measures how much your portfolio moves relative to the overall market. A beta of 1.0 means it moves with the market; above 1.0 means more volatile.',
      calculation: 'Weighted average of individual stock betas. Each stock\'s beta measures its historical price movement relative to the S&P 500.',
      goodVsBad: 'Below 1.0: Less volatile than market (defensive). 1.0-1.3: Slightly above market. Above 1.3: Significantly more volatile.',
      benchmark: beta != null ? `Your beta: ${beta}. If market drops 10%, your portfolio might drop ~${(beta * 10).toFixed(0)}%.` : '',
      analogy: 'Like a boat on the ocean — a beta of 1 means you ride the same waves as the market. Higher beta means bigger waves, for better or worse.',
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Portfolio Health</Text>
      <View style={styles.grid}>
        {metrics.map((metric, i) => (
          <TouchableOpacity
            key={i}
            style={styles.metricCard}
            onPress={() => setSelectedMetric(metric)}
            activeOpacity={0.7}
          >
            <Text style={styles.metricTitle}>{metric.title}</Text>
            <Text style={styles.metricValue}>{metric.value}</Text>
            <Text style={styles.metricSubtitle}>{metric.subtitle}</Text>
            <View style={[styles.ratingBadge, { backgroundColor: `${metric.ratingColor}15` }]}>
              <Text style={[styles.ratingText, { color: metric.ratingColor }]}>{metric.rating}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bottom sheet modal */}
      <Modal
        visible={!!selectedMetric}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMetric(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedMetric(null)}
        >
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sheetTitle}>{selectedMetric?.title}</Text>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetLabel}>WHAT IS IT?</Text>
                <Text style={styles.sheetBody}>{selectedMetric?.explanation}</Text>
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetLabel}>HOW IT'S CALCULATED</Text>
                <Text style={styles.sheetBody}>{selectedMetric?.calculation}</Text>
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetLabel}>GOOD VS BAD</Text>
                <Text style={styles.sheetBody}>{selectedMetric?.goodVsBad}</Text>
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetLabel}>YOUR VALUE</Text>
                <Text style={styles.sheetBody}>{selectedMetric?.benchmark}</Text>
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetLabel}>THINK OF IT LIKE...</Text>
                <Text style={styles.sheetBody}>{selectedMetric?.analogy}</Text>
              </View>

              <Text style={styles.sheetDisclaimer}>
                For educational purposes only. Not financial advice.
              </Text>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 4,
  },
  metricTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  metricSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '500',
  },
  ratingBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Bottom sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 20,
  },
  sheetSection: {
    marginBottom: 18,
  },
  sheetLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  sheetBody: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 21,
  },
  sheetDisclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 12,
    marginBottom: 20,
  },
});
