import { labelMap, t } from '../i18n/core';
import type { Composer, ComposerPeriod } from '../types';

export const PERIOD_LABELS: Record<ComposerPeriod, string> = labelMap('composers.periods', [
  'BAROQUE',
  'CLASSICAL',
  'ROMANTIC',
  'MODERN',
  'VIETNAM',
]);

export const PERIODS = Object.keys(PERIOD_LABELS) as ComposerPeriod[];

/** Khoảng năm của từng thời kỳ, để vẽ dòng thời gian (Việt Nam không có khoảng riêng). */
export const PERIOD_SPANS: { period: ComposerPeriod; from: number; to: number }[] = [
  { period: 'BAROQUE', from: 1600, to: 1750 },
  { period: 'CLASSICAL', from: 1750, to: 1820 },
  { period: 'ROMANTIC', from: 1820, to: 1900 },
  { period: 'MODERN', from: 1900, to: 2025 },
];

/** "1685 – 1750", "1939 – 2001", "sinh 1950"... */
export function lifespan(c: Pick<Composer, 'birthYear' | 'deathYear'>): string {
  if (c.birthYear && c.deathYear) return `${c.birthYear} – ${c.deathYear}`;
  if (c.birthYear) return t('composers.born', { year: c.birthYear });
  if (c.deathYear) return t('composers.died', { year: c.deathYear });
  return '';
}

/** Hai chữ cái đầu của hai từ cuối, làm chữ lồng thay ảnh chân dung. */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '♪'
  );
}
