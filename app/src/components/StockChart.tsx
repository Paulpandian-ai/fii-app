import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Skeleton } from './Skeleton';

// ─── Chart Data Types ───

export interface ChartCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface ChartOverlays {
  sma20?: { t: number; v: number }[];
  sma50?: { t: number; v: number }[];
  sma200?: { t: number; v: number }[];
  bollingerBands?: {
    t: number;
    upper: number;
    middle: number;
    lower: number;
  }[];
}

export interface ChartIndicators {
  rsi?: { t: number; v: number }[];
  macd?: { t: number; value: number; signal: number; histogram: number }[];
}

export interface ChartEvent {
  t: number;
  type: string;
  label: string;
}

export interface ChartData {
  candles: ChartCandle[];
  overlays: ChartOverlays;
  indicators: ChartIndicators;
  events: ChartEvent[];
  meta: {
    ticker: string;
    resolution: string;
    range: string;
    candleCount: number;
  };
}

// ─── Component Props ───

interface StockChartProps {
  ticker: string;
  chartData: ChartData | null;
  loading?: boolean;
  onRangeChange?: (range: string) => void;
}

// ─── Constants ───

const TIME_RANGES = ['1M', '3M', '6M', '1Y', '2Y'] as const;

const OVERLAY_OPTIONS = [
  { key: 'sma20', label: 'SMA 20' },
  { key: 'sma50', label: 'SMA 50' },
  { key: 'sma200', label: 'SMA 200' },
  { key: 'bb', label: 'Bollinger' },
] as const;

// ─── HTML Template Builder ───

function buildChartHTML(data: ChartData): string {
  const candleData = JSON.stringify(
    data.candles.map((c) => ({
      time: c.t,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }))
  );

  const volumeData = JSON.stringify(
    data.candles.map((c) => ({
      time: c.t,
      value: c.v,
      color: c.c >= c.o ? 'rgba(38,166,154,0.3)' : 'rgba(239,83,80,0.3)',
    }))
  );

  const sma20Data = JSON.stringify(
    (data.overlays.sma20 ?? []).map((d) => ({ time: d.t, value: d.v }))
  );
  const sma50Data = JSON.stringify(
    (data.overlays.sma50 ?? []).map((d) => ({ time: d.t, value: d.v }))
  );
  const sma200Data = JSON.stringify(
    (data.overlays.sma200 ?? []).map((d) => ({ time: d.t, value: d.v }))
  );

  const bbBands = data.overlays.bollingerBands ?? [];
  const bbUpperData = JSON.stringify(
    bbBands.map((d) => ({ time: d.t, value: d.upper }))
  );
  const bbMiddleData = JSON.stringify(
    bbBands.map((d) => ({ time: d.t, value: d.middle }))
  );
  const bbLowerData = JSON.stringify(
    bbBands.map((d) => ({ time: d.t, value: d.lower }))
  );

  const rsiData = JSON.stringify(
    (data.indicators.rsi ?? []).map((d) => ({ time: d.t, value: d.v }))
  );

  const macdLineData = JSON.stringify(
    (data.indicators.macd ?? []).map((d) => ({ time: d.t, value: d.value }))
  );
  const macdSignalData = JSON.stringify(
    (data.indicators.macd ?? []).map((d) => ({ time: d.t, value: d.signal }))
  );
  const macdHistData = JSON.stringify(
    (data.indicators.macd ?? []).map((d) => ({
      time: d.t,
      value: d.histogram,
      color:
        d.histogram >= 0 ? 'rgba(38,166,154,0.7)' : 'rgba(239,83,80,0.7)',
    }))
  );

  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #1a1a2e;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #main-chart { width: 100%; height: 300px; }
    #rsi-chart { width: 100%; height: 80px; }
    #macd-chart { width: 100%; height: 80px; }
    .chart-label {
      color: rgba(255,255,255,0.4);
      font-size: 10px;
      font-weight: 600;
      padding: 4px 8px 0;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    #tooltip {
      display: none;
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 100;
      background: rgba(26,26,46,0.92);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      padding: 6px 10px;
      color: #fff;
      font-size: 11px;
      line-height: 1.5;
      pointer-events: none;
      white-space: nowrap;
    }
    #tooltip .label { color: rgba(255,255,255,0.5); }
    #tooltip .up { color: #26a69a; }
    #tooltip .down { color: #ef5350; }
  </style>
</head>
<body>
  <div id="tooltip"></div>
  <div id="main-chart"></div>
  <div class="chart-label">RSI</div>
  <div id="rsi-chart"></div>
  <div class="chart-label">MACD</div>
  <div id="macd-chart"></div>

  <script src="https://unpkg.com/lightweight-charts@5/dist/lightweight-charts.standalone.production.mjs" type="module"></script>
  <script type="module">
    import {
      createChart,
      CandlestickSeries,
      HistogramSeries,
      LineSeries,
      AreaSeries,
    } from 'https://unpkg.com/lightweight-charts@5/dist/lightweight-charts.standalone.production.mjs';

    // ── Utility ──
    function toDateStr(ts) {
      const d = new Date(ts * 1000);
      return d.toISOString().slice(0, 10);
    }

    // ── Layout options ──
    const layoutOpts = {
      background: { color: '#1a1a2e' },
      textColor: 'rgba(255,255,255,0.5)',
    };

    const gridOpts = {
      vertLines: { color: 'rgba(255,255,255,0.04)' },
      horzLines: { color: 'rgba(255,255,255,0.04)' },
    };

    const crosshairOpts = {
      mode: 0,
      vertLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 2 },
      horzLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 2 },
    };

    const timeScaleOpts = {
      borderColor: 'rgba(255,255,255,0.08)',
      timeVisible: false,
    };

    const rightPriceScaleOpts = {
      borderColor: 'rgba(255,255,255,0.08)',
    };

    // ── Main Chart ──
    const mainEl = document.getElementById('main-chart');
    const mainChart = createChart(mainEl, {
      width: mainEl.clientWidth,
      height: 300,
      layout: layoutOpts,
      grid: gridOpts,
      crosshair: crosshairOpts,
      timeScale: timeScaleOpts,
      rightPriceScale: rightPriceScaleOpts,
    });

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candleSeries.setData(${candleData});

    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeries.setData(${volumeData});
    mainChart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      drawTicks: false,
      borderVisible: false,
    });

    // ── SMA Lines ──
    const sma20Series = mainChart.addSeries(LineSeries, {
      color: '#2196F3',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: true,
    });
    sma20Series.setData(${sma20Data});

    const sma50Series = mainChart.addSeries(LineSeries, {
      color: '#9C27B0',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: true,
    });
    sma50Series.setData(${sma50Data});

    const sma200Series = mainChart.addSeries(LineSeries, {
      color: '#FF9800',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: true,
    });
    sma200Series.setData(${sma200Data});

    // ── Bollinger Bands ──
    const bbUpperSeries = mainChart.addSeries(LineSeries, {
      color: 'rgba(255,152,0,0.5)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });
    bbUpperSeries.setData(${bbUpperData});

    const bbMiddleSeries = mainChart.addSeries(LineSeries, {
      color: 'rgba(255,152,0,0.7)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });
    bbMiddleSeries.setData(${bbMiddleData});

    const bbLowerSeries = mainChart.addSeries(LineSeries, {
      color: 'rgba(255,152,0,0.5)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });
    bbLowerSeries.setData(${bbLowerData});

    // ── RSI Chart ──
    const rsiEl = document.getElementById('rsi-chart');
    const rsiChart = createChart(rsiEl, {
      width: rsiEl.clientWidth,
      height: 80,
      layout: layoutOpts,
      grid: gridOpts,
      crosshair: crosshairOpts,
      timeScale: { visible: false },
      rightPriceScale: rightPriceScaleOpts,
    });

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: '#AB47BC',
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    rsiSeries.setData(${rsiData});

    // RSI reference lines (overbought/oversold)
    const rsiOverBought = rsiChart.addSeries(LineSeries, {
      color: 'rgba(239,83,80,0.3)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const rsiOverSold = rsiChart.addSeries(LineSeries, {
      color: 'rgba(38,166,154,0.3)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    // Build reference lines from RSI timestamps
    const rsiTimestamps = ${rsiData};
    if (rsiTimestamps.length > 0) {
      rsiOverBought.setData(rsiTimestamps.map(d => ({ time: d.time, value: 70 })));
      rsiOverSold.setData(rsiTimestamps.map(d => ({ time: d.time, value: 30 })));
    }

    rsiChart.priceScale('right').applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.05 },
    });

    // ── MACD Chart ──
    const macdEl = document.getElementById('macd-chart');
    const macdChart = createChart(macdEl, {
      width: macdEl.clientWidth,
      height: 80,
      layout: layoutOpts,
      grid: gridOpts,
      crosshair: crosshairOpts,
      timeScale: { visible: false },
      rightPriceScale: rightPriceScaleOpts,
    });

    const macdLineSeries = macdChart.addSeries(LineSeries, {
      color: '#2196F3',
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    macdLineSeries.setData(${macdLineData});

    const macdSignalSeries = macdChart.addSeries(LineSeries, {
      color: '#FF9800',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    macdSignalSeries.setData(${macdSignalData});

    const macdHistSeries = macdChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    macdHistSeries.setData(${macdHistData});

    // ── Sync time scales ──
    function syncTimeScales(source, targets) {
      source.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) {
          targets.forEach((t) => t.timeScale().setVisibleLogicalRange(range));
        }
      });
    }
    syncTimeScales(mainChart, [rsiChart, macdChart]);
    syncTimeScales(rsiChart, [mainChart, macdChart]);
    syncTimeScales(macdChart, [mainChart, rsiChart]);

    // Fit content on all charts
    mainChart.timeScale().fitContent();
    rsiChart.timeScale().fitContent();
    macdChart.timeScale().fitContent();

    // ── Tooltip ──
    const tooltip = document.getElementById('tooltip');
    mainChart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || param.seriesData.size === 0) {
        tooltip.style.display = 'none';
        return;
      }
      const candle = param.seriesData.get(candleSeries);
      const vol = param.seriesData.get(volumeSeries);
      if (!candle) {
        tooltip.style.display = 'none';
        return;
      }
      const o = (candle.open ?? 0).toFixed(2);
      const h = (candle.high ?? 0).toFixed(2);
      const l = (candle.low ?? 0).toFixed(2);
      const c = (candle.close ?? 0).toFixed(2);
      const change = ((candle.close ?? 0) - (candle.open ?? 0));
      const changePct = (candle.open ?? 0) !== 0
        ? ((change / (candle.open ?? 1)) * 100).toFixed(2)
        : '0.00';
      const cls = change >= 0 ? 'up' : 'down';
      const sign = change >= 0 ? '+' : '';
      const v = vol && vol.value != null
        ? (vol.value >= 1e6
            ? ((vol.value ?? 0) / 1e6).toFixed(1) + 'M'
            : (vol.value >= 1e3
                ? ((vol.value ?? 0) / 1e3).toFixed(1) + 'K'
                : (vol.value ?? 0).toFixed(0)))
        : '-';

      tooltip.innerHTML =
        '<span class="label">O</span> ' + o +
        ' <span class="label">H</span> ' + h +
        ' <span class="label">L</span> ' + l +
        ' <span class="label">C</span> <span class="' + cls + '">' + c + '</span>' +
        ' <span class="' + cls + '">' + sign + changePct + '%</span>' +
        ' <span class="label">Vol</span> ' + v;
      tooltip.style.display = 'block';
    });

    // ── Handle resize ──
    const ro = new ResizeObserver(() => {
      const w = document.documentElement.clientWidth;
      mainChart.applyOptions({ width: w });
      rsiChart.applyOptions({ width: w });
      macdChart.applyOptions({ width: w });
    });
    ro.observe(document.documentElement);

    // ── Message handling from React Native ──
    function handleMessage(event) {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (_) {
        return;
      }

      if (msg.type === 'toggleOverlay') {
        const key = msg.key;
        const visible = msg.visible;
        switch (key) {
          case 'sma20':
            sma20Series.applyOptions({ visible });
            break;
          case 'sma50':
            sma50Series.applyOptions({ visible });
            break;
          case 'sma200':
            sma200Series.applyOptions({ visible });
            break;
          case 'bb':
            bbUpperSeries.applyOptions({ visible });
            bbMiddleSeries.applyOptions({ visible });
            bbLowerSeries.applyOptions({ visible });
            break;
        }
      }

      if (msg.type === 'updateData') {
        try {
          const d = msg.data;
          if (d.candles) {
            candleSeries.setData(d.candles.map(function(c) {
              return { time: c.t, open: c.o, high: c.h, low: c.l, close: c.c };
            }));
            volumeSeries.setData(d.candles.map(function(c) {
              return {
                time: c.t,
                value: c.v,
                color: c.c >= c.o ? 'rgba(38,166,154,0.3)' : 'rgba(239,83,80,0.3)',
              };
            }));
          }
          if (d.overlays) {
            if (d.overlays.sma20) sma20Series.setData(d.overlays.sma20.map(function(p) { return { time: p.t, value: p.v }; }));
            if (d.overlays.sma50) sma50Series.setData(d.overlays.sma50.map(function(p) { return { time: p.t, value: p.v }; }));
            if (d.overlays.sma200) sma200Series.setData(d.overlays.sma200.map(function(p) { return { time: p.t, value: p.v }; }));
            if (d.overlays.bollingerBands) {
              bbUpperSeries.setData(d.overlays.bollingerBands.map(function(p) { return { time: p.t, value: p.upper }; }));
              bbMiddleSeries.setData(d.overlays.bollingerBands.map(function(p) { return { time: p.t, value: p.middle }; }));
              bbLowerSeries.setData(d.overlays.bollingerBands.map(function(p) { return { time: p.t, value: p.lower }; }));
            }
          }
          if (d.indicators) {
            if (d.indicators.rsi) {
              const rsiMapped = d.indicators.rsi.map(function(p) { return { time: p.t, value: p.v }; });
              rsiSeries.setData(rsiMapped);
              rsiOverBought.setData(rsiMapped.map(function(p) { return { time: p.time, value: 70 }; }));
              rsiOverSold.setData(rsiMapped.map(function(p) { return { time: p.time, value: 30 }; }));
            }
            if (d.indicators.macd) {
              macdLineSeries.setData(d.indicators.macd.map(function(p) { return { time: p.t, value: p.value }; }));
              macdSignalSeries.setData(d.indicators.macd.map(function(p) { return { time: p.t, value: p.signal }; }));
              macdHistSeries.setData(d.indicators.macd.map(function(p) {
                return {
                  time: p.t,
                  value: p.histogram,
                  color: p.histogram >= 0 ? 'rgba(38,166,154,0.7)' : 'rgba(239,83,80,0.7)',
                };
              }));
            }
          }
          mainChart.timeScale().fitContent();
          rsiChart.timeScale().fitContent();
          macdChart.timeScale().fitContent();
        } catch (e) {
          // Silently handle malformed update data
        }
      }
    }

    // React Native WebView sends messages via window event
    document.addEventListener('message', handleMessage);
    window.addEventListener('message', handleMessage);
  </script>
</body>
</html>`;
}

// ─── Component ───

export const StockChart: React.FC<StockChartProps> = ({
  ticker,
  chartData,
  loading = false,
  onRangeChange,
}) => {
  const webViewRef = useRef<WebView>(null);
  const [activeRange, setActiveRange] = useState<string>('1Y');
  const [overlays, setOverlays] = useState<Record<string, boolean>>({
    sma20: true,
    sma50: true,
    sma200: true,
    bb: false,
  });

  const handleRangePress = useCallback(
    (range: string) => {
      setActiveRange(range);
      onRangeChange?.(range);
    },
    [onRangeChange]
  );

  const handleOverlayToggle = useCallback(
    (key: string) => {
      setOverlays((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: 'toggleOverlay',
            key,
            visible: next[key],
          })
        );
        return next;
      });
    },
    []
  );

  const htmlSource = useMemo(() => {
    if (!chartData) return null;
    return buildChartHTML(chartData);
  }, [chartData]);

  // ── Loading State ──
  if (loading || !chartData) {
    return (
      <View style={styles.container}>
        <View style={styles.controlsRow}>
          {TIME_RANGES.map((range) => (
            <View key={range} style={styles.chipSkeleton}>
              <Skeleton width={40} height={28} borderRadius={14} />
            </View>
          ))}
        </View>
        <View style={styles.overlayRow}>
          {OVERLAY_OPTIONS.map((opt) => (
            <Skeleton
              key={opt.key}
              width={70}
              height={24}
              borderRadius={12}
            />
          ))}
        </View>
        <Skeleton width="100%" height={300} borderRadius={8} />
        <View style={styles.subChartSpacer} />
        <Skeleton width="100%" height={80} borderRadius={8} />
        <View style={styles.subChartSpacer} />
        <Skeleton width="100%" height={80} borderRadius={8} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Time Range Selector */}
      <View style={styles.controlsRow}>
        {TIME_RANGES.map((range) => (
          <TouchableOpacity
            key={range}
            style={[
              styles.chip,
              activeRange === range && styles.chipActive,
            ]}
            onPress={() => handleRangePress(range)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                activeRange === range && styles.chipTextActive,
              ]}
            >
              {range}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Overlay Toggles */}
      <View style={styles.overlayRow}>
        {OVERLAY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[
              styles.overlayChip,
              overlays[opt.key] && styles.overlayChipActive,
            ]}
            onPress={() => handleOverlayToggle(opt.key)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.overlayDot,
                {
                  backgroundColor: overlays[opt.key]
                    ? opt.key === 'sma20'
                      ? '#2196F3'
                      : opt.key === 'sma50'
                        ? '#9C27B0'
                        : opt.key === 'sma200'
                          ? '#FF9800'
                          : '#FF9800'
                    : 'rgba(255,255,255,0.2)',
                },
              ]}
            />
            <Text
              style={[
                styles.overlayText,
                overlays[opt.key] && styles.overlayTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart WebView */}
      <View style={styles.webViewContainer} accessibilityLabel={`Interactive stock chart for ${ticker}`}>
        {htmlSource != null && (
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: htmlSource }}
            style={styles.webView}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            overScrollMode="never"
            setBuiltInZoomControls={false}
            androidLayerType="hardware"
          />
        )}
      </View>
    </View>
  );
};

// ─── Styles ───

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipActive: {
    backgroundColor: 'rgba(38,166,154,0.15)',
    borderColor: '#26a69a',
  },
  chipText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: '#26a69a',
  },
  chipSkeleton: {
    marginHorizontal: 2,
  },
  overlayRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  overlayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  overlayChipActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  overlayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  overlayText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '500',
  },
  overlayTextActive: {
    color: 'rgba(255,255,255,0.7)',
  },
  webViewContainer: {
    width: '100%',
    // 300px main + 80px RSI + 80px MACD + ~40px labels/padding
    height: 500,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  webView: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  subChartSpacer: {
    height: 8,
  },
});
