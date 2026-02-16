import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Svg, {
  Rect,
  Circle,
  Line,
  Text as SvgText,
  Path,
  G,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { DiversificationResult } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_W = SCREEN_WIDTH - 64;

interface Props {
  diversification: DiversificationResult | null;
  isLoading: boolean;
}

const GRADE_COLORS: Record<string, string> = {
  A: '#10B981',
  B: '#34D399',
  C: '#FBBF24',
  D: '#F59E0B',
  F: '#EF4444',
};

export const PortfolioXRay: React.FC<Props> = ({
  diversification,
  isLoading,
}) => {
  const [scanProgress, setScanProgress] = useState(0);

  useEffect(() => {
    if (isLoading) {
      setScanProgress(0);
      const interval = setInterval(() => {
        setScanProgress((p) => {
          if (p >= 100) {
            clearInterval(interval);
            return 100;
          }
          return p + 2;
        });
      }, 40);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  if (!diversification && !isLoading) return null;

  const score = diversification?.diversificationScore ?? 0;
  const grade = diversification?.grade ?? '?';
  const gradeColor = GRADE_COLORS[grade] ?? '#60A5FA';

  // Gauge angle: 0-100 maps to -135deg to +135deg (270deg arc)
  const gaugeAngle = -135 + (score / 100) * 270;
  const gaugeRad = (gaugeAngle * Math.PI) / 180;
  const gaugeR = 60;
  const gaugeCx = 80;
  const gaugeCy = 80;
  const needleX = gaugeCx + gaugeR * 0.8 * Math.cos(gaugeRad);
  const needleY = gaugeCy + gaugeR * 0.8 * Math.sin(gaugeRad);

  // Arc path for gauge background
  const arcPath = (startDeg: number, endDeg: number, r: number) => {
    const s = (startDeg * Math.PI) / 180;
    const e = (endDeg * Math.PI) / 180;
    const x1 = gaugeCx + r * Math.cos(s);
    const y1 = gaugeCy + r * Math.sin(s);
    const x2 = gaugeCx + r * Math.cos(e);
    const y2 = gaugeCy + r * Math.sin(e);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="scan" size={22} color="#60A5FA" />
        <Text style={styles.sectionTitle}>Portfolio X-Ray</Text>
      </View>
      <Text style={styles.sectionSubtitle}>
        Deep diagnostic of your portfolio health
      </Text>

      {isLoading ? (
        <View style={styles.scanContainer}>
          <ActivityIndicator color="#60A5FA" />
          <Text style={styles.scanText}>Scanning... {scanProgress}%</Text>
          <View style={styles.scanBar}>
            <View
              style={[styles.scanBarFill, { width: `${scanProgress}%` }]}
            />
          </View>
        </View>
      ) : diversification ? (
        <>
          {/* Diversification Gauge */}
          <View style={styles.gaugeContainer}>
            <Svg width={160} height={120}>
              {/* Background arc */}
              <Path
                d={arcPath(-135, 135, gaugeR)}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={10}
                fill="none"
                strokeLinecap="round"
              />
              {/* Colored arc */}
              <Path
                d={arcPath(-135, gaugeAngle, gaugeR)}
                stroke={gradeColor}
                strokeWidth={10}
                fill="none"
                strokeLinecap="round"
              />
              {/* Needle */}
              <Line
                x1={gaugeCx}
                y1={gaugeCy}
                x2={needleX}
                y2={needleY}
                stroke="#FFFFFF"
                strokeWidth={2}
              />
              <Circle
                cx={gaugeCx}
                cy={gaugeCy}
                r={4}
                fill="#FFFFFF"
              />
              {/* Score text */}
              <SvgText
                x={gaugeCx}
                y={gaugeCy + 25}
                fill={gradeColor}
                fontSize={28}
                fontWeight="800"
                textAnchor="middle"
              >
                {Math.round(score)}
              </SvgText>
            </Svg>
            <Text style={[styles.gradeLabel, { color: gradeColor }]}>
              Grade: {grade}
            </Text>
          </View>

          {/* Sector Exposure Bar Chart */}
          <Text style={styles.panelTitle}>Sector Exposure</Text>
          <View style={styles.barChart}>
            {(diversification.sectors || []).map((s) => {
              const w = Math.max(2, (s.weight ?? 0) * 100);
              return (
                <View key={s.sector} style={styles.barRow}>
                  <Text style={styles.barLabel} numberOfLines={1}>
                    {s.sector}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.min(100, w)}%`,
                          backgroundColor: s.warning
                            ? '#EF4444'
                            : s.color || '#60A5FA',
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.barValue,
                      s.warning && { color: '#EF4444' },
                    ]}
                  >
                    {w.toFixed(0)}%
                  </Text>
                  {s.warning && (
                    <Ionicons
                      name="warning"
                      size={14}
                      color="#EF4444"
                    />
                  )}
                </View>
              );
            })}
          </View>

          {/* Geographic Split */}
          <Text style={styles.panelTitle}>Geographic Split</Text>
          <View style={styles.geoRow}>
            {(diversification.geographic || []).map((g) => {
              const pct = (g.weight ?? 0) * 100;
              const color =
                g.region === 'US'
                  ? '#60A5FA'
                  : g.region === 'International'
                  ? '#8B5CF6'
                  : '#FBBF24';
              return (
                <View key={g.region} style={styles.geoItem}>
                  <View
                    style={[styles.geoDot, { backgroundColor: color }]}
                  />
                  <Text style={styles.geoLabel}>{g.region}</Text>
                  <Text style={[styles.geoValue, { color }]}>
                    {pct.toFixed(0)}%
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Correlation Heatmap */}
          {diversification.correlations &&
            diversification.correlations.length > 0 && (
              <>
                <Text style={styles.panelTitle}>Correlation Map</Text>
                <View style={styles.corrContainer}>
                  {diversification.correlations.slice(0, 10).map((c, i) => {
                    const corr = c.correlation ?? 0;
                    const color =
                      corr > 0.7
                        ? '#EF4444'
                        : corr > 0.3
                        ? '#FBBF24'
                        : '#10B981';
                    return (
                      <View key={`${c.ticker1}-${c.ticker2}-${i}`} style={styles.corrPair}>
                        <Text style={styles.corrTickers}>
                          {c.ticker1}/{c.ticker2}
                        </Text>
                        <View style={styles.corrBarTrack}>
                          <View
                            style={[
                              styles.corrBarFill,
                              {
                                width: `${Math.abs(corr) * 100}%`,
                                backgroundColor: color,
                              },
                            ]}
                          />
                        </View>
                        <Text style={[styles.corrValue, { color }]}>
                          {corr.toFixed(2)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

          {/* Risk Radar */}
          {diversification.riskRadar && diversification.riskRadar.length > 0 && (
            <>
              <Text style={styles.panelTitle}>Risk Radar</Text>
              <View style={styles.radarContainer}>
                <Svg width={CHART_W} height={200}>
                  <G x={CHART_W / 2} y={100}>
                    {/* Background circles */}
                    {[0.25, 0.5, 0.75, 1].map((r) => (
                      <Circle
                        key={`bg-${r}`}
                        cx={0}
                        cy={0}
                        r={r * 70}
                        fill="none"
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth={1}
                      />
                    ))}
                    {/* Axes + labels */}
                    {diversification.riskRadar.map((axis, i) => {
                      const count = diversification.riskRadar.length;
                      const angle =
                        (i / count) * Math.PI * 2 - Math.PI / 2;
                      const ex = Math.cos(angle) * 70;
                      const ey = Math.sin(angle) * 70;
                      const lx = Math.cos(angle) * 85;
                      const ly = Math.sin(angle) * 85;
                      return (
                        <React.Fragment key={axis.axis}>
                          <Line
                            x1={0}
                            y1={0}
                            x2={ex}
                            y2={ey}
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth={1}
                          />
                          <SvgText
                            x={lx}
                            y={ly + 3}
                            fill="rgba(255,255,255,0.5)"
                            fontSize={9}
                            textAnchor="middle"
                          >
                            {axis.axis}
                          </SvgText>
                        </React.Fragment>
                      );
                    })}
                    {/* Data polygon */}
                    {(() => {
                      const count = diversification.riskRadar.length;
                      const pts = diversification.riskRadar
                        .map((axis, i) => {
                          const angle =
                            (i / count) * Math.PI * 2 - Math.PI / 2;
                          const val = Math.min(1, Math.max(0, (axis.value ?? 0) / 100));
                          const px = Math.cos(angle) * val * 70;
                          const py = Math.sin(angle) * val * 70;
                          return `${px.toFixed(1)},${py.toFixed(1)}`;
                        })
                        .join(' ');
                      return (
                        <>
                          <Path
                            d={`M ${pts} Z`}
                            fill="rgba(96,165,250,0.2)"
                            stroke="#60A5FA"
                            strokeWidth={2}
                          />
                          {diversification.riskRadar.map((axis, i) => {
                            const angle =
                              (i / count) * Math.PI * 2 - Math.PI / 2;
                            const val = Math.min(1, Math.max(0, (axis.value ?? 0) / 100));
                            const px = Math.cos(angle) * val * 70;
                            const py = Math.sin(angle) * val * 70;
                            return (
                              <Circle
                                key={`dot-${i}`}
                                cx={px}
                                cy={py}
                                r={3}
                                fill="#60A5FA"
                              />
                            );
                          })}
                        </>
                      );
                    })()}
                  </G>
                </Svg>
              </View>
            </>
          )}
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  scanContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  scanText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 12,
  },
  scanBar: {
    width: '80%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  scanBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#60A5FA',
  },
  gaugeContainer: {
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    paddingVertical: 16,
  },
  gradeLabel: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  panelTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 16,
  },
  barChart: {
    gap: 6,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    width: 80,
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  barFill: {
    height: 10,
    borderRadius: 5,
  },
  barValue: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
    width: 36,
    textAlign: 'right',
  },
  geoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 14,
  },
  geoItem: {
    alignItems: 'center',
    gap: 4,
  },
  geoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  geoLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
  },
  geoValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  corrContainer: {
    gap: 6,
  },
  corrPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  corrTickers: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    width: 70,
  },
  corrBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  corrBarFill: {
    height: 6,
    borderRadius: 3,
  },
  corrValue: {
    fontSize: 12,
    fontWeight: '700',
    width: 36,
    textAlign: 'right',
  },
  radarContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    paddingVertical: 10,
  },
});
