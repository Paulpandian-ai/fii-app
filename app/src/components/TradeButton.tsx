import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Broker {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  description: string;
  deepLink: string;
  webLink: string;
}

const BROKERS: Broker[] = [
  {
    id: 'robinhood',
    name: 'Robinhood',
    icon: 'logo-usd',
    color: '#00C805',
    description: 'Commission-free trading',
    deepLink: 'robinhood://stocks/{ticker}',
    webLink: 'https://robinhood.com/stocks/{ticker}?ref=fii',
  },
  {
    id: 'webull',
    name: 'Webull',
    icon: 'trending-up',
    color: '#F5A623',
    description: 'Advanced charting & analysis',
    deepLink: 'webull://quote/{ticker}',
    webLink: 'https://www.webull.com/quote/{ticker}?source=fii',
  },
  {
    id: 'schwab',
    name: 'Schwab',
    icon: 'business',
    color: '#00A0DF',
    description: 'Full-service brokerage',
    deepLink: 'schwab://trade?symbol={ticker}',
    webLink: 'https://www.schwab.com/research/stocks/quotes/{ticker}?ref=fii',
  },
  {
    id: 'fidelity',
    name: 'Fidelity',
    icon: 'shield-checkmark',
    color: '#4B8B3B',
    description: 'Retirement & long-term investing',
    deepLink: 'fidelity://trade?symbol={ticker}',
    webLink: 'https://www.fidelity.com/quote/{ticker}?ref=fii',
  },
];

interface Props {
  ticker: string;
}

export const TradeButton: React.FC<Props> = ({ ticker }) => {
  const [visible, setVisible] = useState(false);

  const handleBrokerPress = useCallback(
    async (broker: Broker) => {
      const deep = broker.deepLink.replace('{ticker}', ticker);
      const web = broker.webLink.replace('{ticker}', ticker);

      setVisible(false);

      try {
        const canOpen = await Linking.canOpenURL(deep);
        if (canOpen) {
          await Linking.openURL(deep);
        } else {
          await Linking.openURL(web);
        }
      } catch {
        Alert.alert('Error', `Could not open ${broker.name}. Please install the app or try again.`);
      }
    },
    [ticker],
  );

  return (
    <>
      <TouchableOpacity style={styles.tradeBtn} onPress={() => setVisible(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Trade ${ticker}`}>
        <Ionicons name="swap-horizontal" size={18} color="#FFF" />
        <Text style={styles.tradeBtnText}>Trade {ticker}</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Trade {ticker}</Text>
            <Text style={styles.modalSubtitle}>Choose your brokerage</Text>

            {BROKERS.map((broker) => (
              <TouchableOpacity
                key={broker.id}
                style={styles.brokerRow}
                onPress={() => handleBrokerPress(broker)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Trade ${ticker} on ${broker.name}, ${broker.description}`}
              >
                <View style={[styles.brokerIcon, { backgroundColor: broker.color + '20' }]}>
                  <Ionicons name={broker.icon} size={22} color={broker.color} />
                </View>
                <View style={styles.brokerInfo}>
                  <Text style={styles.brokerName}>{broker.name}</Text>
                  <Text style={styles.brokerDesc}>{broker.description}</Text>
                </View>
                <Ionicons name="open-outline" size={18} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            ))}

            <Text style={styles.disclaimer}>
              FII does not execute trades. You will be redirected to a brokerage app. FII may receive
              referral compensation from brokerage partners.
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  tradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 12,
  },
  tradeBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  brokerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  brokerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brokerInfo: {
    flex: 1,
  },
  brokerName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  brokerDesc: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  disclaimer: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },
});
