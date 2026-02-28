import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  DailyBriefingData,
  DisciplineScoreData,
  AchievementsData,
  WeeklyRecapData,
  LearningPathsData,
} from '../types';
import {
  getCoachDaily,
  getCoachScore,
  getCoachAchievements,
  postCoachEvent,
  getCoachWeekly,
} from '../services/api';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface CoachStore {
  daily: DailyBriefingData | null;
  isDailyLoading: boolean;
  dailyDismissed: boolean;

  score: DisciplineScoreData | null;
  isScoreLoading: boolean;

  achievements: AchievementsData | null;
  isAchievementsLoading: boolean;

  weekly: WeeklyRecapData | null;
  isWeeklyLoading: boolean;

  // Learning paths
  learningPaths: LearningPathsData | null;
  isLearningPathsLoading: boolean;
  completedLessons: Set<string>;

  // Coach chat
  chatMessages: ChatMsg[];
  isChatLoading: boolean;

  hasLoaded: boolean;

  loadDaily: () => Promise<void>;
  loadScore: () => Promise<void>;
  loadAchievements: () => Promise<void>;
  loadWeekly: () => Promise<void>;
  dismissDaily: () => void;
  logEvent: (event: string, amount?: number) => Promise<void>;
  loadAll: () => Promise<void>;

  // Learning paths
  loadLearningPaths: () => Promise<void>;
  completeLesson: (lessonId: string) => void;

  // Coach chat
  loadChatHistory: () => Promise<void>;
  addChatMessage: (msg: ChatMsg) => void;
  setChatLoading: (loading: boolean) => void;
}

const CHAT_STORAGE_KEY = '@fii_coach_chat';
const LESSONS_STORAGE_KEY = '@fii_completed_lessons';

// Default learning paths data (static content — in prod, fetch from API)
const DEFAULT_LEARNING_PATHS: LearningPathsData = {
  paths: [
    {
      id: 'basics',
      title: 'Investing Basics',
      emoji: '\u{1F331}',
      description: 'Start your investing journey',
      completedLessonIds: [],
      lessons: [
        {
          id: 'b1', title: 'What is a Stock?', xpReward: 10,
          screens: [
            'A stock represents ownership in a company. When you buy a share, you own a tiny piece of that business — its assets, profits, and future growth.',
            'Companies sell stock to raise money for growth. Investors buy stock hoping the company will become more valuable over time, making their shares worth more.',
            'Stock prices change every second during market hours based on supply and demand. If more people want to buy a stock than sell it, the price goes up.',
          ],
          quiz: [{ question: 'What does owning a stock represent?', options: ['A loan to the company', 'Ownership in the company', 'A guarantee of profit', 'A government bond'], correctIndex: 1 }],
        },
        {
          id: 'b2', title: 'How Markets Work', xpReward: 10,
          screens: [
            'Stock markets are like organized marketplaces where buyers and sellers trade shares. The NYSE and NASDAQ are the two largest in the US.',
            'Market hours are 9:30 AM - 4:00 PM ET, Monday through Friday. Pre-market and after-hours trading also exist but with less volume.',
            'Market indices like the S&P 500 track the overall performance of a group of stocks. When people say "the market is up," they usually mean the S&P 500.',
          ],
          quiz: [{ question: 'What does the S&P 500 track?', options: ['500 random companies', 'The 500 largest US companies', 'Technology stocks only', 'Bond performance'], correctIndex: 1 }],
        },
        {
          id: 'b3', title: 'What is P/E Ratio?', xpReward: 10,
          screens: [
            'The Price-to-Earnings (P/E) ratio tells you how much investors are willing to pay for $1 of a company\'s earnings. Formula: Stock Price ÷ Earnings Per Share.',
            'A high P/E (like 50x) means investors expect strong future growth. A low P/E (like 10x) might mean the company is undervalued — or that growth is slowing.',
            'The average S&P 500 P/E is around 20-25x. Compare a stock\'s P/E to its industry peers and its own historical average for better context.',
          ],
          quiz: [{ question: 'A company has a stock price of $100 and EPS of $5. What is its P/E ratio?', options: ['5x', '10x', '20x', '50x'], correctIndex: 2 }],
        },
        {
          id: 'b4', title: 'Risk vs. Reward', xpReward: 10,
          screens: [
            'In investing, risk and reward are linked. Higher potential returns usually come with higher potential losses. This is the fundamental trade-off.',
            'Stocks are generally riskier than bonds but offer higher long-term returns. The S&P 500 has averaged ~10% annually over decades, but with significant year-to-year swings.',
            'Your risk tolerance depends on your time horizon, financial situation, and emotional comfort with volatility. Younger investors can typically take more risk.',
          ],
          quiz: [{ question: 'What is the historical average annual return of the S&P 500?', options: ['About 5%', 'About 10%', 'About 20%', 'About 30%'], correctIndex: 1 }],
        },
        {
          id: 'b5', title: 'Diversification 101', xpReward: 10,
          screens: [
            'Diversification means spreading your investments across different stocks, sectors, and asset types. It\'s the classic "don\'t put all your eggs in one basket."',
            'If one stock drops 50%, but it\'s only 5% of your portfolio, your total loss is just 2.5%. Concentration amplifies both gains AND losses.',
            'A well-diversified portfolio typically has 15-30 stocks across multiple sectors. ETFs (like SPY or QQQ) offer instant diversification in a single purchase.',
          ],
          quiz: [{ question: 'Why is diversification important?', options: ['It guarantees profits', 'It reduces risk by spreading investments', 'It eliminates all losses', 'It\'s required by law'], correctIndex: 1 }],
        },
        {
          id: 'b6', title: 'Bull vs. Bear Markets', xpReward: 10,
          screens: [
            'A bull market is when stock prices rise 20%+ from recent lows. A bear market is when they fall 20%+ from recent highs. These are natural cycles.',
            'Bull markets last an average of 4.4 years. Bear markets last about 11.3 months on average. Historically, markets spend far more time going up than down.',
            'The key insight: bear markets are temporary, bull markets are the trend. Patient investors who stay invested through both tend to come out ahead.',
          ],
          quiz: [{ question: 'How long does the average bear market last?', options: ['About 1 month', 'About 11 months', 'About 3 years', 'About 10 years'], correctIndex: 1 }],
        },
        {
          id: 'b7', title: 'Understanding Dividends', xpReward: 10,
          screens: [
            'Dividends are cash payments companies make to shareholders, usually quarterly. Not all companies pay dividends — growth companies often reinvest profits instead.',
            'Dividend yield = Annual Dividend ÷ Stock Price. A $100 stock paying $3/year has a 3% yield. This is income on top of any stock price appreciation.',
            'Reinvesting dividends (DRIP) can dramatically boost long-term returns through compounding. $10K invested in S&P 500 in 1990 with dividends reinvested would be worth ~$200K vs ~$120K without.',
          ],
          quiz: [{ question: 'What is dividend yield?', options: ['Stock price ÷ earnings', 'Annual dividend ÷ stock price', 'Total return ÷ years', 'Market cap ÷ revenue'], correctIndex: 1 }],
        },
        {
          id: 'b8', title: 'Market Orders vs. Limit Orders', xpReward: 10,
          screens: [
            'A market order buys or sells immediately at the current price. It\'s fast and simple, but in volatile markets you might get a slightly different price than expected.',
            'A limit order sets the maximum price you\'ll pay (buy) or minimum you\'ll accept (sell). It only executes if the market reaches your price. More control, but might not fill.',
            'For most retail investors, market orders work fine for liquid stocks. Use limit orders for volatile or thinly-traded stocks, or when you want a specific entry point.',
          ],
          quiz: [{ question: 'What happens with a limit buy order at $50 if the stock is at $55?', options: ['It buys immediately at $55', 'It waits until the stock drops to $50', 'It cancels automatically', 'It buys at $52.50'], correctIndex: 1 }],
        },
        {
          id: 'b9', title: 'Reading a Stock Chart', xpReward: 10,
          screens: [
            'Stock charts show price movement over time. The most common types are line charts (simple) and candlestick charts (show open, high, low, close for each period).',
            'Volume bars at the bottom show how many shares traded. High volume on a price move means stronger conviction. Low volume moves are less reliable.',
            'Moving averages (50-day, 200-day) smooth out price noise and help identify trends. When the 50-day crosses above the 200-day, it\'s called a "golden cross" — a bullish signal.',
          ],
          quiz: [{ question: 'What does high trading volume on a price increase suggest?', options: ['The move is unreliable', 'Strong buying conviction', 'The stock is overvalued', 'A crash is coming'], correctIndex: 1 }],
        },
        {
          id: 'b10', title: 'Your First Investment Plan', xpReward: 15,
          screens: [
            'Step 1: Define your goals and timeline. Retirement in 30 years? House down payment in 5 years? Your timeline determines your strategy.',
            'Step 2: Start with broad diversification. An S&P 500 index fund gives you exposure to 500 top companies. Add individual stocks as you learn more.',
            'Step 3: Invest regularly (dollar-cost averaging). Putting in the same amount monthly smooths out market volatility. Automate it and don\'t try to time the market.',
          ],
          quiz: [{ question: 'What is dollar-cost averaging?', options: ['Buying only cheap stocks', 'Investing a fixed amount at regular intervals', 'Selling at a loss for tax benefits', 'Buying at the daily low'], correctIndex: 1 }],
        },
      ],
    },
    {
      id: 'signals',
      title: 'Reading FII Signals',
      emoji: '\u{1F4CA}',
      description: 'Master factor-based analysis',
      completedLessonIds: [],
      lessons: [
        {
          id: 's1', title: 'What is the FII Score?', xpReward: 10,
          screens: [
            'The FII Score is a composite rating from 1-10 for every stock, updated daily. It combines 25 individual factors across 6 dimensions to give you one number.',
            'Scores 1-3 suggest caution (SELL signal). Scores 4-6 are neutral (HOLD). Scores 7-10 suggest opportunity (BUY). The higher the score, the stronger the signal.',
            'The score is NOT a prediction — it\'s a data-driven assessment of current conditions. Use it as one input in your decision-making, not the only one.',
          ],
          quiz: [{ question: 'What does an FII Score of 8.5 suggest?', options: ['Guaranteed profit', 'A strong BUY signal', 'Time to sell', 'The stock is overpriced'], correctIndex: 1 }],
        },
        {
          id: 's2', title: 'The 6 Dimensions', xpReward: 10,
          screens: [
            'FII analyzes stocks across 6 dimensions: Supply Chain, Macro/Geopolitical, Technical, Fundamental, Sentiment, and Alternative Data.',
            'Each dimension captures a different angle: Supply Chain looks at vendor relationships, Technical examines price patterns, Fundamental checks financial health, and so on.',
            'Not all dimensions carry equal weight. The system adjusts based on what\'s most relevant for each stock. A pharma company weighs FDA data more heavily than a tech company.',
          ],
          quiz: [{ question: 'How many dimensions does FII use?', options: ['3', '4', '6', '10'], correctIndex: 2 }],
        },
        {
          id: 's3', title: 'Supply Chain Analysis', xpReward: 10,
          screens: [
            'FII is unique because it analyzes supply chains. It reads SEC 10-K filings to map a company\'s key suppliers, customers, and dependencies.',
            'A company with a concentrated supply chain (few suppliers) is more vulnerable to disruption. FII flags this risk in the Supply Chain dimension score.',
            'Example: If 60% of a company\'s chips come from one supplier, and that supplier faces a factory fire, the stock could drop 10-20%. FII catches this vulnerability.',
          ],
          quiz: [{ question: 'Where does FII get supply chain data?', options: ['Social media', 'SEC 10-K filings', 'Company websites', 'News headlines'], correctIndex: 1 }],
        },
        {
          id: 's4', title: 'BUY, HOLD, SELL Explained', xpReward: 10,
          screens: [
            'BUY signals mean the data is favorable across multiple dimensions. The stock has strong fundamentals, positive momentum, and manageable risk.',
            'HOLD means conditions are mixed — no strong reason to buy or sell. Stay the course if you already own it, and monitor for changes.',
            'SELL signals indicate deteriorating conditions: weakening fundamentals, negative technical momentum, or elevated risk. Consider reducing your position.',
          ],
          quiz: [{ question: 'What should you do if you own a stock with a HOLD signal?', options: ['Sell immediately', 'Buy more aggressively', 'Stay the course and monitor', 'Ignore FII completely'], correctIndex: 2 }],
        },
        {
          id: 's5', title: 'Confidence Levels', xpReward: 10,
          screens: [
            'Each signal comes with a confidence level: LOW, MEDIUM, or HIGH. This tells you how much data supports the conclusion.',
            'HIGH confidence means multiple dimensions agree, with strong, recent data. LOW confidence means limited or conflicting data — proceed with more caution.',
            'A BUY with HIGH confidence is more actionable than a BUY with LOW confidence. Always consider confidence alongside the signal itself.',
          ],
          quiz: [{ question: 'A BUY signal with LOW confidence means:', options: ['Guaranteed profit', 'Some positive indicators but limited data support', 'You should sell', 'The analysis is wrong'], correctIndex: 1 }],
        },
        {
          id: 's6', title: 'Signal Changes & Alerts', xpReward: 10,
          screens: [
            'When a stock\'s signal changes (e.g., HOLD → BUY or BUY → SELL), it means something significant shifted in the underlying data.',
            'Signal changes often correspond to earnings reports, macro events, or technical breakouts/breakdowns. Check the "reasoning" to understand why.',
            'FII sends alerts for signal changes in your portfolio and watchlist. These are moments to review your positions, not necessarily to act immediately.',
          ],
          quiz: [{ question: 'A signal change from BUY to SELL means:', options: ['You must sell now', 'Underlying data has deteriorated — review your position', 'The stock will crash', 'FII made a mistake'], correctIndex: 1 }],
        },
        {
          id: 's7', title: 'Using Signals Responsibly', xpReward: 10,
          screens: [
            'FII signals are educational tools, not financial advice. Always do your own research and consider your personal situation before making trades.',
            'No system is right 100% of the time. FII\'s historical hit rate is strong, but individual signals can be wrong. Use position sizing to manage risk.',
            'The best approach: use FII as a starting point for research, not as an auto-trading bot. Combine data-driven insights with your own judgment.',
          ],
          quiz: [{ question: 'How should you use FII signals?', options: ['Auto-trade every signal', 'As one input combined with your own research', 'Ignore them entirely', 'Only follow BUY signals'], correctIndex: 1 }],
        },
        {
          id: 's8', title: 'Comparing Signals Across Stocks', xpReward: 15,
          screens: [
            'When comparing stocks, look beyond the headline signal. A BUY with score 9.2 is stronger than a BUY with score 7.1.',
            'Compare stocks within the same sector for the most meaningful comparison. A score of 7 in tech might mean something different than 7 in utilities.',
            'Use the Screener tab to filter and sort stocks by signal, score, sector, and other criteria. This helps you find the strongest opportunities efficiently.',
          ],
          quiz: [{ question: 'When comparing two BUY signals, what else matters?', options: ['Only the stock price', 'The composite score and confidence level', 'The company logo', 'Nothing — all BUYs are equal'], correctIndex: 1 }],
        },
      ],
    },
    {
      id: 'advanced',
      title: 'Advanced Strategies',
      emoji: '\u{1F3AF}',
      description: 'Level up your portfolio',
      completedLessonIds: [],
      lessons: [
        {
          id: 'a1', title: 'Portfolio Diversification', xpReward: 10,
          screens: [
            'True diversification goes beyond owning many stocks. You need exposure across sectors, market caps, and even geographies to reduce correlated risk.',
            'The goal isn\'t to eliminate risk — it\'s to eliminate unnecessary risk. A portfolio of 30 tech stocks isn\'t diversified, even though it has 30 holdings.',
            'FII\'s Portfolio X-Ray analyzes your actual diversification: sector exposure, correlation between holdings, and concentration risk. Use it to find gaps.',
          ],
          quiz: [{ question: 'Is a portfolio of 30 tech stocks well diversified?', options: ['Yes, 30 stocks is plenty', 'No, sector concentration creates correlated risk', 'It depends on the stock prices', 'Yes, if they\'re all BUY signals'], correctIndex: 1 }],
        },
        {
          id: 'a2', title: 'Tax-Loss Harvesting', xpReward: 10,
          screens: [
            'Tax-loss harvesting means selling investments at a loss to offset capital gains taxes. You save money on taxes while keeping a similar portfolio.',
            'The key rule: after selling, buy a "similar but not identical" stock to maintain market exposure. This avoids the IRS wash sale rule (30-day window).',
            'FII\'s Tax Playbook automatically identifies harvesting opportunities in your portfolio and suggests replacement stocks. It estimates your actual tax savings.',
          ],
          quiz: [{ question: 'What is the wash sale rule?', options: ['You must wash your hands before trading', 'You can\'t rebuy the same stock within 30 days of a tax-loss sale', 'You must sell within 30 days of buying', 'It\'s a type of trading strategy'], correctIndex: 1 }],
        },
        {
          id: 'a3', title: 'Understanding Macro Factors', xpReward: 10,
          screens: [
            'Macro factors are big-picture economic forces: interest rates, inflation, GDP growth, and employment. They affect the entire market, not just individual stocks.',
            'When the Fed raises interest rates, growth stocks typically suffer more than value stocks. Higher rates increase borrowing costs and reduce the present value of future earnings.',
            'FII\'s Macro dimension tracks Fed funds rate, CPI, Treasury yields, and other indicators. It helps you understand how the economic environment affects your stocks.',
          ],
          quiz: [{ question: 'How do rising interest rates typically affect growth stocks?', options: ['They help them grow faster', 'They negatively impact them more than value stocks', 'They have no effect', 'They guarantee a crash'], correctIndex: 1 }],
        },
        {
          id: 'a4', title: 'Correlation Analysis', xpReward: 10,
          screens: [
            'Correlation measures how much two stocks move together. A correlation of 1.0 means they move identically; -1.0 means they move in opposite directions; 0 means no relationship.',
            'If your top 5 holdings are all highly correlated (>0.8), a single event could hit them all simultaneously. True diversification means owning uncorrelated assets.',
            'Gold, bonds, and certain defensive sectors often have low or negative correlation with tech stocks. Adding them can reduce portfolio volatility without sacrificing much return.',
          ],
          quiz: [{ question: 'What correlation value indicates stocks move in opposite directions?', options: ['1.0', '0.5', '0', '-1.0'], correctIndex: 3 }],
        },
        {
          id: 'a5', title: 'When to Rebalance', xpReward: 10,
          screens: [
            'Rebalancing means adjusting your portfolio back to target weights when market moves cause drift. If NVDA doubles and becomes 40% of your portfolio, it\'s time to trim.',
            'Common approaches: calendar-based (quarterly), threshold-based (when any position drifts 5%+ from target), or signal-based (when FII signals change).',
            'FII\'s Rebalancing tool compares your current weights to optimal allocation and suggests specific buy/sell amounts. It factors in tax implications too.',
          ],
          quiz: [{ question: 'When should you consider rebalancing?', options: ['Every day', 'When positions drift significantly from target weights', 'Never — let winners run forever', 'Only when the market crashes'], correctIndex: 1 }],
        },
        {
          id: 'a6', title: 'How to Think About Risk', xpReward: 10,
          screens: [
            'Risk isn\'t just "will my portfolio go down." It includes: concentration risk, liquidity risk, market risk, sector risk, and behavioral risk (your own emotions).',
            'Beta measures a stock\'s volatility relative to the market. Beta > 1 means more volatile (NVDA ≈ 1.7), Beta < 1 means less volatile (JNJ ≈ 0.5).',
            'The biggest risk for most investors is behavioral: panic selling during downturns. FII\'s Discipline Score tracks this and helps you build better habits.',
          ],
          quiz: [{ question: 'A stock with a beta of 1.5 means:', options: ['It\'s 50% more volatile than the market', 'It\'s guaranteed to rise', 'It\'s 50% less volatile', 'It pays a 1.5% dividend'], correctIndex: 0 }],
        },
        {
          id: 'a7', title: 'Earnings Season Strategy', xpReward: 10,
          screens: [
            'Earnings season happens 4x per year when companies report financial results. Stock prices can swing 5-20% on earnings surprises.',
            'Before earnings: review FII signals, check analyst estimates, and decide if you want to hold through the volatility. Consider position sizing.',
            'FII\'s Earnings Calendar shows upcoming dates, analyst estimates, and historical beat/miss streaks. Use this to prepare — not to gamble on outcomes.',
          ],
          quiz: [{ question: 'How often does earnings season occur?', options: ['Monthly', 'Quarterly (4x per year)', 'Annually', 'Randomly'], correctIndex: 1 }],
        },
        {
          id: 'a8', title: 'Monte Carlo Simulation', xpReward: 10,
          screens: [
            'Monte Carlo simulation runs thousands of possible future scenarios for your portfolio, using historical returns and volatility as inputs.',
            'It gives you a range of outcomes: best case (95th percentile), likely case (median), and worst case (5th percentile) at your chosen time horizon.',
            'FII\'s Wealth Simulator runs 10,000 Monte Carlo simulations on your actual portfolio. It tells you the probability of hitting your financial goals.',
          ],
          quiz: [{ question: 'What does a Monte Carlo simulation show?', options: ['A guaranteed outcome', 'A range of possible outcomes based on historical data', 'Tomorrow\'s stock price', 'Which stock to buy next'], correctIndex: 1 }],
        },
        {
          id: 'a9', title: 'Position Sizing', xpReward: 10,
          screens: [
            'Position sizing determines how much of your portfolio to put in each stock. Too concentrated = excessive risk. Too spread out = diluted returns.',
            'A common rule: no single stock should exceed 10% of your portfolio. The top 5 positions shouldn\'t exceed 40%. These limits protect against company-specific risk.',
            'FII\'s optimizer suggests ideal weights based on your risk profile and the current signals. But remember: even the best stock can have a bad quarter.',
          ],
          quiz: [{ question: 'Why is position sizing important?', options: ['To maximize tax losses', 'To limit exposure to any single stock\'s risk', 'To trade more frequently', 'It\'s not important'], correctIndex: 1 }],
        },
        {
          id: 'a10', title: 'Building Your Strategy', xpReward: 15,
          screens: [
            'A complete investment strategy includes: asset allocation, stock selection criteria, entry/exit rules, position sizing, and rebalancing frequency.',
            'FII gives you tools for each part: Signals (selection), Portfolio X-Ray (allocation), Rebalancing (adjustments), and Tax Playbook (tax efficiency).',
            'The best strategy is one you can follow consistently. Start simple, use FII\'s data-driven insights, and refine your approach as you learn. Discipline beats brilliance.',
          ],
          quiz: [{ question: 'What matters more in long-term investing?', options: ['Picking the hottest stock', 'Timing the market perfectly', 'Consistent discipline and strategy', 'Trading frequently'], correctIndex: 2 }],
        },
      ],
    },
  ],
  totalXP: 0,
  updatedAt: new Date().toISOString(),
};

export const useCoachStore = create<CoachStore>((set, get) => ({
  daily: null,
  isDailyLoading: false,
  dailyDismissed: false,

  score: null,
  isScoreLoading: false,

  achievements: null,
  isAchievementsLoading: false,

  weekly: null,
  isWeeklyLoading: false,

  learningPaths: null,
  isLearningPathsLoading: false,
  completedLessons: new Set<string>(),

  chatMessages: [],
  isChatLoading: false,

  hasLoaded: false,

  loadDaily: async () => {
    set({ isDailyLoading: true });
    try {
      const data = await getCoachDaily();
      set({ daily: data ?? null, isDailyLoading: false });
    } catch (error) {
      console.error('[CoachStore] loadDaily failed:', error);
      set({ isDailyLoading: false });
    }
  },

  loadScore: async () => {
    set({ isScoreLoading: true });
    try {
      const data = await getCoachScore();
      set({ score: data ?? null, isScoreLoading: false });
    } catch (error) {
      console.error('[CoachStore] loadScore failed:', error);
      set({ isScoreLoading: false });
    }
  },

  loadAchievements: async () => {
    set({ isAchievementsLoading: true });
    try {
      const data = await getCoachAchievements();
      set({ achievements: data ?? null, isAchievementsLoading: false });
    } catch (error) {
      console.error('[CoachStore] loadAchievements failed:', error);
      set({ isAchievementsLoading: false });
    }
  },

  loadWeekly: async () => {
    set({ isWeeklyLoading: true });
    try {
      const data = await getCoachWeekly();
      set({ weekly: data ?? null, isWeeklyLoading: false });
    } catch (error) {
      console.error('[CoachStore] loadWeekly failed:', error);
      set({ isWeeklyLoading: false });
    }
  },

  dismissDaily: () => {
    set({ dailyDismissed: true });
    get().logEvent('briefing_read');
  },

  logEvent: async (event, amount) => {
    try {
      await postCoachEvent(event, amount);
      get().loadScore();
      get().loadAchievements();
    } catch (error) {
      console.error('[CoachStore] logEvent failed:', error);
    }
  },

  loadAll: async () => {
    const { loadDaily, loadScore, loadAchievements, loadLearningPaths, loadChatHistory } = get();
    await Promise.all([loadDaily(), loadScore(), loadAchievements(), loadLearningPaths(), loadChatHistory()]);
    set({ hasLoaded: true });
  },

  // Learning Paths
  loadLearningPaths: async () => {
    set({ isLearningPathsLoading: true });
    try {
      // Load completed lessons from local storage
      const savedLessons = await AsyncStorage.getItem(LESSONS_STORAGE_KEY);
      const completedSet = savedLessons ? new Set<string>(JSON.parse(savedLessons)) : new Set<string>();

      // Use default learning paths, with completed lessons applied
      const paths = { ...DEFAULT_LEARNING_PATHS };
      paths.paths = paths.paths.map(path => ({
        ...path,
        completedLessonIds: path.lessons
          .filter(l => completedSet.has(l.id))
          .map(l => l.id),
      }));

      // Calculate total XP
      let totalXP = 0;
      for (const path of paths.paths) {
        for (const lesson of path.lessons) {
          if (completedSet.has(lesson.id)) {
            totalXP += lesson.xpReward;
          }
        }
      }
      paths.totalXP = totalXP;

      set({ learningPaths: paths, completedLessons: completedSet, isLearningPathsLoading: false });
    } catch (error) {
      console.error('[CoachStore] loadLearningPaths failed:', error);
      set({ learningPaths: DEFAULT_LEARNING_PATHS, isLearningPathsLoading: false });
    }
  },

  completeLesson: (lessonId: string) => {
    const { completedLessons, learningPaths } = get();
    if (completedLessons.has(lessonId)) return;

    const newCompleted = new Set(completedLessons);
    newCompleted.add(lessonId);

    // Save to storage
    AsyncStorage.setItem(LESSONS_STORAGE_KEY, JSON.stringify([...newCompleted])).catch(() => {});

    // Update paths
    if (learningPaths) {
      const updatedPaths = { ...learningPaths };
      updatedPaths.paths = updatedPaths.paths.map(path => ({
        ...path,
        completedLessonIds: path.lessons
          .filter(l => newCompleted.has(l.id))
          .map(l => l.id),
      }));

      let totalXP = 0;
      for (const path of updatedPaths.paths) {
        for (const lesson of path.lessons) {
          if (newCompleted.has(lesson.id)) {
            totalXP += lesson.xpReward;
          }
        }
      }
      updatedPaths.totalXP = totalXP;

      set({ completedLessons: newCompleted, learningPaths: updatedPaths });
    } else {
      set({ completedLessons: newCompleted });
    }

    // Log event for XP/achievement tracking
    get().logEvent('lesson_completed');
  },

  // Coach Chat
  loadChatHistory: async () => {
    try {
      const saved = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const messages: ChatMsg[] = JSON.parse(saved);
        set({ chatMessages: messages.slice(-20) }); // Keep last 20
      }
    } catch (error) {
      console.error('[CoachStore] loadChatHistory failed:', error);
    }
  },

  addChatMessage: (msg: ChatMsg) => {
    const { chatMessages } = get();
    const updated = [...chatMessages, msg].slice(-20);
    set({ chatMessages: updated });
    AsyncStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },

  setChatLoading: (loading: boolean) => {
    set({ isChatLoading: loading });
  },
}));
