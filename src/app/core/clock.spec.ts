import { TestBed } from '@angular/core/testing';
import { Clock, TICK_MS } from './clock';

const START = new Date('2026-01-01T12:00:00Z').getTime();

describe('Clock', () => {
  let clock: Clock;

  beforeEach(() => {
    vi.useFakeTimers(); // all timers this time: setInterval and Date
    vi.setSystemTime(START);
    clock = TestBed.inject(Clock);
  });

  afterEach(() => {
    TestBed.resetTestingModule(); // destroys the service, so its interval is cleared
    vi.useRealTimers();
  });

  function setVisibility(state: DocumentVisibilityState): void {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('starts at the current time', () => {
    expect(clock.now()).toBe(START);
  });

  it('does not change between ticks', () => {
    vi.advanceTimersByTime(TICK_MS - 1);

    expect(clock.now()).toBe(START);
  });

  it('moves forward with every tick', () => {
    vi.advanceTimersByTime(TICK_MS);
    expect(clock.now()).toBe(START + TICK_MS);

    vi.advanceTimersByTime(TICK_MS);
    expect(clock.now()).toBe(START + 2 * TICK_MS);
  });

  it('keeps up over a whole pomodoro', () => {
    vi.advanceTimersByTime(25 * 60_000);

    expect(clock.now()).toBe(START + 25 * 60_000);
  });

  it('is a single instance for the whole app', () => {
    expect(TestBed.inject(Clock)).toBe(clock);
  });

  it('is read-only from the outside', () => {
    expect('set' in clock.now).toBe(false);
  });

  describe('when the tab becomes visible again', () => {
    it('catches up immediately instead of waiting for the next tick', () => {
      // A throttled background tab: the time moved on, but no tick fired.
      vi.setSystemTime(START + 90_000);

      setVisibility('visible');

      expect(clock.now()).toBe(START + 90_000);
    });

    it('ignores the tab being hidden', () => {
      vi.setSystemTime(START + 90_000);

      setVisibility('hidden');

      expect(clock.now()).toBe(START);
    });
  });

  describe('when destroyed', () => {
    it('stops ticking', () => {
      TestBed.resetTestingModule();

      vi.advanceTimersByTime(5 * TICK_MS);

      expect(clock.now()).toBe(START);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('stops listening for visibility changes', () => {
      TestBed.resetTestingModule();
      vi.setSystemTime(START + 90_000);

      setVisibility('visible');

      expect(clock.now()).toBe(START);
    });
  });
});
