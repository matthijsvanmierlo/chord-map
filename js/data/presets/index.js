import jazz from './jazz.js';
import blues from './blues.js';
import classical from './classical.js';
import folk from './folk.js';
import country from './country.js';
import pop from './pop.js';
import rock from './rock.js';
import latin from './latin.js';
import soul from './soul.js';
import world from './world.js';

export const STYLES = [
  { id: 'jazz', name: 'Jazz', icon: 'music-note-beamed', blurb: 'ii–V–I cadences, turnarounds, Rhythm Changes and the jazz blues.' },
  { id: 'blues', name: 'Blues', icon: 'soundwave', blurb: '12-bar, 8-bar and 16-bar forms, shuffles, slow blues and minor blues.' },
  { id: 'classical', name: 'Classical', icon: 'music-note', blurb: 'Cadences, ground basses and sequences from the Renaissance to the Classical era.' },
  { id: 'folk', name: 'Folk', icon: 'tree', blurb: 'Three-chord songs, waltzes, modal tunes and fingerpicking patterns.' },
  { id: 'country', name: 'Country', icon: 'sun', blurb: 'Boom-chick rhythm, Nashville numbers, bluegrass and ragtime changes.' },
  { id: 'pop', name: 'Pop', icon: 'stars', blurb: 'The four-chord loops and borrowed-chord tricks behind modern hits.' },
  { id: 'rock', name: 'Rock', icon: 'lightning-charge', blurb: 'Power chords, Mixolydian riffs and Aeolian minor loops.' },
  { id: 'latin', name: 'Latin', icon: 'vinyl', blurb: 'Bossa nova, son montuno, rumba flamenca, tango and guajira.' },
  { id: 'soul', name: 'Soul & Gospel', icon: 'mic', blurb: 'Gospel bass walks, Motown, funk, reggae and neo-soul colours.' },
  { id: 'world', name: 'World & Modal', icon: 'globe2', blurb: 'Flamenco, Celtic, modal vamps and the Hawaiian ukulele vamp.' }
];

export const PRESETS = [
  ...jazz,
  ...blues,
  ...classical,
  ...folk,
  ...country,
  ...pop,
  ...rock,
  ...latin,
  ...soul,
  ...world
];

export function getPreset(id) {
  return PRESETS.find(p => p.id === id) || null;
}
