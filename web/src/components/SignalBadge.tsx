'use client';

import { cn } from '@/lib/utils';
import { SCORE_COLORS, getScoreLabel } from '@/lib/scoreColors';
import type { ScoreLabel } from '@/types';

const LABEL_STYLES: Record<ScoreLabel, string> = {
  Strong:    'bg-[#00C9A7]/20 text-[#00C9A7] border-[#00C9A7]/30',
  Favorable: 'bg-[#4A90D9]/20 text-[#4A90D9] border-[#4A90D9]/30',
  Neutral:   'bg-[#8E8E93]/20 text-[#8E8E93] border-[#8E8E93]/30',
  Weak:      'bg-[#F5A623]/20 text-[#F5A623] border-[#F5A623]/30',
  Caution:   'bg-[#5856D6]/20 text-[#5856D6] border-[#5856D6]/30',
};

export function SignalBadge({
  scoreLabel,
  score,
  size = 'md',
  className,
}: {
  scoreLabel?: ScoreLabel;
  score?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const label = scoreLabel ?? (score != null ? getScoreLabel(score) : 'Neutral');
  const sizeClass = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-3 py-1',
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-center font-bold rounded border',
        LABEL_STYLES[label] || LABEL_STYLES.Neutral,
        sizeClass,
        className,
      )}
    >
      {label}
    </span>
  );
}
