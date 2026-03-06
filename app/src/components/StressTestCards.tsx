import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// ── Types ──

interface DollarImpact {
  invested: number;
  result: number;
  loss: number;
}

interface StressScenario {
  id: string;
  label: string;
  description: string;
  scenarioKey: string;
  estimated_impact: number;
  dollar_impact: DollarImpact;
  recovery_estimate: string;
  risk_level: string;
}

interface HistoricalEvent {
  id: string;
  name: string;
  decline_pct: number;
  recovery_months: number | null;
  sp500_decline: number;
}

interface StressReport {
  scenarios: StressScenario[];
  overall_risk_rating: string;
  historical_events?: HistoricalEvent[];
  disclaimer?: string;
}

interface Props {
  report: StressReport;
  investmentAmount?: number;
}

// ── Color mapping by risk level ──

const RISK_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  MODERATE: {
    bg: 'rgba(142,142,147,0.12)',
    text: '#8E8E93',
    bar: '#8E8E93',
  },
  ELEVATED: {
    bg: 'rgba(245,166,35,0.12)',
    text: '#F5A623',
    bar: '#F5A623',
  },
  HIGH: {
    bg: 'rgba(88,86,214,0.12)',
    text: '#5856D6',
    bar: '#5856D6',
  },
};

function getRiskColors(level: string) {
  return RISK_COLORS[level] || RISK_COLORS.MODERATE;
}

// ── Risk Bar ──

function RiskBar({ impact, riskLevel }: { impact: number; riskLevel: string }) {
  const colors = getRiskColors(riskLevel);
  // Map impact (-95% to 0%) to bar fill (95% to 5%)
  const fillPct = Math.max(5, Math.min(95, Math.abs(impact)));
  return (
    <View style={s.riskBarTrack}>
      <View style={[s.riskBarFill, { width: `${fillPct}%`, backgroundColor: colors.bar }]} />
      <Text style={[s.riskBarLabel, { color: colors.text }]}>{riskLevel}</Text>
    </View>
  );
}

// ── Main Component ──

export const StressTestCards: React.FC<Props> = ({ report, investmentAmount = 10000 }) => {
  const { scenarios, historical_events, disclaimer } = report;

  if (!scenarios || scenarios.length === 0) return null;

  const amtLabel = `$${investmentAmount.toLocaleString()}`;

  return (
    <View style={s.container}>
      <Text style={s.sectionTitle}>Stress Test Scenarios</Text>
      <Text style={s.sectionSubtitle}>
        How would a {amtLabel} investment perform?
      </Text>

      {scenarios.map((sc) => {
        const colors = getRiskColors(sc.risk_level);
        const impactPct = sc.estimated_impact;
        const resultAmt = Math.max(0, Math.round(investmentAmount * (1 + impactPct / 100)));
        const isSevere = sc.scenarioKey === 'severe';

        return (
          <View
            key={sc.id || sc.scenarioKey}
            style={[s.card, { backgroundColor: colors.bg, borderColor: colors.text + '30' }]}
          >
            <View style={s.cardHeaderRow}>
              <Text style={[s.cardLabel, { color: colors.text }]}>
                {isSevere ? '\u26A0\uFE0F ' : ''}{sc.label}
              </Text>
              <Text style={[s.cardImpact, { color: colors.text }]}>
                Est. {impactPct > 0 ? '+' : ''}{impactPct}%
              </Text>
            </View>

            <Text style={s.dollarLine}>
              {amtLabel} {'\u2192'} ${resultAmt.toLocaleString()}
            </Text>

            <RiskBar impact={impactPct} riskLevel={sc.risk_level} />

            <Text style={s.recoveryText}>
              Recovery: ~{sc.recovery_estimate.replace('based on historical analogs', '').trim()}
            </Text>
          </View>
        );
      })}

      {/* Historical Event Overlays */}
      {historical_events && historical_events.length > 0 && (
        <View style={s.historicalSection}>
          <Text style={s.historicalTitle}>How it actually performed:</Text>
          {historical_events.map((ev) => (
            <View key={ev.id} style={s.historicalRow}>
              <Text style={s.historicalName}>{ev.name}:</Text>
              <Text style={s.historicalValue}>
                {ev.decline_pct > 0 ? '+' : ''}{ev.decline_pct}%
                {ev.recovery_months != null
                  ? ` (recovered in ${ev.recovery_months} months)`
                  : ' (no full recovery yet)'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Disclaimer */}
      <View style={s.disclaimerRow}>
        <Text style={s.disclaimerIcon}>{'\u24D8'}</Text>
        <Text style={s.disclaimerText}>
          {disclaimer || 'Estimates based on historical patterns and factor analysis. Not predictions.'}
        </Text>
      </View>
    </View>
  );
};

// ── Styles ──

const s = StyleSheet.create({
  container: {
    gap: 10,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginBottom: 4,
  },

  // ── Card ──
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  cardImpact: {
    fontSize: 14,
    fontWeight: '700',
  },
  dollarLine: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },

  // ── Risk Bar ──
  riskBarTrack: {
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 11,
    overflow: 'hidden',
    marginBottom: 6,
    justifyContent: 'center',
  },
  riskBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 11,
    opacity: 0.35,
  },
  riskBarLabel: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
  },

  // ── Recovery ──
  recoveryText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },

  // ── Historical ──
  historicalSection: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  historicalTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  historicalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 3,
  },
  historicalName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  historicalValue: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },

  // ── Disclaimer ──
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  disclaimerIcon: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    marginTop: 1,
  },
  disclaimerText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
});
