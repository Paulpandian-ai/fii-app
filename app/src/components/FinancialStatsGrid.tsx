import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  SectionList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton } from './Skeleton';
import { getFinancials } from '../services/api';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Metric tooltip definitions (educational) ──
const METRIC_TOOLTIPS: Record<string, string> = {
  // Valuation
  trailing_pe: 'Price to Earnings ratio (trailing 12 months). How much investors pay for each dollar of earnings. Lower usually means cheaper.',
  forward_pe: 'Expected P/E based on future earnings estimates. Lower suggests the stock may be undervalued relative to expected growth.',
  peg_ratio: 'P/E divided by earnings growth rate. A PEG near 1 suggests fair value; below 1 may be undervalued.',
  price_to_sales: 'Market cap divided by total revenue. Useful for comparing companies that aren\'t yet profitable.',
  price_to_book: 'Market cap divided by book value. A P/B below 1 could mean the stock is undervalued, or the company has problems.',
  ev_to_ebitda: 'Enterprise value divided by EBITDA. A more complete valuation than P/E because it includes debt.',
  ev_to_revenue: 'Enterprise value divided by revenue. Useful for comparing companies across different capital structures.',
  market_cap: 'Total market value of all outstanding shares. Larger companies are generally more stable but grow slower.',
  enterprise_value: 'Market cap plus debt minus cash. Represents the total cost to acquire the company.',
  // Profitability
  gross_margin: 'Revenue minus cost of goods, as a percentage. Higher means the company keeps more from each sale.',
  operating_margin: 'Profit from operations as a percentage of revenue. Shows how efficiently the company runs.',
  net_margin: 'Bottom-line profit as a percentage of revenue, after all expenses. Higher is better.',
  roe: 'Return on Equity. How much profit the company generates with shareholders\' money. Higher means more efficient.',
  roa: 'Return on Assets. Profit relative to total assets. Shows how well the company uses everything it owns.',
  roic: 'Return on Invested Capital. Profit generated per dollar of invested capital. Best measure of capital efficiency.',
  ebitda: 'Earnings before interest, taxes, depreciation and amortization. A proxy for operating cash flow.',
  ebitda_margin: 'EBITDA as a percentage of revenue. Shows operating profitability before accounting choices.',
  free_cash_flow_margin: 'Free cash flow as a percentage of revenue. Shows how much real cash the business generates.',
  // Growth
  revenue_growth_yoy: 'Year-over-year revenue growth. Shows if the company is expanding its top line.',
  eps_growth_yoy: 'Year-over-year earnings per share growth. Shows if profits are growing.',
  revenue_growth_qoq: 'Quarter-over-quarter revenue growth. More recent trend than annual.',
  eps_growth_qoq: 'Quarter-over-quarter EPS growth. More recent earnings trend.',
  revenue_cagr_3y: 'Compound annual growth rate of revenue over 3 years. Shows sustained growth ability.',
  eps_cagr_3y: 'Compound annual growth rate of EPS over 3 years. Consistent earnings growth is highly valued.',
  free_cash_flow_growth: 'Growth rate of free cash flow. FCF growth often leads to share price appreciation.',
  book_value_growth: 'Growth in company\'s net asset value. Indicates wealth accumulation for shareholders.',
  // Financial Health
  current_ratio: 'Current assets divided by current liabilities. Above 1 means the company can pay short-term bills.',
  quick_ratio: 'Like current ratio but excludes inventory. A stricter test of short-term financial health.',
  debt_to_equity: 'Total debt divided by shareholder equity. Lower means less reliance on borrowed money.',
  debt_to_assets: 'Total debt as a percentage of total assets. Shows how much of the company is funded by debt.',
  interest_coverage: 'EBIT divided by interest expense. Higher means the company can easily pay its debt interest.',
  total_debt: 'All short-term and long-term borrowings. Consider relative to cash and earnings.',
  total_cash: 'Cash and cash equivalents on hand. A safety buffer for tough times.',
  net_debt: 'Total debt minus cash. Negative net debt means more cash than debt — a strong position.',
  altman_z_score: 'Bankruptcy risk score. Above 3 is safe, 1.8-3 is gray zone, below 1.8 signals distress.',
  // Dividends
  dividend_yield: 'Annual dividend per share divided by price. The "interest rate" you earn from holding the stock.',
  payout_ratio: 'Percentage of earnings paid as dividends. Very high ratios may not be sustainable.',
  dividend_per_share: 'Dollar amount of dividends paid per share annually.',
  dividend_growth_5y: 'Average annual dividend growth over 5 years. Growing dividends signal financial strength.',
  ex_dividend_date: 'Buy before this date to receive the next dividend payment.',
  years_of_growth: 'Consecutive years of dividend increases. 25+ years earns "Dividend Aristocrat" status.',
  // Analyst Estimates
  target_price: 'Average analyst price target. The price Wall Street expects the stock to reach.',
  target_upside: 'How much upside (or downside) to the average price target from current price.',
  analyst_rating: 'Consensus recommendation from analysts covering this stock.',
  num_analysts: 'Number of professional analysts providing estimates. More coverage means better data.',
  eps_estimate_current: 'Expected earnings per share for the current quarter.',
  eps_estimate_next: 'Expected earnings per share for next quarter.',
  revenue_estimate_current: 'Expected total revenue for the current quarter.',
  revenue_estimate_next: 'Expected total revenue for next quarter.',
  // Momentum & Technicals
  beta: 'How much the stock moves relative to the market. Beta > 1 means more volatile than average.',
  fifty_two_week_high: 'Highest price in the past year. Proximity to this level can indicate strength.',
  fifty_two_week_low: 'Lowest price in the past year. Proximity may indicate weakness or a buying opportunity.',
  fifty_day_ma: '50-day moving average price. A short-term trend indicator. Price above = bullish.',
  two_hundred_day_ma: '200-day moving average price. A long-term trend indicator. Price above = bullish.',
  relative_strength_index: 'RSI measures momentum. Above 70 is overbought, below 30 is oversold.',
  avg_volume: 'Average number of shares traded daily. Higher volume means easier to buy and sell.',
  price_to_52w_high: 'Current price as a percentage of the 52-week high. Shows how far from the peak.',
  short_interest: 'Percentage of shares currently sold short. High short interest means many are betting against it.',
  // Ownership
  insider_ownership: 'Percentage of shares owned by company executives. Higher can align interests with shareholders.',
  institutional_ownership: 'Percentage owned by funds and institutions. High institutional ownership adds stability.',
  insider_transactions: 'Recent insider buying or selling activity. Insiders buying is generally a positive signal.',
  shares_outstanding: 'Total shares that exist. Used to calculate market cap and per-share metrics.',
  float_shares: 'Shares available for public trading. Lower float can mean higher volatility.',
  shares_short: 'Number of shares currently sold short by bearish investors.',
};

// ── Category configuration ──
const CATEGORIES = [
  { key: 'valuation', label: 'Valuation', icon: 'analytics-outline' },
  { key: 'profitability', label: 'Profitability', icon: 'trending-up-outline' },
  { key: 'growth', label: 'Growth', icon: 'rocket-outline' },
  { key: 'financial_health', label: 'Financial Health', icon: 'shield-checkmark-outline' },
  { key: 'dividends', label: 'Dividends', icon: 'cash-outline' },
  { key: 'analyst_estimates', label: 'Analyst Estimates', icon: 'people-outline' },
  { key: 'momentum_technicals', label: 'Momentum & Technicals', icon: 'pulse-outline' },
  { key: 'ownership', label: 'Ownership', icon: 'pie-chart-outline' },
];

// ── Metric display names ──
const METRIC_LABELS: Record<string, string> = {
  trailing_pe: 'P/E (TTM)', forward_pe: 'P/E (Forward)', peg_ratio: 'PEG Ratio',
  price_to_sales: 'P/S Ratio', price_to_book: 'P/B Ratio', ev_to_ebitda: 'EV/EBITDA',
  ev_to_revenue: 'EV/Revenue', market_cap: 'Market Cap', enterprise_value: 'Enterprise Value',
  gross_margin: 'Gross Margin', operating_margin: 'Operating Margin', net_margin: 'Net Margin',
  roe: 'Return on Equity', roa: 'Return on Assets', roic: 'Return on Invested Capital',
  ebitda: 'EBITDA', ebitda_margin: 'EBITDA Margin', free_cash_flow_margin: 'FCF Margin',
  revenue_growth_yoy: 'Revenue Growth (YoY)', eps_growth_yoy: 'EPS Growth (YoY)',
  revenue_growth_qoq: 'Revenue Growth (QoQ)', eps_growth_qoq: 'EPS Growth (QoQ)',
  revenue_cagr_3y: 'Revenue CAGR (3Y)', eps_cagr_3y: 'EPS CAGR (3Y)',
  free_cash_flow_growth: 'FCF Growth', book_value_growth: 'Book Value Growth',
  current_ratio: 'Current Ratio', quick_ratio: 'Quick Ratio', debt_to_equity: 'Debt/Equity',
  debt_to_assets: 'Debt/Assets', interest_coverage: 'Interest Coverage',
  total_debt: 'Total Debt', total_cash: 'Total Cash', net_debt: 'Net Debt',
  altman_z_score: 'Altman Z-Score',
  dividend_yield: 'Dividend Yield', payout_ratio: 'Payout Ratio',
  dividend_per_share: 'Dividend/Share', dividend_growth_5y: 'Dividend Growth (5Y)',
  ex_dividend_date: 'Ex-Dividend Date', years_of_growth: 'Years of Growth',
  target_price: 'Price Target', target_upside: 'Target Upside',
  analyst_rating: 'Analyst Rating', num_analysts: 'Analysts Covering',
  eps_estimate_current: 'EPS Est. (Current Q)', eps_estimate_next: 'EPS Est. (Next Q)',
  revenue_estimate_current: 'Rev Est. (Current Q)', revenue_estimate_next: 'Rev Est. (Next Q)',
  beta: 'Beta', fifty_two_week_high: '52-Week High', fifty_two_week_low: '52-Week Low',
  fifty_day_ma: '50-Day MA', two_hundred_day_ma: '200-Day MA',
  relative_strength_index: 'RSI (14)', avg_volume: 'Avg Volume',
  price_to_52w_high: 'Price vs 52W High', short_interest: 'Short Interest',
  insider_ownership: 'Insider Ownership', institutional_ownership: 'Institutional Ownership',
  insider_transactions: 'Insider Transactions', shares_outstanding: 'Shares Outstanding',
  float_shares: 'Float', shares_short: 'Shares Short',
};

// ── Higher-is-better vs lower-is-better ──
const HIGHER_IS_BETTER = new Set([
  'gross_margin', 'operating_margin', 'net_margin', 'roe', 'roa', 'roic',
  'revenue_growth_yoy', 'eps_growth_yoy', 'revenue_growth_qoq', 'eps_growth_qoq',
  'revenue_cagr_3y', 'eps_cagr_3y', 'free_cash_flow_growth', 'book_value_growth',
  'free_cash_flow_margin', 'ebitda_margin', 'current_ratio', 'quick_ratio',
  'interest_coverage', 'dividend_yield', 'dividend_growth_5y', 'years_of_growth',
  'altman_z_score', 'total_cash',
]);

const LOWER_IS_BETTER = new Set([
  'trailing_pe', 'forward_pe', 'peg_ratio', 'debt_to_equity', 'debt_to_assets',
  'short_interest', 'ev_to_ebitda', 'total_debt', 'net_debt', 'payout_ratio',
  'shares_short',
]);

// ── Formatting helpers ──
const PCT_METRICS = new Set([
  'gross_margin', 'operating_margin', 'net_margin', 'roe', 'roa', 'roic',
  'ebitda_margin', 'free_cash_flow_margin', 'revenue_growth_yoy', 'eps_growth_yoy',
  'revenue_growth_qoq', 'eps_growth_qoq', 'revenue_cagr_3y', 'eps_cagr_3y',
  'free_cash_flow_growth', 'book_value_growth', 'dividend_yield', 'payout_ratio',
  'dividend_growth_5y', 'target_upside', 'insider_ownership', 'institutional_ownership',
  'short_interest', 'price_to_52w_high', 'debt_to_assets',
]);

const CURRENCY_LARGE = new Set([
  'market_cap', 'enterprise_value', 'ebitda', 'total_debt', 'total_cash', 'net_debt',
  'revenue_estimate_current', 'revenue_estimate_next',
]);

const PER_SHARE = new Set([
  'dividend_per_share', 'eps_estimate_current', 'eps_estimate_next', 'target_price',
  'fifty_two_week_high', 'fifty_two_week_low', 'fifty_day_ma', 'two_hundred_day_ma',
]);

const safeNum = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatValue = (key: string, value: unknown): string => {
  if (value == null) return 'N/A';
  if (typeof value === 'string') return value;
  const num = safeNum(value);
  if (!Number.isFinite(num)) return 'N/A';
  if (PCT_METRICS.has(key)) {
    const pct = Math.abs(num) < 1 && Math.abs(num) > 0 ? num * 100 : num;
    return `${pct.toFixed(2)}%`;
  }
  if (CURRENCY_LARGE.has(key)) {
    if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    return `$${num.toLocaleString()}`;
  }
  if (PER_SHARE.has(key)) return `$${num.toFixed(2)}`;
  if (key === 'avg_volume' || key === 'shares_outstanding' || key === 'float_shares' || key === 'shares_short') {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
    return num.toLocaleString();
  }
  return num.toFixed(2);
};

const getPercentileColor = (key: string, percentile: number): string => {
  if (HIGHER_IS_BETTER.has(key)) {
    return percentile >= 70 ? '#00C9A7' : percentile >= 40 ? '#8E8E93' : '#F5A623';
  }
  if (LOWER_IS_BETTER.has(key)) {
    return percentile <= 30 ? '#00C9A7' : percentile <= 60 ? '#8E8E93' : '#F5A623';
  }
  return '#8E8E93';
};

interface FinancialStatsGridProps {
  ticker: string;
}

interface MetricData {
  value: any;
  source?: string;
  sector_median?: any;
  percentile?: number;
}

export const FinancialStatsGrid: React.FC<FinancialStatsGridProps> = ({ ticker }) => {
  const [financials, setFinancials] = useState<Record<string, Record<string, MetricData>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['valuation']));
  const [tooltipKey, setTooltipKey] = useState<string | null>(null);

  useEffect(() => {
    getFinancials(ticker)
      .then((d: any) => {
        if (d && typeof d === 'object') {
          const cats = d.categories || d;
          setFinancials(cats);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticker]);

  const toggleCategory = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Skeleton width="100%" height={52} borderRadius={12} />
        <View style={{ height: 8 }} />
        <Skeleton width="100%" height={52} borderRadius={12} />
        <View style={{ height: 8 }} />
        <Skeleton width="100%" height={52} borderRadius={12} />
      </View>
    );
  }

  if (!financials || Object.keys(financials).length === 0) return null;

  return (
    <View>
      {CATEGORIES.map(({ key: catKey, label, icon }) => {
        const catData = financials[catKey];
        if (!catData || typeof catData !== 'object') return null;
        const metrics = Object.entries(catData).filter(([, m]) => m && m.value != null);
        if (metrics.length === 0) return null;
        // Hide dividends if no meaningful data
        if (catKey === 'dividends') {
          const hasYield = metrics.some(([k, m]) => k === 'dividend_yield' && safeNum(m.value) > 0);
          if (!hasYield) return null;
        }
        const isExpanded = expandedCats.has(catKey);

        return (
          <View key={catKey} style={styles.categoryCard}>
            <TouchableOpacity
              style={styles.categoryHeader}
              onPress={() => toggleCategory(catKey)}
              activeOpacity={0.7}
            >
              <View style={styles.categoryLeft}>
                <Ionicons name={icon as any} size={18} color="#60A5FA" />
                <Text style={styles.categoryName}>{label}</Text>
                <View style={styles.metricCountBadge}>
                  <Text style={styles.metricCountText}>{metrics.length}</Text>
                </View>
              </View>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="rgba(255,255,255,0.4)"
              />
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.metricsList}>
                {metrics.map(([metricKey, metric]) => {
                  const percentile = metric.percentile ?? null;
                  const sectorMedian = metric.sector_median;
                  const barColor = percentile != null ? getPercentileColor(metricKey, percentile) : '#8E8E93';
                  const showTooltip = tooltipKey === metricKey;

                  return (
                    <View key={metricKey}>
                      <View style={styles.metricRow}>
                        <View style={styles.metricNameRow}>
                          <Text style={styles.metricName} numberOfLines={1}>
                            {METRIC_LABELS[metricKey] || metricKey.replace(/_/g, ' ')}
                          </Text>
                          {METRIC_TOOLTIPS[metricKey] && (
                            <TouchableOpacity
                              onPress={() => setTooltipKey(showTooltip ? null : metricKey)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons
                                name="information-circle-outline"
                                size={14}
                                color="rgba(255,255,255,0.3)"
                              />
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={styles.metricValueCol}>
                          <Text style={styles.metricValue}>{formatValue(metricKey, metric.value)}</Text>
                          {sectorMedian != null && (
                            <Text style={styles.sectorMedian}>
                              Sector: {formatValue(metricKey, sectorMedian)}
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* Percentile bar */}
                      {percentile != null && (
                        <View style={styles.percentileBarRow}>
                          <View style={styles.percentileTrack}>
                            <View
                              style={[
                                styles.percentileFill,
                                {
                                  width: `${Math.min(100, Math.max(2, percentile))}%`,
                                  backgroundColor: barColor,
                                },
                              ]}
                            />
                          </View>
                          <Text style={[styles.percentileLabel, { color: barColor }]}>
                            {Math.round(percentile)}th
                          </Text>
                        </View>
                      )}

                      {/* Tooltip */}
                      {showTooltip && METRIC_TOOLTIPS[metricKey] && (
                        <View style={styles.tooltipCard}>
                          <Text style={styles.tooltipText}>{METRIC_TOOLTIPS[metricKey]}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    paddingVertical: 8,
  },
  categoryCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  metricCountBadge: {
    backgroundColor: 'rgba(96,165,250,0.15)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  metricCountText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '700',
  },
  metricsList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7,
  },
  metricNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 8,
  },
  metricName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '500',
  },
  metricValueCol: {
    alignItems: 'flex-end',
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  sectorMedian: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  percentileBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  percentileTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  percentileFill: {
    height: '100%',
    borderRadius: 2,
  },
  percentileLabel: {
    fontSize: 10,
    fontWeight: '700',
    width: 32,
    textAlign: 'right',
  },
  tooltipCard: {
    backgroundColor: 'rgba(96,165,250,0.12)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#60A5FA',
  },
  tooltipText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    lineHeight: 18,
  },
});
