// Records practice time: while the player is playing a given song, time and
// tempo are tracked; each play-through ≥ 5 s becomes a practice-log entry.
import { player } from './player.js';
import { logPractice } from '../state/store.js';

const MIN_SECONDS = 5;

/**
 * @param {() => {ref:string, detail?:string}|null} getRef  what is being practised (song id or preset:id)
 * @returns {() => void} stop tracking (logs an in-progress session)
 */
export function trackPracticeSessions(getRef) {
  let start = null;
  let tempoStart = null;
  let info = null;
  const finish = () => {
    if (start === null) return;
    const seconds = Math.round((performance.now() - start) / 1000);
    if (seconds >= MIN_SECONDS && info) {
      logPractice({ kind: 'practice', ref: info.ref, detail: info.detail, seconds, tempoStart, tempoEnd: player.tempo ?? tempoStart });
    }
    start = null;
  };
  const off = player.on((type, d) => {
    if (type !== 'state' || d.metronome) return;
    if (d.playing) {
      info = getRef();
      if (!info) return;
      start = performance.now();
      tempoStart = player.tempo;
    } else finish();
  });
  return () => { finish(); off(); };
}
