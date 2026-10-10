// Synth playback with Tone.js (window.Tone): plucked-string voices (one per
// string, like a real instrument), strum patterns, metronome, count-in, loop,
// live tempo and a speed trainer. Audio only starts after a user gesture.
import { timeline } from '../music/song.js';
import { parseChord } from '../music/chordParser.js';
import { resolveVoicing } from '../music/voicingEngine.js';
import { tuningMidi } from '../music/tunings.js';
import { getPattern, patternSteps } from '../data/strumPatterns.js';

const STRUM_GAP = 0.014; // seconds between strings in a strum

class Player {
  constructor() {
    this.ready = false;
    this.playing = false;
    this.listeners = new Set();
    this.volume = 70;
    this.loopCount = 0;
    this.trainer = null;
  }

  get available() { return !!window.Tone; }

  async init() {
    if (this.ready) return true;
    const Tone = window.Tone;
    if (!Tone) return false;
    await Tone.start();
    this.out = new Tone.Volume(-6).toDestination();
    this.reverb = new Tone.Freeverb({ roomSize: 0.35, dampening: 4200, wet: 0.14 }).connect(this.out);
    this.filter = new Tone.Filter(5200, 'lowpass').connect(this.reverb);
    this.strings = Array.from({ length: 8 }, () => new Tone.PluckSynth({ attackNoise: 1.2, dampening: 3600, resonance: 0.965, release: 0.6 }).connect(this.filter));
    this.click = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 }, volume: -10 }).connect(this.out);
    this.ready = true;
    this.setVolume(this.volume);
    return true;
  }

  setVolume(v) {
    this.volume = v;
    if (!this.out) return;
    this.out.mute = v <= 0;
    this.out.volume.value = v <= 0 ? -Infinity : -36 + (v / 100) * 36;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) { for (const fn of this.listeners) fn(type, data); }

  /** Strum one chord immediately (preview). */
  async previewChord(symbol, tuning, { capo = 0, voicingId = null } = {}) {
    if (!(await this.init())) return;
    const v = resolveVoicing(symbol, tuning, { capo, voicingId });
    if (!v) return;
    const open = tuningMidi(tuning, capo);
    const now = window.Tone.now() + 0.03;
    v.frets.forEach((f, i) => {
      if (f < 0) return;
      this.pluck(i, open[i] + f, now + i * 0.03, 0.9);
    });
  }

  pluck(stringIdx, midi, time, velocity = 0.8) {
    const s = this.strings[stringIdx % this.strings.length];
    const freq = window.Tone.Frequency(midi, 'midi').toFrequency();
    try { s.triggerAttack(freq, time); } catch { /* time collisions are harmless */ }
    s.volume.value = -14 + velocity * 10;
  }

  mute(stringIdx, time) {
    try { this.strings[stringIdx % this.strings.length].triggerRelease(time); } catch { /* noop */ }
  }

  /**
   * Prepare a song for playback.
   * @param {object} song
   * @param {object} tuning
   * @param {{sectionIds?:string[], loop?:boolean, countIn?:boolean, metronome?:boolean, chords?:boolean, smooth?:boolean, trainer?:{every:number, step:number, max:number}|null}} opts
   */
  async load(song, tuning, opts = {}) {
    if (!(await this.init())) return false;
    this.stop();
    const Tone = window.Tone;
    const T = Tone.getTransport();
    T.cancel();
    T.bpm.value = song.tempo;
    this.song = song;
    this.opts = { loop: true, countIn: true, metronome: true, chords: true, ...opts };
    this.trainer = opts.trainer || null;
    this.loopCount = 0;

    const [num, den] = song.timeSignature;
    const PPQ = T.PPQ;
    const beatTicks = PPQ; // one meter beat ⇒ one transport "quarter"
    const tl = timeline(song, { sectionIds: opts.sectionIds });
    this.events = tl.events;
    if (!tl.events.length) return false;
    const countInBeats = this.opts.countIn ? num : 0;
    const startTick = countInBeats * beatTicks;
    const endTick = startTick + tl.totalBeats * beatTicks;
    const pattern = getPattern(song.strumPatternId);
    const { perBeat, steps } = patternSteps(pattern, song.timeSignature);
    const swing = (song.swing || pattern.swing) && perBeat === 2;
    const stepTicks = beatTicks / perBeat;
    const open = tuningMidi(tuning, song.capo || 0);
    const hasStrum = steps.some((s) => s === 'D' || s === 'd');

    // resolve voicings once
    let prev = null;
    const voiced = tl.events.map((ev) => {
      const c = parseChord(ev.symbol);
      if (!c || c.nc) return null;
      const v = resolveVoicing(ev.symbol, tuning, { capo: song.capo || 0, voicingId: ev.voicingId, previous: prev, smooth: opts.smooth });
      if (v) prev = v;
      return v;
    });

    const at = (tick) => `${Math.round(tick)}i`;

    // count-in & metronome clicks
    if (this.opts.countIn) {
      for (let b = 0; b < countInBeats; b++) {
        T.schedule((time) => {
          this.click.triggerAttackRelease(b === 0 ? 'C6' : 'G5', '32n', time);
          Tone.getDraw().schedule(() => this.emit('countin', { beat: b + 1, of: countInBeats }), time);
        }, at(b * beatTicks));
      }
    }
    if (this.opts.metronome) {
      for (let b = 0; b < tl.totalBeats; b++) {
        const down = b % num === 0;
        T.schedule((time) => this.click.triggerAttackRelease(down ? 'C6' : 'G5', '32n', time, down ? 0.9 : 0.5), at(startTick + b * beatTicks));
      }
    }

    // chords
    tl.events.forEach((ev, i) => {
      const v = voiced[i];
      const evTick = startTick + ev.start * beatTicks;
      T.schedule((time) => {
        Tone.getDraw().schedule(() => this.emit('chord', { index: i, event: ev }), time);
      }, at(evTick));
      if (!v || !this.opts.chords) return;
      const played = v.frets.map((f, s) => (f >= 0 ? { s, midi: open[s] + f } : null)).filter(Boolean);
      const byPitch = [...played].sort((a, b) => a.midi - b.midi);
      const barStart = Math.floor(ev.start / num) * num;
      const firstStep = Math.round((ev.start - barStart) * perBeat);
      const lastStep = Math.round((ev.start - barStart + ev.beats) * perBeat);
      for (let st = firstStep; st < lastStep; st++) {
        let tok = steps[st % steps.length];
        if (st === firstStep && tok === '.') tok = hasStrum ? 'D' : 'B';
        if (tok === '.' || !tok) continue;
        let tick = startTick + (barStart * perBeat + st) * stepTicks;
        if (swing && st % 2 === 1) tick += stepTicks / 3;
        const accent = st % (perBeat * num) === 0 ? 1 : st % perBeat === 0 ? 0.85 : 0.65;
        T.schedule((time) => this.playToken(tok, played, byPitch, time, accent), at(tick));
      }
    });

    T.schedule((time) => Tone.getDraw().schedule(() => this.emit('pass-end', {}), time), at(endTick - 1));
    if (this.opts.loop) {
      T.loop = true;
      T.loopStart = at(startTick);
      T.loopEnd = at(endTick);
      if (this.loopHandler) T.off('loop', this.loopHandler);
      this.loopHandler = () => {
        this.loopCount++;
        if (this.trainer && this.loopCount % this.trainer.every === 0 && T.bpm.value < this.trainer.max) {
          T.bpm.value = Math.min(this.trainer.max, T.bpm.value + this.trainer.step);
          Tone.getDraw().schedule(() => this.emit('tempo', { bpm: Math.round(T.bpm.value) }), Tone.now());
        }
        Tone.getDraw().schedule(() => this.emit('loop', { count: this.loopCount }), Tone.now());
      };
      T.on('loop', this.loopHandler);
    } else {
      T.loop = false;
      T.schedule((time) => Tone.getDraw().schedule(() => this.stop(), time), at(endTick + beatTicks / 2));
    }
    return true;
  }

  playToken(tok, played, byPitch, time, accent) {
    if (!played.length) return;
    const n = played.length;
    switch (tok) {
      case 'D':
        played.forEach((p, k) => this.pluck(p.s, p.midi, time + k * STRUM_GAP, 0.75 * accent + 0.1));
        break;
      case 'U': {
        const upper = played.slice(Math.max(0, n - 4)).reverse();
        upper.forEach((p, k) => this.pluck(p.s, p.midi, time + k * STRUM_GAP * 0.8, 0.55 * accent));
        break;
      }
      case 'd':
        played.forEach((p, k) => {
          this.pluck(p.s, p.midi, time + k * 0.006, 0.6 * accent);
          this.mute(p.s, time + 0.16);
        });
        break;
      case 'B': this.pluck(byPitch[0].s, byPitch[0].midi, time, 0.85 * accent); break;
      case 'b': {
        const alt = byPitch[1] || byPitch[0];
        this.pluck(alt.s, alt.midi, time, 0.75 * accent);
        break;
      }
      default: {
        const k = Number(tok);
        if (k >= 1) {
          const p = played[Math.max(0, n - k)];
          this.pluck(p.s, p.midi, time, 0.6 * accent);
        }
      }
    }
  }

  play() {
    if (!this.ready || !this.events?.length) return;
    const T = window.Tone.getTransport();
    T.start('+0.05', 0);
    this.playing = true;
    this.emit('state', { playing: true });
  }

  stop() {
    if (!this.ready) return;
    const T = window.Tone.getTransport();
    T.stop();
    T.position = 0;
    this.strings.forEach((s, i) => this.mute(i, window.Tone.now()));
    if (this.playing) {
      this.playing = false;
      this.emit('state', { playing: false });
    }
  }

  setTempo(bpm) {
    if (!this.ready) return;
    window.Tone.getTransport().bpm.value = bpm;
  }

  get tempo() {
    return this.ready ? Math.round(window.Tone.getTransport().bpm.value) : null;
  }
}

export const player = new Player();
