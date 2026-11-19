import { formatDuration } from './format-duration';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe('formatDuration', () => {
  it.each([
    [0, '00:00'],
    [SECOND, '00:01'],
    [59 * SECOND, '00:59'],
    [MINUTE, '01:00'],
    [3 * MINUTE + 7 * SECOND, '03:07'],
    [25 * MINUTE, '25:00'],
    [59 * MINUTE + 59 * SECOND, '59:59'],
    [HOUR, '1:00:00'],
    [HOUR + 2 * MINUTE + 3 * SECOND, '1:02:03'],
    [12 * HOUR, '12:00:00'],
  ])('formats %d ms as "%s"', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it.each([
    [999, '00:00'],
    [1999, '00:01'],
    [25 * MINUTE - 1, '24:59'],
  ])('rounds %d ms down to "%s"', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it.each([-1, -MINUTE])('treats a negative duration (%d) as 0', (ms) => {
    expect(formatDuration(ms)).toBe('00:00');
  });

  it.each([NaN, Infinity, -Infinity])('throws for %s', (ms) => {
    expect(() => formatDuration(ms)).toThrow(/finite/);
  });
});
