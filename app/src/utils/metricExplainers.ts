// ═══════════════════════════════════════════════════════════════
// Beginner-Friendly Metric Explainers
// ═══════════════════════════════════════════════════════════════
// Every financial metric gets a plain-English tooltip with:
// - Dollar-based analogies ($1 invested -> $X)
// - Everyday comparisons (rental property, lemonade stand, etc.)
// - "Higher/lower is better" directional guidance
// - No jargon in the beginner field

export interface MetricExplainer {
  name: string;
  beginner: string;
  context: string;
  direction: 'higher' | 'lower' | 'neutral';
}

/**
 * Returns a beginner-friendly explainer for a metric, optionally
 * interpolating the actual value into the explanation.
 */
export function getBeginnerExplainer(
  metricKey: string,
  value?: number | null,
): MetricExplainer | null {
  const explainer = METRIC_EXPLAINERS[metricKey];
  if (!explainer) return null;

  if (value != null && Number.isFinite(value)) {
    return {
      ...explainer,
      beginner: interpolateValue(explainer.beginner, metricKey, value),
    };
  }
  return explainer;
}

function interpolateValue(template: string, key: string, value: number): string {
  // For metrics where we can make the explanation dynamic
  if (key === 'trailing_pe' || key === 'forward_pe' || key === 'price_to_earnings') {
    const pe = Math.abs(value) < 1 ? value : Math.round(value);
    return `If this company earned $1, investors are paying $${pe} for it. Lower usually means a better deal.`;
  }
  if (key === 'gross_margin') {
    const cents = Math.round((Math.abs(value) < 1 ? value : value / 100) * 100);
    return `For every $1 of sales, the company keeps $0.${cents.toString().padStart(2, '0')} after making the product. Higher is better.`;
  }
  if (key === 'debt_to_equity') {
    const ratio = value < 1 ? value.toFixed(2) : value.toFixed(1);
    return `For every $1 the company owns, it owes $${ratio} in debt. Lower means less financial risk.`;
  }
  if (key === 'beta') {
    const dir = value > 1 ? 'more' : value < 1 ? 'less' : 'about the same as';
    const pct = Math.abs(value * 100 - 100);
    return `When the market moves 1%, this stock typically moves ${value.toFixed(1)}%. It swings ${dir} than average${value !== 1 ? ` (${Math.round(pct)}% ${value > 1 ? 'more' : 'less'})` : ''}.`;
  }
  if (key === 'dividend_yield') {
    const pct = Math.abs(value) < 1 ? (value * 100).toFixed(1) : value.toFixed(1);
    return `For every $100 you invest, you'd earn about $${(parseFloat(pct)).toFixed(2)} per year in dividends.`;
  }
  return template;
}

export const METRIC_EXPLAINERS: Record<string, MetricExplainer> = {
  // ── Valuation (9 metrics) ──
  trailing_pe: {
    name: 'P/E Ratio',
    beginner: 'If this company earned $1, investors are paying $45 for it. Lower usually means a better deal.',
    context: 'Think of it like buying a rental property \u2014 P/E tells you how many years of rent it takes to pay back your purchase price.',
    direction: 'lower',
  },
  forward_pe: {
    name: 'Forward P/E',
    beginner: 'Based on expected future earnings, how much investors pay for each $1 of profit. Lower suggests the stock may be a better deal.',
    context: 'Like buying a rental property based on next year\'s expected rent \u2014 forward-looking, so it uses estimates.',
    direction: 'lower',
  },
  peg_ratio: {
    name: 'PEG Ratio',
    beginner: 'Compares the stock\'s price to how fast profits are growing. Near 1 is fair value. Below 1 could be a bargain.',
    context: 'Imagine two stores: one costs $100K earning $10K/year (growing 5%), another costs $200K earning $10K/year (growing 20%). PEG helps compare them.',
    direction: 'lower',
  },
  price_to_sales: {
    name: 'Price/Sales',
    beginner: 'How much investors pay for each $1 of the company\'s total sales. Useful when the company isn\'t yet profitable.',
    context: 'Like valuing a food truck by its total sales rather than profit. A P/S of 2 means investors pay $2 for every $1 of revenue.',
    direction: 'lower',
  },
  price_to_book: {
    name: 'Price/Book',
    beginner: 'Compares the stock price to what the company would be worth if it sold everything and paid off debts. Below 1 might be a deal.',
    context: 'Like buying a house for less than the value of the land plus building materials. Under 1 could mean a bargain or a warning.',
    direction: 'lower',
  },
  ev_to_ebitda: {
    name: 'EV/EBITDA',
    beginner: 'A more complete way to check if a stock is expensive. It includes the company\'s debt in the calculation. Lower is usually better.',
    context: 'Like comparing house prices by including the mortgage \u2014 gives a fuller picture than just the sticker price.',
    direction: 'lower',
  },
  ev_to_revenue: {
    name: 'EV/Revenue',
    beginner: 'The total cost to buy the entire company (including its debt) compared to its yearly sales. Lower means cheaper.',
    context: 'Imagine buying a business for $500K that makes $100K in sales \u2014 that\'s an EV/Revenue of 5x.',
    direction: 'lower',
  },
  market_cap: {
    name: 'Market Cap',
    beginner: 'The total value of all the company\'s shares combined. Bigger companies are usually more stable but grow slower.',
    context: 'Think of it as the price tag on the whole company. Over $200B is mega-cap, $10-200B is large, under $2B is small.',
    direction: 'neutral',
  },
  enterprise_value: {
    name: 'Enterprise Value',
    beginner: 'The "real" price to buy the entire company \u2014 includes share price plus debt, minus cash on hand.',
    context: 'Like the total cost of buying a house: the listing price plus the mortgage you take over, minus the cash in the safe.',
    direction: 'neutral',
  },

  // ── Profitability (9 metrics) ──
  gross_margin: {
    name: 'Gross Margin',
    beginner: 'For every $1 of sales, the company keeps $0.74 after making the product. Higher is better.',
    context: 'A lemonade stand that sells for $2 and spends $0.50 on lemons has a 75% gross margin.',
    direction: 'higher',
  },
  operating_margin: {
    name: 'Operating Margin',
    beginner: 'For every $1 of sales, how much is left after paying for everything except taxes and interest. Higher means more efficient.',
    context: 'After paying for lemons, cups, the stand, and your helper \u2014 what\'s left over before the taxman comes.',
    direction: 'higher',
  },
  net_margin: {
    name: 'Net Margin',
    beginner: 'The final profit from every $1 of sales after ALL expenses. The ultimate measure of profitability. Higher is better.',
    context: 'Your lemonade stand made $1000 in sales and kept $150 after everything. That\'s a 15% net margin.',
    direction: 'higher',
  },
  roe: {
    name: 'Return on Equity',
    beginner: 'For every $1 that shareholders have invested, the company earns this much in profit. Higher means the company uses your money well.',
    context: 'Like earning $15 on a $100 savings account \u2014 that\'s a 15% return. Companies above 15% are doing well.',
    direction: 'higher',
  },
  roa: {
    name: 'Return on Assets',
    beginner: 'For every $1 worth of stuff the company owns (buildings, equipment, etc.), it generates this much profit. Higher is better.',
    context: 'If you own a $200K food truck that makes $20K profit, that\'s a 10% ROA. It shows how well they use what they own.',
    direction: 'higher',
  },
  roic: {
    name: 'Return on Invested Capital',
    beginner: 'For every $1 invested in the business (by owners and lenders combined), how much profit comes back. The gold standard of efficiency.',
    context: 'Like measuring the return on ALL money put into a business \u2014 from the owner\'s pocket and from bank loans combined.',
    direction: 'higher',
  },
  ebitda: {
    name: 'EBITDA',
    beginner: 'How much cash the business generates from its operations, before accounting tricks. Bigger is better.',
    context: 'Think of it as "how much money is the engine of this business actually producing?" Ignores taxes and bookkeeping choices.',
    direction: 'higher',
  },
  ebitda_margin: {
    name: 'EBITDA Margin',
    beginner: 'What percentage of every sales dollar turns into operating cash. Higher means a more profitable business engine.',
    context: 'A company with 25% EBITDA margin keeps $0.25 as operating cash from every $1 of sales.',
    direction: 'higher',
  },
  free_cash_flow_margin: {
    name: 'FCF Margin',
    beginner: 'What percentage of sales turns into real cash the company can use freely \u2014 to pay dividends, buy back stock, or grow. Higher is better.',
    context: 'This is the "real money" left over after paying all bills and buying necessary equipment. It\'s what matters most.',
    direction: 'higher',
  },

  // ── Growth (8 metrics) ──
  revenue_growth_yoy: {
    name: 'Revenue Growth (YoY)',
    beginner: 'How much total sales grew compared to the same time last year. Positive means the company is getting bigger.',
    context: 'If your store made $100K last year and $120K this year, that\'s 20% revenue growth. Steady growth is a good sign.',
    direction: 'higher',
  },
  eps_growth_yoy: {
    name: 'EPS Growth (YoY)',
    beginner: 'How much profit per share grew compared to last year. This is what drives stock prices over time. Higher is better.',
    context: 'Like your paycheck going from $50K to $55K \u2014 that\'s 10% growth. Consistent EPS growth often leads to rising stock prices.',
    direction: 'higher',
  },
  revenue_growth_qoq: {
    name: 'Revenue Growth (QoQ)',
    beginner: 'How much sales grew compared to last quarter. Shows the most recent business trend.',
    context: 'A quarterly check-in on business health \u2014 like weighing yourself monthly instead of yearly.',
    direction: 'higher',
  },
  eps_growth_qoq: {
    name: 'EPS Growth (QoQ)',
    beginner: 'How much earnings per share changed from last quarter. The freshest read on profit trends.',
    context: 'Like checking your bank balance this month vs. last month \u2014 the most up-to-date snapshot of growth.',
    direction: 'higher',
  },
  revenue_cagr_3y: {
    name: 'Revenue CAGR (3Y)',
    beginner: 'Average yearly sales growth over the past 3 years. Shows whether the company has been growing steadily over time.',
    context: 'Like measuring your kid\'s height growth rate averaged over 3 years instead of just one measurement.',
    direction: 'higher',
  },
  eps_cagr_3y: {
    name: 'EPS CAGR (3Y)',
    beginner: 'Average yearly profit-per-share growth over 3 years. Consistent growth here is a very positive sign.',
    context: 'If your investment grew from $100 to $133 over 3 years, that\'s about 10% CAGR. Steady is the key word.',
    direction: 'higher',
  },
  free_cash_flow_growth: {
    name: 'FCF Growth',
    beginner: 'How much the company\'s "real cash" is growing. More free cash means more flexibility to reward investors.',
    context: 'Like your take-home pay growing \u2014 not just your salary on paper, but the actual cash in your pocket.',
    direction: 'higher',
  },
  book_value_growth: {
    name: 'Book Value Growth',
    beginner: 'How much the company\'s net worth (assets minus debts) is growing. Positive means the company is building wealth.',
    context: 'Like your home equity growing as you pay down the mortgage and the house appreciates.',
    direction: 'higher',
  },

  // ── Financial Health (9 metrics) ──
  current_ratio: {
    name: 'Current Ratio',
    beginner: 'Can the company pay its bills due within a year? Above 1.0 means yes. Below 1.0 is a warning sign.',
    context: 'Like checking if you have enough in your checking account to cover this month\'s bills. Above 1.5 is comfortable.',
    direction: 'higher',
  },
  quick_ratio: {
    name: 'Quick Ratio',
    beginner: 'Can the company pay bills NOW without selling inventory? A stricter test than current ratio. Above 1.0 is good.',
    context: 'Like asking "can you pay rent today?" \u2014 not counting stuff you\'d have to sell first on eBay.',
    direction: 'higher',
  },
  debt_to_equity: {
    name: 'Debt to Equity',
    beginner: 'For every $1 the company owns, it owes $0.45 in debt. Lower means less financial risk.',
    context: 'Like a person who earns $100K/year with $45K in loans \u2014 manageable but worth watching.',
    direction: 'lower',
  },
  debt_to_assets: {
    name: 'Debt/Assets',
    beginner: 'What fraction of everything the company owns was paid for with borrowed money. Lower is safer.',
    context: 'Like owing $150K on a $300K house \u2014 that\'s 50% debt-to-assets. Below 40% is healthy for most companies.',
    direction: 'lower',
  },
  interest_coverage: {
    name: 'Interest Coverage',
    beginner: 'How easily the company can pay the interest on its debts. Higher means debts are well under control.',
    context: 'If you earn $5,000/month and your loan payments are $500, your coverage is 10x. Above 5x is comfortable.',
    direction: 'higher',
  },
  total_debt: {
    name: 'Total Debt',
    beginner: 'Everything the company owes to banks and bondholders. Look at this alongside cash and earnings.',
    context: 'Like your total mortgage + car loan + student loans. The number alone doesn\'t tell the whole story \u2014 compare to income.',
    direction: 'lower',
  },
  total_cash: {
    name: 'Total Cash',
    beginner: 'Cash sitting in the company\'s bank accounts. More cash means more safety net and more options.',
    context: 'Like your emergency fund \u2014 companies with lots of cash can weather storms and seize opportunities.',
    direction: 'higher',
  },
  net_debt: {
    name: 'Net Debt',
    beginner: 'Total debt minus cash. If negative, the company has more cash than debt \u2014 a strong position.',
    context: 'Like subtracting your savings from your loans. Negative net debt is like being debt-free with money in the bank.',
    direction: 'lower',
  },
  altman_z_score: {
    name: 'Altman Z-Score',
    beginner: 'A bankruptcy risk score. Above 3 means safe, between 1.8 and 3 is a gray zone, below 1.8 means financial trouble.',
    context: 'Like a credit score for companies \u2014 invented by a professor in the 1960s and still widely used today.',
    direction: 'higher',
  },

  // ── Dividends (6 metrics) ──
  dividend_yield: {
    name: 'Dividend Yield',
    beginner: 'For every $100 you invest, you\'d earn about $X per year in dividends. Like interest on a savings account.',
    context: 'A 3% yield means $3/year per $100 invested. The average S&P 500 yield is around 1.5%.',
    direction: 'higher',
  },
  payout_ratio: {
    name: 'Payout Ratio',
    beginner: 'What percentage of profits the company pays out as dividends. Very high (over 80%) may not be sustainable.',
    context: 'Like spending 80% of your paycheck and saving 20%. A company paying out too much might have to cut dividends.',
    direction: 'neutral',
  },
  dividend_per_share: {
    name: 'Dividend/Share',
    beginner: 'The dollar amount you receive per share you own each year. More shares = more income.',
    context: 'If you own 100 shares and the dividend is $2/share, you\'ll get $200/year.',
    direction: 'higher',
  },
  dividend_growth_5y: {
    name: 'Dividend Growth (5Y)',
    beginner: 'How fast dividends have been growing over 5 years. Growing dividends often signal a healthy, confident company.',
    context: 'Like getting a raise every year. A company that consistently raises dividends is usually doing well.',
    direction: 'higher',
  },
  ex_dividend_date: {
    name: 'Ex-Dividend Date',
    beginner: 'You must own the stock before this date to get the next dividend payment.',
    context: 'Like a cut-off date for a promotion \u2014 buy before the ex-date, and the dividend check is yours.',
    direction: 'neutral',
  },
  years_of_growth: {
    name: 'Years of Growth',
    beginner: 'How many years in a row the company has raised its dividend. 25+ years earns special "Dividend Aristocrat" status.',
    context: 'Like a track record of raises at work. Companies with 25+ years of increases are incredibly reliable.',
    direction: 'higher',
  },

  // ── Analyst Estimates (8 metrics) ──
  target_price: {
    name: 'Price Target',
    beginner: 'The average price that professional analysts think this stock will reach. Compare to the current price.',
    context: 'Like a home appraiser saying your house is worth $350K. It\'s an educated guess, not a guarantee.',
    direction: 'higher',
  },
  target_upside: {
    name: 'Target Upside',
    beginner: 'How much higher (or lower) analysts think the stock will go from here. Positive means they expect it to rise.',
    context: 'If the stock is $100 and the target is $120, that\'s 20% upside. But remember, analysts aren\'t always right.',
    direction: 'higher',
  },
  analyst_rating: {
    name: 'Analyst Rating',
    beginner: 'The consensus recommendation from Wall Street analysts. Ranges from Strong Buy to Strong Sell.',
    context: 'Like a restaurant review average \u2014 the more analysts agree, the more meaningful the rating.',
    direction: 'neutral',
  },
  num_analysts: {
    name: 'Analysts Covering',
    beginner: 'How many professional analysts study and publish opinions on this stock. More coverage means more reliable data.',
    context: 'Like reading 20 reviews vs. 2 reviews \u2014 more opinions give you a better picture.',
    direction: 'higher',
  },
  eps_estimate_current: {
    name: 'EPS Est. (Current Q)',
    beginner: 'How much profit per share analysts expect for this quarter. If the company beats this, the stock often rises.',
    context: 'Like a student\'s expected grade \u2014 beating expectations (an "earnings beat") usually gets rewarded.',
    direction: 'higher',
  },
  eps_estimate_next: {
    name: 'EPS Est. (Next Q)',
    beginner: 'Expected profit per share for next quarter. Rising estimates mean analysts are getting more optimistic.',
    context: 'Future expectations matter more than past results in the stock market. Rising estimates are bullish.',
    direction: 'higher',
  },
  revenue_estimate_current: {
    name: 'Rev Est. (Current Q)',
    beginner: 'How much total sales analysts expect this quarter. Companies that consistently beat estimates tend to do well.',
    context: 'Like projecting how much a store will sell this month. Beating the projection is a positive signal.',
    direction: 'higher',
  },
  revenue_estimate_next: {
    name: 'Rev Est. (Next Q)',
    beginner: 'Expected total sales for next quarter. Rising revenue estimates suggest the business is growing.',
    context: 'Forward-looking sales expectations \u2014 if these keep rising, analysts see a growing business.',
    direction: 'higher',
  },

  // ── Momentum & Technicals (9 metrics) ──
  beta: {
    name: 'Beta',
    beginner: 'When the market goes up 1%, this stock typically goes up 1.2%. It swings more than average.',
    context: 'Think of it as a roller coaster rating \u2014 higher beta means bigger ups and bigger downs.',
    direction: 'neutral',
  },
  fifty_two_week_high: {
    name: '52-Week High',
    beginner: 'The highest price this stock has reached in the past year. Being near this level often signals strength.',
    context: 'Like a personal best in sports \u2014 stocks near their 52-week high are showing strong momentum.',
    direction: 'neutral',
  },
  fifty_two_week_low: {
    name: '52-Week Low',
    beginner: 'The lowest price in the past year. Being near this level could mean a bargain or a deeper problem.',
    context: 'Like a sale price \u2014 it might be a great deal, or the product might have issues. Investigate further.',
    direction: 'neutral',
  },
  fifty_day_ma: {
    name: '50-Day MA',
    beginner: 'The average price over the last 50 trading days. If the stock is above this, the short-term trend is up.',
    context: 'Like a 50-day moving weather average \u2014 smooths out daily noise to show the real trend direction.',
    direction: 'neutral',
  },
  two_hundred_day_ma: {
    name: '200-Day MA',
    beginner: 'The average price over roughly 10 months. If the stock is above this, the long-term trend is positive.',
    context: 'The most-watched trend line on Wall Street. Stocks above it are in a long-term uptrend.',
    direction: 'neutral',
  },
  relative_strength_index: {
    name: 'RSI',
    beginner: 'A momentum gauge from 0-100. Above 70 means the stock might be running too hot. Below 30 means it might be oversold.',
    context: 'Like a speedometer \u2014 it doesn\'t tell you where you\'re going, but it tells you how fast.',
    direction: 'neutral',
  },
  avg_volume: {
    name: 'Avg Volume',
    beginner: 'How many shares trade hands on a typical day. Higher volume means it\'s easier to buy and sell without affecting the price.',
    context: 'Like the foot traffic in a store \u2014 busy stores have better prices. Low volume stocks can be harder to trade.',
    direction: 'higher',
  },
  price_to_52w_high: {
    name: 'Price vs 52W High',
    beginner: 'How close the stock is to its yearly high. Near 100% means near the peak; lower means it\'s pulled back.',
    context: 'Like checking how close you are to your all-time best \u2014 90%+ suggests strong momentum.',
    direction: 'neutral',
  },
  short_interest: {
    name: 'Short Interest',
    beginner: 'What percentage of shares are being bet against. High short interest means many investors expect the price to fall.',
    context: 'Like negative reviews for a restaurant \u2014 if lots of people are betting against it, find out why. But sometimes they\'re wrong.',
    direction: 'lower',
  },

  // ── Ownership (6 metrics) ──
  insider_ownership: {
    name: 'Insider Ownership',
    beginner: 'How much of the company is owned by its own executives. Higher can be good \u2014 they have skin in the game.',
    context: 'Like a chef who eats at their own restaurant \u2014 if insiders own a lot, their interests align with yours.',
    direction: 'higher',
  },
  institutional_ownership: {
    name: 'Institutional Ownership',
    beginner: 'How much is owned by big funds and institutions. High ownership adds stability but can mean less upside.',
    context: 'Like having a co-signer on a loan \u2014 big institutions add credibility and stability.',
    direction: 'neutral',
  },
  insider_transactions: {
    name: 'Insider Transactions',
    beginner: 'Recent buying or selling by company executives. Insiders buying is generally a positive signal \u2014 they know the business best.',
    context: 'When the CEO buys more shares with their own money, it\'s like the pilot buying a ticket on their own airline.',
    direction: 'neutral',
  },
  shares_outstanding: {
    name: 'Shares Outstanding',
    beginner: 'The total number of shares that exist. More shares means each one represents a smaller piece of the company.',
    context: 'Like slicing a pizza \u2014 the more slices, the smaller each one. Companies sometimes buy back shares to make each slice bigger.',
    direction: 'neutral',
  },
  float_shares: {
    name: 'Float',
    beginner: 'Shares available for everyday investors to trade. Lower float can mean bigger price swings.',
    context: 'Like concert tickets available to the public \u2014 fewer available tickets means prices can move more dramatically.',
    direction: 'neutral',
  },
  shares_short: {
    name: 'Shares Short',
    beginner: 'The number of shares currently being bet against. High numbers relative to float can cause dramatic squeezes.',
    context: 'Short sellers borrow shares to sell, hoping to buy back cheaper. If the price rises instead, they scramble to buy back \u2014 a "short squeeze."',
    direction: 'lower',
  },

  // ── Additional Metrics (22 metrics) ──
  fcf_yield: {
    name: 'FCF Yield',
    beginner: 'For every $100 invested, the company generates about $X in free cash. Like a "real" interest rate on your investment.',
    context: 'Higher FCF yield means you\'re getting more "real cash" per dollar invested. Compare to bond yields for perspective.',
    direction: 'higher',
  },
  earnings_yield: {
    name: 'Earnings Yield',
    beginner: 'The earnings the company makes as a percentage of its stock price. Like the "interest rate" you earn from owning the stock.',
    context: 'The inverse of P/E ratio. An earnings yield of 5% means the company earns $5 for every $100 of stock price.',
    direction: 'higher',
  },
  revenue_growth_3y_cagr: {
    name: 'Revenue CAGR (3Y)',
    beginner: 'Average yearly sales growth over 3 years. Shows whether revenue has been growing steadily, not just a one-time spike.',
    context: 'Like measuring rainfall over 3 years instead of one day \u2014 gives a more reliable picture of the trend.',
    direction: 'higher',
  },
  eps_growth_3y_cagr: {
    name: 'EPS CAGR (3Y)',
    beginner: 'Average yearly earnings growth over 3 years. Consistent profit growth is what drives long-term stock gains.',
    context: 'A 15% EPS CAGR means profits roughly doubled over 3 years. That\'s the kind of growth investors love.',
    direction: 'higher',
  },
  book_value_growth_yoy: {
    name: 'Book Value Growth (YoY)',
    beginner: 'How much the company\'s net worth grew last year. Positive growth means the company is building value for shareholders.',
    context: 'Like your home equity growing year over year \u2014 the company is becoming more valuable on paper.',
    direction: 'higher',
  },
  fcf_growth_yoy: {
    name: 'FCF Growth (YoY)',
    beginner: 'How much the company\'s free cash flow grew compared to last year. Growing cash flow means more money for shareholders.',
    context: 'Like your take-home pay growing year over year \u2014 this is the real money the company can use freely.',
    direction: 'higher',
  },
  short_pct_float: {
    name: 'Short % of Float',
    beginner: 'What percentage of tradeable shares are being bet against. Above 10% is considered high \u2014 many are betting the price will fall.',
    context: 'Like negative Yelp reviews as a percentage of total reviews. High short interest can also lead to short squeezes.',
    direction: 'lower',
  },
  short_ratio: {
    name: 'Short Ratio',
    beginner: 'How many days it would take short sellers to buy back all their shares. Higher means they\'re more "trapped" if the price rises.',
    context: 'Also called "days to cover." Above 5 days means short sellers can\'t exit quickly, which could fuel a price surge.',
    direction: 'neutral',
  },
  price_to_earnings: {
    name: 'P/E Ratio',
    beginner: 'How much you pay for each $1 of the company\'s profits. Lower usually means the stock is cheaper relative to its earnings.',
    context: 'The most classic stock valuation metric. The S&P 500 average is around 20-25x. Growth stocks are often higher.',
    direction: 'lower',
  },
  price_to_fcf: {
    name: 'Price/FCF',
    beginner: 'How much you pay for each $1 of real cash the company generates. Lower means you\'re paying less for actual cash production.',
    context: 'Like P/E but uses "real cash" instead of accounting profits. Many investors prefer this as a truer measure.',
    direction: 'lower',
  },
  operating_cash_flow: {
    name: 'Operating Cash Flow',
    beginner: 'Cash generated from running the business day-to-day. More reliable than accounting profits because cash is cash.',
    context: 'Like the actual cash in your register at the end of the day \u2014 not what your accountant says you earned, but what you can touch.',
    direction: 'higher',
  },
  capex: {
    name: 'Capital Expenditure',
    beginner: 'Money spent on long-term stuff like factories, equipment, and technology. Needed for growth but reduces cash on hand.',
    context: 'Like buying a new oven for your bakery \u2014 it costs money now but should help you earn more later.',
    direction: 'neutral',
  },
  free_cash_flow: {
    name: 'Free Cash Flow',
    beginner: 'Cash left over after paying all bills and buying necessary equipment. This is the real money available for shareholders.',
    context: 'Like your paycheck minus rent, food, car payment, and savings \u2014 what\'s truly "free" to spend however you want.',
    direction: 'higher',
  },
  revenue: {
    name: 'Revenue',
    beginner: 'Total money the company brought in from selling products or services. The "top line" of the business.',
    context: 'Like total sales at a store before subtracting any costs. Revenue growth is the foundation of business growth.',
    direction: 'higher',
  },
  net_income: {
    name: 'Net Income',
    beginner: 'Final profit after every expense is paid \u2014 taxes, salaries, rent, everything. The "bottom line" that matters most.',
    context: 'Like your take-home pay after taxes, insurance, and retirement contributions. What\'s actually left.',
    direction: 'higher',
  },
  earnings_per_share: {
    name: 'EPS',
    beginner: 'How much profit the company made for each share you own. If you own 10 shares and EPS is $5, that\'s $50 in earnings for you.',
    context: 'The most important number for stock valuation. Higher EPS usually leads to higher stock prices over time.',
    direction: 'higher',
  },
  revenue_per_share: {
    name: 'Revenue/Share',
    beginner: 'Total sales divided by the number of shares. Shows how much revenue each share of stock represents.',
    context: 'Like splitting a restaurant\'s total sales among all the owners \u2014 more revenue per share is better.',
    direction: 'higher',
  },
  tangible_book_value: {
    name: 'Tangible Book Value',
    beginner: 'The company\'s net worth counting only things you can touch (buildings, equipment) \u2014 not brand value or patents.',
    context: 'Like valuing a house based only on the land and structure, not the "good neighborhood" premium.',
    direction: 'higher',
  },
  working_capital: {
    name: 'Working Capital',
    beginner: 'Money available for day-to-day operations. Positive means the company can comfortably run its business.',
    context: 'Like your checking account balance minus upcoming bills. Positive working capital means the lights stay on.',
    direction: 'higher',
  },
  cash_per_share: {
    name: 'Cash/Share',
    beginner: 'How much cash the company has for each share. If this is a big portion of the stock price, you\'re getting a cash cushion.',
    context: 'Like buying a $50 item that comes with a $10 gift card inside. The higher the cash per share, the bigger the built-in safety net.',
    direction: 'higher',
  },
  debt_to_fcf: {
    name: 'Debt/FCF',
    beginner: 'How many years of free cash flow it would take to pay off all debt. Lower means the company can shed debt faster.',
    context: 'Like asking "how long until I pay off my mortgage with my current savings rate?" Under 3 years is healthy.',
    direction: 'lower',
  },

  // RSI alias used in some contexts
  rsi_14: {
    name: 'RSI',
    beginner: 'A momentum gauge from 0-100. Above 70 means the stock might be running too hot. Below 30 means it might be oversold.',
    context: 'Like a speedometer \u2014 it doesn\'t tell you where you\'re going, but it tells you how fast.',
    direction: 'neutral',
  },
};
