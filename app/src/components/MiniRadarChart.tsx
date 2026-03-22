import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon, Line, Text as SvgText } from 'react-native-svg';

export interface MiniRadarChartProps {
  scores: {
    supply_chain_upstream: number;
    supply_chain_downstream: number;
    geopolitical: number;
    monetary: number;
    correlations: number;
    risk_performance: number;
  };
  size?: number;
}

const LABELS = ['SC↑', 'SC↓', 'GEO', 'MON', 'COR', 'R&P'];
const GRID_LEVELS = [0.33, 0.66, 1.0];

function getPoint(center: number, angle: number, radius: number): [number, number] {
  return [
    center + radius * Math.cos(angle - Math.PI / 2),
    center + radius * Math.sin(angle - Math.PI / 2),
  ];
}

export const MiniRadarChart: React.FC<MiniRadarChartProps> = ({ scores, size = 80 }) => {
  const center = size / 2;
  const maxRadius = (size / 2) - 12;
  const angleStep = (2 * Math.PI) / 6;

  const values = [
    scores.supply_chain_upstream / 100,
    scores.supply_chain_downstream / 100,
    scores.geopolitical / 100,
    scores.monetary / 100,
    scores.correlations / 100,
    scores.risk_performance / 100,
  ];

  // Grid polygons
  const gridPolygons = GRID_LEVELS.map((level) => {
    const points = Array.from({ length: 6 }, (_, i) => {
      const [x, y] = getPoint(center, i * angleStep, maxRadius * level);
      return `${x},${y}`;
    }).join(' ');
    return points;
  });

  // Axis lines
  const axisLines = Array.from({ length: 6 }, (_, i) => {
    const [x, y] = getPoint(center, i * angleStep, maxRadius);
    return { x1: center, y1: center, x2: x, y2: y };
  });

  // Data polygon
  const dataPoints = values.map((v, i) => {
    const r = Math.max(0.05, Math.min(1, v)) * maxRadius;
    const [x, y] = getPoint(center, i * angleStep, r);
    return `${x},${y}`;
  }).join(' ');

  // Label positions
  const labelPositions = LABELS.map((label, i) => {
    const [x, y] = getPoint(center, i * angleStep, maxRadius + 9);
    return { label, x, y };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Grid rings */}
        {gridPolygons.map((points, i) => (
          <Polygon
            key={`grid-${i}`}
            points={points}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={0.5}
          />
        ))}

        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <Line
            key={`axis-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={0.5}
          />
        ))}

        {/* Data polygon */}
        <Polygon
          points={dataPoints}
          fill="rgba(0,201,167,0.25)"
          stroke="#00C9A7"
          strokeWidth={1.5}
        />

        {/* Labels */}
        {labelPositions.map((lp, i) => (
          <SvgText
            key={`label-${i}`}
            x={lp.x}
            y={lp.y}
            fill="rgba(255,255,255,0.35)"
            fontSize={6}
            fontWeight="600"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {lp.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
};
