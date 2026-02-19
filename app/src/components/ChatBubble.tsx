import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

interface ChatBubbleProps {
  ticker?: string;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ ticker }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={() => navigation.navigate('AIChat', { ticker })}
      activeOpacity={0.8}
    >
      <View style={styles.iconContainer}>
        <Ionicons name="sparkles" size={22} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    zIndex: 100,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#60A5FA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#60A5FA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
