import React from 'react';
import { View, Text } from 'react-native';

export const CoachScreen: React.FC = () => {
  return (
    <View style={{ flex: 1, backgroundColor: '#0D1B3E', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: 'white', fontSize: 20 }}>Coach Tab - Debug Mode</Text>
    </View>
  );
};
