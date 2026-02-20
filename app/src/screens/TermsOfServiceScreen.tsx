import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export const TermsOfServiceScreen: React.FC = () => {
  const navigation = useNavigation();

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.lastUpdated}>Last updated: February 2026</Text>

        {/* Section: Acceptance of Terms */}
        <Text style={styles.sectionTitle}>Acceptance of Terms</Text>
        <Text style={styles.body}>
          By downloading, installing, or using the Factor Impact Intelligence ("FII") mobile
          application, you agree to be bound by these Terms of Service. If you do not agree
          to these terms, do not use the app. We reserve the right to modify these terms at
          any time. Continued use of FII after modifications constitutes acceptance of
          the updated terms.
        </Text>

        {/* Section: Not Investment Advice */}
        <Text style={styles.sectionTitle}>Not Investment Advice</Text>
        <View style={styles.warningCard}>
          <Ionicons name="warning-outline" size={20} color="#FBBF24" />
          <Text style={styles.warningText}>
            Factor Impact Intelligence does not provide investment advice. All signals,
            scores, and recommendations are for educational purposes only.
          </Text>
        </View>
        <Text style={styles.body}>
          FII is an educational and informational tool. Nothing in this app constitutes
          investment advice, financial advice, trading advice, or tax advice. The AI-generated
          signals, composite scores, factor analyses, scenario projections, Monte Carlo
          simulations, and all other outputs are model-based estimates derived from publicly
          available data. They do not reflect actual market conditions and should not be
          relied upon as a basis for making investment decisions.
        </Text>
        <Text style={styles.body}>
          FII is not a registered investment advisor, broker-dealer, or financial planner
          under the Investment Advisers Act of 1940 or any other applicable law. Always
          consult a qualified financial advisor before making investment decisions.
        </Text>
        <Text style={styles.body}>
          Past performance of any signal, score, or analysis does not guarantee future
          results. All investing involves risk, including the possible loss of principal.
        </Text>

        {/* Section: Age Requirement */}
        <Text style={styles.sectionTitle}>Age Requirement</Text>
        <Text style={styles.body}>
          You must be at least 18 years of age to use FII. By using the app, you represent
          and warrant that you are at least 18 years old. If you are under 18, you may not
          use this application under any circumstances.
        </Text>

        {/* Section: Limitation of Liability */}
        <Text style={styles.sectionTitle}>Limitation of Liability</Text>
        <Text style={styles.body}>
          To the maximum extent permitted by applicable law, FII and its creators, officers,
          directors, employees, agents, and affiliates shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages, including but not limited to:
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Financial losses resulting from investment decisions made using FII data
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Inaccuracies or delays in market data, AI analysis, or signal generation
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Service interruptions, data loss, or technical failures
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Unauthorized access to or alteration of your data
        </Text>
        <Text style={styles.body}>
          In no event shall our total liability exceed the amount you have paid for the
          app in the twelve (12) months preceding the claim, or $100, whichever is greater.
        </Text>

        {/* Section: Data Sources and Accuracy Disclaimer */}
        <Text style={styles.sectionTitle}>Data Sources and Accuracy</Text>
        <Text style={styles.body}>
          FII aggregates data from multiple publicly available sources including SEC EDGAR,
          Federal Reserve Economic Data (FRED), Finnhub.io, PatentsView (USPTO),
          USASpending.gov, and ClinicalTrials.gov (NIH). AI analysis is powered by
          Anthropic Claude.
        </Text>
        <Text style={styles.body}>
          While we strive for accuracy, we make no warranties or representations about the
          completeness, accuracy, reliability, suitability, or availability of any data,
          analysis, or content provided through the app. Data may be delayed, incomplete,
          or contain errors. Factor scores are AI-generated estimates and may not reflect
          actual market conditions.
        </Text>
        <Text style={styles.body}>
          Sharpe ratios, Monte Carlo projections, efficient frontier calculations, scenario
          analyses, and backtests use historical data and statistical models that do not
          predict future returns. Tax-loss harvesting information is estimated and does not
          constitute tax advice.
        </Text>

        {/* Section: Account Termination */}
        <Text style={styles.sectionTitle}>Account Termination</Text>
        <Text style={styles.body}>
          We reserve the right to suspend or terminate your access to FII at any time,
          with or without cause, with or without notice. Reasons for termination may include
          but are not limited to:
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Violation of these Terms of Service
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Abuse of the app or its services (e.g., excessive API usage, scraping)
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Fraudulent or illegal activity
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Non-payment of subscription fees
        </Text>
        <Text style={styles.body}>
          Upon termination, your right to use FII will immediately cease. You may delete
          your local data at any time through the "Reset App" feature in Settings.
        </Text>

        {/* Section: Governing Law */}
        <Text style={styles.sectionTitle}>Governing Law</Text>
        <Text style={styles.body}>
          These Terms of Service shall be governed by and construed in accordance with the
          laws of the United States and the State of Delaware, without regard to its
          conflict of law provisions.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  lastUpdated: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 28,
    marginBottom: 12,
  },
  body: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  bulletItem: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 22,
    paddingLeft: 12,
    marginBottom: 6,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  warningText: {
    color: '#FBBF24',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    flex: 1,
  },
});
