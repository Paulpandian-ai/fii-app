import type { ScoreLabel } from '../types';

export const SCORE_COLORS: Record<ScoreLabel, string> = {
  Strong:    '#00C9A7',
  Favorable: '#4A90D9',
  Neutral:   '#8E8E93',
  Weak:      '#F5A623',
  Caution:   '#5856D6',
} as const;

export function getScoreColor(score: number): string {
  if (score >= 9) return SCORE_COLORS.Strong;
  if (score >= 7) return SCORE_COLORS.Favorable;
  if (score >= 5) return SCORE_COLORS.Neutral;
  if (score >= 3) return SCORE_COLORS.Weak;
  return SCORE_COLORS.Caution;
}

export function getScoreLabel(score: number): ScoreLabel {
  if (score >= 9) return 'Strong';
  if (score >= 7) return 'Favorable';
  if (score >= 5) return 'Neutral';
  if (score >= 3) return 'Weak';
  return 'Caution';
}
