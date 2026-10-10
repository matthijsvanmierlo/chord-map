// Stage mode: huge current chord + lyric, next chord, fullscreen, screen kept
// awake, and page-turner pedal support. Works for one song or a whole setlist.
import { getSong, getSetlist, getSettings } from '../state/store.js';
import { timeline } from '../music/song.js';
import { getTuning } from '../music/tunings.js';
import { resolveVoicing } from '../music/voicingEngine.js';
import { songPrefs } from '../music/voicingPrefs.js';
import { parseChord, describeChord } from '../music/chordParser.js';
import { chordDiagramSVG } from '../render/chordDiagram.js';
import { chordLabel } from '../render/notation.js';
import { splitLyric } from '../music/lyrics.js';
import { player } from '../audio/player.js';
import { trackPracticeSessions } from '../audio/sessionLog.js';
import { escapeHtml, icon, on, announce } from '../ui/dom.js';
import { keyLabel } from '../music/theory.js';
import { notFound } from './shared.js';

const NEXT_KEYS = ['ArrowRight', 'PageDown', 'Enter', 'ArrowDown'];
const PREV_KEYS = ['ArrowLeft', 'PageUp', 'ArrowUp', 'Backspace'];

export default {
  title: () => 'Stage mode',
  render(el, { params }) {
    const setlist = params.setlistId ? getSetlist(params.setlistId) : null;
    const songs = setlist ? setlist.songIds.map(getSong).filter(Boolean) : [getSong(params.id)].filter(Boolean);
    if (!songs.length) {
      el.innerHTML = notFound('display', 'Nothing to show', setlist ? 'This setlist has no songs yet.' : 'That song is not available in this browser.', '<a class="btn btn-primary" href="#/songs">My Songs</a>');
      return null;
    }
    const backHref = setlist ? `#/setlist/${setlist.id}` : `#/practice/${songs[0].id}`;
    let songIdx = 0;
    let idx = 0;
    let events = [];
    let song, tuning;
    let wakeLock = null;

    document.body.classList.add('stage-active');
    el.innerHTML = `
      <div class="stage" id="stage">
        <div class="stage-top">
          <a class="btn btn-outline-light btn-sm" href="${backHref}" id="stage-exit" aria-keyshortcuts="Escape">${icon('x-lg')} Exit</a>
          <div class="stage-title">
            <h1 class="h5 mb-0" id="st-title"></h1>
            <div class="small opacity-75" id="st-meta"></div>
          </div>
          <div class="d-flex gap-2 flex-wrap justify-content-end">
            ${setlist ? `<button class="btn btn-outline-light btn-sm" type="button" data-act="prev-song" aria-label="Previous song">${icon('skip-backward-fill')}</button>
            <button class="btn btn-outline-light btn-sm" type="button" data-act="next-song" aria-label="Next song">${icon('skip-forward-fill')}</button>` : ''}
            <button class="btn btn-light btn-sm" type="button" data-act="play" aria-keyshortcuts="Space">${icon('play-fill')} <span>Play</span></button>
            <button class="btn btn-outline-light btn-sm" type="button" data-act="fullscreen" aria-keyshortcuts="F">${icon('arrows-fullscreen')} <span>Full screen</span></button>
          </div>
        </div>
        <div class="stage-main">
          <div class="stage-now">
            <div class="stage-chord" id="st-chord" aria-hidden="true"></div>
            <div class="stage-diagram" id="st-diagram"></div>
          </div>
          <p class="stage-lyric" id="st-lyric"></p>
          <div class="stage-next"><span class="opacity-75">Next</span> <strong id="st-next"></strong></div>
        </div>
        <div class="stage-bottom">
          <button class="btn btn-outline-light" type="button" data-act="prev" aria-label="Previous chord">${icon('chevron-left')}</button>
          <div class="text-center small"><div id="st-pos"></div><div class="opacity-75">Pedal / ← → / PageUp PageDown to step · Space play · F full screen · Esc exit</div></div>
          <button class="btn btn-outline-light" type="button" data-act="next" aria-label="Next chord">${icon('chevron-right')}</button>
        </div>
        <div class="visually-hidden" aria-live="polite" id="st-live"></div>
      </div>`;
    const $ = (s) => el.querySelector(s);

    function loadSong(i) {
      player.stop();
      songIdx = i;
      song = songs[i];
      tuning = getTuning(song.instrumentId);
      events = timeline(song).events;
      idx = 0;
      $('#st-title').textContent = `${setlist ? `${i + 1}/${songs.length} · ` : ''}${song.title}`;
      $('#st-meta').textContent = [keyLabel(song.key), `${song.tempo} bpm`, song.capo ? `Capo ${song.capo}` : '', tuning.name].filter(Boolean).join(' · ');
      draw(true);
    }

    function lyricFor(ev) {
      const bar = song.sections.find((s) => s.id === ev.sectionId)?.bars[ev.barIndex];
      if (!bar?.lyric) return '';
      return splitLyric(bar.lyric, bar.chords.length)[ev.chordIndex] || '';
    }

    function draw(speak = false) {
      const ev = events[idx];
      const next = events[idx + 1];
      const display = getSettings().chordDisplay === 'roman' ? 'roman' : 'chords';
      if (!ev) { $('#st-chord').textContent = '—'; return; }
      const c = parseChord(ev.symbol);
      $('#st-chord').textContent = chordLabel(ev.symbol, song.key, display);
      $('#st-diagram').innerHTML = c && !c.nc
        ? chordDiagramSVG(ev.symbol, resolveVoicing(ev.symbol, tuning, { capo: song.capo, voicingId: ev.voicingId, prefs: songPrefs(song) }), tuning, { width: 220, leftHanded: getSettings().leftHanded, capo: song.capo, showName: false })
        : '';
      $('#st-lyric').textContent = lyricFor(ev);
      $('#st-next').textContent = next ? chordLabel(next.symbol, song.key, display) : (setlist && songIdx < songs.length - 1 ? `Next song: ${songs[songIdx + 1].title}` : 'End');
      $('#st-pos').textContent = `${ev.sectionName} · bar ${ev.bar + 1} of ${timeline(song).bars}`;
      if (speak && getSettings().announceChords) $('#st-live').textContent = `${describeChord(ev.symbol)}${lyricFor(ev) ? `: ${lyricFor(ev)}` : ''}`;
    }

    function step(d) {
      if (player.playing) return;
      const n = idx + d;
      if (n >= events.length) {
        if (setlist && songIdx < songs.length - 1) { loadSong(songIdx + 1); announce(`Next song: ${song.title}`); }
        return;
      }
      if (n < 0) {
        if (setlist && songIdx > 0) { loadSong(songIdx - 1); idx = events.length - 1; draw(true); }
        return;
      }
      idx = n;
      draw(true);
    }

    async function togglePlay() {
      if (player.playing) { player.stop(); return; }
      const s = getSettings();
      if (await player.load(song, tuning, { loop: false, countIn: s.countIn, metronome: s.metronome, subdivision: s.metronomeSubdivision, smooth: s.smoothVoicing })) player.play();
    }

    async function toggleFullscreen() {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await $('#stage').requestFullscreen();
      } catch { /* not allowed (e.g. iframe) */ }
    }

    async function keepAwake() {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen');
      } catch { wakeLock = null; }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') keepAwake(); };
    document.addEventListener('visibilitychange', onVisible);
    keepAwake();

    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (NEXT_KEYS.includes(e.key)) { e.preventDefault(); step(1); }
      else if (PREV_KEYS.includes(e.key)) { e.preventDefault(); step(-1); }
      else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if (e.key === 'Escape' && !document.fullscreenElement) location.hash = backHref;
    };
    document.addEventListener('keydown', onKey);
    const playBtn = $('[data-act="play"]');
    const fsBtn = $('[data-act="fullscreen"]');
    const onFs = () => { fsBtn.innerHTML = `${icon(document.fullscreenElement ? 'fullscreen-exit' : 'arrows-fullscreen')} <span>${document.fullscreenElement ? 'Exit full screen' : 'Full screen'}</span>`; };
    document.addEventListener('fullscreenchange', onFs);

    const offs = [
      trackPracticeSessions(() => ({ ref: song.id, detail: song.title })),
      player.on((type, d) => {
        if (type === 'state') playBtn.innerHTML = `${icon(d.playing ? 'stop-fill' : 'play-fill')} <span>${d.playing ? 'Stop' : 'Play'}</span>`;
        if (type === 'chord') { idx = d.index; draw(true); }
      }),
      on(el, 'click', '[data-act]', (e, t) => {
        const a = t.dataset.act;
        if (a === 'next') step(1);
        if (a === 'prev') step(-1);
        if (a === 'play') togglePlay();
        if (a === 'fullscreen') toggleFullscreen();
        if (a === 'next-song' && songIdx < songs.length - 1) loadSong(songIdx + 1);
        if (a === 'prev-song' && songIdx > 0) loadSong(songIdx - 1);
      }),
    ];
    loadSong(0);
    $('#stage-exit').focus();
    return () => {
      offs.forEach((o) => o());
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('fullscreenchange', onFs);
      document.body.classList.remove('stage-active');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      wakeLock?.release().catch(() => {});
      player.stop();
    };
  },
};
