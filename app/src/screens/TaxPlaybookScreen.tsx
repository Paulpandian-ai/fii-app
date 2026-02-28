import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

import { usePortfolioStore } from '../store/portfolioStore';
import { useStrategyStore } from '../store/strategyStore';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { Skeleton } from '../components/Skeleton';

const formatMoney = (v: unknown): string => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

const TAX_BRACKETS = [
  { rate: 10, label: '10%' },
  { rate: 12, label: '12%' },
  { rate: 22, label: '22%' },
  { rate: 24, label: '24%' },
  { rate: 32, label: '32%' },
  { rate: 35, label: '35%' },
  { rate: 37, label: '37%' },
];

const FILING_STATUSES = ['Single', 'Married', 'Head of Household'] as const;
type FilingStatus = typeof FILING_STATUSES[number];

// Tax calendar dates
const TAX_DATES = [
  { date: 'Jan 15', description: 'Q4 estimated tax payment due', icon: 'cash-outline' },
  { date: 'Apr 15', description: 'Tax filing deadline / Q1 estimated payment', icon: 'document-text-outline' },
  { date: 'Jun 15', description: 'Q2 estimated tax payment due', icon: 'cash-outline' },
  { date: 'Sep 15', description: 'Q3 estimated tax payment due', icon: 'cash-outline' },
  { date: 'Oct 15', description: 'Extended tax filing deadline', icon: 'document-text-outline' },
];

export const TaxPlaybookScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const holdings = usePortfolioStore((s) => s.holdings);
  const hasPortfolio = holdings.length >= 3;

  const {
    taxHarvest,
    isTaxLoading,
    taxBracket,
    setTaxBracket,
    loadTaxHarvest,
    hasRun,
  } = useStrategyStore();

  const [filingStatus, setFilingStatus] = useState<FilingStatus>('Single');
  const [activeTab, setActiveTab] = useState<'harvest' | 'bracket' | 'yearend' | 'calendar'>('harvest');

  // Auto-load tax data
  useEffect(() => {
    if (hasPortfolio && !taxHarvest && !isTaxLoading) {
      loadTaxHarvest(taxBracket);
    }
  }, [hasPortfolio, taxHarvest, isTaxLoading, loadTaxHarvest, taxBracket]);

  const handleBracketChange = useCallback(
    (rate: number) => {
      setTaxBracket(rate);
      loadTaxHarvest(rate);
    },
    [setTaxBracket, loadTaxHarvest]
  );

  // Compute holdings with gains/losses for bracket calculator
  const holdingsWithTax = useMemo(() => {
    return holdings
      .filter((h) => h.currentPrice && h.avgCost)
      .map((h) => {
        const gain = ((h.currentPrice ?? 0) - h.avgCost) * h.shares;
        const isLongTerm = h.dateAdded
          ? (Date.now() - new Date(h.dateAdded).getTime()) > 365 * 24 * 60 * 60 * 1000
          : false;
        const daysHeld = h.dateAdded
          ? Math.floor((Date.now() - new Date(h.dateAdded).getTime()) / (24 * 60 * 60 * 1000))
          : 0;
        const daysToLongTerm = h.dateAdded && !isLongTerm ? 365 - daysHeld : 0;
        const shortTermRate = taxBracket / 100;
        const longTermRate = taxBracket <= 12 ? 0 : taxBracket <= 35 ? 0.15 : 0.20;
        const taxIfSellNow = gain > 0 ? gain * (isLongTerm ? longTermRate : shortTermRate) : 0;
        const taxIfWait = gain > 0 && !isLongTerm ? gain * longTermRate : taxIfSellNow;
        const savings = taxIfSellNow - taxIfWait;

        return {
          ...h,
          gain,
          isLongTerm,
          daysHeld,
          daysToLongTerm,
          taxIfSellNow,
          taxIfWait,
          savings,
          shortTermRate,
          longTermRate,
        };
      })
      .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));
  }, [holdings, taxBracket]);

  // Year-end projections
  const realizedGains = useMemo(() => {
    // Estimate based on current unrealized
    const totalGains = holdingsWithTax.filter((h) => h.gain > 0).reduce((sum, h) => sum + h.gain, 0);
    const totalLosses = holdingsWithTax.filter((h) => h.gain < 0).reduce((sum, h) => sum + h.gain, 0);
    return { totalGains, totalLosses, net: totalGains + totalLosses };
  }, [holdingsWithTax]);

  // Compute wash sale windows
  const washSaleWarnings = useMemo(() => {
    if (!taxHarvest?.losses) return [];
    return taxHarvest.losses.filter((loss) => {
      // Flag if the user holds a replacement already
      return holdings.some((h) =>
        loss.replacements?.some((r) => r.ticker === h.ticker)
      );
    });
  }, [taxHarvest, holdings]);

  // Holdings approaching 1-year milestone
  const longTermMilestones = useMemo(() => {
    return holdingsWithTax
      .filter((h) => !h.isLongTerm && h.daysToLongTerm > 0 && h.daysToLongTerm <= 90 && h.gain > 0)
      .sort((a, b) => a.daysToLongTerm - b.daysToLongTerm);
  }, [holdingsWithTax]);

  const tabs = [
    { id: 'harvest' as const, label: 'Harvesting', icon: 'leaf' as const },
    { id: 'bracket' as const, label: 'Calculator', icon: 'calculator' as const },
    { id: 'yearend' as const, label: 'Year-End', icon: 'trending-up' as const },
    { id: 'calendar' as const, label: 'Calendar', icon: 'calendar' as const },
  ];

  if (!hasPortfolio) {
    return (
      <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tax Playbook</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 48 }}>📋</Text>
          <Text style={styles.emptyTitle}>Add Your Portfolio First</Text>
          <Text style={styles.emptySubtitle}>
            Add at least 3 holdings to find tax-saving opportunities.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0D1B3E', '#1A1A2E']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tax Playbook</Text>
        {isTaxLoading && <ActivityIndicator color="#10B981" size="small" />}
      </View>

      {/* Tab selector */}
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.id ? '#10B981' : 'rgba(255,255,255,0.4)'}
            />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ═══ 3A. TAX-LOSS HARVESTING SCANNER ═══ */}
        {activeTab === 'harvest' && (
          <View style={styles.section}>
            {/* Tax bracket selector */}
            <Text style={styles.sectionTitle}>Tax-Loss Harvesting</Text>
            <Text style={styles.sectionSubtitle}>
              Scan your holdings for positions with unrealized losses you can harvest
            </Text>

            <Text style={styles.bracketLabel}>Your Tax Bracket</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bracketRow}
            >
              {TAX_BRACKETS.map((b) => (
                <TouchableOpacity
                  key={b.rate}
                  style={[styles.bracketPill, taxBracket === b.rate && styles.bracketPillActive]}
                  onPress={() => handleBracketChange(b.rate)}
                >
                  <Text style={[styles.bracketPillText, taxBracket === b.rate && styles.bracketPillTextActive]}>
                    {b.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Summary */}
            {taxHarvest && (
              <View style={styles.harvestSummary}>
                <View style={styles.harvestSummaryItem}>
                  <Text style={styles.harvestSummaryLabel}>Unrealized Losses</Text>
                  <Text style={[styles.harvestSummaryValue, { color: '#EF4444' }]}>
                    {formatMoney(taxHarvest.totalUnrealizedLoss)}
                  </Text>
                </View>
                <View style={styles.harvestSummaryDivider} />
                <View style={styles.harvestSummaryItem}>
                  <Text style={styles.harvestSummaryLabel}>Estimated Savings</Text>
                  <Text style={[styles.harvestSummaryValue, { color: '#10B981' }]}>
                    {formatMoney(taxHarvest.totalTaxSavings)}
                  </Text>
                </View>
              </View>
            )}

            {/* Loss positions */}
            {isTaxLoading && !taxHarvest ? (
              <View style={{ gap: 10 }}>
                <Skeleton width="100%" height={100} borderRadius={12} />
                <Skeleton width="100%" height={100} borderRadius={12} />
              </View>
            ) : taxHarvest?.losses && taxHarvest.losses.length > 0 ? (
              <View style={styles.lossCardsContainer}>
                {taxHarvest.losses.map((loss, idx) => {
                  const hasWashSaleRisk = washSaleWarnings.some((w) => w.ticker === loss.ticker);
                  return (
                    <View key={`${loss.ticker}-${idx}`} style={styles.lossCard}>
                      <View style={styles.lossCardHeader}>
                        <View>
                          <Text style={styles.lossTicker}>{loss.ticker}</Text>
                          <Text style={styles.lossCompany} numberOfLines={1}>{loss.companyName}</Text>
                        </View>
                        <View style={styles.lossBadge}>
                          <Text style={styles.lossBadgeText}>
                            {formatMoney(loss.taxSavings)} savings
                          </Text>
                        </View>
                      </View>

                      <View style={styles.lossDetails}>
                        <View style={styles.lossDetailRow}>
                          <Text style={styles.lossDetailLabel}>Cost Basis</Text>
                          <Text style={styles.lossDetailValue}>{formatMoney(loss.costBasis)}</Text>
                        </View>
                        <View style={styles.lossDetailRow}>
                          <Text style={styles.lossDetailLabel}>Current Value</Text>
                          <Text style={styles.lossDetailValue}>{formatMoney(loss.currentValue)}</Text>
                        </View>
                        <View style={styles.lossDetailRow}>
                          <Text style={styles.lossDetailLabel}>Unrealized Loss</Text>
                          <Text style={[styles.lossDetailValue, { color: '#EF4444' }]}>
                            {formatMoney(loss.unrealizedLoss)}
                          </Text>
                        </View>
                      </View>

                      {hasWashSaleRisk && (
                        <View style={styles.washSaleWarning}>
                          <Ionicons name="warning" size={14} color="#FBBF24" />
                          <Text style={styles.washSaleText}>
                            Wash sale risk — you may hold a similar position
                          </Text>
                        </View>
                      )}

                      {loss.replacements && loss.replacements.length > 0 && (
                        <View style={styles.replacementSection}>
                          <Text style={styles.replacementLabel}>Replacement suggestion:</Text>
                          {loss.replacements.slice(0, 2).map((r) => (
                            <Text key={r.ticker} style={styles.replacementText}>
                              {r.ticker} ({r.sector}) — maintains sector exposure
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.noLossCard}>
                <Ionicons name="checkmark-circle" size={32} color="#10B981" />
                <Text style={styles.noLossTitle}>No Harvesting Opportunities</Text>
                <Text style={styles.noLossSubtitle}>
                  None of your positions have unrealized losses right now.
                </Text>
              </View>
            )}

            <Text style={styles.aiDisclaimer}>
              For educational purposes only. Not investment advice.
            </Text>
          </View>
        )}

        {/* ═══ 3B. TAX BRACKET IMPACT CALCULATOR ═══ */}
        {activeTab === 'bracket' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tax Impact Calculator</Text>
            <Text style={styles.sectionSubtitle}>
              See the tax impact of selling any position
            </Text>

            {/* Filing status */}
            <Text style={styles.bracketLabel}>Filing Status</Text>
            <View style={styles.filingRow}>
              {FILING_STATUSES.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[styles.filingPill, filingStatus === status && styles.filingPillActive]}
                  onPress={() => setFilingStatus(status)}
                >
                  <Text style={[styles.filingPillText, filingStatus === status && styles.filingPillTextActive]}>
                    {status}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Bracket selector */}
            <Text style={styles.bracketLabel}>Tax Bracket</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bracketRow}
            >
              {TAX_BRACKETS.map((b) => (
                <TouchableOpacity
                  key={b.rate}
                  style={[styles.bracketPill, taxBracket === b.rate && styles.bracketPillActive]}
                  onPress={() => handleBracketChange(b.rate)}
                >
                  <Text style={[styles.bracketPillText, taxBracket === b.rate && styles.bracketPillTextActive]}>
                    {b.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Holdings tax breakdown */}
            {holdingsWithTax.length > 0 ? (
              <View style={styles.taxBreakdownContainer}>
                {holdingsWithTax.map((h) => (
                  <View key={h.id} style={styles.taxBreakdownCard}>
                    <View style={styles.taxBreakdownHeader}>
                      <View>
                        <Text style={styles.taxBreakdownTicker}>{h.ticker}</Text>
                        <Text style={styles.taxBreakdownName} numberOfLines={1}>{h.companyName}</Text>
                      </View>
                      <Text
                        style={[
                          styles.taxBreakdownGain,
                          { color: h.gain >= 0 ? '#10B981' : '#EF4444' },
                        ]}
                      >
                        {h.gain >= 0 ? '+' : ''}{formatMoney(h.gain)}
                      </Text>
                    </View>

                    <View style={styles.taxBreakdownDetails}>
                      <View style={styles.taxBreakdownRow}>
                        <Text style={styles.taxBreakdownLabel}>Holding period</Text>
                        <Text style={styles.taxBreakdownValue}>
                          {h.isLongTerm ? 'Long-term' : `Short-term (${h.daysHeld}d)`}
                        </Text>
                      </View>
                      {h.gain > 0 && (
                        <>
                          <View style={styles.taxBreakdownRow}>
                            <Text style={styles.taxBreakdownLabel}>Tax if sell today</Text>
                            <Text style={[styles.taxBreakdownValue, { color: '#EF4444' }]}>
                              {formatMoney(h.taxIfSellNow)}
                            </Text>
                          </View>
                          {!h.isLongTerm && h.daysToLongTerm > 0 && (
                            <View style={styles.taxBreakdownRow}>
                              <Text style={styles.taxBreakdownLabel}>
                                Tax if wait {h.daysToLongTerm}d
                              </Text>
                              <Text style={[styles.taxBreakdownValue, { color: '#10B981' }]}>
                                {formatMoney(h.taxIfWait)}
                              </Text>
                            </View>
                          )}
                          {h.savings > 0 && (
                            <View style={styles.savingsHighlight}>
                              <Text style={styles.savingsText}>
                                Save {formatMoney(h.savings)} by waiting {h.daysToLongTerm} days
                              </Text>
                            </View>
                          )}
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No holdings with price data available.</Text>
            )}

            <Text style={styles.aiDisclaimer}>
              For educational purposes only. Not tax advice.
            </Text>
          </View>
        )}

        {/* ═══ 3C. YEAR-END TAX PLANNING ═══ */}
        {activeTab === 'yearend' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Year-End Tax Planning</Text>
            <Text style={styles.sectionSubtitle}>
              Projected capital gains and optimization strategies
            </Text>

            {/* Projected gains/losses summary */}
            <View style={styles.yearEndSummary}>
              <View style={styles.yearEndRow}>
                <Text style={styles.yearEndLabel}>Projected Capital Gains</Text>
                <Text style={[styles.yearEndValue, { color: '#10B981' }]}>
                  {formatMoney(realizedGains.totalGains)}
                </Text>
              </View>
              <View style={styles.yearEndRow}>
                <Text style={styles.yearEndLabel}>Available Losses to Offset</Text>
                <Text style={[styles.yearEndValue, { color: '#EF4444' }]}>
                  {formatMoney(Math.abs(realizedGains.totalLosses))}
                </Text>
              </View>
              <View style={[styles.yearEndRow, styles.yearEndNetRow]}>
                <Text style={[styles.yearEndLabel, { fontWeight: '700' }]}>Net Taxable</Text>
                <Text
                  style={[
                    styles.yearEndValue,
                    {
                      color: realizedGains.net > 0 ? '#FBBF24' : '#10B981',
                      fontWeight: '800',
                    },
                  ]}
                >
                  {formatMoney(Math.max(0, realizedGains.net))}
                </Text>
              </View>
              <View style={styles.yearEndRow}>
                <Text style={styles.yearEndLabel}>
                  Estimated Tax ({taxBracket}% bracket)
                </Text>
                <Text style={[styles.yearEndValue, { color: '#EF4444' }]}>
                  {formatMoney(Math.max(0, realizedGains.net) * (taxBracket / 100))}
                </Text>
              </View>
            </View>

            {/* Suggested moves */}
            {taxHarvest && taxHarvest.losses.length > 0 && (
              <View style={styles.optimizeCard}>
                <View style={styles.optimizeHeader}>
                  <Ionicons name="bulb" size={20} color="#FBBF24" />
                  <Text style={styles.optimizeTitle}>Optimization Suggestion</Text>
                </View>
                <Text style={styles.optimizeText}>
                  Harvesting {taxHarvest.losses.length} loss position{taxHarvest.losses.length !== 1 ? 's' : ''} could
                  save you approximately {formatMoney(taxHarvest.totalTaxSavings)} in taxes this year.
                </Text>
                <View style={styles.optimizeTickers}>
                  {taxHarvest.losses.slice(0, 5).map((loss) => (
                    <View key={loss.ticker} style={styles.optimizeTickerChip}>
                      <Text style={styles.optimizeTickerText}>{loss.ticker}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Long-term milestones */}
            {longTermMilestones.length > 0 && (
              <View style={styles.milestonesSection}>
                <Text style={styles.milestonesTitle}>Approaching Long-Term Status</Text>
                <Text style={styles.milestonesSubtitle}>
                  These positions will qualify for lower tax rates soon
                </Text>
                {longTermMilestones.map((h) => (
                  <View key={h.id} style={styles.milestoneCard}>
                    <View style={styles.milestoneInfo}>
                      <Text style={styles.milestoneTicker}>{h.ticker}</Text>
                      <Text style={styles.milestoneGain}>
                        Gain: {formatMoney(h.gain)}
                      </Text>
                    </View>
                    <View style={styles.milestoneCountdown}>
                      <Text style={styles.milestoneCountdownValue}>{h.daysToLongTerm}</Text>
                      <Text style={styles.milestoneCountdownLabel}>days left</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.aiDisclaimer}>
              For educational purposes only. Not tax advice.
            </Text>
          </View>
        )}

        {/* ═══ 3D. TAX CALENDAR & REMINDERS ═══ */}
        {activeTab === 'calendar' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tax Calendar</Text>
            <Text style={styles.sectionSubtitle}>
              Key tax dates and deadlines to remember
            </Text>

            {/* Tax dates */}
            <View style={styles.calendarContainer}>
              {TAX_DATES.map((item, idx) => {
                const isPast = isDatePast(item.date);
                return (
                  <View key={idx} style={[styles.calendarItem, isPast && styles.calendarItemPast]}>
                    <View style={styles.calendarLeft}>
                      <View style={[styles.calendarDot, isPast && styles.calendarDotPast]} />
                      {idx < TAX_DATES.length - 1 && <View style={styles.calendarLine} />}
                    </View>
                    <View style={styles.calendarContent}>
                      <View style={styles.calendarDateRow}>
                        <Ionicons
                          name={item.icon as any}
                          size={16}
                          color={isPast ? 'rgba(255,255,255,0.2)' : '#60A5FA'}
                        />
                        <Text style={[styles.calendarDate, isPast && styles.calendarDatePast]}>
                          {item.date}
                        </Text>
                        {isPast && (
                          <View style={styles.pastBadge}>
                            <Text style={styles.pastBadgeText}>PAST</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.calendarDesc, isPast && styles.calendarDescPast]}>
                        {item.description}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Wash sale windows */}
            {washSaleWarnings.length > 0 && (
              <View style={styles.washSaleSection}>
                <View style={styles.washSaleHeader}>
                  <Ionicons name="warning" size={18} color="#FBBF24" />
                  <Text style={styles.washSaleTitle}>Wash Sale Windows</Text>
                </View>
                <Text style={styles.washSaleInfo}>
                  Selling these positions and buying back within 30 days will trigger wash sale rules.
                </Text>
                {washSaleWarnings.map((w) => (
                  <View key={w.ticker} style={styles.washSaleItem}>
                    <Text style={styles.washSaleTicker}>{w.ticker}</Text>
                    <Text style={styles.washSaleDetail}>
                      30-day window applies if sold
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Long-term milestones on calendar */}
            {longTermMilestones.length > 0 && (
              <View style={styles.calendarMilestones}>
                <View style={styles.calendarMilestonesHeader}>
                  <Ionicons name="timer-outline" size={18} color="#10B981" />
                  <Text style={styles.calendarMilestonesTitle}>Long-Term Milestones</Text>
                </View>
                {longTermMilestones.map((h) => {
                  const milestoneDate = new Date(Date.now() + h.daysToLongTerm * 24 * 60 * 60 * 1000);
                  return (
                    <View key={h.id} style={styles.calendarMilestoneItem}>
                      <Text style={styles.calendarMilestoneTicker}>{h.ticker}</Text>
                      <Text style={styles.calendarMilestoneDate}>
                        Long-term on {milestoneDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' '}({h.daysToLongTerm} days)
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={styles.aiDisclaimer}>
              For educational purposes only. Not tax advice. Consult a qualified tax professional.
            </Text>
          </View>
        )}

        <DisclaimerBanner />
        <View style={{ height: 20 }} />
      </ScrollView>
    </LinearGradient>
  );
};

/** Helper: check if a calendar date (e.g. "Apr 15") has passed this year */
function isDatePast(dateStr: string): boolean {
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const parts = dateStr.split(' ');
  const month = months[parts[0]] ?? 0;
  const day = parseInt(parts[1]) || 1;
  const now = new Date();
  const target = new Date(now.getFullYear(), month, day);
  return now > target;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    gap: 12,
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
    fontSize: 22,
    fontWeight: '800',
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // ─── Tab Bar ───
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  tabText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#10B981',
  },

  // ─── Section ───
  section: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },

  // ─── Bracket Selector ───
  bracketLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bracketRow: {
    gap: 8,
    paddingBottom: 16,
  },
  bracketPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  bracketPillActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: '#10B981',
  },
  bracketPillText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
  bracketPillTextActive: {
    color: '#10B981',
  },

  // ─── Filing Status ───
  filingRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filingPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filingPillActive: {
    backgroundColor: 'rgba(96,165,250,0.15)',
    borderColor: '#60A5FA',
  },
  filingPillText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  filingPillTextActive: {
    color: '#60A5FA',
  },

  // ─── Harvest Summary ───
  harvestSummary: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  harvestSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  harvestSummaryDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  harvestSummaryLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  harvestSummaryValue: {
    fontSize: 20,
    fontWeight: '800',
  },

  // ─── Loss Cards ───
  lossCardsContainer: {
    gap: 10,
  },
  lossCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  lossCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  lossTicker: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  lossCompany: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  lossBadge: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  lossBadgeText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  lossDetails: {
    gap: 6,
  },
  lossDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  lossDetailLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
  lossDetailValue: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
  },
  washSaleWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderRadius: 8,
    padding: 8,
  },
  washSaleText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  replacementSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  replacementLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  replacementText: {
    color: '#60A5FA',
    fontSize: 12,
    marginBottom: 2,
  },
  noLossCard: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
  },
  noLossTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
  },
  noLossSubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },

  // ─── Tax Breakdown ───
  taxBreakdownContainer: {
    gap: 10,
  },
  taxBreakdownCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  taxBreakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  taxBreakdownTicker: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  taxBreakdownName: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    marginTop: 1,
    maxWidth: 180,
  },
  taxBreakdownGain: {
    fontSize: 16,
    fontWeight: '700',
  },
  taxBreakdownDetails: {
    gap: 6,
  },
  taxBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taxBreakdownLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  taxBreakdownValue: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  savingsHighlight: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  savingsText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ─── Year-End ───
  yearEndSummary: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    marginBottom: 16,
  },
  yearEndRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  yearEndNetRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  yearEndLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  yearEndValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  optimizeCard: {
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.15)',
    marginBottom: 16,
  },
  optimizeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  optimizeTitle: {
    color: '#FBBF24',
    fontSize: 15,
    fontWeight: '700',
  },
  optimizeText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 19,
  },
  optimizeTickers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  optimizeTickerChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  optimizeTickerText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },

  // ─── Milestones ───
  milestonesSection: {
    marginTop: 16,
  },
  milestonesTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  milestonesSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 10,
  },
  milestoneCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  milestoneInfo: {
    flex: 1,
  },
  milestoneTicker: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  milestoneGain: {
    color: '#10B981',
    fontSize: 12,
    marginTop: 2,
  },
  milestoneCountdown: {
    alignItems: 'center',
  },
  milestoneCountdownValue: {
    color: '#FBBF24',
    fontSize: 20,
    fontWeight: '800',
  },
  milestoneCountdownLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    marginTop: -2,
  },

  // ─── Calendar ───
  calendarContainer: {
    gap: 0,
    marginBottom: 16,
  },
  calendarItem: {
    flexDirection: 'row',
    minHeight: 60,
  },
  calendarItemPast: {
    opacity: 0.5,
  },
  calendarLeft: {
    width: 24,
    alignItems: 'center',
  },
  calendarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#60A5FA',
    marginTop: 4,
  },
  calendarDotPast: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  calendarLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 4,
  },
  calendarContent: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 16,
  },
  calendarDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarDate: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  calendarDatePast: {
    color: 'rgba(255,255,255,0.4)',
  },
  pastBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pastBadgeText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    fontWeight: '700',
  },
  calendarDesc: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  calendarDescPast: {
    color: 'rgba(255,255,255,0.3)',
  },

  // ─── Wash Sale Section ───
  washSaleSection: {
    backgroundColor: 'rgba(251,191,36,0.06)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.12)',
    marginBottom: 16,
  },
  washSaleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  washSaleTitle: {
    color: '#FBBF24',
    fontSize: 15,
    fontWeight: '700',
  },
  washSaleInfo: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 17,
  },
  washSaleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  washSaleTicker: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  washSaleDetail: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },

  // ─── Calendar Milestones ───
  calendarMilestones: {
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.12)',
  },
  calendarMilestonesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  calendarMilestonesTitle: {
    color: '#10B981',
    fontSize: 15,
    fontWeight: '700',
  },
  calendarMilestoneItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  calendarMilestoneTicker: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  calendarMilestoneDate: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },

  // ─── Empty / Shared ───
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 20,
  },
  aiDisclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    marginTop: 10,
    fontStyle: 'italic',
  },
});
