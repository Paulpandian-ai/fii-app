import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SectorData {
  sector: string;
  marketCap: number;
  changePercent: number;
  stockCount: number;
}

export interface SectorHeatmapProps {
  sectors: SectorData[];
  onSectorPress?: (sector: string) => void;
  height?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HORIZONTAL_PADDING = 32;
const GAP = 2;
const MIN_RECT_DIMENSION = 28;

const SECTOR_ABBREVIATIONS: Record<string, string> = {
  'Technology': 'Tech',
  'Healthcare': 'Health',
  'Financial Services': 'Finance',
  'Consumer Cyclical': 'Cyclical',
  'Consumer Defensive': 'Staples',
  'Energy': 'Energy',
  'Industrials': 'Indust.',
  'Basic Materials': 'Materials',
  'Real Estate': 'RE',
  'Utilities': 'Util.',
  'Communication Services': 'Comms',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getColorForChange = (changePercent: number): string => {
  if (changePercent <= -3) return '#b71c1c';
  if (changePercent <= -2) return '#e53935';
  if (changePercent <= -1) return '#ef5350';
  if (changePercent <= -0.5) return 'rgba(198,40,40,0.6)';
  if (changePercent < 0.5) return '#424242';
  if (changePercent < 1) return 'rgba(46,125,50,0.6)';
  if (changePercent < 2) return '#66bb6a';
  if (changePercent < 3) return '#43a047';
  return '#1b5e20';
};

const abbreviateSector = (sector: string): string =>
  SECTOR_ABBREVIATIONS[sector] ?? sector;

/**
 * Determine whether there is enough room to display text inside a rectangle.
 * Returns 'full' | 'compact' | 'none'.
 */
const labelFit = (
  w: number,
  h: number,
): 'full' | 'compact' | 'none' => {
  if (w < MIN_RECT_DIMENSION || h < MIN_RECT_DIMENSION) return 'none';
  if (w < 46 || h < 32) return 'compact';
  return 'full';
};

// ---------------------------------------------------------------------------
// Treemap layout (slice-and-dice)
// ---------------------------------------------------------------------------

interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
  sector: SectorData;
}

/**
 * Recursive slice-and-dice treemap layout.
 *
 * Sectors are assumed to already be sorted by marketCap descending.
 * At each recursion level the split direction alternates between
 * horizontal (split into left/right) and vertical (split into top/bottom).
 */
const computeLayout = (
  sectors: SectorData[],
  x: number,
  y: number,
  width: number,
  height: number,
  horizontal: boolean,
): LayoutRect[] => {
  if (sectors.length === 0) return [];

  if (sectors.length === 1) {
    return [
      {
        x: x + GAP / 2,
        y: y + GAP / 2,
        width: Math.max(0, width - GAP),
        height: Math.max(0, height - GAP),
        sector: sectors[0],
      },
    ];
  }

  const totalCap = sectors.reduce((sum, s) => sum + s.marketCap, 0);
  if (totalCap <= 0) {
    // Degenerate case: distribute equally
    const equalCap = 1 / sectors.length;
    return computeLayout(
      sectors.map((s) => ({ ...s, marketCap: equalCap })),
      x,
      y,
      width,
      height,
      horizontal,
    );
  }

  // Find a split point that divides total area roughly in half by market cap.
  // We walk through the sorted list accumulating cap until we cross ~50%.
  let accum = 0;
  let splitIndex = 1; // at least 1 item in the first group
  const halfCap = totalCap / 2;
  for (let i = 0; i < sectors.length - 1; i++) {
    accum += sectors[i].marketCap;
    if (accum >= halfCap) {
      splitIndex = i + 1;
      break;
    }
    splitIndex = i + 1;
  }

  const firstGroup = sectors.slice(0, splitIndex);
  const secondGroup = sectors.slice(splitIndex);
  const firstCap = firstGroup.reduce((s, d) => s + d.marketCap, 0);
  const ratio = firstCap / totalCap;

  if (horizontal) {
    const firstWidth = width * ratio;
    return [
      ...computeLayout(firstGroup, x, y, firstWidth, height, !horizontal),
      ...computeLayout(secondGroup, x + firstWidth, y, width - firstWidth, height, !horizontal),
    ];
  }

  const firstHeight = height * ratio;
  return [
    ...computeLayout(firstGroup, x, y, width, firstHeight, !horizontal),
    ...computeLayout(secondGroup, x, y + firstHeight, width, height - firstHeight, !horizontal),
  ];
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SectorHeatmap: React.FC<SectorHeatmapProps> = ({
  sectors,
  onSectorPress,
  height = 200,
}) => {
  const chartWidth = SCREEN_WIDTH - HORIZONTAL_PADDING;

  const rects = useMemo(() => {
    if (!sectors || sectors.length === 0) return [];

    // Filter out sectors with non-positive market cap, then sort descending
    const valid = sectors
      .filter((s) => s.marketCap > 0)
      .sort((a, b) => b.marketCap - a.marketCap);

    if (valid.length === 0) return [];

    return computeLayout(valid, 0, 0, chartWidth, height, chartWidth >= height);
  }, [sectors, chartWidth, height]);

  // ---- Empty state ----
  if (!sectors || sectors.length === 0 || rects.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={styles.emptyText}>No sector data available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Svg width={chartWidth} height={height}>
        {rects.map((rect) => {
          const color = getColorForChange(rect.sector.changePercent);
          const fit = labelFit(rect.width, rect.height);
          const abbr = abbreviateSector(rect.sector.sector);
          const changeStr =
            (rect.sector.changePercent >= 0 ? '+' : '') +
            rect.sector.changePercent.toFixed(1) +
            '%';

          const cx = rect.x + rect.width / 2;
          const cy = rect.y + rect.height / 2;

          // Determine font sizes based on available space
          const nameFontSize = Math.min(12, Math.max(8, rect.width / 6));
          const changeFontSize = Math.min(10, Math.max(7, rect.width / 8));

          return (
            <React.Fragment key={rect.sector.sector}>
              <Rect
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                rx={4}
                ry={4}
                fill={color}
              />
              {fit === 'full' && (
                <>
                  <SvgText
                    x={cx}
                    y={cy - 4}
                    fill="#FFFFFF"
                    fontSize={nameFontSize}
                    fontWeight="700"
                    textAnchor="middle"
                    opacity={0.95}
                  >
                    {abbr}
                  </SvgText>
                  <SvgText
                    x={cx}
                    y={cy + changeFontSize + 2}
                    fill="#FFFFFF"
                    fontSize={changeFontSize}
                    fontWeight="600"
                    textAnchor="middle"
                    opacity={0.85}
                  >
                    {changeStr}
                  </SvgText>
                </>
              )}
              {fit === 'compact' && (
                <SvgText
                  x={cx}
                  y={cy + changeFontSize / 2 - 1}
                  fill="#FFFFFF"
                  fontSize={changeFontSize}
                  fontWeight="700"
                  textAnchor="middle"
                  opacity={0.9}
                >
                  {changeStr}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>

      {/* Invisible touch targets overlaid on top of the SVG */}
      {onSectorPress &&
        rects.map((rect) => (
          <TouchableOpacity
            key={`touch-${rect.sector.sector}`}
            style={[
              styles.touchTarget,
              {
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
              },
            ]}
            activeOpacity={0.7}
            onPress={() => onSectorPress(rect.sector.sector)}
          />
        ))}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignSelf: 'center',
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontWeight: '500',
  },
  touchTarget: {
    position: 'absolute',
  },
});
