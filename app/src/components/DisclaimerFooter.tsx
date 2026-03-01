import React from 'react';
import { Text, StyleSheet } from 'react-native';

export const DisclaimerFooter: React.FC = () => (
  <Text style={styles.footer}>
    For educational purposes only {'\u00B7'} Not investment advice
  </Text>
);

const styles = StyleSheet.create({
  footer: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
});
