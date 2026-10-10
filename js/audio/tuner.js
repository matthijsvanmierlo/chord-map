// Chromatic tuner: microphone → AnalyserNode → YIN pitch detection.
// Audio is analysed live in the browser and never stored or sent anywhere.
import { mod12, SHARP_NAMES } from '../music/theory.js';

/**
 * YIN pitch detection on a mono buffer. Returns frequency in Hz or null.
 * @param {Float32Array} buf
 * @param {number} sampleRate
 */
export function detectPitch(buf, sampleRate, { minHz = 60, maxHz = 1200, threshold = 0.12 } = {}) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.01) return null; // too quiet
  const maxTau = Math.min(Math.floor(sampleRate / minHz), Math.floor(buf.length / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  const W = buf.length - maxTau;
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // cumulative mean normalised difference
  let running = 0;
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running ? (d[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // parabolic interpolation for sub-sample accuracy
  const x0 = tau > 1 ? cmnd[tau - 1] : cmnd[tau];
  const x2 = tau < maxTau ? cmnd[tau + 1] : cmnd[tau];
  const denom = 2 * (2 * cmnd[tau] - x2 - x0);
  const better = denom ? tau + (x2 - x0) / denom : tau;
  return sampleRate / better;
}

/** Nearest equal-tempered note for a frequency. */
export function noteFromFrequency(freq, a4 = 440) {
  const midiFloat = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  return { midi, cents, name: SHARP_NAMES[mod12(midi)], octave: Math.floor(midi / 12) - 1, freq };
}

/** Frequency of a MIDI note at the given reference pitch. */
export function midiToFrequency(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export class Tuner {
  constructor({ onPitch, a4 = 440 } = {}) {
    this.onPitch = onPitch;
    this.a4 = a4;
    this.ctx = null;
    this.stream = null;
    this.timer = null;
  }

  get running() { return !!this.timer; }

  async startMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the microphone.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.ctx = new AudioContext();
    this.connect(this.ctx.createMediaStreamSource(this.stream));
  }

  /** Test/demo source: a steady oscillator instead of the microphone. */
  startOscillator(freq) {
    this.ctx = new AudioContext();
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.4;
    osc.connect(gain);
    osc.start();
    this.osc = osc;
    this.connect(gain);
  }

  connect(source) {
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    source.connect(this.analyser);
    const buf = new Float32Array(this.analyser.fftSize);
    const history = [];
    this.timer = setInterval(() => {
      this.analyser.getFloatTimeDomainData(buf);
      const f = detectPitch(buf, this.ctx.sampleRate);
      if (!f) { history.length = 0; this.onPitch?.(null); return; }
      // median of the last few readings smooths the display
      history.push(f);
      if (history.length > 5) history.shift();
      const med = [...history].sort((a, b) => a - b)[Math.floor(history.length / 2)];
      this.onPitch?.(noteFromFrequency(med, this.a4));
    }, 60);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.osc?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.stream = null;
    this.osc = null;
  }
}
