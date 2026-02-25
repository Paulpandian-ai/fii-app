# FII App — Codebase Map

> Factor-based Investment Intelligence — a React Native / AWS Serverless stock analysis platform.
> Auto-generated codebase scan. Last updated: 2026-02-25.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Data Flow](#2-data-flow)
3. [Screen Components](#3-screen-components)
4. [State Management](#4-state-management)
5. [API Integration](#5-api-integration)
6. [DynamoDB Schema](#6-dynamodb-schema)
7. [Navigation Structure](#7-navigation-structure)

---

## 1. Project Structure

```
fii-app/
├── app/                              # React Native (Expo) frontend
│   ├── App.tsx                       # Root: Tab + Stack navigators, staggered startup
│   ├── index.ts                      # Expo entry point
│   ├── app.json                      # Expo config (name, slug, version, splash)
│   ├── tsconfig.json                 # TypeScript config
│   ├── package.json                  # Dependencies (expo, react-navigation, zustand, axios)
│   └── src/
│       ├── components/               # 48 reusable UI components
│       │   ├── FeedCard.tsx           # TikTok-style signal card (2x3 metrics, 52W bar, dimensions)
│       │   ├── ScoreRing.tsx          # Animated circular score dial (1-10)
│       │   ├── SignalBadge.tsx        # BUY/HOLD/SELL badge
│       │   ├── SwipeHint.tsx          # Swipe gesture indicator
│       │   ├── FactorBar.tsx          # Horizontal factor score bar
│       │   ├── RadarScore.tsx         # 5-dimension radar chart
│       │   ├── StockChart.tsx         # Interactive candlestick/line chart
│       │   ├── SearchOverlay.tsx      # Ticker search modal
│       │   ├── StockMiniCard.tsx      # Compact stock info card
│       │   ├── StockDiscovery.tsx     # Tinder-style stock discovery
│       │   ├── BasketCarousel.tsx     # Horizontal basket carousel
│       │   ├── WatchlistTabs.tsx      # Watchlist tab switcher
│       │   ├── AddHoldingSheet.tsx    # Bottom sheet: manual holding entry
│       │   ├── CSVUploadSheet.tsx     # Bottom sheet: CSV portfolio import
│       │   ├── PortfolioHealthGauge.tsx  # Portfolio health 0-100 gauge
│       │   ├── PortfolioXRay.tsx      # Sector/geographic diversification
│       │   ├── BestPortfolio.tsx      # Optimized allocation display
│       │   ├── BuildPortfolio.tsx     # Portfolio builder wizard
│       │   ├── RebalancingMoves.tsx   # Buy/sell rebalance suggestions
│       │   ├── RiskRewardMap.tsx      # Risk vs. reward scatter plot
│       │   ├── ScenarioBattles.tsx    # What-if stress test cards
│       │   ├── TimeMachine.tsx        # Monte Carlo projection fan chart
│       │   ├── WealthSimulatorHero.tsx  # Simulator summary hero section
│       │   ├── StrategyDashboard.tsx  # Strategy overview grid
│       │   ├── SectorHeatmap.tsx      # Sector performance heatmap
│       │   ├── MarketContextCards.tsx # Market context (VIX, yields, etc.)
│       │   ├── TrendingSection.tsx    # Trending stocks section
│       │   ├── DailyBriefing.tsx      # Coach: daily greeting + summary
│       │   ├── DisciplineScore.tsx    # Coach: behavioral score + level
│       │   ├── AchievementBadges.tsx  # Coach: earned badges display
│       │   ├── WeeklyRecap.tsx        # Coach: weekly performance recap
│       │   ├── ConvictionCheck.tsx    # Coach: sell conviction prompt
│       │   ├── DiversificationCoach.tsx  # Coach: diversification advice
│       │   ├── VolatilityAlert.tsx    # Coach: panic-prevention alert
│       │   ├── TaxDoctor.tsx          # Tax-loss harvesting suggestions
│       │   ├── ChatBubble.tsx         # AI chat message bubble
│       │   ├── ShareResults.tsx       # Share portfolio results
│       │   ├── TradeButton.tsx        # Affiliate broker trade CTA
│       │   ├── ProGate.tsx            # Premium feature gate/upsell
│       │   ├── DisclaimerBanner.tsx   # Legal disclaimer banner
│       │   ├── ErrorBoundary.tsx      # React error boundary wrapper
│       │   ├── ErrorState.tsx         # Error state placeholder
│       │   └── Skeleton.tsx           # Loading skeleton placeholder
│       │
│       ├── screens/                   # 25 screen components
│       │   ├── FeedScreen.tsx         # Tab 1: Vertical swipeable signal feed
│       │   ├── PortfolioScreen.tsx    # Tab 2: Holdings management
│       │   ├── ScreenerScreen.tsx     # Tab 3: Multi-filter stock screener
│       │   ├── StrategyScreen.tsx     # Tab 4: Portfolio optimization hub
│       │   ├── CoachScreen.tsx        # Tab 5: Behavioral coaching
│       │   ├── SignalDetailScreen.tsx  # Full stock analysis (factors, chart, events)
│       │   ├── FinancialHealthScreen.tsx  # Fundamentals deep-dive (Z/F/M scores)
│       │   ├── AlternativeDataScreen.tsx  # Patents, contracts, FDA data
│       │   ├── WealthSimulatorScreen.tsx  # Monte Carlo, optimization, rebalancing
│       │   ├── TaxStrategyScreen.tsx  # Tax-loss harvesting
│       │   ├── PortfolioXRayScreen.tsx  # Diversification analysis
│       │   ├── AIAdvisorScreen.tsx    # AI-generated prescriptions
│       │   ├── AIChatScreen.tsx       # Conversational AI chat
│       │   ├── BacktestScreen.tsx     # Historical signal backtesting
│       │   ├── EventTimelineScreen.tsx  # News/events for a ticker
│       │   ├── EarningsCalendarScreen.tsx  # Upcoming earnings dates
│       │   ├── MarketDashboardScreen.tsx  # Gainers/losers/movers
│       │   ├── BasketListScreen.tsx   # Pre-made stock baskets
│       │   ├── TrackRecordScreen.tsx  # Signal accuracy & hit rate
│       │   ├── DiscussionScreen.tsx   # Community discussion board
│       │   ├── LeaderboardScreen.tsx  # User rankings
│       │   ├── ProfileScreen.tsx      # User public profile
│       │   ├── OnboardingScreen.tsx   # New user onboarding flow
│       │   ├── SettingsScreen.tsx     # User preferences & agent triggers
│       │   ├── PaywallScreen.tsx      # Pro/Premium upgrade screen
│       │   ├── PrivacyPolicyScreen.tsx  # Legal: privacy policy
│       │   └── TermsOfServiceScreen.tsx  # Legal: terms of service
│       │
│       ├── store/                     # 9 Zustand stores (global state)
│       │   ├── authStore.ts           # Authentication (user, token, isAuthenticated)
│       │   ├── feedStore.ts           # Feed items, current index, loading
│       │   ├── portfolioStore.ts      # Holdings, P&L, daily change
│       │   ├── signalStore.ts         # Signal cache (analyses + lightweight summaries)
│       │   ├── eventStore.ts          # Events, alerts, live banner, preferences
│       │   ├── watchlistStore.ts      # Watchlists CRUD, active watchlist
│       │   ├── strategyStore.ts       # Optimization, projection, scenarios, tax
│       │   ├── coachStore.ts          # Daily briefing, discipline score, badges
│       │   └── subscriptionStore.ts   # Tier (free/pro/premium), usage limits
│       │
│       ├── services/
│       │   ├── api.ts                 # Axios instance, 60+ endpoint functions, retry interceptor
│       │   └── auth.ts               # Cognito auth helper (getCurrentSession)
│       │
│       ├── hooks/
│       │   ├── useCountUp.ts          # Animated counter hook
│       │   └── useOfflineCache.ts     # AsyncStorage offline cache hook
│       │
│       └── types/
│           └── index.ts               # All TypeScript interfaces (FeedItem, PriceData, etc.)
│
├── backend/                           # AWS SAM serverless backend
│   ├── template.yaml                  # SAM template (12 Lambda functions, DynamoDB, S3, Cognito)
│   │
│   ├── functions/
│   │   ├── api_handler/               # Main REST API (50+ routes)
│   │   │   ├── handler.py             # Lambda router (~5000+ lines, all _handle_* functions)
│   │   │   ├── factor_engine.py       # 25 sub-factors across 6 dimensions
│   │   │   ├── fundamentals_engine.py # Z-Score, F-Score, M-Score, DCF, Finnhub fallback
│   │   │   ├── technical_engine.py    # 15 indicators from OHLCV (local copy)
│   │   │   ├── patent_engine.py       # USPTO PatentsView API integration
│   │   │   ├── contract_engine.py     # USASpending.gov API integration
│   │   │   ├── fda_engine.py          # FDA OpenData + ClinicalTrials.gov
│   │   │   ├── event_engine.py        # Company news, SEC filings, macro events
│   │   │   ├── stress_engine.py       # Macro stress scenario modeling
│   │   │   ├── social.py              # Community: discussion, profiles, leaderboard
│   │   │   ├── track_record.py        # Signal accuracy tracking
│   │   │   └── finnhub_client.py      # Finnhub API wrapper (local copy)
│   │   │
│   │   ├── signal_engine/             # Scheduled: 6-factor AI signal generation
│   │   │   └── handler.py             # Fan-out per stock, Claude scoring, S3 storage
│   │   │
│   │   ├── feed_compiler/             # Scheduled: compile daily feed
│   │   │   └── handler.py             # Batch-read signals → sorted feed → S3
│   │   │
│   │   ├── data_refresh/              # Scheduled: price & technical refresh
│   │   │   └── handler.py             # Finnhub bulk refresh (30-min intervals)
│   │   │
│   │   ├── event_handler/             # Event timeline & notifications
│   │   │   ├── handler.py             # Routes: /events/*, /alerts, /notifications/*
│   │   │   └── event_engine.py        # News, SEC filing, macro monitors
│   │   │
│   │   ├── ai_agent/                  # Scheduled: AI observe-reason-act loop
│   │   │   ├── handler.py             # Detect changes → Claude analysis → store insights
│   │   │   ├── claude_client.py       # Claude AI client (local copy)
│   │   │   ├── db.py                  # DynamoDB helper (local copy)
│   │   │   └── models.py             # Models (local copy)
│   │   │
│   │   ├── strategy_engine/           # Portfolio optimization
│   │   │   └── handler.py             # Sharpe optimization, Monte Carlo, tax harvesting
│   │   │
│   │   ├── social_handler/            # Community & subscriptions
│   │   │   ├── handler.py             # Routes: /discuss/*, /profile/*, /chat, /subscription/*
│   │   │   ├── social.py              # Discussion CRUD, profiles, leaderboard
│   │   │   ├── track_record.py        # Signal performance tracking
│   │   │   ├── affiliates.py          # Broker affiliate links
│   │   │   └── subscription.py        # RevenueCat subscription management
│   │   │
│   │   └── scheduler/                 # Cron orchestrator
│   │       └── handler.py             # Invokes other Lambdas on schedule
│   │
│   ├── shared/                        # Shared Python modules (source of truth)
│   │   ├── __init__.py
│   │   ├── db.py                      # DynamoDB CRUD operations
│   │   ├── s3.py                      # S3 JSON read/write
│   │   ├── models.py                  # STOCK_UNIVERSE (523 securities), tier system, scoring
│   │   ├── finnhub_client.py          # Finnhub API: quote, candles, profile, financials
│   │   ├── claude_client.py           # Claude AI: factor scoring, reasoning, alternatives
│   │   ├── technical_engine.py        # 15 technical indicators (graceful degradation >=5 candles)
│   │   ├── sec_edgar.py               # SEC EDGAR 10-K supply chain extraction
│   │   ├── market_data.py             # FRED macro data, correlation matrix
│   │   ├── portfolio_optimizer.py     # Sharpe optimization, Monte Carlo simulation
│   │   └── stress_engine.py           # Macro stress test scenarios
│   │
│   ├── shared_layer/                  # Lambda layer (deployed copy of shared/)
│   │   ├── build.py                   # Layer build script
│   │   ├── Makefile                   # Layer packaging
│   │   ├── requirements.txt           # Python deps (anthropic, numpy, pandas, etc.)
│   │   └── *.py                       # Mirror of shared/*.py
│   │
│   ├── scripts/
│   │   └── seed_signals.py            # Dev script: seed initial signal data
│   │
│   └── data/
│       └── us_top_500.json            # S&P 500 stock metadata
```

---

## 2. Data Flow

### 2.1 Signal Generation Pipeline (Scheduled: Daily 6 AM ET)

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│  Scheduler   │───→│ SignalEngine  │───→│  Claude AI API   │───→│  DynamoDB    │
│  (cron)      │    │  (fan-out)   │    │  (factor scoring)│    │  SIGNAL#     │
└─────────────┘    └──────┬───────┘    └─────────────────┘    └──────┬───────┘
                          │                                          │
                    ┌─────┴──────┐                            ┌─────┴──────┐
                    │  Finnhub   │                            │  S3 Bucket │
                    │  (market)  │                            │  signals/  │
                    ├────────────┤                            └────────────┘
                    │  SEC EDGAR │
                    │  (10-K)    │
                    ├────────────┤
                    │  FRED      │
                    │  (macro)   │
                    └────────────┘
```

**Tier-based analysis depth:**
| Tier | Stocks | Analysis |
|------|--------|----------|
| TIER_1 | Top 50 (NVDA, AAPL, MSFT...) | Full Claude AI + all engines |
| TIER_2 | Stocks 51-200 | Technical + Fundamental only |
| TIER_3 | Stocks 201+ | Technical only |
| ETF | 20 major ETFs | Technical with isETF flag |

### 2.2 Feed Compilation (Scheduled: Daily 6:30 AM ET)

```
DynamoDB (all SIGNAL#)  ──→  FeedCompiler  ──→  S3 feed/default.json
                              │
                              ├── Sort by tier, confidence, score extremity
                              ├── Interleave educational cards
                              └── Write compiled JSON to S3
```

### 2.3 Real-time Data Refresh (Every 30 min during market hours)

```
DataRefresh Lambda  ──→  Finnhub (quotes + candles)  ──→  DynamoDB
                                                          ├── PRICE#{ticker} / LATEST
                                                          └── TECHNICALS#{ticker} / LATEST
```

### 2.4 AI Agent Loop (Hourly + Market Close)

```
AIAgent Lambda  ──→  Observe: detect changes (price moves, signal shifts, technicals)
                ──→  Reason:  Claude analyzes (Haiku for low, Sonnet for high significance)
                ──→  Act:     Store INSIGHT#{ticker}, INSIGHT_FEED, ALERTS
```

### 2.5 Event Monitoring (Every 5-15 min during market hours)

```
NewsMonitor (15min)     ──→ Finnhub news    ──→ EVENT#{ticker} / timestamp
SecFilingMonitor (5min) ──→ SEC EDGAR RSS   ──→ EVENT#{ticker} / timestamp
MacroMonitor (15min)    ──→ FRED releases   ──→ EVENT#MACRO / timestamp
```

### 2.6 App Data Flow (User Request)

```
React Native App                     API Gateway              Lambda
┌──────────────┐                    ┌───────────┐           ┌──────────┐
│  FeedScreen  │──getFeed()────────→│  /feed    │──────────→│ handler  │
│              │←─FeedItem[]────────│           │←──────────│          │
└──────────────┘                    └───────────┘           └────┬─────┘
                                                                 │
│  FeedCard    │──Promise.allSettled(6 calls)──→                 │
│              │  ├── getPrice()         → /price/{ticker}       │
│              │  ├── getSignalDetail()  → /signals/{ticker}     │
│              │  ├── getTechnicals()    → /technicals/{ticker}  ├──→ DynamoDB
│              │  ├── getFundamentals()  → /fundamentals/{ticker}├──→ Finnhub
│              │  ├── getFactors()       → /factors/{ticker}     ├──→ SEC EDGAR
│              │  └── getInsights()      → /insights/{ticker}    ├──→ Claude AI
│              │←─parallel responses─────────────────────────────┘
└──────────────┘
      │
      ├── Merge & dedupe via fallback chains (sig ?? tech ?? fund ?? price)
      ├── Filter error responses (_ok helper)
      └── Render: metrics grid, 52W bar, dimension bars, factor pills
```

---

## 3. Screen Components

### 3.1 Tab Screens (Bottom Navigation)

| Tab | Screen | File | Purpose |
|-----|--------|------|---------|
| Feed | `FeedScreen` | `screens/FeedScreen.tsx` | Vertical swipeable signal cards, live event banner |
| Portfolio | `PortfolioScreen` | `screens/PortfolioScreen.tsx` | Holdings, P&L, add/import, baskets, watchlists |
| Screener | `ScreenerScreen` | `screens/ScreenerScreen.tsx` | Multi-filter stock discovery, templates |
| Strategy | `StrategyScreen` | `screens/StrategyScreen.tsx` | Optimization hub: simulator, tax, X-ray, advice |
| Coach | `CoachScreen` | `screens/CoachScreen.tsx` | Daily briefing, discipline score, badges, weekly recap |

### 3.2 Stack Screens (Modal & Detail)

| Screen | File | Params | Purpose |
|--------|------|--------|---------|
| `SignalDetail` | `SignalDetailScreen.tsx` | `{ticker, feedItemId}` | Full analysis: factors, chart, events, stress test |
| `FinancialHealth` | `FinancialHealthScreen.tsx` | `{ticker}` | Z-Score, F-Score, M-Score, DCF deep-dive |
| `AlternativeData` | `AlternativeDataScreen.tsx` | `{ticker}` | Patents, contracts, FDA pipeline |
| `WealthSimulator` | `WealthSimulatorScreen.tsx` | — | Monte Carlo, optimization, rebalancing |
| `TaxStrategy` | `TaxStrategyScreen.tsx` | — | Tax-loss harvesting opportunities |
| `PortfolioXRay` | `PortfolioXRayScreen.tsx` | — | Sector, geographic, correlation analysis |
| `AIAdvisor` | `AIAdvisorScreen.tsx` | — | AI prescriptions & advice |
| `AIChat` | `AIChatScreen.tsx` | `{ticker?}` | Conversational AI assistant |
| `Backtest` | `BacktestScreen.tsx` | — | Historical signal backtesting |
| `EventTimeline` | `EventTimelineScreen.tsx` | `{ticker}` | News, filings, macro events for ticker |
| `EarningsCalendar` | `EarningsCalendarScreen.tsx` | — | Upcoming earnings dates (30-day) |
| `MarketDashboard` | `MarketDashboardScreen.tsx` | — | Gainers, losers, most active, AI upgrades |
| `BasketList` | `BasketListScreen.tsx` | — | Pre-made stock baskets |
| `TrackRecord` | `TrackRecordScreen.tsx` | — | Signal accuracy & hit rate metrics |
| `Discussion` | `DiscussionScreen.tsx` | `{ticker}` | Community posts (bull/bear sentiment) |
| `Leaderboard` | `LeaderboardScreen.tsx` | — | User rankings by discipline score |
| `ProfileScreen` | `ProfileScreen.tsx` | — | User public profile |
| `Settings` | `SettingsScreen.tsx` | — | Preferences, agent triggers, theme |
| `Paywall` | `PaywallScreen.tsx` | `{feature?}` | Pro/Premium upgrade with feature gates |
| `Onboarding` | `OnboardingScreen.tsx` | — | New user onboarding flow |

### 3.3 Screen → Store Dependencies

| Screen | Stores Used |
|--------|-------------|
| FeedScreen | feedStore, portfolioStore, eventStore |
| PortfolioScreen | portfolioStore, watchlistStore |
| ScreenerScreen | (direct API calls) |
| StrategyScreen | portfolioStore, strategyStore |
| CoachScreen | coachStore |
| SignalDetailScreen | signalStore, eventStore |
| WealthSimulatorScreen | portfolioStore, strategyStore |
| PaywallScreen | subscriptionStore |

---

## 4. State Management

**Library:** [Zustand](https://github.com/pmndrs/zustand) — lightweight, hook-based state management.

### 4.1 Store Overview

| Store | File | Key State | Key Actions |
|-------|------|-----------|-------------|
| **authStore** | `authStore.ts` | `user`, `token`, `isAuthenticated` | `setUser()`, `clearAuth()` |
| **feedStore** | `feedStore.ts` | `items: FeedItem[]`, `currentIndex` | `setItems()`, `appendItems()`, `setCurrentIndex()` |
| **portfolioStore** | `portfolioStore.ts` | `holdings[]`, `totalValue`, `totalGainLoss` | `loadPortfolio()`, `addHolding()`, `removeHolding()`, `importHoldings()` |
| **signalStore** | `signalStore.ts` | `analyses: Record<ticker, FullAnalysis>`, `signals: Record<ticker, SignalSummary>` | `setAnalysis()`, `upsertSignals()`, `getSignal()` |
| **eventStore** | `eventStore.ts` | `tickerEvents`, `feedEvents`, `alerts`, `liveBannerEvent` | `loadEventsForTicker()`, `loadEventsFeed()`, `loadAlerts()` |
| **watchlistStore** | `watchlistStore.ts` | `watchlists[]`, `activeWatchlistId` | `loadWatchlists()`, `addTicker()`, `removeTicker()`, `isInAnyWatchlist()` |
| **strategyStore** | `strategyStore.ts` | `optimization`, `projection`, `scenarios`, `moves`, `taxHarvest`, `reportCard` | `runFullSimulation()`, `loadOptimization()`, `loadTaxHarvest()` |
| **coachStore** | `coachStore.ts` | `daily`, `score`, `achievements`, `weekly` | `loadAll()`, `loadDaily()`, `dismissDaily()`, `logEvent()` |
| **subscriptionStore** | `subscriptionStore.ts` | `tier: 'free'\|'pro'\|'premium'`, usage buckets | `loadSubscription()`, `canAccess()`, `requiredTierFor()` |

### 4.2 Signal Caching Pattern

The `signalStore` maintains a lightweight signal cache populated automatically by the `_cacheSignals()` helper in `api.ts`. Any API response containing stock data (feed, screener, baskets, search) auto-populates `signalStore.upsertSignals()` with `{ticker, score, signal}` summaries.

### 4.3 Subscription Feature Gates

| Tier | Features |
|------|----------|
| **Free** | Basic feed, 3 signal views/day, limited screener |
| **Pro** | Charts, alerts, community posting, saved screeners, unlimited signals, advanced coach |
| **Premium** | Wealth simulator, tax harvesting, X-ray, API access, unlimited chat, priority support |

---

## 5. API Integration

### 5.1 Frontend API Client (`app/src/services/api.ts`)

**Base URL:** `process.env.EXPO_PUBLIC_API_URL || 'https://api.fii.app'`
**Timeout:** 30 seconds
**Auth:** Bearer token from Cognito `getCurrentSession()`
**Retry:** 503/429 responses retried 3x with exponential backoff (2s, 4s, 6s)

### 5.2 All API Endpoints

#### Feed & Market

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getFeed(cursor?)` | GET | `/feed` | `FeedItem[]` |
| `getTrending()` | GET | `/trending` | Trending stocks |
| `getDiscoveryCards()` | GET | `/discovery` | Tinder-style discovery cards |
| `getMarketMovers()` | GET | `/market/movers` | Gainers, losers, most active, AI upgrades/downgrades |
| `getEarningsCalendar()` | GET | `/earnings/calendar` | 30-day earnings calendar |

#### Price & Charts

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getPrice(ticker)` | GET | `/price/{ticker}` | `PriceData` (price, change, 52W range, sector) |
| `getTechnicals(ticker)` | GET | `/technicals/{ticker}` | `TechnicalAnalysis` (15 indicators) |
| `getChartData(ticker, res, range)` | GET | `/charts/{ticker}` | OHLCV chart data with overlays |

#### Analysis

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getSignalDetail(ticker)` | GET | `/signals/{ticker}` | `FullAnalysis` (score, signal, factors, reasoning) |
| `getFundamentals(ticker)` | GET | `/fundamentals/{ticker}` | `FundamentalAnalysis` (Z/F/M scores, DCF, ratios) |
| `getFactors(ticker)` | GET | `/factors/{ticker}` | `FactorAnalysis` (25 sub-factors, 6 dimensions) |
| `getAltData(ticker)` | GET | `/altdata/{ticker}` | `AlternativeData` (patents, contracts, FDA) |
| `generateSignal(ticker)` | POST | `/signals/generate/{ticker}` | On-demand signal generation |
| `batchSignals(tickers)` | GET | `/signals/batch` | Batch signal summaries (up to 50) |

#### Screener & Search

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getScreener(params)` | GET | `/screener` | `ScreenerResult[]` (filtered, sorted) |
| `getScreenerTemplates()` | GET | `/screener/templates` | Pre-built filter templates |
| `searchTickers(query)` | GET | `/search` | `SearchResult[]` |

#### Portfolio

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getPortfolio()` | GET | `/portfolio` | Portfolio with live prices |
| `savePortfolio(holdings)` | POST | `/portfolio` | Saved portfolio |
| `parsePortfolioCsv(csv)` | POST | `/portfolio/parse-csv` | Parsed holdings from CSV |
| `getPortfolioSummary()` | GET | `/portfolio/summary` | P&L stats, biggest winner/risk |
| `getPortfolioHealth()` | GET | `/portfolio/health` | Health score (0-100, A-F grade) |

#### Watchlists

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getWatchlists()` | GET | `/watchlist` | All user watchlists |
| `saveWatchlist(wl)` | POST | `/watchlist` | Created/updated watchlist |
| `addToWatchlist(id, ticker, name)` | POST | `/watchlist/add` | Updated watchlist |
| `removeFromWatchlist(id, ticker)` | POST | `/watchlist/remove` | Updated watchlist |
| `deleteWatchlist(name)` | DELETE | `/watchlist/{name}` | Confirmation |

#### Baskets

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getBaskets()` | GET | `/baskets` | All AI-optimized baskets |
| `getBasketDetail(id)` | GET | `/baskets/{id}` | Single basket with stocks |

#### Strategy & Optimization

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `runOptimization(value)` | POST | `/strategy/optimize` | Sharpe-optimized weights |
| `runProjection(years, value)` | POST | `/strategy/project` | Monte Carlo projection (P5-P95) |
| `runScenarios()` | POST | `/strategy/scenarios` | Stress test scenario cards |
| `runRebalance()` | POST | `/strategy/rebalance` | Buy/sell suggestions |
| `runDiversification()` | POST | `/strategy/diversification` | Sector, geographic, correlation |
| `runTaxHarvest(bracket)` | POST | `/strategy/tax-harvest` | Tax-loss opportunities |
| `getCorrelation()` | GET | `/strategy/correlation` | Correlation matrix |
| `getAdvice()` | POST | `/strategy/advice` | AI prescriptions |
| `getReportCard()` | GET | `/strategy/report-card` | Performance report card (A-F) |
| `runBacktest(tickers, period)` | POST | `/strategy/backtest` | Historical backtesting |
| `getAchievements()` | GET | `/strategy/achievements` | Achievement badges |
| `getStressTest(ticker, scenario)` | GET | `/stock/{ticker}/stress-test` | Single stress scenario |
| `getStressTestAll(ticker)` | GET | `/stock/{ticker}/stress-test/all` | All 5 stress scenarios |

#### Coach

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getCoachDaily()` | GET | `/coach/daily` | Daily briefing + stats |
| `getCoachScore()` | GET | `/coach/score` | Discipline score + level |
| `getCoachAchievements()` | GET | `/coach/achievements` | Earned badges |
| `getCoachWeekly()` | GET | `/coach/weekly` | Weekly recap |
| `postCoachEvent(event, amt)` | POST | `/coach/event` | Event logged |

#### Insights & Events

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getInsightsFeed(limit)` | GET | `/insights/feed` | AI-generated insight feed |
| `getInsightsAlerts(limit)` | GET | `/insights/alerts` | High-urgency alerts |
| `getInsightsForTicker(ticker, limit)` | GET | `/insights/{ticker}` | Ticker-specific insights |
| `getEventsForTicker(ticker)` | GET | `/events/{ticker}` | News, filings, macro events |
| `getEventsFeed(limit)` | GET | `/events/feed` | Global event feed |
| `getSignalHistory(ticker, days)` | GET | `/events/signal-history/{ticker}` | Score history (30-day) |
| `getAlerts(limit)` | GET | `/alerts` | Notification alerts |
| `getNotificationPreferences()` | GET | `/notifications/preferences` | User notification prefs |
| `saveNotificationPreferences(p)` | POST | `/notifications/preferences` | Updated prefs |

#### Community

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getDiscussion(ticker, limit)` | GET | `/discuss/{ticker}` | Discussion posts |
| `createPost(ticker, content, sentiment)` | POST | `/discuss/{ticker}` | New post |
| `reactToPost(ticker, postId, reaction)` | POST | `/discuss/{ticker}/{postId}/react` | Updated reactions |
| `getTrackRecord()` | GET | `/track-record` | Overall signal accuracy |
| `getTrackRecordTicker(ticker)` | GET | `/track-record/{ticker}` | Per-ticker accuracy |

#### User & Subscription

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `getMyProfile()` | GET | `/profile/me` | User profile |
| `updateMyProfile(updates)` | PUT | `/profile/me` | Updated profile |
| `getPublicProfile(userId)` | GET | `/profile/{userId}` | Public profile |
| `getLeaderboard()` | GET | `/leaderboard` | Ranked users |
| `sendChatMessage(msg, ctx)` | POST | `/chat` | AI chat response |
| `getSubscriptionStatus()` | GET | `/subscription/status` | Tier, expiry, trial |
| `getSubscriptionUsage()` | GET | `/subscription/usage` | Usage buckets |

### 5.3 Backend Lambda Functions

| Lambda | Trigger | Purpose |
|--------|---------|---------|
| **ApiHandlerFunction** | HTTP API (50+ routes) | Main REST API router |
| **EventHandlerFunction** | HTTP API (`/events/*`, `/alerts`, `/notifications/*`) | Events, alerts, notification prefs |
| **SocialHandlerFunction** | HTTP API (`/discuss/*`, `/profile/*`, `/chat`, `/subscription/*`) | Community, profiles, chat, subscriptions |
| **StrategyEngineFunction** | HTTP API (`/strategy/*`) | Portfolio optimization & projections |
| **SignalEngineFunction** | EventBridge cron (6 AM ET daily) | Claude AI signal generation (fan-out) |
| **FeedCompilerFunction** | EventBridge cron (6:30 AM ET daily) | Compile daily feed from signals |
| **DataRefreshFunction** | EventBridge cron (30-min market hours + daily full) | Price & technical refresh |
| **AIAgentFunction** | EventBridge cron (hourly + market close) | Observe-reason-act insight generation |
| **SchedulerFunction** | EventBridge cron (5 triggers) | Orchestrator: invokes other Lambdas |
| **NewsMonitorFunction** | Schedule (15 min market hours) | Company news via Finnhub |
| **SecFilingMonitorFunction** | Schedule (5 min market hours) | SEC filings (8-K, Form 4, SC 13D/G) |
| **MacroMonitorFunction** | Schedule (15 min market hours) | Macro economic releases |

### 5.4 External APIs

| API | Module | Used For |
|-----|--------|----------|
| **Finnhub** | `finnhub_client.py` | Quotes, candles, profiles, peers, earnings, news, financials |
| **Claude AI** (Anthropic) | `claude_client.py` | Factor scoring, reasoning, alternatives, insights, coaching |
| **SEC EDGAR** | `sec_edgar.py`, `fundamentals_engine.py` | 10-K supply chain, XBRL financial data |
| **FRED** | `market_data.py` | Fed rate, CPI, Treasury yields, GDP |
| **USPTO PatentsView** | `patent_engine.py` | Patent grants, velocity, citations |
| **USASpending.gov** | `contract_engine.py` | Government contract awards |
| **FDA OpenData** | `fda_engine.py` | Drug approvals, clinical trials |
| **ClinicalTrials.gov** | `fda_engine.py` | Active trials, PDUFA dates |

---

## 6. DynamoDB Schema

### 6.1 Table Design

**Single-table design** with composite primary key:
- **Table name:** `fii-table-{stage}`
- **Partition key (PK):** String
- **Sort key (SK):** String
- **GSI1:** `GSI1PK` / `GSI1SK` for alternate query patterns

### 6.2 Record Types

| PK Pattern | SK Pattern | Purpose | Cache TTL |
|------------|------------|---------|-----------|
| `SIGNAL#{ticker}` | `LATEST` | Current signal (score, signal, confidence, insight) | 24 hours |
| `SIGNAL#{ticker}` | `FACTORS` | Full 18-factor details | 24 hours |
| `SIGNAL#{ticker}` | `PREVIOUS` | Previous signal (for change detection) | — |
| `SIGNAL_HISTORY#{ticker}` | `{timestamp}` | Historical signal scores | — |
| `PRICE#{ticker}` | `LATEST` | Real-time price, change, 52W range | 5 min |
| `TECHNICALS#{ticker}` | `LATEST` | 15 technical indicators | 1 hour |
| `HEALTH#{ticker}` | `LATEST` | Fundamental health (Z/F/M scores, DCF, grade) | 1 hour |
| `FACTORS#{ticker}` | `LATEST` | 25 sub-factor scores, 6 dimension scores | 1 hour |
| `PATENTS#{ticker}` | `LATEST` | USPTO patent analysis | 30 days |
| `CONTRACTS#{ticker}` | `LATEST` | Government contract analysis | 7 days |
| `FDA#{ticker}` | `LATEST` | FDA pipeline analysis | 7 days |
| `EVENT#{ticker}` | `{timestamp}` | News, SEC filings, macro events | — |
| `INSIGHT#{ticker}` | `{timestamp}` | AI-generated per-ticker insights | 1 hour |
| `INSIGHT_FEED` | `{timestamp}#{ticker}` | Global insight feed | — |
| `ALERTS` | `{timestamp}#{ticker}` | High-urgency notification alerts | — |
| `EARNINGS#{ticker}` | `{period}` | Historical earnings (actual vs estimate) | — |
| `USER#{userId}` | `PORTFOLIO` | User portfolio holdings | — |
| `USER#{userId}` | `WATCHLISTS` | User watchlists | — |
| `USER#{userId}` | `PROFILE` | User profile (display name, risk profile) | — |
| `USER#{userId}` | `SUBSCRIPTION` | Subscription tier, expiry, usage | — |
| `USER#{userId}` | `COACH_EVENT#{timestamp}` | Behavioral event log | — |
| `DISCUSS#{ticker}` | `{timestamp}#{postId}` | Community discussion posts | — |
| `AGENT_RUN#{agentName}` | `{timestamp}` | Agent execution history | — |
| `DEVICE#{deviceToken}` | `USER` | Push notification device registration | — |

### 6.3 GSI1 (Score-based queries)

| GSI1PK | GSI1SK | Purpose |
|--------|--------|---------|
| `SIGNALS` | `{score}#{ticker}` | Query signals sorted by score |

### 6.4 Common Item Fields

All records include:
- `PK`, `SK` — Primary key
- `cachedAt` or `analyzedAt` — ISO timestamp for cache staleness checks
- `source` — Data provenance (`cache`, `live`, `stale_cache`, `finnhub_fallback`)

Signal records additionally include:
- `generatedAt` — When analysis was generated
- `compositeScore` — 1-10 blended score
- `signal` — BUY/HOLD/SELL
- `confidence` — LOW/MEDIUM/HIGH
- `insight` — One-line Claude summary

---

## 7. Navigation Structure

### 7.1 Navigator Hierarchy

```
NavigationContainer
└── Stack.Navigator (RootStack)
    ├── MainTabs (Tab.Navigator, lazy: true)
    │   ├── Feed      → FeedScreen        (icon: play-circle)
    │   ├── Portfolio  → PortfolioScreen   (icon: briefcase)
    │   ├── Screener   → ScreenerScreen    (icon: funnel)
    │   ├── Strategy   → StrategyScreen    (icon: bar-chart)
    │   └── Coach      → CoachScreen       (icon: shield-checkmark, badge: daily)
    │
    ├── Modal Presentations (bottom slide animation)
    │   ├── SignalDetail    → SignalDetailScreen     {ticker, feedItemId}
    │   ├── Paywall         → PaywallScreen          {feature?}
    │   └── Settings        → SettingsScreen
    │
    └── Stack Screens (right slide animation)
        ├── FinancialHealth   → FinancialHealthScreen    {ticker}
        ├── AlternativeData   → AlternativeDataScreen    {ticker}
        ├── EventTimeline     → EventTimelineScreen      {ticker}
        ├── Discussion        → DiscussionScreen         {ticker}
        ├── AIChat            → AIChatScreen             {ticker?}
        ├── WealthSimulator   → WealthSimulatorScreen
        ├── TaxStrategy       → TaxStrategyScreen
        ├── PortfolioXRay     → PortfolioXRayScreen
        ├── AIAdvisor         → AIAdvisorScreen
        ├── Backtest          → BacktestScreen
        ├── EarningsCalendar  → EarningsCalendarScreen
        ├── MarketDashboard   → MarketDashboardScreen
        ├── BasketList        → BasketListScreen
        ├── TrackRecord       → TrackRecordScreen
        ├── Leaderboard       → LeaderboardScreen
        ├── ProfileScreen     → ProfileScreen
        ├── PrivacyPolicy     → PrivacyPolicyScreen
        └── TermsOfService    → TermsOfServiceScreen
```

### 7.2 Tab Bar Configuration

- **Style:** Dark theme (`#0D1B2A` background)
- **Active color:** `#60A5FA` (blue)
- **Inactive color:** `#475569` (slate)
- **Lazy loading:** Enabled (`lazy: true`) — tabs only mount when first visited
- **Badge:** Coach tab shows red badge when daily briefing is available and not dismissed

### 7.3 Staggered Startup Sequence

To prevent 503 errors from simultaneous API calls:

```
t=0s   FeedScreen loads:     getFeed(), starts rendering
t=0s   Tab.Navigator:        lazy: true (other tabs don't mount)
t=2s   FeedScreen delayed:   loadEventsFeed()
t=3s   App.tsx delayed:      loadEventsFeed() (global)
t=4s   FeedScreen delayed:   getInsightsAlerts()
t=5s   App.tsx delayed:      setupPushNotifications()
```

### 7.4 Navigation Type Definitions

```typescript
type RootTabParamList = {
  Feed: undefined;
  Portfolio: undefined;
  Screener: undefined;
  Strategy: undefined;
  Coach: undefined;
};

type RootStackParamList = {
  MainTabs: undefined;
  SignalDetail: { ticker: string; feedItemId: string };
  FinancialHealth: { ticker: string };
  AlternativeData: { ticker: string };
  EventTimeline: { ticker: string };
  Discussion: { ticker: string };
  AIChat: { ticker?: string };
  WealthSimulator: undefined;
  TaxStrategy: undefined;
  PortfolioXRay: undefined;
  AIAdvisor: undefined;
  Backtest: undefined;
  EarningsCalendar: undefined;
  MarketDashboard: undefined;
  BasketList: undefined;
  TrackRecord: undefined;
  Leaderboard: undefined;
  ProfileScreen: undefined;
  Settings: undefined;
  Paywall: { feature?: string };
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
};
```

---

## Appendix: Key Architecture Patterns

### Fallback Chains
The frontend uses multi-source fallback chains for data resilience:
```
Signal → Dedicated endpoint → Raw response → Price data → "--"
```

### Error Response Detection
Backend returns HTTP 200 with `{error: "..."}` for missing data. Frontend's `_ok()` helper filters these while still extracting partial data from `fundRaw`/`sigRaw`/`factorsRaw`.

### Graceful Degradation
- `technical_engine`: Works with as few as 5 candles (computes whichever indicators the data supports)
- `fundamentals_engine`: Falls back to Finnhub basic_financials when SEC EDGAR XBRL is unavailable
- `factor_engine`: Returns neutral scores (5.0/10) for missing dimensions instead of failing

### Cost Controls
- Claude Haiku for low-significance AI agent events (< 9/10)
- Claude Sonnet for high-significance events (>= 9/10)
- Max 20 Claude calls per AI agent run cycle
- 1-hour insight TTL prevents re-analysis within window
- Finnhub rate limit: 55 calls/min with exponential backoff
