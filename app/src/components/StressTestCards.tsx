import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AIContentDisclaimer } from './AIContentDisclaimer';

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
  context?: string;
  scenarioKey: string;
  estimated_impact: number;
  dollar_impact: DollarImpact;
  recovery_estimate: string;
  risk_level: string;
  historical_analog?: string;
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
  UPSIDE: {
    bg: 'rgba(0,201,167,0.12)',
    text: '#00C9A7',
    bar: '#00C9A7',
  },
};

// Fallback context strings for scenarios that ship without a `context` field
// (older cached reports, sector_shock fallback, etc.).
const FALLBACK_CONTEXTS: Record<string, string> = {
  moderate:
    'Markets sometimes pull back 10-15% without any recession in sight. Think 2018 Q4 or the 2015-2016 selloff \u2014 painful but short-lived. Most diversified portfolios recover within a year.',
  recession:
    'A classic recession drags earnings down 20-30% as consumers tighten spending. The 2001 dot-com unwind and 2022 rate cycle are the closest analogs. Recoveries typically take 1-2 years.',
  severe:
    'A once-in-a-decade crisis with cascading defaults and equities down 40-60%. 2008 and 2020 are the playbook \u2014 severe, frightening, but historically temporary. Recoveries have taken 2-4 years.',
  sector_shock:
    'A targeted event hits this stock\u2019s sector while the broader market holds up. Damage is concentrated, so diversification matters \u2014 a single-sector tilt can amplify losses even when the S&P 500 is flat.',
  bull_rally:
    'Bulls don\u2019t show up on schedule, but when they do the gains are concentrated and fast. The 2020-2021 post-COVID rally and 2023 AI advance both delivered 25-40% in 6-12 months. Sitting in cash through these periods is one of the biggest risks investors underestimate.',
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

export const StressTestCards: React.FC<Props> = React.memo(({ report, investmentAmount = 10000 }) => {
  const { scenarios, historical_events, disclaimer } = report;

  if (!scenarios || scenarios.length === 0) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, fontStyle: 'italic', textAlign: 'center' }}>
          Stress analysis is being calculated. Check back shortly.
        </Text>
      </View>
    );
  }

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
        const isUpside = sc.scenarioKey === 'bull_rally' || impactPct > 0;
        const contextText = sc.context || FALLBACK_CONTEXTS[sc.scenarioKey] || '';
        const durationLabel = isUpside ? 'Typical duration' : 'Recovery';
        const cleanedDuration = (sc.recovery_estimate || '')
          .replace('based on historical analogs', '')
          .trim();

        return (
          <View
            key={sc.id || sc.scenarioKey}
            style={[s.card, { backgroundColor: colors.bg, borderColor: colors.text + '30' }]}
          >
            <View style={s.cardHeaderRow}>
              <Text style={[s.cardLabel, { color: colors.text }]}>
                {isSevere ? '\u26A0\uFE0F ' : isUpside ? '\u{1F680} ' : ''}{sc.label}
              </Text>
              <Text style={[s.cardImpact, { color: colors.text }]}>
                Est. {impactPct > 0 ? '+' : ''}{impactPct}%
              </Text>
            </View>

            <Text style={s.dollarLine}>
              {amtLabel} {'\u2192'} ${resultAmt.toLocaleString()}
            </Text>

            <RiskBar impact={impactPct} riskLevel={sc.risk_level} />

            {!!cleanedDuration && (
              <Text style={s.recoveryText}>
                {durationLabel}: ~{cleanedDuration}
              </Text>
            )}

            {!!contextText && (
              <Text style={s.contextText}>{contextText}</Text>
            )}

            {!!sc.historical_analog && (
              <Text style={s.analogText}>
                Historical analog: {sc.historical_analog}
              </Text>
            )}
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

      <AIContentDisclaimer />
    </View>
  );
});

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
  contextText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  analogText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
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
