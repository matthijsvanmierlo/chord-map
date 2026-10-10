// Tap tempo: call tap() on each tap; returns the BPM (average of the last
// intervals) once there are at least two taps, else null. A pause > 2 s resets.
export function createTapTempo({ min = 30, max = 300, keep = 4 } = {}) {
  let taps = [];
  return {
    tap(now = performance.now()) {
      if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
      taps.push(now);
      if (taps.length > keep + 1) taps.shift();
      if (taps.length < 2) return null;
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      return Math.max(min, Math.min(max, Math.round(60000 / avg)));
    },
    reset() { taps = []; },
  };
}
