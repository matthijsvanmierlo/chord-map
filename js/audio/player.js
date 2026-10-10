// Synth playback with Tone.js (window.Tone): plucked-string voices (one per
// string, like a real instrument), strum patterns, a backing band (bass +
// drums), metronome with subdivisions, count-in, loop, live tempo and a speed
// trainer. Each part has its own mixer channel. Audio only starts after a user gesture.
import { songPrefs } from '../music/voicingPrefs.js';
import { timeline } from '../music/song.js';
import { parseChord } from '../music/chordParser.js';
import { resolveVoicing } from '../music/voicingEngine.js';
import { tuningMidi } from '../music/tunings.js';
import { getPattern, patternSteps } from '../data/strumPatterns.js';
import { arrangeBand } from '../data/grooves.js';

const STRUM_GAP = 0.014; // seconds between strings in a strum

class Player {
  constructor() {
    this.ready = false;
    this.playing = false;
    this.listeners = new Set();
    this.volume = 70;
    this.loopCount = 0;
    this.trainer = null;
    this.mix = { chords: 80, bass: 70, drums: 60, click: 70 };
  }

  get available() { return !!window.Tone; }

  async init() {
    if (this.ready) return true;
    const Tone = window.Tone;
    if (!Tone) return false;
    await Tone.start();
    this.out = new Tone.Volume(-6).toDestination();
    // mixer channels
    this.bus = {
      chords: new Tone.Volume(0).connect(this.out),
      bass: new Tone.Volume(0).connect(this.out),
      drums: new Tone.Volume(0).connect(this.out),
      click: new Tone.Volume(0).connect(this.out),
    };
    this.reverb = new Tone.Freeverb({ roomSize: 0.35, dampening: 4200, wet: 0.14 }).connect(this.bus.chords);
    this.filter = new Tone.Filter(5200, 'lowpass').connect(this.reverb);
    this.strings = Array.from({ length: 8 }, () => new Tone.PluckSynth({ attackNoise: 1.2, dampening: 3600, resonance: 0.965, release: 0.6 }).connect(this.filter));
    this.click = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 }, volume: -10 }).connect(this.bus.click);
    // backing band
    this.bass = new Tone.MonoSynth({
      oscillator: { type: 'fmtriangle', modulationIndex: 1.2, harmonicity: 1 },
      filter: { Q: 1, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.004, decay: 0.25, sustain: 0.55, release: 0.12 },
      filterEnvelope: { attack: 0.004, decay: 0.18, sustain: 0.35, release: 0.2, baseFrequency: 120, octaves: 2.6 },
      volume: -4,
    }).connect(this.bus.bass);
    this.drums = {
      kick: new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 6, envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.05 }, volume: -2 }).connect(this.bus.drums),
      snare: new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 }, volume: -10 }).connect(new Tone.Filter(1400, 'highpass').connect(this.bus.drums)),
      hat: new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.045, sustain: 0 }, volume: -16 }).connect(new Tone.Filter(8000, 'highpass').connect(this.bus.drums)),
      ride: new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.32, sustain: 0 }, volume: -20 }).connect(new Tone.Filter(5200, 'highpass').connect(this.bus.drums)),
      rim: new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 }, volume: -8 }).connect(this.bus.drums),
    };
    this.ready = true;
    this.setVolume(this.volume);
    this.setMix(this.mix);
    return true;
  }

  setVolume(v) {
    this.volume = v;
    if (!this.out) return;
    this.out.mute = v <= 0;
    this.out.volume.value = v <= 0 ? -Infinity : -36 + (v / 100) * 36;
  }

  /** Mixer levels 0–100 for chords / bass / drums / click. */
  setMix(mix = {}) {
    this.mix = { ...this.mix, ...mix };
    if (!this.bus) return;
    for (const [k, v] of Object.entries(this.mix)) {
      const node = this.bus[k];
      if (!node) continue;
      node.mute = v <= 0;
      node.volume.value = v <= 0 ? -Infinity : -24 + (v / 100) * 24;
    }
  }

  playDrum(drum, time, vel) {
    const d = this.drums[drum];
    if (!d) return;
    try {
      if (drum === 'kick') d.triggerAttackRelease('C1', '8n', time, vel);
      else if (drum === 'rim') d.triggerAttackRelease('E5', '32n', time, vel);
      else d.triggerAttackRelease(drum === 'ride' ? '8n' : '32n', time, vel);
    } catch { /* overlapping triggers are harmless */ }
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) { for (const fn of this.listeners) fn(type, data); }

  /** Strum one chord immediately (preview). */
  async previewChord(symbol, tuning, { capo = 0, voicingId = null, prefs } = {}) {
    if (!(await this.init())) return;
    const v = resolveVoicing(symbol, tuning, { capo, voicingId, prefs });
    if (!v) return;
    const open = tuningMidi(tuning, capo);
    const now = window.Tone.now() + 0.03;
    v.frets.forEach((f, i) => {
      if (f < 0) return;
      this.pluck(i, open[i] + f, now + i * 0.03, 0.9);
    });
  }

  /** Play one reference note now (tuner). */
  async playNote(midi) {
    if (!(await this.init())) return;
    this.pluck(0, midi, window.Tone.now() + 0.02, 0.95);
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
   * @param {{sectionIds?:string[], loop?:boolean, countIn?:boolean, metronome?:boolean, subdivision?:number, chords?:boolean,
   *   band?:boolean, grooveId?:string, pattern?:object, smooth?:boolean, prefs?:object,
   *   trainer?:{every:number, step:number, max:number}|null}} opts
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
    const pattern = opts.pattern || getPattern(song.strumPatternId);
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
      const v = resolveVoicing(ev.symbol, tuning, { capo: song.capo || 0, voicingId: ev.voicingId, previous: prev, smooth: opts.smooth, prefs: opts.prefs ?? songPrefs(song) });
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
        const sub = Math.max(1, Math.min(4, opts.subdivision || 1));
        for (let k = 1; k < sub; k++) {
          T.schedule((time) => this.click.triggerAttackRelease('C7', '64n', time, 0.22), at(startTick + (b + k / sub) * beatTicks));
        }
      }
    }

    // backing band (bass + drums)
    this.band = { bass: 0, drums: 0 };
    if (this.opts.band !== false) {
      const band = arrangeBand(song, { grooveId: opts.grooveId ?? song.groove, sectionIds: opts.sectionIds });
      this.band = { bass: band.bass.length, drums: band.drums.length, groove: band.groove.id };
      for (const n of band.bass) {
        const freq = Tone.Frequency(n.midi, 'midi').toFrequency();
        T.schedule((time) => { try { this.bass.triggerAttackRelease(freq, at(n.dur * beatTicks), time, n.vel); } catch { /* noop */ } }, at(startTick + n.start * beatTicks));
      }
      for (const d of band.drums) {
        T.schedule((time) => this.playDrum(d.drum, time, d.vel), at(startTick + d.start * beatTicks));
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
    try { this.bass.triggerRelease(window.Tone.now()); } catch { /* noop */ }
    if (this.playing) {
      this.playing = false;
      this.emit('state', { playing: false });
    }
  }

  /** Simple standalone metronome (used by drills). Stops any song playback. */
  async metronomeStart(bpm = 80, beatsPerBar = 4) {
    if (!(await this.init())) return false;
    this.stop();
    const Tone = window.Tone;
    const T = Tone.getTransport();
    T.cancel();
    T.loop = false;
    T.bpm.value = bpm;
    let beat = 0;
    T.scheduleRepeat((time) => {
      const down = beat % beatsPerBar === 0;
      this.click.triggerAttackRelease(down ? 'C6' : 'G5', '32n', time, down ? 0.9 : 0.5);
      beat++;
    }, '4n', 0);
    T.start('+0.05', 0);
    this.playing = true;
    this.emit('state', { playing: true, metronome: true });
    return true;
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
