import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AIContentDisclaimer } from './AIContentDisclaimer';
import type { AltDataFullPayload } from '../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const EXPAND_ANIMATION = LayoutAnimation.create(
  200,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

interface Props {
  ticker: string;
  data: AltDataFullPayload | null;
  loading?: boolean;
}

// ── Helpers ──

function formatMoney(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatNum(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return n.toLocaleString();
}

function formatPct(n: number | null | undefined, withSign = true): string {
  if (n == null || !isFinite(n)) return '—';
  const sign = withSign && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function sentimentColor(label?: string): string {
  if (label === 'positive') return '#00C9A7';
  if (label === 'negative') return '#F59E0B';
  return 'rgba(255,255,255,0.55)';
}

function dateFromTs(ts: number | undefined): string {
  if (!ts) return '';
  try {
    return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ── Collapsible Section Card ──

interface SectionProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  source?: string;
  summary?: React.ReactNode;
  children?: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
  defaultExpanded?: boolean;
}

const SectionCard: React.FC<SectionProps> = ({
  title,
  icon,
  iconColor,
  source,
  summary,
  children,
  empty,
  emptyText,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasDetails = !!children && !empty;

  const toggle = () => {
    if (!hasDetails) return;
    LayoutAnimation.configureNext(EXPAND_ANIMATION);
    setExpanded(!expanded);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons name={icon} size={18} color={iconColor} />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {!!source && <Text style={styles.cardSource}>{source}</Text>}
      </View>

      {empty ? (
        <Text style={styles.emptyText}>{emptyText || 'No data available'}</Text>
      ) : (
        <>
          {summary && <View style={styles.summaryBlock}>{summary}</View>}
          {hasDetails && (
            <>
              <TouchableOpacity style={styles.expandBtn} onPress={toggle} activeOpacity={0.7}>
                <Text style={styles.expandBtnText}>{expanded ? 'Hide details' : 'See more'}</Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color="rgba(255,255,255,0.5)"
                />
              </TouchableOpacity>
              {expanded && <View style={styles.detailsBlock}>{children}</View>}
            </>
          )}
        </>
      )}
    </View>
  );
};

// ── Metric Row ──

const Metric: React.FC<{ label: string; value: string; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <View style={styles.metricRow}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={[styles.metricValue, color ? { color } : null]}>{value}</Text>
  </View>
);

// ── Pending Block ──

const PendingBlock: React.FC<{ reason?: string }> = ({ reason }) => (
  <View style={styles.pendingBlock}>
    <Text style={styles.pendingLabel}>Data pending</Text>
    {!!reason && <Text style={styles.pendingReason}>{reason}</Text>}
  </View>
);

// ── Main Component ──

export const AltDataTab: React.FC<Props> = ({ ticker, data, loading }) => {
  if (loading && !data) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Loading alternative data…</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>
          No alternative data available for {ticker} yet.
        </Text>
      </View>
    );
  }

  const { patents, contracts, insider_activity, institutional, news_sentiment, sector_specific } = data;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Alternative Data</Text>
      <Text style={styles.subHeader}>
        Signals from patents, contracts, insiders, institutions and news — beyond the standard financials.
      </Text>

      {/* 1. Patents */}
      <SectionCard
        title="Patents"
        icon="bulb-outline"
        iconColor="#F59E0B"
        source="USPTO"
        empty={!patents || !patents.last_12_months}
        emptyText={`No patent activity found for ${ticker}`}
        summary={
          patents && (
            <>
              <Metric label="Filings (last 12 mo)" value={formatNum(patents.last_12_months)} />
              <Metric
                label="YoY change"
                value={formatPct(patents.yoy_change_pct)}
                color={patents.yoy_change_pct >= 0 ? '#00C9A7' : '#F59E0B'}
              />
              {patents.top_areas && patents.top_areas.length > 0 && (
                <Metric label="Top areas" value={patents.top_areas.slice(0, 3).join(', ')} />
              )}
            </>
          )
        }
      >
        {patents && (
          <>
            <Metric label="Prior 12 mo" value={formatNum(patents.prior_12_months)} />
            {patents.innovation_score != null && (
              <Metric label="Innovation score" value={`${patents.innovation_score}/10`} />
            )}
            {patents.recent_notable && patents.recent_notable.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.subHead}>Recent notable filings</Text>
                {patents.recent_notable.slice(0, 5).map((p: any, i: number) => (
                  <Text key={i} style={styles.listItem}>
                    • {p.title || p.patent_title || p.name || 'Patent'}
                  </Text>
                ))}
              </View>
            )}
          </>
        )}
      </SectionCard>

      {/* 2. Government Contracts */}
      <SectionCard
        title="Government Contracts"
        icon="business-outline"
        iconColor="#60A5FA"
        source="USASpending.gov"
        empty={!contracts || !contracts.active_count}
        emptyText={`No active government contracts for ${ticker}`}
        summary={
          contracts && (
            <>
              <Metric label="Active contracts" value={formatNum(contracts.active_count)} />
              <Metric label="Current value" value={formatMoney(contracts.total_value)} />
              {contracts.prior_value > 0 && (
                <Metric
                  label="YoY growth"
                  value={formatPct(
                    ((contracts.total_value - contracts.prior_value) / contracts.prior_value) * 100,
                  )}
                  color={contracts.total_value >= contracts.prior_value ? '#00C9A7' : '#F59E0B'}
                />
              )}
            </>
          )
        }
      >
        {contracts && (
          <>
            <Metric label="Distinct agencies" value={formatNum(contracts.distinct_agencies)} />
            <Metric label="Major awards" value={formatNum(contracts.major_awards_count)} />
            {contracts.top_agencies && contracts.top_agencies.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.subHead}>Top agencies</Text>
                {contracts.top_agencies.slice(0, 5).map((a, i) => (
                  <Text key={i} style={styles.listItem}>• {a}</Text>
                ))}
              </View>
            )}
            {contracts.recent_awards && contracts.recent_awards.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.subHead}>Recent awards</Text>
                {contracts.recent_awards.slice(0, 5).map((w: any, i: number) => (
                  <Text key={i} style={styles.listItem}>
                    • {w.agency || w.awarding_agency || 'Agency'}: {formatMoney(w.amount || w.value)}
                  </Text>
                ))}
              </View>
            )}
          </>
        )}
      </SectionCard>

      {/* 3. Insider Activity */}
      <SectionCard
        title="Insider Activity"
        icon="person-outline"
        iconColor="#A78BFA"
        source="SEC Form 4"
        empty={!insider_activity}
        emptyText="No insider data"
        summary={
          insider_activity &&
          (insider_activity.status === 'pending' ? (
            <PendingBlock reason={insider_activity.pending_reason} />
          ) : (
            <>
              <Metric label="Buys (90d)" value={formatNum(insider_activity.buys_90d)} color="#00C9A7" />
              <Metric label="Sells (90d)" value={formatNum(insider_activity.sells_90d)} color="#F59E0B" />
              <Metric
                label="Net sentiment"
                value={(insider_activity.net_sentiment || 'neutral').toUpperCase()}
              />
            </>
          ))
        }
      >
        {insider_activity && insider_activity.notable && insider_activity.notable.length > 0 && (
          <View>
            <Text style={styles.subHead}>Notable transactions</Text>
            {insider_activity.notable.slice(0, 5).map((t: any, i: number) => (
              <Text key={i} style={styles.listItem}>
                • {t.insider || t.name || 'Insider'}: {t.action || t.type || ''}{' '}
                {t.shares ? formatNum(t.shares) + ' shares' : ''}
              </Text>
            ))}
          </View>
        )}
      </SectionCard>

      {/* 4. Institutional Flows */}
      <SectionCard
        title="Institutional Flows"
        icon="briefcase-outline"
        iconColor="#14B8A6"
        source="SEC 13F"
        empty={!institutional}
        emptyText="No institutional data"
        summary={
          institutional &&
          (institutional.status === 'pending' ? (
            <PendingBlock reason={institutional.pending_reason} />
          ) : (
            <>
              <Metric
                label="Net change (QoQ)"
                value={formatPct(institutional.net_change_qoq)}
                color={institutional.net_change_qoq >= 0 ? '#00C9A7' : '#F59E0B'}
              />
              {institutional.top_holders && institutional.top_holders.length > 0 && (
                <Metric
                  label="Top holders"
                  value={String(institutional.top_holders.length)}
                />
              )}
            </>
          ))
        }
      >
        {institutional && (
          <>
            {institutional.top_holders && institutional.top_holders.length > 0 && (
              <View>
                <Text style={styles.subHead}>Top holders</Text>
                {institutional.top_holders.slice(0, 5).map((h: any, i: number) => (
                  <Text key={i} style={styles.listItem}>
                    • {h.name || h.holder || 'Holder'}
                    {h.pct != null ? ` — ${h.pct.toFixed(1)}%` : ''}
                  </Text>
                ))}
              </View>
            )}
            {institutional.notable_new_positions && institutional.notable_new_positions.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.subHead}>New positions</Text>
                {institutional.notable_new_positions.slice(0, 3).map((p: any, i: number) => (
                  <Text key={i} style={styles.listItem}>• {p.name || p.holder || 'Holder'}</Text>
                ))}
              </View>
            )}
          </>
        )}
      </SectionCard>

      {/* 5. Sector-Specific Intelligence */}
      {sector_specific && <SectorSpecificCard data={sector_specific} />}

      {/* 6. News Sentiment */}
      <SectionCard
        title="News Sentiment"
        icon="newspaper-outline"
        iconColor="#F472B6"
        source="Finnhub"
        empty={
          !news_sentiment ||
          !news_sentiment.recent_headlines ||
          news_sentiment.recent_headlines.length === 0
        }
        emptyText={`No recent news for ${ticker}`}
        summary={
          news_sentiment && (
            <>
              <Metric
                label="Sentiment"
                value={(news_sentiment.sentiment_label || 'neutral').toUpperCase()}
                color={sentimentColor(news_sentiment.sentiment_label)}
              />
              <Metric
                label="Score"
                value={news_sentiment.sentiment_score.toFixed(2)}
                color={sentimentColor(news_sentiment.sentiment_label)}
              />
              <Metric
                label="Positive / Negative"
                value={`${news_sentiment.counts.positive} / ${news_sentiment.counts.negative}`}
              />
            </>
          )
        }
      >
        {news_sentiment && news_sentiment.recent_headlines && (
          <View>
            <Text style={styles.subHead}>Recent headlines</Text>
            {news_sentiment.recent_headlines.slice(0, 6).map((h, i) => (
              <View key={i} style={styles.headlineRow}>
                <Text style={styles.headlineText} numberOfLines={2}>
                  {h.headline}
                </Text>
                <Text style={styles.headlineMeta}>
                  {h.source || ''}{h.datetime ? ` · ${dateFromTs(h.datetime)}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      {/* Disclaimer */}
      <View style={styles.disclaimerRow}>
        <Text style={styles.disclaimerIcon}>{'\u24D8'}</Text>
        <Text style={styles.disclaimerText}>
          {data.disclaimer || 'Alternative data is educational. Not financial advice.'}
        </Text>
      </View>

      <AIContentDisclaimer />
      <View style={{ height: 40 }} />
    </View>
  );
};

// ── Sector-specific sub-card ──

const SectorSpecificCard: React.FC<{ data: AltDataFullPayload['sector_specific'] }> = ({ data }) => {
  if (!data) return null;
  const d = data.data || {};
  const items: Array<[string, string]> = [];

  switch (data.type) {
    case 'healthcare':
      items.push(['Active trials', formatNum(d.active_trials)]);
      if (d.phase_counts && typeof d.phase_counts === 'object') {
        const phaseStr = Object.entries(d.phase_counts)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        if (phaseStr) items.push(['Phase breakdown', phaseStr]);
      }
      items.push([
        'Upcoming PDUFA',
        d.upcoming_pdufa ? String(d.upcoming_pdufa.length) : '0',
      ]);
      items.push([
        'Recent approvals',
        d.recent_approvals ? String(d.recent_approvals.length) : '0',
      ]);
      if (d.catalyst_score != null) items.push(['Catalyst score', `${d.catalyst_score}/10`]);
      break;
    case 'technology':
      items.push(['Patents (12m)', formatNum(d.patents_12m)]);
      items.push(['YoY change', formatPct(d.yoy_change_pct)]);
      if (d.top_areas && Array.isArray(d.top_areas) && d.top_areas.length) {
        items.push(['Top areas', d.top_areas.slice(0, 3).join(', ')]);
      }
      if (d.innovation_score != null) items.push(['Innovation score', `${d.innovation_score}/10`]);
      break;
    case 'energy':
      items.push(['Active contracts', formatNum(d.active_contracts)]);
      items.push(['Total value', formatMoney(d.total_value)]);
      if (d.top_agencies && Array.isArray(d.top_agencies) && d.top_agencies.length) {
        items.push(['Top agencies', d.top_agencies.filter(Boolean).slice(0, 3).join(', ')]);
      }
      break;
    case 'financials':
      items.push(['Active contracts', formatNum(d.active_contracts)]);
      items.push(['Total value', formatMoney(d.total_value)]);
      break;
    case 'consumer':
      // Notes-only branch
      break;
    default:
      items.push(['Patents (12m)', formatNum(d.patents_12m)]);
      items.push(['Active contracts', formatNum(d.active_contracts)]);
  }

  const notes: string[] = Array.isArray(d.notes) ? d.notes : [];
  const hasData = items.length > 0;

  return (
    <SectionCard
      title={data.label || 'Sector Intelligence'}
      icon="analytics-outline"
      iconColor="#818CF8"
      source={data.data_source}
      empty={!hasData && notes.length === 0}
      emptyText="No sector-specific data"
      summary={
        <>
          {items.slice(0, 3).map(([label, value]) => (
            <Metric key={label} label={label} value={value} />
          ))}
          {notes.length > 0 && items.length === 0 && (
            <PendingBlock reason={notes[0]} />
          )}
        </>
      }
    >
      {items.length > 3 &&
        items.slice(3).map(([label, value]) => <Metric key={label} label={label} value={value} />)}
      {notes.length > 0 && items.length > 0 && (
        <View style={{ marginTop: 8 }}>
          {notes.map((n, i) => (
            <Text key={i} style={styles.noteText}>• {n}</Text>
          ))}
        </View>
      )}
    </SectionCard>
  );
};

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  header: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  subHeader: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },

  loadingWrap: {
    padding: 24,
    alignItems: 'center',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontStyle: 'italic',
  },

  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cardSource: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '500',
  },

  summaryBlock: {
    gap: 6,
  },
  detailsBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },

  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    flex: 1,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },

  subHead: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  listItem: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 2,
  },
  noteText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 17,
    marginBottom: 2,
  },

  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 4,
  },
  expandBtnText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
  },

  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontStyle: 'italic',
  },

  pendingBlock: {
    backgroundColor: 'rgba(245,166,35,0.08)',
    borderRadius: 8,
    padding: 10,
  },
  pendingLabel: {
    color: '#F5A623',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  pendingReason: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    lineHeight: 15,
  },

  headlineRow: {
    marginBottom: 8,
  },
  headlineText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 17,
  },
  headlineMeta: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },

  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
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
