// Instrument tunings. Strings are listed in PHYSICAL order: the string nearest
// your chin first (low E on guitar; the re-entrant G on ukulele).
import { midiOf } from './theory.js';

/** @typedef {{id:string,name:string,instrument:'guitar'|'ukulele'|'other',strings:string[],frets:number,reentrant?:boolean,custom?:boolean}} Tuning */

/** @type {Tuning[]} */
export const BUILTIN_TUNINGS = [
  { id: 'guitar-standard', name: 'Guitar — Standard (EADGBE)', instrument: 'guitar', strings: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], frets: 15 },
  { id: 'guitar-drop-d', name: 'Guitar — Drop D (DADGBE)', instrument: 'guitar', strings: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'], frets: 15 },
  { id: 'guitar-half-down', name: 'Guitar — Half-step down (E♭)', instrument: 'guitar', strings: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'], frets: 15 },
  { id: 'guitar-dadgad', name: 'Guitar — DADGAD', instrument: 'guitar', strings: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'], frets: 15 },
  { id: 'guitar-open-g', name: 'Guitar — Open G (DGDGBD)', instrument: 'guitar', strings: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'], frets: 15 },
  { id: 'guitar-open-d', name: 'Guitar — Open D (DADF♯AD)', instrument: 'guitar', strings: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'], frets: 15 },
  { id: 'guitar-open-e', name: 'Guitar — Open E (EBEG♯BE)', instrument: 'guitar', strings: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'], frets: 15 },
  { id: 'ukulele-standard', name: 'Ukulele — Standard (gCEA, high G)', instrument: 'ukulele', strings: ['G4', 'C4', 'E4', 'A4'], frets: 12, reentrant: true },
  { id: 'ukulele-low-g', name: 'Ukulele — Low G (GCEA)', instrument: 'ukulele', strings: ['G3', 'C4', 'E4', 'A4'], frets: 12 },
  { id: 'ukulele-d', name: 'Ukulele — D tuning (aDF♯B)', instrument: 'ukulele', strings: ['A4', 'D4', 'F#4', 'B4'], frets: 12, reentrant: true },
  { id: 'ukulele-baritone', name: 'Ukulele — Baritone (DGBE)', instrument: 'ukulele', strings: ['D3', 'G3', 'B3', 'E4'], frets: 15 },
];

let customTunings = [];

/** Install user-defined tunings (from settings). */
export function setCustomTunings(list) {
  customTunings = (Array.isArray(list) ? list : []).filter(validTuning).map((t) => ({ ...t, custom: true }));
}

export function allTunings() {
  return [...BUILTIN_TUNINGS, ...customTunings];
}

export function getTuning(id) {
  return allTunings().find((t) => t.id === id) || BUILTIN_TUNINGS[0];
}

export function validTuning(t) {
  return t && typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.strings)
    && t.strings.length >= 3 && t.strings.length <= 8 && t.strings.every((s) => midiOf(s) !== null);
}

/** MIDI numbers of open strings (+capo). */
export function tuningMidi(tuning, capo = 0) {
  return tuning.strings.map((s) => midiOf(s) + capo);
}

/** Re-entrant = some string is lower in pitch than the one before it (e.g. high-G uke). */
export function isReentrant(tuning) {
  const m = tuningMidi(tuning);
  return m.some((v, i) => i > 0 && v < m[i - 1]);
}

export function instrumentOf(tuning) {
  return tuning.instrument || (tuning.strings.length <= 4 ? 'ukulele' : 'guitar');
}

/** Guitar music is written an octave above sounding pitch (treble 8vb). */
export function writtenOctaveShift(tuning) {
  const low = Math.min(...tuningMidi(tuning));
  return low < 55 ? 12 : 0; // anything reaching below G3 is notated an octave up
}
