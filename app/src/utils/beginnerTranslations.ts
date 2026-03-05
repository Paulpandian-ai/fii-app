// ═══════════════════════════════════════════════════════════════
// Beginner-Friendly Translations for Score Drivers
// ═══════════════════════════════════════════════════════════════
// Maps technical factor descriptions to plain English for the
// Overview tab. Analysis and Deep Dive tabs keep technical language.

/**
 * Translates a technical score driver description into beginner-friendly language.
 * Falls back to the original description if no translation pattern matches.
 */
export function translateDriverDescription(description: string): string {
  const lower = description.toLowerCase();

  // MACD signals
  if (lower.includes('macd') && (lower.includes('bullish') || lower.includes('crossover'))) {
    return 'Price trend is turning positive';
  }
  if (lower.includes('macd') && (lower.includes('bearish') || lower.includes('divergence'))) {
    return 'Price trend is turning negative';
  }

  // RSI signals
  if (lower.includes('rsi') && (lower.includes('overbought') || lower.includes('above 70'))) {
    return 'Stock price has risen fast recently \u2014 may cool off';
  }
  if (lower.includes('rsi') && (lower.includes('oversold') || lower.includes('below 30'))) {
    return 'Stock price has dropped a lot \u2014 may be a bargain';
  }
  if (lower.includes('rsi') && lower.includes('approaching overbought')) {
    return 'Stock price has risen fast recently \u2014 may cool off';
  }

  // SMA / moving average signals
  if (lower.includes('sma') && lower.includes('bearish')) {
    return 'Long-term price trend is pointing down';
  }
  if (lower.includes('sma') && lower.includes('bullish')) {
    return 'Long-term price trend is pointing up';
  }
  if (lower.includes('moving average') && lower.includes('below')) {
    return 'Price is below its average \u2014 recent trend is weak';
  }
  if (lower.includes('moving average') && lower.includes('above')) {
    return 'Price is above its average \u2014 recent trend is strong';
  }
  if (lower.includes('golden cross')) {
    return 'A rare positive signal \u2014 short-term trend just crossed above long-term';
  }
  if (lower.includes('death cross')) {
    return 'A warning signal \u2014 short-term trend just crossed below long-term';
  }

  // Bollinger bands
  if (lower.includes('bollinger') && lower.includes('upper')) {
    return 'Price is near the top of its normal range \u2014 could pull back';
  }
  if (lower.includes('bollinger') && lower.includes('lower')) {
    return 'Price is near the bottom of its normal range \u2014 could bounce back';
  }

  // Earnings / EPS
  if (lower.includes('eps surprise') || lower.includes('earnings beat')) {
    return 'Company earned more than analysts expected';
  }
  if (lower.includes('eps miss') || lower.includes('earnings miss')) {
    return 'Company earned less than analysts expected';
  }
  if (lower.includes('earnings') && lower.includes('momentum')) {
    return 'Strong earnings momentum \u2014 profits are growing';
  }

  // Guidance
  if (lower.includes('guidance') && (lower.includes('raised') || lower.includes('positive') || lower.includes('up'))) {
    return 'Company expects to do better than previously planned';
  }
  if (lower.includes('guidance') && (lower.includes('lowered') || lower.includes('negative') || lower.includes('cut'))) {
    return 'Company lowered its expectations for the future';
  }
  if (lower.includes('guidance') && lower.includes('revision')) {
    return 'Company updated its forecast for future performance';
  }

  // Supply chain
  if (lower.includes('supply chain') && (lower.includes('disruption') || lower.includes('risk'))) {
    return 'Some suppliers are having issues that could affect this company';
  }
  if (lower.includes('supplier') && lower.includes('miss')) {
    return 'A key supplier reported weaker-than-expected results';
  }
  if (lower.includes('lead time') || lower.includes('delivery delay')) {
    return 'It\'s taking longer to get parts and materials';
  }
  if (lower.includes('supply chain') && (lower.includes('concentrated') || lower.includes('asia'))) {
    return 'Supply chain concentrated in one region \u2014 adds risk';
  }

  // Customer / downstream
  if (lower.includes('capex') || lower.includes('capital expenditure')) {
    return 'Major customers are changing their spending plans';
  }
  if (lower.includes('contract') && (lower.includes('update') || lower.includes('renewal'))) {
    return 'Important customer contracts have been updated';
  }
  if (lower.includes('customer') && lower.includes('revenue')) {
    return 'Revenue from key customers is growing';
  }

  // Geopolitical
  if (lower.includes('conflict') || lower.includes('war')) {
    return 'Global conflicts may affect this company\'s operations';
  }
  if (lower.includes('trade barrier') || lower.includes('tariff') || lower.includes('sanction')) {
    return 'Trade restrictions could impact this company';
  }
  if (lower.includes('logistics') && lower.includes('disruption')) {
    return 'Shipping and delivery routes are being disrupted';
  }

  // Monetary / macro
  if (lower.includes('fed') && (lower.includes('rate') || lower.includes('decision'))) {
    return 'Federal Reserve interest rate decisions are affecting this stock';
  }
  if (lower.includes('inflation') || lower.includes('cpi')) {
    return 'Inflation trends are impacting this company';
  }
  if (lower.includes('treasury') || lower.includes('yield')) {
    return 'Bond market movements are affecting stock valuations';
  }

  // Correlations
  if (lower.includes('sector') && lower.includes('peer')) {
    return 'Similar companies in the sector are moving together';
  }
  if (lower.includes('commodity') && (lower.includes('link') || lower.includes('correlation'))) {
    return 'Commodity prices are influencing this stock';
  }
  if (lower.includes('risk sentiment') || lower.includes('market sentiment')) {
    return 'Overall market mood is affecting this stock';
  }

  // Beta / volatility
  if (lower.includes('beta') && lower.includes('high')) {
    return 'This stock swings more than average \u2014 higher risk and reward';
  }
  if (lower.includes('beta') && lower.includes('low')) {
    return 'This stock is calmer than average \u2014 steadier but less upside';
  }
  if (lower.includes('volatility') && lower.includes('high')) {
    return 'Price has been swinging a lot recently';
  }
  if (lower.includes('volatility') && lower.includes('low')) {
    return 'Price has been relatively steady recently';
  }

  // Debt / financial health
  if (lower.includes('debt') && (lower.includes('high') || lower.includes('concern'))) {
    return 'The company has a lot of debt relative to its size';
  }
  if (lower.includes('cash') && (lower.includes('strong') || lower.includes('healthy'))) {
    return 'The company has a healthy cash position';
  }

  // Data coverage
  if (lower.includes('data coverage') || lower.includes('limited data')) {
    return 'Limited data available \u2014 score may be less reliable';
  }

  // Generic positive / negative fallbacks
  if (lower.includes('strong') && lower.includes('positive')) {
    return 'Multiple positive signals are supporting this stock';
  }
  if (lower.includes('significant') && lower.includes('headwind')) {
    return 'Several factors are working against this stock right now';
  }

  // No match — return original
  return description;
}

/**
 * Translates a factor dimension name into beginner-friendly language.
 */
export function translateFactorName(factor: string): string {
  const translations: Record<string, string> = {
    'Supply Chain (Upstream)': 'Supplier Health',
    'Supply Chain (Downstream)': 'Customer Demand',
    'Geopolitical': 'Global Stability',
    'Monetary Policy': 'Interest Rates & Inflation',
    'Correlations': 'Market Connections',
    'Risk & Performance': 'Earnings & Stability',
  };
  return translations[factor] || factor;
}

/**
 * Returns the appropriate Ionicons name for a driver direction.
 * Uses Ionicons instead of emoji as per design spec.
 */
export function getDriverIcon(direction: string): { name: string; type: 'positive' | 'negative' } {
  const isPositive = direction === 'positive' || direction === 'up';
  return {
    name: isPositive ? 'checkmark-circle' : 'alert-circle',
    type: isPositive ? 'positive' : 'negative',
  };
}
