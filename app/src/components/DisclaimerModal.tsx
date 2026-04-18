import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DISCLAIMER_KEY = '@fii_disclaimer_acknowledged';

export const DisclaimerModal: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DISCLAIMER_KEY).then((val) => {
      if (!val) setVisible(true);
    }).catch(() => setVisible(true));
  }, []);

  const handleAccept = () => {
    const timestamp = new Date().toISOString();
    AsyncStorage.setItem(DISCLAIMER_KEY, timestamp).catch(() => {});
    setVisible(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Important Information</Text>
          <ScrollView style={styles.scrollBody}>
            <Text style={styles.body}>
              Factor Impact Intelligence provides educational analysis of publicly available market data. All scores, analysis, and content are for informational purposes only and do not constitute financial advice. Past performance does not guarantee future results. Consult a qualified financial advisor before making financial decisions.
            </Text>
          </ScrollView>
          <TouchableOpacity style={styles.button} onPress={handleAccept} activeOpacity={0.8}>
            <Text style={styles.buttonText}>I Understand</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  scrollBody: {
    maxHeight: 260,
    marginBottom: 20,
  },
  body: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#4A90D9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
