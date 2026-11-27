/**
 * Least-squares trend lines, as used by the original Weight card:
 * "Trend = a straight line through every weigh-in in these 14 days (needs 3 or more)."
 */
export interface TrendPoint {
  /** Position in days (e.g. days since the window start). Fractions allowed. */
  day: number;
  value: number;
}

/** Minimum number of points before a trend is shown. */
export const MIN_TREND_POINTS = 3;

/**
 * Slope of the least-squares line through the points, in value units per day.
 * Returns null when there are fewer than {@link MIN_TREND_POINTS} points or all
 * points share the same day (vertical line).
 */
export function slopePerDay(points: readonly TrendPoint[]): number | null {
  if (points.length < MIN_TREND_POINTS) return null;
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.day;
    sumY += p.value;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    const dx = p.day - meanX;
    num += dx * (p.value - meanY);
    den += dx * dx;
  }
  if (den === 0) return null;
  return num / den;
}

/** Trend in value units per week (e.g. lb/week), or null if not enough data. */
export function trendPerWeek(points: readonly TrendPoint[]): number | null {
  const perDay = slopePerDay(points);
  return perDay === null ? null : perDay * 7;
}
