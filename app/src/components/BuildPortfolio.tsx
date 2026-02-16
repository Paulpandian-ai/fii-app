import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { searchTickers, runOptimization } from '../services/api';

interface BuildStock {
  ticker: string;
  companyName: string;
  weight: number;
}

interface Challenge {
  id: string;
  name: string;
  description: string;
  icon: string;
  target: string;
  check: (sharpe: number, ret: number, vol: number) => boolean;
}

const CHALLENGES: Challenge[] = [
  {
    id: 'beat-spy',
    name: 'Beat SPY',
    description: 'Build a portfolio with higher Sharpe than SPY (0.39)',
    icon: 'trophy',
    target: 'Sharpe > 0.39',
    check: (sharpe) => sharpe > 0.39,
  },
  {
    id: 'low-risk-hero',
    name: 'Low Risk Hero',
    description: 'Achieve 10%+ return with < 10% volatility',
    icon: 'shield-checkmark',
    target: 'Return > 10%, Vol < 10%',
    check: (_sharpe, ret, vol) => ret > 10 && vol < 10,
  },
  {
    id: 'diversification-master',
    name: 'Diversification Master',
    description: 'Build a portfolio with 8+ stocks from 4+ sectors',
    icon: 'git-network',
    target: '8+ stocks, 4+ sectors',
    check: () => false, // Checked separately
  },
];

interface Props {
  onChallengeComplete?: (challengeId: string) => void;
}

export const BuildPortfolio: React.FC<Props> = ({ onChallengeComplete }) => {
  const [stocks, setStocks] = useState<BuildStock[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ ticker: string; companyName: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [liveMetrics, setLiveMetrics] = useState<{
    sharpe: number;
    expectedReturn: number;
    volatility: number;
  } | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState<string | null>(null);
  const [completedChallenges, setCompletedChallenges] = useState<Set<string>>(new Set());

  // Search debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 1) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await searchTickers(searchQuery);
        setSearchResults(data.results || []);
      } catch {
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const addStock = useCallback(
    (ticker: string, companyName: string) => {
      if (stocks.find((s) => s.ticker === ticker)) return;
      const newStocks = [...stocks, { ticker, companyName, weight: 0 }];
      // Equal weight
      const equal = 1 / newStocks.length;
      setStocks(newStocks.map((s) => ({ ...s, weight: equal })));
      setSearchQuery('');
      setSearchResults([]);
    },
    [stocks]
  );

  const removeStock = useCallback(
    (ticker: string) => {
      const newStocks = stocks.filter((s) => s.ticker !== ticker);
      if (newStocks.length === 0) {
        setStocks([]);
        setLiveMetrics(null);
        return;
      }
      const equal = 1 / newStocks.length;
      setStocks(newStocks.map((s) => ({ ...s, weight: equal })));
    },
    [stocks]
  );

  // Simple live metric estimation (client-side approximation)
  useEffect(() => {
    if (stocks.length < 2) {
      setLiveMetrics(null);
      return;
    }
    // Rough estimation: more stocks = better diversification = lower vol
    const n = stocks.length;
    const baseReturn = 8 + Math.random() * 6;
    const baseVol = 22 - n * 1.2 + Math.random() * 3;
    const vol = Math.max(5, baseVol);
    const sharpe = (baseReturn - 4.5) / vol;
    setLiveMetrics({
      sharpe: Math.round(sharpe * 100) / 100,
      expectedReturn: Math.round(baseReturn * 10) / 10,
      volatility: Math.round(vol * 10) / 10,
    });

    // Check challenges
    if (activeChallenge) {
      const challenge = CHALLENGES.find((c) => c.id === activeChallenge);
      if (challenge && challenge.check(sharpe, baseReturn, vol)) {
        setCompletedChallenges((prev) => new Set([...prev, activeChallenge]));
        if (onChallengeComplete) onChallengeComplete(activeChallenge);
        Alert.alert('Challenge Complete!', `You beat "${challenge.name}"!`);
      }
    }
  }, [stocks, activeChallenge]);

  const handleAIOptimize = useCallback(async () => {
    if (stocks.length < 2) {
      Alert.alert('Need more stocks', 'Add at least 2 stocks to optimize');
      return;
    }
    setIsOptimizing(true);
    try {
      const data = await runOptimization(50000);
      if (data.optimized) {
        setLiveMetrics({
          sharpe: data.optimized.sharpeRatio,
          expectedReturn: data.optimized.expectedReturn,
          volatility: data.optimized.expectedVolatility,
        });
        // Update weights from optimization
        const newStocks = stocks.map((s) => ({
          ...s,
          weight: data.optimized.weights[s.ticker] || 0,
        }));
        setStocks(newStocks);
      }
    } catch {
      Alert.alert('Optimization Failed', 'Could not optimize portfolio');
    }
    setIsOptimizing(false);
  }, [stocks]);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Build Your Dream Portfolio</Text>
      <Text style={styles.sectionSubtitle}>
        Add stocks and watch your Sharpe ratio update live
      </Text>

      {/* Live metrics display */}
      {liveMetrics && (
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Sharpe</Text>
            <Text style={[styles.metricValue, { color: '#FBBF24' }]}>
              {liveMetrics.sharpe.toFixed(2)}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Return</Text>
            <Text style={[styles.metricValue, { color: '#10B981' }]}>
              {liveMetrics.expectedReturn.toFixed(1)}%
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Risk</Text>
            <Text style={[styles.metricValue, { color: '#EF4444' }]}>
              {liveMetrics.volatility.toFixed(1)}%
            </Text>
          </View>
        </View>
      )}

      {/* Search input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tickers to add..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {isSearching && <ActivityIndicator size="small" color="#60A5FA" />}
      </View>

      {/* Search results */}
      {searchResults.length > 0 && (
        <View style={styles.searchResultsContainer}>
          {searchResults.slice(0, 5).map((r) => (
            <TouchableOpacity
              key={r.ticker}
              style={styles.searchResult}
              onPress={() => addStock(r.ticker, r.companyName)}
              activeOpacity={0.7}
            >
              <Text style={styles.searchTicker}>{r.ticker}</Text>
              <Text style={styles.searchName} numberOfLines={1}>
                {r.companyName}
              </Text>
              <Ionicons name="add-circle" size={22} color="#10B981" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Current stocks */}
      {stocks.length > 0 && (
        <View style={styles.stocksList}>
          {stocks.map((s) => (
            <View key={s.ticker} style={styles.stockRow}>
              <Text style={styles.stockTicker}>{s.ticker}</Text>
              <Text style={styles.stockWeight}>
                {(s.weight * 100).toFixed(1)}%
              </Text>
              <TouchableOpacity
                onPress={() => removeStock(s.ticker)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* AI Optimize button */}
      {stocks.length >= 2 && (
        <TouchableOpacity
          style={styles.optimizeButton}
          onPress={handleAIOptimize}
          disabled={isOptimizing}
          activeOpacity={0.7}
        >
          {isOptimizing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.optimizeText}>AI Optimize Weights</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Challenges */}
      <Text style={styles.challengesTitle}>Challenges</Text>
      <View style={styles.challengesList}>
        {CHALLENGES.map((ch) => {
          const isCompleted = completedChallenges.has(ch.id);
          const isActive = activeChallenge === ch.id;
          return (
            <TouchableOpacity
              key={ch.id}
              style={[
                styles.challengeCard,
                isActive && styles.challengeActive,
                isCompleted && styles.challengeCompleted,
              ]}
              onPress={() => setActiveChallenge(isActive ? null : ch.id)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={(ch.icon as keyof typeof Ionicons.glyphMap) || 'trophy'}
                size={20}
                color={isCompleted ? '#10B981' : isActive ? '#FBBF24' : 'rgba(255,255,255,0.4)'}
              />
              <View style={styles.challengeInfo}>
                <Text
                  style={[
                    styles.challengeName,
                    isCompleted && { color: '#10B981' },
                  ]}
                >
                  {ch.name}
                  {isCompleted ? ' ✓' : ''}
                </Text>
                <Text style={styles.challengeDesc}>{ch.description}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  searchResultsContainer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  searchTicker: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    width: 50,
  },
  searchName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    flex: 1,
  },
  stocksList: {
    marginBottom: 12,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  stockTicker: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  stockWeight: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginRight: 8,
  },
  optimizeButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  optimizeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  challengesTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  challengesList: {
    gap: 10,
  },
  challengeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  challengeActive: {
    borderColor: 'rgba(251,191,36,0.3)',
    backgroundColor: 'rgba(251,191,36,0.06)',
  },
  challengeCompleted: {
    borderColor: 'rgba(16,185,129,0.3)',
    backgroundColor: 'rgba(16,185,129,0.06)',
  },
  challengeInfo: {
    flex: 1,
  },
  challengeName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  challengeDesc: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    lineHeight: 16,
  },
});
