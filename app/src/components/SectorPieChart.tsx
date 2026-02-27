import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

interface SectorData {
  name: string;
  value: number;
  color: string;
}

interface Props {
  sectors: SectorData[];
  size?: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

export const SectorPieChart: React.FC<Props> = ({ sectors, size = 100 }) => {
  const total = sectors.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = r * 0.55;
  const nonZero = sectors.filter((s) => s.value > 0);
  const isSingle = nonZero.length <= 1;

  let currentAngle = 0;
  const slices: { d: string; color: string }[] = [];

  if (!isSingle) {
    for (const sector of nonZero) {
      const sliceAngle = (sector.value / total) * 360;
      if (sliceAngle > 0.5) {
        const d = describeArc(cx, cy, r, currentAngle, currentAngle + sliceAngle - 0.3);
        slices.push({ d, color: sector.color });
      }
      currentAngle += sliceAngle;
    }
  }

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        {isSingle ? (
          <Circle cx={cx} cy={cy} r={r} fill={nonZero[0]?.color || 'rgba(255,255,255,0.1)'} />
        ) : (
          slices.map((slice, i) => <Path key={i} d={slice.d} fill={slice.color} />)
        )}
        {/* Inner cutout for donut effect */}
        <Circle cx={cx} cy={cy} r={innerR} fill="#0D1B3E" />
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        {sectors.slice(0, 5).map((sector) => (
          <View key={sector.name} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: sector.color }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {sector.name}
            </Text>
            <Text style={styles.legendPct}>
              {((sector.value / total) * 100).toFixed(0)}%
            </Text>
          </View>
        ))}
        {sectors.length > 5 && (
          <Text style={styles.legendMore}>+{sectors.length - 5} more</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  legend: {
    flex: 1,
    gap: 5,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    flex: 1,
  },
  legendPct: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
  },
  legendMore: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    marginTop: 2,
  },
});
