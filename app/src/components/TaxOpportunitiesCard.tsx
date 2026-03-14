import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTaxOpportunities, getTaxLots } from '../services/api';
import { Skeleton } from './Skeleton';

interface Opportunity {
  ticker: string;
  company_name: string;
  unrealized_loss: number;
  loss_pct: number;
  holding_period: string;
  tax_rate: number;
  estimated_tax_savings: number;
  wash_sale_risk: boolean;
  wash_sale_note?: string;
}

interface LotComparison {
  method: string;
  total_gain_loss: number;
  tax_impact: number;
  lots_used: number;
}

interface SelectedOpp {
  ticker: string;
  company_name: string;
  lots?: LotComparison[];
  loading: boolean;
}

const formatMoney = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};

export const TaxOpportunitiesCard: React.FC = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSavings, setTotalSavings] = useState(0);
  const [selectedOpp, setSelectedOpp] = useState<SelectedOpp | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getTaxOpportunities();
        if (mounted && data?.opportunities) {
          setOpportunities(data.opportunities.slice(0, 5));
          setTotalSavings(data.total_estimated_savings || 0);
        }
      } catch {}
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const handleTapOpportunity = async (opp: Opportunity) => {
    setSelectedOpp({ ticker: opp.ticker, company_name: opp.company_name, loading: true });
    try {
      const data = await getTaxLots(opp.ticker);
      if (data?.methods) {
        setSelectedOpp((prev) =>
          prev ? { ...prev, lots: data.methods, loading: false } : null
        );
      } else {
        setSelectedOpp((prev) => prev ? { ...prev, loading: false } : null);
      }
    } catch {
      setSelectedOpp((prev) => prev ? { ...prev, loading: false } : null);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Tax Opportunities</Text>
        <View style={styles.card}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ marginBottom: 10 }}>
              <Skeleton width="100%" height={60} borderRadius={10} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (opportunities.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Tax Opportunities</Text>
        <View style={styles.card}>
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={32} color="#00C9A7" />
            <Text style={styles.emptyTitle}>No Harvesting Opportunities</Text>
            <Text style={styles.emptySubtitle}>
              None of your positions currently show unrealized losses for tax-loss harvesting.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Tax Opportunities</Text>

      <View style={styles.card}>
        {/* Summary */}
        {totalSavings > 0 && (
          <View style={styles.summaryRow}>
            <Ionicons name="cash-outline" size={16} color="#00C9A7" />
            <Text style={styles.summaryText}>
              Estimated tax savings: <Text style={styles.summaryValue}>{formatMoney(totalSavings)}</Text>
            </Text>
          </View>
        )}

        {/* Opportunity list */}
        {opportunities.map((opp, i) => (
          <TouchableOpacity
            key={opp.ticker}
            style={[styles.oppRow, i < opportunities.length - 1 && styles.oppRowBorder]}
            onPress={() => handleTapOpportunity(opp)}
            activeOpacity={0.7}
          >
            <View style={styles.oppLeft}>
              <Text style={styles.oppTicker}>{opp.ticker}</Text>
              <Text style={styles.oppName} numberOfLines={1}>{opp.company_name}</Text>
            </View>
            <View style={styles.oppRight}>
              <Text style={styles.oppLoss}>{formatMoney(opp.unrealized_loss)}</Text>
              <Text style={styles.oppPct}>{opp.loss_pct?.toFixed(1)}%</Text>
            </View>
            <View style={styles.oppMeta}>
              <View style={[styles.periodBadge, { backgroundColor: opp.holding_period === 'short_term' ? 'rgba(245,166,35,0.12)' : 'rgba(0,201,167,0.12)' }]}>
                <Text style={[styles.periodText, { color: opp.holding_period === 'short_term' ? '#F5A623' : '#00C9A7' }]}>
                  {opp.holding_period === 'short_term' ? 'ST' : 'LT'}
                </Text>
              </View>
              {opp.wash_sale_risk && (
                <Ionicons name="warning" size={12} color="#F5A623" />
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
          </TouchableOpacity>
        ))}

        <Text style={styles.disclaimer}>
          For educational purposes only. Consult a tax professional before making decisions.
        </Text>
      </View>

      {/* Lot comparison bottom sheet */}
      <Modal
        visible={!!selectedOpp}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedOpp(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedOpp(null)}
        >
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sheetTitle}>
                {selectedOpp?.ticker} — Tax Lot Analysis
              </Text>
              <Text style={styles.sheetSubtitle}>{selectedOpp?.company_name}</Text>

              {selectedOpp?.loading ? (
                <View style={{ gap: 10, marginTop: 16 }}>
                  <Skeleton width="100%" height={50} borderRadius={10} />
                  <Skeleton width="100%" height={50} borderRadius={10} />
                  <Skeleton width="100%" height={50} borderRadius={10} />
                </View>
              ) : selectedOpp?.lots && selectedOpp.lots.length > 0 ? (
                <View style={styles.lotsContainer}>
                  {selectedOpp.lots.map((lot, i) => (
                    <View key={i} style={styles.lotCard}>
                      <Text style={styles.lotMethod}>{lot.method}</Text>
                      <View style={styles.lotStats}>
                        <View style={styles.lotStat}>
                          <Text style={styles.lotStatLabel}>Gain/Loss</Text>
                          <Text style={[styles.lotStatValue, { color: lot.total_gain_loss >= 0 ? '#00C9A7' : '#F5A623' }]}>
                            {formatMoney(lot.total_gain_loss)}
                          </Text>
                        </View>
                        <View style={styles.lotStat}>
                          <Text style={styles.lotStatLabel}>Tax Impact</Text>
                          <Text style={[styles.lotStatValue, { color: lot.tax_impact >= 0 ? '#F5A623' : '#00C9A7' }]}>
                            {formatMoney(lot.tax_impact)}
                          </Text>
                        </View>
                        <View style={styles.lotStat}>
                          <Text style={styles.lotStatLabel}>Lots</Text>
                          <Text style={styles.lotStatValue}>{lot.lots_used}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.noLots}>No tax lot data available for this position.</Text>
              )}

              <Text style={styles.sheetDisclaimer}>
                For educational purposes only. Not tax advice.
              </Text>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,201,167,0.08)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  summaryText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '500',
  },
  summaryValue: {
    color: '#00C9A7',
    fontWeight: '700',
  },
  oppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  oppRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  oppLeft: {
    flex: 1,
  },
  oppTicker: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  oppName: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 1,
  },
  oppRight: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  oppLoss: {
    color: '#F5A623',
    fontSize: 14,
    fontWeight: '700',
  },
  oppPct: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
  },
  oppMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 4,
  },
  periodBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  periodText: {
    fontSize: 9,
    fontWeight: '800',
  },
  disclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 9,
    fontStyle: 'italic',
    marginTop: 10,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
  },

  // Bottom sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  sheetSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  lotsContainer: {
    gap: 10,
  },
  lotCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  lotMethod: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  lotStats: {
    flexDirection: 'row',
  },
  lotStat: {
    flex: 1,
    alignItems: 'center',
  },
  lotStatLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 3,
  },
  lotStatValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  noLots: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
  },
  sheetDisclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 16,
    marginBottom: 20,
  },
});
