const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Formats a duration as `mm:ss`, or `h:mm:ss` from one hour on.
 * Rounds down to whole seconds and treats negative durations as 0.
 *
 * @example formatDuration(1_500_000) // "25:00"
 * @example formatDuration(3_723_000) // "1:02:03"
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) {
    throw new Error(`Duration must be a finite number of milliseconds, got ${ms}`);
  }
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mmss = `${pad(minutes)}:${pad(seconds)}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}
