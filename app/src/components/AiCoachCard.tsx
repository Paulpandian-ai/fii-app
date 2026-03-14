import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { getCoachSuggestions } from '../services/api';

const DEFAULT_CHIPS = [
  { label: 'How risky is my portfolio?', message: 'How risky is my portfolio?' },
  { label: 'Analyze my portfolio', message: 'Analyze my portfolio performance and risk' },
  { label: 'Tax savings opportunities?', message: 'What are my tax-loss harvesting opportunities?' },
  { label: 'Compare stocks', message: 'Compare my top holdings by factor scores' },
];

interface Props {
  onChipPress?: (message: string) => void;
}

export const AiCoachCard: React.FC<Props> = ({ onChipPress }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [chips, setChips] = useState(DEFAULT_CHIPS);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getCoachSuggestions();
        if (mounted && data?.suggestions?.length >= 4) {
          setChips(data.suggestions.slice(0, 4));
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  const handleChipPress = (message: string) => {
    if (onChipPress) {
      onChipPress(message);
    } else {
      navigation.navigate('AICoach');
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => navigation.navigate('AICoach')}
      activeOpacity={0.85}
    >
      <LinearGradient
        colors={['rgba(139,92,246,0.15)', 'rgba(96,165,250,0.10)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles" size={20} color="#8B5CF6" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>AI Coach</Text>
            <Text style={styles.subtitle}>How can I help with your portfolio today?</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
        </View>

        <View style={styles.chipGrid}>
          {chips.map((chip, i) => (
            <TouchableOpacity
              key={i}
              style={styles.chip}
              onPress={() => handleChipPress(chip.message)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipText} numberOfLines={1}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradient: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 2,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});
