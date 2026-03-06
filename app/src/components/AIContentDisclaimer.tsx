import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const AIContentDisclaimer: React.FC = () => (
  <View style={styles.container}>
    <Ionicons name="information-circle-outline" size={11} color="rgba(255,255,255,0.3)" />
    <Text style={styles.text}>AI-generated analysis for educational purposes only</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  text: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontStyle: 'italic',
  },
});
