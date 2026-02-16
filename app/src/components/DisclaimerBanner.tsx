import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const DISCLAIMER_SHORT = 'For educational purposes only. Not investment advice.';

export const DISCLAIMER_FULL =
  'Factor Impact Intelligence (FII) is for educational and informational purposes only and does not constitute investment advice, financial advice, or tax advice. ' +
  'Factor scores are AI-generated model estimates based on publicly available data and may not reflect actual market conditions. ' +
  'Past performance does not guarantee future results. ' +
  'Sharpe ratios, Monte Carlo projections, and scenario analyses use historical data and statistical models that do not predict future returns. ' +
  'Tax-loss harvesting information is estimated and is not tax advice. ' +
  'Always consult a qualified financial advisor and tax professional before making investment or tax decisions. ' +
  'FII is not a registered investment advisor under the Investment Advisers Act of 1940.';

export const DisclaimerBanner: React.FC = () => {
  const [showFull, setShowFull] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={styles.banner}
        onPress={() => setShowFull(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="information-circle-outline" size={12} color="rgba(255,255,255,0.25)" />
        <Text style={styles.bannerText}>{DISCLAIMER_SHORT}</Text>
      </TouchableOpacity>

      <Modal
        visible={showFull}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Legal Disclaimer</Text>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalText}>{DISCLAIMER_FULL}</Text>
              <View style={styles.sourcesSection}>
                <Text style={styles.sourcesTitle}>Data Sources</Text>
                <Text style={styles.sourcesText}>SEC EDGAR, Federal Reserve FRED, Claude Sonnet 4.5</Text>
              </View>
              <Text style={styles.privacyText}>
                FII does not store or transmit personal financial account information.
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowFull(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

export const DisclaimerFull: React.FC = () => {
  return (
    <View style={styles.fullContainer}>
      <Text style={styles.fullTitle}>Legal Disclaimer</Text>
      <Text style={styles.fullText}>{DISCLAIMER_FULL}</Text>
      <View style={styles.sourcesSection}>
        <Text style={styles.sourcesTitle}>Data Sources</Text>
        <Text style={styles.sourcesText}>SEC EDGAR, Federal Reserve FRED, Claude Sonnet 4.5</Text>
      </View>
      <Text style={styles.privacyText}>
        FII does not store or transmit personal financial account information.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  bannerText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
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
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  modalScroll: {
    marginBottom: 16,
  },
  modalText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 22,
  },
  sourcesSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  sourcesTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sourcesText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  privacyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    marginTop: 12,
    fontStyle: 'italic',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 12,
  },
  closeText: {
    color: '#60A5FA',
    fontSize: 16,
    fontWeight: '600',
  },
  fullContainer: {
    padding: 16,
  },
  fullTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  fullText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 22,
  },
});
