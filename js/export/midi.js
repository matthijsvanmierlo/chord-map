// Standard MIDI File (type 1) export, written by hand — no library needed.
import { songPrefs } from '../music/voicingPrefs.js';
import { timeline } from '../music/song.js';
import { parseChord } from '../music/chordParser.js';
import { resolveVoicing, voicingMidi } from '../music/voicingEngine.js';
import { instrumentOf } from '../music/tunings.js';
import { keySignatureCount } from '../music/theory.js';
import { arrangeBand, GM_DRUMS } from '../data/grooves.js';

export const PPQ = 480;

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const text = (s) => [...new TextEncoder().encode(String(s).slice(0, 120))];

/** events: [{tick, bytes:number[], order}] → MTrk chunk bytes */
function trackChunk(events) {
  const sorted = events.map((e, i) => ({ ...e, i })).sort((a, b) => a.tick - b.tick || a.order - b.order || a.i - b.i);
  const body = [];
  let last = 0;
  for (const e of sorted) {
    body.push(...vlq(Math.max(0, Math.round(e.tick - last))), ...e.bytes);
    last = Math.max(last, Math.round(e.tick));
  }
  body.push(0, 0xff, 0x2f, 0x00); // end of track
  return [...text('MTrk').slice(0, 4), ...u32(body.length), ...body];
}

function noteEvents(channel, notes) {
  const ev = [];
  for (const n of notes) {
    ev.push({ tick: n.tick, order: 1, bytes: [0x90 | channel, n.midi & 127, Math.max(1, Math.min(127, n.vel))] });
    ev.push({ tick: n.tick + Math.max(1, n.dur), order: 0, bytes: [0x80 | channel, n.midi & 127, 0] });
  }
  return ev;
}

/** Chord notes (strummed) for a song as [{tick, dur, midi, vel}] plus the tick length of one beat. */
export function chordNotes(song, tuning, { smooth = false, prefs = songPrefs(song) } = {}) {
  const den = song.timeSignature[1];
  const beatTicks = (PPQ * 4) / den;
  const notes = [];
  let prev = null;
  for (const ev of timeline(song).events) {
    const c = parseChord(ev.symbol);
    if (!c || c.nc) continue;
    const v = resolveVoicing(ev.symbol, tuning, { capo: song.capo || 0, voicingId: ev.voicingId, previous: prev, smooth, prefs });
    if (!v) continue;
    prev = v;
    const start = ev.start * beatTicks;
    const len = ev.beats * beatTicks;
    voicingMidi(v, tuning, song.capo || 0).forEach((m, k) => {
      const t = start + k * 12; // strum: 12 ticks between strings
      notes.push({ tick: t, dur: Math.max(30, start + len - t - 20), midi: m, vel: k === 0 ? 84 : 72 });
    });
  }
  return { notes, beatTicks };
}

/**
 * Build a .mid file.
 * @param {object} song
 * @param {object} tuning
 * @param {{smooth?:boolean, prefs?:object, band?:boolean, extraTracks?:{name:string, channel:number, program:number|null, notes:{tick:number,dur:number,midi:number,vel:number}[]}[]}} opts
 * @returns {Uint8Array}
 */
export function toMidi(song, tuning, opts = {}) {
  const [num, den] = song.timeSignature;
  const quarterBpm = (song.tempo * 4) / den;
  const mpq = Math.round(60000000 / quarterBpm);
  let sf = keySignatureCount(song.key.tonic, song.key.mode);
  if (sf > 7) sf -= 12;
  if (sf < -7) sf += 12;
  const minor = ['minor', 'harmonicMinor'].includes(song.key.mode) ? 1 : 0;
  const titleBytes = text(song.title);

  const meta = [
    { tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(titleBytes.length), ...titleBytes] },
    { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (mpq >> 16) & 255, (mpq >> 8) & 255, mpq & 255] },
    { tick: 0, order: 0, bytes: [0xff, 0x58, 0x04, num, Math.round(Math.log2(den)), 24, 8] },
    { tick: 0, order: 0, bytes: [0xff, 0x59, 0x02, sf & 255, minor] },
  ];

  const isUke = instrumentOf(tuning) === 'ukulele';
  const { notes } = chordNotes(song, tuning, opts);
  const name = text(isUke ? 'Ukulele' : 'Guitar');
  const chordTrack = [
    { tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(name.length), ...name] },
    { tick: 0, order: 0, bytes: [0xc0, isUke ? 24 : 25] }, // GM: nylon / steel-string guitar
    ...noteEvents(0, notes),
  ];
  const tracks = [meta, chordTrack];
  const extra = [...(opts.extraTracks || [])];
  if (opts.band !== false) {
    const beatTicks = (PPQ * 4) / den;
    const band = arrangeBand(song);
    const toTicks = (n) => ({ tick: n.start * beatTicks, dur: Math.max(20, n.dur * beatTicks), vel: Math.round(n.vel * 110) });
    if (band.bass.length) extra.push({ name: 'Bass', channel: 1, program: 33, notes: band.bass.map((n) => ({ ...toTicks(n), midi: n.midi })) });
    if (band.drums.length) extra.push({ name: 'Drums', channel: 9, program: null, notes: band.drums.map((n) => ({ ...toTicks({ ...n, dur: 0.25 }), midi: GM_DRUMS[n.drum] })) });
  }
  for (const t of extra) {
    const nm = text(t.name);
    tracks.push([
      { tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(nm.length), ...nm] },
      ...(t.program == null ? [] : [{ tick: 0, order: 0, bytes: [0xc0 | t.channel, t.program] }]),
      ...noteEvents(t.channel, t.notes),
    ]);
  }
  const header = [...text('MThd'), ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(PPQ)];
  return new Uint8Array([...header, ...tracks.flatMap(trackChunk)]);
}
