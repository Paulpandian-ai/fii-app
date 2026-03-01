import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const ScoreInfoTooltip: React.FC = () => {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity onPress={() => setVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="information-circle-outline" size={16} color="rgba(255,255,255,0.4)" />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={styles.tooltip}>
            <Text style={styles.tooltipText}>
              This score reflects quantitative analysis of six factor categories using publicly available data. It is not a recommendation.
            </Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  tooltip: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 16,
    maxWidth: 300,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tooltipText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
