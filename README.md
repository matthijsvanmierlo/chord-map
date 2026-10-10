# Fretboard Progressions

A local-first web app for **exploring, building and practising chord progressions** on guitar and ukulele: jazz, blues, classical, folk, country, pop, rock, Latin, soul/gospel and modal/world styles.

- **97 curated progressions**, each with a description, an explanation of why it works, a practice tip and example songs. Transpose any of them to any key.
- **Chord diagrams, standard notation and TAB** for every chord, generated for your instrument: standard and alternate guitar tunings, ukulele (high-G, low-G, D, baritone) and any custom tuning you define. Capo is supported.
- **Editor**: sections, repeats, an arrangement (play order), beats per chord, a diatonic chord palette, typed chord charts (`Am | F | C G | Dm7 . . G7`), Roman-numeral entry, transposition, shape selection and undo/redo.
- **Practice mode**: synth playback with strum and picking patterns, a metronome, count-in, section looping, a speed trainer, and large current/next chord diagrams. The bar being played is highlighted in the notation.
- **Export**: Print / PDF, PNG, SVG, MusicXML (MuseScore, Guitar Pro and others), ChordPro, and single-song JSON. **Full backup and restore** as one JSON file lets you move all your data to another browser.
- **Private and offline**: no accounts and no server. Data stays in your browser's `localStorage`, and the app works offline once installed as a PWA.
- **Accessible**: keyboard operable, screen-reader labels on every diagram and score, live announcements, visible focus, light/dark themes and reduced-motion support.

## Run it locally

The app is plain HTML, CSS and JavaScript (ES modules). There is no build step, but ES modules need to be served over HTTP:

```bash
cd guitarchords
python3 -m http.server 8000
# open http://localhost:8000
```

Any static server works, for example `npx serve` or the VS Code "Live Server" extension.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (default branch `main`).
2. Go to **Settings → Pages → Build and deployment → Source**, choose **Deploy from a branch**, and select **main** / **(root)**.
3. Before pushing, run the tests locally (`scripts/run-tests.sh` and `scripts/run-e2e.sh`) and `python3 scripts/update-sw.py`.

All paths are relative and routing uses the URL hash (`#/explore`), so the app works from a sub-path such as `https://you.github.io/guitarchords/` without any rewrite rules. `.nojekyll` stops Pages from processing the files.

## Third-party libraries (CDN + local copies)

| Library | Purpose |
|---|---|
| Bootstrap 5.3.8 and Bootstrap Icons 1.13.1 | layout, components, theming, icons |
| VexFlow 4.2.5 | standard notation and TAB rendering |
| Tone.js 15.1.22 | synth playback, transport and metronome |
| SortableJS 1.15.6 | drag-and-drop reordering (keyboard alternatives are always provided) |

`js/vendor-loader.js` loads each library from jsDelivr, pinned to an exact version and checked with a Subresource Integrity hash. If the CDN fails, it falls back to the copy in `vendor/`. **Settings → Load libraries from this site only** skips the CDN entirely.

To upgrade a library, edit `vendor/manifest.json` and then run:

```bash
python3 scripts/fetch-vendor.py   # downloads into vendor/ and regenerates js/vendor-manifest.js (URLs + SRI)
python3 scripts/update-sw.py      # refreshes the offline cache list/version in sw.js
```

Chord theory, voicing generation, chord diagrams, MusicXML/ChordPro export and image export are implemented in this project and have no dependencies.

## Your data

- Everything is saved automatically to `localStorage` under the key `fretboard-progressions:v1`. Browsers can clear this storage, so **export a backup regularly** from **Settings → Backup**. The app reminds you if you haven't backed up in 30 days.
- **Import** accepts a full backup, a song or song-list JSON file, a ChordPro file (`.cho`) or a plain-text chord chart. Before anything is written you get a preview, then you choose to merge (keep the newest copy, or keep both) or to replace everything. Invalid files never touch your existing data.
- Backup format (`schemaVersion: 1`):

```jsonc
{
  "app": "fretboard-progressions", "kind": "backup", "schemaVersion": 1, "exportedAt": "…",
  "settings": { "theme": "auto", "instrumentId": "guitar-standard", "customTunings": [], "favorites": [], … },
  "songs": [{
    "id": "…", "title": "…", "key": { "tonic": "G", "mode": "major" }, "timeSignature": [4, 4],
    "tempo": 90, "capo": 0, "instrumentId": "guitar-standard", "strumPatternId": "folk",
    "sections": [{ "id": "…", "name": "Verse", "repeat": 1,
      "bars": [{ "id": "…", "chords": [{ "symbol": "Am7", "beats": 2, "voicingId": null }] }] }],
    "form": [], "createdAt": "…", "updatedAt": "…"
  }]
}
```

Future format changes add a migration step in `js/state/schema.js` (`migrate()`), so old backups keep importing.

## Project structure

```
index.html              app shell (navbar, skip link, live region)
css/app.css, print.css  theme layer on Bootstrap; sheet-music print layout
js/main.js              boot: libraries → store → router → service worker
js/router.js            hash router, focus management, page titles
js/state/               store (pub/sub + localStorage), schema/validation/migrations, undo history
js/music/               theory, chord parser, Roman numerals and bar-text grammar, tunings,
                        voicing engine + curated/movable shapes, song helpers, durations
js/data/                progression presets by style, strum patterns
js/render/              chord diagrams (SVG), VexFlow notation, lead sheet
js/audio/player.js      Tone.js playback and practice engine
js/export/              backup, ChordPro, MusicXML, SVG/PNG
js/ui/                  dialogs/toasts, chord editor panel, importer, export menu
js/views/               home, explore, progression, editor, practice, songs, chords, settings, help, print
vendor/                 local copies of third-party libraries (+ manifest, notices)
scripts/                fetch-vendor.py, update-sw.py, run-tests.sh, run-e2e.sh, test-server.py
tests/                  in-browser unit tests (index.html), end-to-end tests (e2e.html), seed.html fixture
```

## Tests

```bash
scripts/run-tests.sh   # unit tests in headless Chromium/Chrome
scripts/run-e2e.sh     # end-to-end: drives the real app (edit, undo, practice playback, import…)
```

You can also open the test pages in a normal browser while a local server is running: `http://localhost:8000/tests/` (unit) and `http://localhost:8000/tests/e2e.html` (end-to-end). The end-to-end page clears that site's saved data.

The unit tests cover:

- chord parsing (about 60 symbol forms)
- Roman numerals in all keys
- spelling and transposition
- the voicing engine: every curated shape is checked, and every common chord in every key must be playable on every built-in tuning
- every preset parsing and being playable on guitar and ukulele
- schema sanitising and migration
- backup round-trip
- ChordPro round-trip
- MusicXML well-formedness and bar durations

`tests/seed.html?go=song/demo-song` loads a demo song for manual testing.

## Notes and conventions

- **Roman numerals** are always relative to the major scale of the tonic, with explicit accidentals (pop/jazz convention). In A minor, `i bVI bIII bVII` means Am F C G.
- **Tempo** counts beats of the time signature's denominator, so 6/8 at 180 is 180 eighth notes per minute.
- **Guitar notation** is written an octave above sounding pitch (treble clef with an 8 below). Ukulele notation is written at pitch. With a capo, chord shapes are shown relative to the capo, while notation and playback are at concert pitch.
- The **service worker** registers only on non-localhost origins, so it doesn't cache files during development. Run `python3 scripts/update-sw.py` before deploying so returning visitors get the new version.

## License

MIT (see `LICENSE`). Third-party library licenses are listed in `vendor/THIRD_PARTY_NOTICES.md`.
