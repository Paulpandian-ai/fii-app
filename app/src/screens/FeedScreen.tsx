import React from 'react';
import { View, Text } from 'react-native';

export const FeedScreen: React.FC = () => {
  return (
    <View style={{ flex: 1, backgroundColor: '#0D1B3E', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: 'white', fontSize: 20 }}>Feed Tab - Debug Mode</Text>
    </View>
  );
};
