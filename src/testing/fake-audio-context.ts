/** One tone the app asked for. */
export interface PlayedTone {
  readonly frequency: number;
  readonly start: number;
  readonly stop: number;
}

export interface FakeAudio {
  /** Pass this to the AUDIO_CONTEXT_FACTORY token. */
  readonly factory: () => AudioContext;
  /** How many contexts were created (should stay 1). */
  created: number;
  state: AudioContextState;
  resumed: number;
  readonly tones: PlayedTone[];
  /** Makes creating the context throw. */
  throwOnCreate: boolean;
}

/** A minimal stand-in for AudioContext that records the tones. Written without `vi`. */
export function createFakeAudio(state: AudioContextState = 'suspended'): FakeAudio {
  const fake: FakeAudio = {
    factory: () => {
      if (fake.throwOnCreate) throw new Error('AudioContext not allowed');
      fake.created++;
      return context as unknown as AudioContext;
    },
    created: 0,
    state,
    resumed: 0,
    tones: [],
    throwOnCreate: false,
  };
  const param = (): Record<string, () => void> => ({
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  });
  const context = {
    currentTime: 10,
    destination: {},
    get state() {
      return fake.state;
    },
    resume: async () => {
      fake.resumed++;
      fake.state = 'running';
    },
    close: async () => undefined,
    createGain: () => {
      const gain = { gain: param(), connect: (target: unknown) => target };
      return gain;
    },
    createOscillator: () => {
      let frequency = 0;
      let start = 0;
      const oscillator = {
        type: 'sine',
        frequency: {
          ...param(),
          setValueAtTime: (value: number) => {
            frequency = value;
          },
        },
        connect: (target: unknown) => target,
        start: (at: number) => {
          start = at;
        },
        stop: (at: number) => {
          fake.tones.push({ frequency, start, stop: at });
        },
      };
      return oscillator;
    },
  };
  return fake;
}
