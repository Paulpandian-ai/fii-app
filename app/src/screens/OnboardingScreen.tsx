import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  onComplete: () => void;
}

const PROFILES = [
  { id: 'conservative', label: 'New to investing', icon: 'checkmark-circle' as const, desc: 'I want guidance on every step' },
  { id: 'moderate', label: 'I know the basics', icon: 'bar-chart' as const, desc: 'I understand risk/reward' },
  { id: 'aggressive', label: 'Experienced trader', icon: 'rocket' as const, desc: 'Show me advanced tools' },
];

export const OnboardingScreen: React.FC<Props> = ({ onComplete }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Staggered animations for page 2
  const row1Opacity = useRef(new Animated.Value(0)).current;
  const row2Opacity = useRef(new Animated.Value(0)).current;
  const row3Opacity = useRef(new Animated.Value(0)).current;

  const handleScroll = (e: any) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentPage(page);

    // Animate rows on page 2
    if (page === 1) {
      Animated.stagger(300, [
        Animated.timing(row1Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(row2Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(row3Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  };

  const handleComplete = async () => {
    if (selectedProfile) {
      await AsyncStorage.setItem('@fii_risk_profile', selectedProfile);
    }
    await AsyncStorage.setItem('@fii_onboarding_complete', 'true');
    onComplete();
  };

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal={true}
        pagingEnabled={true}
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={200}
      >
        {/* Page 1: Welcome */}
        <View style={styles.page}>
          <View style={styles.pageContent}>
            <Ionicons name="trending-up" size={80} color="#FFFFFF" />
            <Text style={styles.title}>Factor Impact Intelligence</Text>
            <Text style={styles.subtitle}>
              Institutional-grade stock analysis in your pocket
            </Text>
          </View>
          <Text style={styles.swipeHint}>Swipe to learn more</Text>
        </View>

        {/* Page 2: How It Works */}
        <View style={styles.page}>
          <View style={styles.pageContent}>
            <Text style={styles.pageTitle}>How It Works</Text>
            <Animated.View style={[styles.featureRow, { opacity: row1Opacity }]}>
              <View style={styles.featureIcon}>
                <Ionicons name="brain-outline" size={28} color="#60A5FA" />
              </View>
              <Text style={styles.featureText}>
                AI analyzes 18 risk factors for every stock
              </Text>
            </Animated.View>
            <Animated.View style={[styles.featureRow, { opacity: row2Opacity }]}>
              <View style={styles.featureIcon}>
                <Ionicons name="checkmark-circle-outline" size={28} color="#10B981" />
              </View>
              <Text style={styles.featureText}>
                Get transparent Buy/Hold/Sell signals
              </Text>
            </Animated.View>
            <Animated.View style={[styles.featureRow, { opacity: row3Opacity }]}>
              <View style={styles.featureIcon}>
                <Ionicons name="trending-up-outline" size={28} color="#FBBF24" />
              </View>
              <Text style={styles.featureText}>
                Optimize your portfolio like a hedge fund
              </Text>
            </Animated.View>
          </View>
        </View>

        {/* Page 3: Get Started */}
        <View style={styles.page}>
          <View style={styles.pageContent}>
            <Text style={styles.pageTitle}>Get Started</Text>
            <Text style={styles.profilePrompt}>What describes you best?</Text>
            {PROFILES.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.profileCard,
                  selectedProfile === p.id && styles.profileCardSelected,
                ]}
                onPress={() => setSelectedProfile(p.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={p.icon}
                  size={24}
                  color={selectedProfile === p.id ? '#60A5FA' : 'rgba(255,255,255,0.4)'}
                />
                <View style={styles.profileInfo}>
                  <Text style={[
                    styles.profileLabel,
                    selectedProfile === p.id && styles.profileLabelSelected,
                  ]}>
                    {p.label}
                  </Text>
                  <Text style={styles.profileDesc}>{p.desc}</Text>
                </View>
                {selectedProfile === p.id && (
                  <Ionicons name="checkmark-circle" size={20} color="#60A5FA" />
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.startButton, !selectedProfile && styles.startButtonDisabled]}
              onPress={handleComplete}
              activeOpacity={0.8}
              disabled={!selectedProfile}
            >
              <Text style={styles.startButtonText}>Let's Go!</Text>
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              For educational purposes only. Not investment advice.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Dots */}
      <View style={styles.dots}>
        {[0, 1, 2].map((i) => (
          <View
            key={`dot-${i}`}
            style={[styles.dot, currentPage === i && styles.dotActive]}
          />
        ))}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  pageContent: {
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 24,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  swipeHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
  },
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 32,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
    width: '100%',
  },
  featureIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    flex: 1,
    lineHeight: 22,
  },
  profilePrompt: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  profileCardSelected: {
    borderColor: 'rgba(96,165,250,0.4)',
    backgroundColor: 'rgba(96,165,250,0.08)',
  },
  profileInfo: {
    flex: 1,
  },
  profileLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  profileLabelSelected: {
    color: '#60A5FA',
  },
  profileDesc: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  startButton: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 20,
  },
  startButtonDisabled: {
    opacity: 0.4,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  disclaimer: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 48,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dotActive: {
    backgroundColor: '#60A5FA',
    width: 24,
    borderRadius: 4,
  },
});
