import { TestBed } from '@angular/core/testing';
import { createFakeAudio, type FakeAudio } from '../../testing/fake-audio-context';
import type { AppEvent } from '../domain/app-event';
import { AlarmSound, AUDIO_CONTEXT_FACTORY } from './alarm-sound';
import { EventBus } from './event-bus';

describe('AlarmSound', () => {
  let audio: FakeAudio;
  let events: AppEvent[];

  beforeEach(() => {
    localStorage.clear();
    audio = createFakeAudio();
  });

  function create(factory: (() => AudioContext) | null = audio.factory): AlarmSound {
    TestBed.configureTestingModule({
      providers: [{ provide: AUDIO_CONTEXT_FACTORY, useValue: factory }],
    });
    events = [];
    TestBed.inject(EventBus).on((e) => events.push(e));
    return TestBed.inject(AlarmSound);
  }

  describe('playing', () => {
    it('plays three rising beeps when a task is up', () => {
      create().play('task');

      expect(audio.tones.map((t) => t.frequency)).toEqual([880, 880, 1175]);
    });

    it('plays two softer steps when a break is over', () => {
      create().play('break');

      expect(audio.tones.map((t) => t.frequency)).toEqual([660, 880]);
    });

    it('schedules the tones one after another, each short', () => {
      create().play('task');

      const starts = audio.tones.map((t) => t.start);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      for (const tone of audio.tones) expect(tone.stop - tone.start).toBeLessThan(0.5);
    });

    it('wakes a suspended context before playing', () => {
      create().play('task');

      expect(audio.resumed).toBe(1);
    });

    it('reuses one context for every sound', () => {
      const sound = create();

      sound.play('task');
      sound.play('break');

      expect(audio.created).toBe(1);
    });

    it('stays silent when switched off', () => {
      const sound = create();
      sound.setEnabled(false);

      sound.play('task');

      expect(audio.tones).toEqual([]);
    });

    it('does nothing without Web Audio', () => {
      const sound = create(null);

      expect(sound.supported).toBe(false);
      expect(() => sound.play('task')).not.toThrow();
    });

    it('never throws when the browser refuses audio', () => {
      audio.throwOnCreate = true;

      expect(() => create().play('task')).not.toThrow();
    });
  });

  describe('autoplay policy', () => {
    it('creates no context before the user interacted', () => {
      create();

      expect(audio.created).toBe(0);
    });

    it.each([
      ['a click', () => new PointerEvent('pointerdown')],
      ['a key press', () => new KeyboardEvent('keydown')],
    ])('unlocks audio on %s anywhere on the page', (_label, makeEvent) => {
      create();

      document.dispatchEvent(makeEvent());

      expect(audio.created).toBe(1);
      expect(audio.resumed).toBe(1);
    });

    it('unlocks only once', () => {
      create();

      document.dispatchEvent(new PointerEvent('pointerdown'));
      document.dispatchEvent(new PointerEvent('pointerdown'));

      expect(audio.resumed).toBe(1);
    });
  });

  describe('setting', () => {
    it('is on by default', () => {
      expect(create().enabled()).toBe(true);
    });

    it('remembers the choice across a reload', () => {
      create().setEnabled(false);
      TestBed.tick();
      TestBed.resetTestingModule();

      expect(create().enabled()).toBe(false);
    });

    it.each(['{broken', '"no"'])('falls back to on for stored %s', (raw) => {
      localStorage.setItem('pomodoro.sound', raw);

      expect(create().enabled()).toBe(true);
    });

    it('logs real changes only', () => {
      const sound = create();

      sound.setEnabled(true); // already on
      sound.setEnabled(false);
      sound.setEnabled(false);

      expect(events).toEqual([{ type: 'sound-toggled', enabled: false }]);
    });
  });
});
