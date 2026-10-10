import { describe, test, eq, ok } from './harness.js';
import { practiceSummary, timeByRef, tempoHistory, drillStats, quizAccuracy, pairKey, rateCard, dueCards, formatDuration, dayKey } from '../js/train/stats.js';
import { detectPitch, noteFromFrequency } from '../js/audio/tuner.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
const NOW = new Date(2026, 9, 10, 18); // 10 Oct 2026, 18:00 local

describe('practice statistics', () => {
  const log = [
    { kind: 'practice', ref: 's1', date: at(2026, 10, 10), seconds: 600, tempoStart: 80, tempoEnd: 90 },
    { kind: 'practice', ref: 's1', date: at(2026, 10, 9), seconds: 300, tempoStart: 70, tempoEnd: 80 },
    { kind: 'drill', ref: 'C|G', date: at(2026, 10, 8), seconds: 60, score: 30 },
    { kind: 'drill', ref: 'C|G', date: at(2026, 10, 9), seconds: 30, score: 20 },
    { kind: 'quiz', ref: 'quality', date: at(2026, 10, 9), seconds: 120, score: 7, total: 10 },
    { kind: 'practice', ref: 's2', date: at(2026, 10, 1), seconds: 1200 },
  ];
  test('summary: totals, week, streak, daily', () => {
    const s = practiceSummary(log, { seconds: 100, entries: 2 }, NOW);
    eq(s.totalSeconds, 100 + 600 + 300 + 60 + 30 + 120 + 1200);
    eq(s.sessions, 8);
    eq(s.weekSeconds, 600 + 300 + 60 + 30 + 120);
    eq(s.streak, 3); // 8, 9, 10 Oct
    eq(s.daily.length, 14);
    eq(s.daily[13].key, dayKey(NOW));
    eq(s.daily[13].seconds, 600);
  });
  test('streak counts from yesterday when nothing yet today', () => {
    eq(practiceSummary([{ kind: 'practice', date: at(2026, 10, 9), seconds: 5 }], {}, NOW).streak, 1);
    eq(practiceSummary([{ kind: 'practice', date: at(2026, 10, 7), seconds: 5 }], {}, NOW).streak, 0);
  });
  test('time by ref, tempo history', () => {
    eq(timeByRef(log, { byRef: { s3: 50 } }).map((r) => r.ref), ['s2', 's1', 's3']);
    eq(tempoHistory(log, 's1').map((h) => h.tempo), [80, 90]);
  });
  test('drills normalise to changes per minute', () => {
    eq(drillStats(log, 'C|G'), { runs: 2, best: 40, last: 40, history: [30, 40] });
    eq(drillStats(log, 'X|Y').best, null);
    eq(pairKey('G', 'C'), 'C|G');
  });
  test('quiz accuracy & durations', () => {
    eq(quizAccuracy(log), { quality: { correct: 7, total: 10, pct: 70 } });
    eq([formatDuration(59 * 60), formatDuration(125 * 60)], ['59 min', '2 h 5 min']);
  });
});

describe('flashcards (Leitner)', () => {
  test('rating moves cards between boxes', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    eq(rateCard(null, 'good', now).box, 2);
    eq(rateCard({ box: 5 }, 'good', now).box, 5);
    eq(rateCard({ box: 3 }, 'hard', now).box, 3);
    eq(rateCard({ box: 4 }, 'again', now).box, 1);
    eq(rateCard({ box: 3 }, 'good', now).due, '2026-10-17T12:00:00.000Z'); // box 4 → 7 days
  });
  test('due cards: unseen and overdue, oldest first', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    const state = { a: { box: 2, due: '2026-10-09T00:00:00.000Z' }, b: { box: 3, due: '2026-10-20T00:00:00.000Z' }, c: { box: 1, due: '2026-10-01T00:00:00.000Z' } };
    eq(dueCards(['a', 'b', 'c', 'd'], state, now), ['d', 'c', 'a']);
  });
});

describe('tuner pitch detection', () => {
  const synth = (freq, sr = 48000, n = 4096, wave = 'saw') => {
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ph = (i * freq / sr) % 1;
      b[i] = wave === 'sine' ? 0.5 * Math.sin(2 * Math.PI * ph) : 0.4 * (2 * ph - 1) + 0.2 * Math.sin(4 * Math.PI * ph);
    }
    return b;
  };
  test('detects guitar open strings within 3 cents', () => {
    for (const [name, f] of [['E2', 82.41], ['A2', 110], ['D3', 146.83], ['G3', 196], ['B3', 246.94], ['E4', 329.63], ['A4 (uke)', 440]]) {
      for (const wave of ['sine', 'saw']) {
        const got = detectPitch(synth(f, 48000, 4096, wave), 48000);
        ok(got, `${name} ${wave}: no pitch`);
        const cents = Math.abs(1200 * Math.log2(got / f));
        ok(cents < 3, `${name} ${wave}: ${got.toFixed(2)} Hz (${cents.toFixed(1)} c off)`);
      }
    }
  });
  test('silence returns null', () => eq(detectPitch(new Float32Array(4096), 48000), null));
  test('note naming and cents', () => {
    eq(noteFromFrequency(440), { midi: 69, cents: 0, name: 'A', octave: 4, freq: 440 });
    const n = noteFromFrequency(110 * Math.pow(2, 10 / 1200));
    eq([n.name, n.octave, n.cents], ['A', 2, 10]);
    eq(noteFromFrequency(432, 432).cents, 0);
  });
});
