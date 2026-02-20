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

export const PrivacyPolicyScreen: React.FC = () => {
  const navigation = useNavigation();

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.lastUpdated}>Last updated: February 2026</Text>

        {/* Introduction */}
        <Text style={styles.body}>
          Factor Impact Intelligence ("FII", "we", "us", or "our") is committed to protecting
          your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard
          your information when you use our mobile application.
        </Text>

        {/* Section: What Data We Collect */}
        <Text style={styles.sectionTitle}>What Data We Collect</Text>
        <Text style={styles.body}>
          We collect the following types of information:
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Device information (device type, operating system, unique device identifiers)
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Usage data (screens viewed, features used, interaction timestamps)
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Portfolio data you voluntarily enter (stock tickers, share counts, cost basis)
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} App preferences and settings (risk profile, notification preferences, tax bracket)
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Push notification tokens (if you opt in to notifications)
        </Text>
        <Text style={styles.body}>
          We do not collect your real name, email address, or financial account credentials
          unless you explicitly provide them through account creation.
        </Text>

        {/* Section: How We Use It */}
        <Text style={styles.sectionTitle}>How We Use Your Data</Text>
        <Text style={styles.body}>
          We use the information we collect to:
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Provide and maintain the FII app and its features
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Generate personalized AI-powered stock analysis and signals
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Send push notifications about market events and portfolio alerts (if enabled)
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Improve app performance, fix bugs, and develop new features
        </Text>
        <Text style={styles.bulletItem}>
          {'\u2022'} Analyze aggregate usage patterns to improve user experience
        </Text>
        <Text style={styles.boldStatement}>
          We do not sell your personal data. We never have and never will.
        </Text>

        {/* Section: Data Retention */}
        <Text style={styles.sectionTitle}>Data Retention</Text>
        <Text style={styles.body}>
          Your portfolio data and preferences are stored locally on your device using
          AsyncStorage. We retain server-side analytics data in anonymized form for up to
          12 months. You can delete all locally stored data at any time by using the
          "Reset App" option in Settings. You can also export your data at any time using
          the "Export My Data" feature.
        </Text>

        {/* Section: Third-Party Services */}
        <Text style={styles.sectionTitle}>Third-Party Services</Text>
        <Text style={styles.body}>
          FII integrates with the following third-party data sources and services to provide
          stock analysis and market intelligence:
        </Text>
        <View style={styles.serviceCard}>
          <Text style={styles.serviceName}>Finnhub.io</Text>
          <Text style={styles.serviceDesc}>
            Real-time and historical stock price data, company profiles, and market data.
          </Text>
        </View>
        <View style={styles.serviceCard}>
          <Text style={styles.serviceName}>SEC EDGAR</Text>
          <Text style={styles.serviceDesc}>
            SEC filings, financial statements, and insider trading data from the U.S.
            Securities and Exchange Commission.
          </Text>
        </View>
        <View style={styles.serviceCard}>
          <Text style={styles.serviceName}>Federal Reserve Economic Data (FRED)</Text>
          <Text style={styles.serviceDesc}>
            Macroeconomic indicators including interest rates, inflation data, employment
            statistics, and Treasury yields.
          </Text>
        </View>
        <View style={styles.serviceCard}>
          <Text style={styles.serviceName}>PatentsView (USPTO)</Text>
          <Text style={styles.serviceDesc}>
            Patent filing data from the United States Patent and Trademark Office for
            innovation intelligence analysis.
          </Text>
        </View>
        <View style={styles.serviceCard}>
          <Text style={styles.serviceName}>USASpending.gov</Text>
          <Text style={styles.serviceDesc}>
            Federal government contract award data for government contract intelligence.
          </Text>
        </View>
        <View style={styles.serviceCard}>
          <Text style={styles.serviceName}>ClinicalTrials.gov (NIH)</Text>
          <Text style={styles.serviceDesc}>
            Clinical trial data from the National Institutes of Health for FDA pipeline
            analysis and pharmaceutical catalyst tracking.
          </Text>
        </View>
        <Text style={styles.body}>
          These services have their own privacy policies. We encourage you to review them.
          Data sent to these services is limited to stock tickers and market queries -- we
          do not share your personal information or portfolio data with these providers.
        </Text>

        {/* Section: Contact Info */}
        <Text style={styles.sectionTitle}>Contact Us</Text>
        <Text style={styles.body}>
          If you have questions or concerns about this Privacy Policy or our data
          practices, please contact us at:
        </Text>
        <Text style={styles.contactInfo}>privacy@factorimpact.app</Text>
        <Text style={styles.body}>
          We will respond to your inquiry within 30 days.
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
  boldStatement: {
    color: '#60A5FA',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 12,
    lineHeight: 22,
  },
  serviceCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  serviceName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  serviceDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    lineHeight: 19,
  },
  contactInfo: {
    color: '#60A5FA',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
});
