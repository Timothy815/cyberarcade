// Procedural synthwave loop: A minor → F → C → G, 104 BPM.
// Bass + arpeggio (through a dotted-eighth delay) + kick/snare/hat, scheduled ahead with a lookahead timer.

export interface Music {
  readonly playing: boolean;
  start(): void;
  stop(): void;
  setMuted(muted: boolean): void;
}

const BPM = 104;
const STEP = 60 / BPM / 4; // one 16th note, in seconds
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TICK_MS = 25;
const VOLUME = 0.32;

// One chord per bar (16 steps): [bass root, triad...] as MIDI notes.
const BARS: number[][] = [
  [45, 57, 60, 64], // Am
  [41, 53, 57, 60], // F
  [48, 60, 64, 67], // C
  [43, 55, 59, 62], // G
];
const ARP = [1, 2, 3, 2, 1, 2, 3, 1]; // indexes into the chord's triad

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export function createMusic(ctx: AudioContext): Music {
  const master = ctx.createGain();
  master.gain.value = VOLUME;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  // Echo bus for the arpeggio.
  const delay = ctx.createDelay(1);
  delay.delayTime.value = STEP * 3;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  delay.connect(feedback).connect(delay);
  delay.connect(master);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  let timer: ReturnType<typeof setInterval> | undefined;
  let step = 0;
  let nextTime = 0;
  let muted = false;

  const env = (t: number, peak: number, decay: number) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    return g;
  };

  const tone = (type: OscillatorType, hz: number, t: number, peak: number, decay: number, cutoff: number, dest: AudioNode) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = env(t, peak, decay);
    osc.connect(filter).connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  };

  const kick = (t: number) => {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = env(t, 0.9, 0.3);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.35);
  };

  const hiss = (t: number, type: BiquadFilterType, hz: number, peak: number, decay: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    const g = env(t, peak, decay);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + decay + 0.05);
  };

  const schedule = (s: number, t: number) => {
    const chord = BARS[Math.floor(s / 16) % BARS.length];
    const beat = s % 16;
    if (beat % 2 === 0) {
      const octave = beat % 4 === 2 ? 12 : 0;
      tone('sawtooth', midiHz(chord[0] + octave), t, 0.22, STEP * 1.8, 700, master);
    }
    tone('square', midiHz(chord[ARP[beat % ARP.length]] + 12), t, 0.05, STEP * 1.5, 2600, master);
    tone('square', midiHz(chord[ARP[beat % ARP.length]] + 12), t, 0.025, STEP * 1.5, 2600, delay);
    if (beat % 4 === 0) kick(t);
    if (beat === 4 || beat === 12) hiss(t, 'bandpass', 1800, 0.35, 0.16);
    if (beat % 4 === 2) hiss(t, 'highpass', 7000, 0.12, 0.05);
  };

  const tick = () => {
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      schedule(step, nextTime);
      step = (step + 1) % (16 * BARS.length);
      nextTime += STEP;
    }
  };

  return {
    get playing() {
      return timer !== undefined;
    },
    start() {
      if (timer !== undefined) return;
      step = 0;
      nextTime = ctx.currentTime + 0.05;
      tick();
      timer = setInterval(tick, TICK_MS);
    },
    stop() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
    setMuted(m) {
      muted = m;
      master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime, 0.05);
    },
  };
}
