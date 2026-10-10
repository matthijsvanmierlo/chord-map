// Practice mode: big current/next chord, synced notation highlight, tempo
// control, count-in, loop by section, metronome-only and a speed trainer.
import { songPrefs } from '../music/voicingPrefs.js';
import { getSong, getState, getSettings, updateSettings, updateMeta, createSong, subscribe, saveSong } from '../state/store.js';
import { GROOVES, getGroove } from '../data/grooves.js';
import { createTapTempo } from '../ui/tapTempo.js';
import { mountFretboardPanel } from '../ui/fretboardPanel.js';
import { trackPracticeSessions } from '../audio/sessionLog.js';
import { navigate } from '../router.js';
import { getPreset } from '../data/presets/index.js';
import { presetToSong, timeline, playOrder } from '../music/song.js';
import { getTuning } from '../music/tunings.js';
import { resolveVoicing } from '../music/voicingEngine.js';
import { parseChord, describeChord } from '../music/chordParser.js';
import { chordDiagramSVG } from '../render/chordDiagram.js';
import { renderLeadSheet } from '../render/leadSheet.js';
import { chordLabel } from '../render/notation.js';
import { player } from '../audio/player.js';
import { getPattern, patternLabel } from '../data/strumPatterns.js';
import { escapeHtml, icon, on, announce, formatDate, debounce } from '../ui/dom.js';
import { toast } from '../ui/feedback.js';
import { emptyState, notFound, startActionsHTML, mixerHTML, subdivisionOptions } from './shared.js';
import { keyLabel } from '../music/theory.js';
import { practiceSummary, timeByRef, tempoHistory, drillStats, quizAccuracy, formatDuration } from '../train/stats.js';
import { columnChart, lineChart, sparklineSVG } from '../render/charts.js';
import { prettyChord as prettyChordName } from '../music/chordParser.js';

function pickerHTML() {
  const st = getState();
  const songs = [...st.songs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const sum = practiceSummary(st.practiceLog, st.practiceTotals);
  const top = timeByRef(st.practiceLog, st.practiceTotals).slice(0, 5);
  const refName = (ref) => (ref.startsWith('preset:') ? getPreset(ref.slice(7))?.name : getSong(ref)?.title) || 'Deleted song';
  const drills = [...new Set(st.practiceLog.filter((e) => e.kind === 'drill').map((e) => e.ref))]
    .map((ref) => ({ ref, ...drillStats(st.practiceLog, ref) })).sort((a, b) => b.best - a.best).slice(0, 5);
  const quiz = quizAccuracy(st.practiceLog);
  const tempoSongs = [...new Set(st.practiceLog.filter((e) => e.kind === 'practice' && e.tempoEnd).map((e) => e.ref))];
  const hasData = sum.sessions > 0;
  return `<h1 class="page-title mb-1">Practice</h1>
    <p class="lead-soft">Your progress, then pick something to practise. You can also practise any progression straight from Explore.</p>
    ${hasData ? `
    <section aria-labelledby="prog-h" class="mb-4">
      <h2 class="visually-hidden" id="prog-h">Your progress</h2>
      <div class="stat-tiles mb-3">
        <div class="stat-tile"><div class="stat-label">This week</div><div class="stat-value">${escapeHtml(formatDuration(sum.weekSeconds))}</div></div>
        <div class="stat-tile"><div class="stat-label">Day streak</div><div class="stat-value">${sum.streak}</div></div>
        <div class="stat-tile"><div class="stat-label">Total practice</div><div class="stat-value">${escapeHtml(formatDuration(sum.totalSeconds))}</div></div>
        <div class="stat-tile"><div class="stat-label">Sessions</div><div class="stat-value">${sum.sessions.toLocaleString()}</div></div>
      </div>
      <div class="row g-3">
        <div class="col-lg-7"><div class="surface p-3 h-100">
          <h3 class="h6 mb-1">Minutes practised per day</h3>
          <p class="small text-body-secondary mb-2">Last 14 days · songs, drills, ear training and flashcards</p>
          <div id="chart-daily"></div>
        </div></div>
        <div class="col-lg-5"><div class="surface p-3 h-100">
          <h3 class="h6">Most practised</h3>
          ${top.length ? `<ol class="mb-3 small">${top.map((t) => `<li>${t.ref.startsWith('preset:') ? escapeHtml(refName(t.ref)) : `<a href="#/practice/${escapeHtml(t.ref)}">${escapeHtml(refName(t.ref))}</a>`} <span class="text-body-secondary">— ${escapeHtml(formatDuration(t.seconds))}</span></li>`).join('')}</ol>` : '<p class="small text-body-secondary">Play a song in Practice to start tracking.</p>'}
          ${drills.length ? `<h3 class="h6">Chord-change bests <span class="small text-body-secondary fw-normal">(per minute)</span></h3>
            <ul class="list-unstyled small mb-3">${drills.map((d) => `<li class="d-flex justify-content-between align-items-center gap-2"><span>${escapeHtml(d.ref.split('|').map(prettyChordName).join(' ⇄ '))}</span><span class="d-flex align-items-center gap-2">${sparklineSVG(d.history.slice(-12), { width: 70, height: 20, label: `Trend: ${d.history.slice(-12).join(', ')}` })}<strong>${d.best}</strong></span></li>`).join('')}</ul>` : ''}
          ${Object.keys(quiz).length ? `<h3 class="h6">Ear training</h3><ul class="list-unstyled small mb-0">${Object.entries(quiz).map(([m, r]) => `<li>${escapeHtml({ quality: 'Chord quality', progression: 'Progressions', cadence: 'Cadences' }[m] || m)}: <strong>${r.pct}%</strong> <span class="text-body-secondary">(${r.correct}/${r.total})</span></li>`).join('')}</ul>` : ''}
        </div></div>
        ${tempoSongs.length ? `<div class="col-12"><div class="surface p-3">
          <div class="d-flex flex-wrap gap-2 align-items-end mb-2">
            <h3 class="h6 mb-0 me-auto">Tempo reached per session</h3>
            <label class="visually-hidden" for="tempo-song">Song</label>
            <select id="tempo-song" class="form-select form-select-sm" style="width:auto">${tempoSongs.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(refName(r))}</option>`).join('')}</select>
          </div>
          <div id="chart-tempo"></div>
        </div></div>` : ''}
      </div>
    </section>` : ''}
    ${hasData ? '<h2 class="h4 mb-2">Pick a song</h2>' : ''}
    ${songs.length ? `<div class="list-group mb-4">${songs.map((s) => `
      <a class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" href="#/practice/${s.id}">
        <span><strong>${escapeHtml(s.title)}</strong> <span class="small text-body-secondary">· ${escapeHtml(keyLabel(s.key))} · ${s.tempo} bpm</span></span>
        <span class="small text-body-secondary">${formatDate(s.updatedAt)}</span>
      </a>`).join('')}</div>`
    : emptyState('music-note-list', 'No songs yet', 'Save a progression from Explore or build your own first.', startActionsHTML())}`;
}

/** Render the dashboard + picker and mount its charts. */
function renderPicker(el) {
  el.innerHTML = pickerHTML();
  const st = getState();
  const daily = el.querySelector('#chart-daily');
  if (daily) {
    const sum = practiceSummary(st.practiceLog, st.practiceTotals);
    columnChart(daily, {
      title: 'Minutes practised per day, last 14 days',
      valueLabel: 'Minutes',
      data: sum.daily.map((d) => ({
        label: d.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        short: d.date.toLocaleDateString(undefined, { day: 'numeric' }),
        value: Math.round(d.seconds / 60),
        display: `${Math.round(d.seconds / 60)} min`,
      })),
    });
  }
  const sel = el.querySelector('#tempo-song');
  const drawTempo = () => {
    const hist = tempoHistory(st.practiceLog, sel.value).slice(-20);
    lineChart(el.querySelector('#chart-tempo'), {
      title: 'Tempo reached per practice session',
      valueLabel: 'Tempo (bpm)',
      data: hist.map((h) => ({ label: new Date(h.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), value: h.tempo, display: `${h.tempo} bpm` })),
    });
  };
  if (sel) { sel.addEventListener('change', drawTempo); drawTempo(); }
}

export default {
  title: (p) => (p.id ? `Practise: ${getSong(p.id)?.title || ''}` : 'Practice'),
  render(el, { params, query }) {
    let song = null;
    let backHref = '#/songs';
    if (params.id) {
      song = getSong(params.id);
      backHref = `#/song/${params.id}`;
      if (song) updateMeta({ lastSongId: song.id });
    } else if (query.preset) {
      const p = getPreset(query.preset);
      if (p) {
        song = presetToSong(p, { tonic: query.key || p.defaultKey.tonic, instrumentId: getSettings().instrumentId });
        backHref = `#/progression/${p.id}${query.key ? `?key=${encodeURIComponent(query.key)}` : ''}`;
      }
    }
    if (!song) {
      if (params.id || query.preset) {
        el.innerHTML = notFound('question-circle', 'Not found', 'That song or progression is not available in this browser.', '<a class="btn btn-primary" href="#/practice">Choose another</a>');
        return null;
      }
      // song picker: stays live if songs change (e.g. imported in another tab)
      renderPicker(el);
      const offNew = on(el, 'click', '[data-act="new"]', () => {
        const s = createSong({ title: 'My progression', instrumentId: getSettings().instrumentId });
        navigate(`song/${s.id}`);
      });
      const offSub = subscribe((_s, reason) => { if (['songs', 'replaced', 'external', 'practice'].includes(reason)) renderPicker(el); });
      return () => { offNew(); offSub(); };
    }

    const settings = getSettings();
    const tuning = getTuning(song.instrumentId);
    const [num] = song.timeSignature;
    let tempo = song.tempo;
    let currentIndex = -1;
    let stepIndex = 0;
    let barRects = [];
    const opts = { loop: true, countIn: settings.countIn, metronome: settings.metronome, subdivision: settings.metronomeSubdivision, chords: true, groove: getGroove(song.groove).id, section: '', trainer: false, step: 5, every: 2, max: Math.min(400, song.tempo + 40) };
    const tapper = createTapTempo();
    const sections = playOrder(song).filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i);

    el.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <p class="eyebrow mb-1">Practice</p>
          <h1 class="page-title mb-1">${escapeHtml(song.title)}</h1>
          <p class="small text-body-secondary mb-0">${escapeHtml(keyLabel(song.key))} · ${song.timeSignature.join('/')} · ${escapeHtml(tuning.name)}${song.capo ? ` · Capo ${song.capo}` : ''} · Strum: <span class="font-monospace">${escapeHtml(patternLabel(getPattern(song.strumPatternId)))}</span></p>
        </div>
        <div class="d-flex gap-2">
          ${params.id ? `<a class="btn btn-outline-primary" href="#/stage/${escapeHtml(params.id)}">${icon('display')} Stage mode</a>` : ''}
          <a class="btn btn-outline-secondary" href="${backHref}">${icon('arrow-left')} Back</a>
        </div>
      </div>

      <div class="practice-stage mb-3">
        <div class="surface now-chord">
          <div class="small text-body-secondary">Now</div>
          <div id="now" aria-live="off"></div>
          <div class="beat-dots" id="beats" aria-hidden="true">${Array.from({ length: num }, () => '<span class="beat-dot"></span>').join('')}</div>
          <div id="countin" class="fw-bold text-brand" aria-live="assertive"></div>
          <div class="next-chord mt-2"><div class="small text-body-secondary">Next</div><div id="next"></div></div>
        </div>

        <div class="surface p-3">
          <div class="d-flex flex-wrap align-items-center gap-3 mb-3">
            <button class="btn btn-primary btn-lg px-4" type="button" id="play" aria-keyshortcuts="Space">${icon('play-fill')} <span>Start</span></button>
            <div class="text-center">
              <div class="big-tempo"><span id="tempo-val">${tempo}</span> <span class="fs-6 fw-normal">bpm</span></div>
              <div class="small text-body-secondary" id="loop-count">&nbsp;</div>
            </div>
            <div class="flex-grow-1" style="min-width: 220px">
              <label for="tempo" class="form-label small mb-1">Tempo</label>
              <div class="d-flex align-items-center gap-2">
                <button class="btn btn-sm btn-outline-secondary" type="button" data-tempo="-5" aria-label="Slower by 5">−5</button>
                <input type="range" class="form-range" id="tempo" min="30" max="300" value="${tempo}" aria-valuetext="${tempo} beats per minute">
                <button class="btn btn-sm btn-outline-secondary" type="button" data-tempo="5" aria-label="Faster by 5">+5</button>
                <button class="btn btn-sm btn-outline-secondary" type="button" id="tap" aria-keyshortcuts="T" title="Tap repeatedly (or press T) to set the tempo">Tap</button>
              </div>
            </div>
          </div>
          <div class="row g-3">
            <div class="col-sm-6">
              <label class="form-label small mb-1" for="sec">Loop</label>
              <select id="sec" class="form-select form-select-sm">
                <option value="">Whole song</option>
                ${sections.map((s) => `<option value="${s.id}">${escapeHtml(s.name)} only</option>`).join('')}
              </select>
              <div class="d-flex flex-wrap gap-3 mt-2 small">
                <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="o-loop" checked><label class="form-check-label" for="o-loop">Repeat</label></div>
                <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="o-countin" ${opts.countIn ? 'checked' : ''}><label class="form-check-label" for="o-countin">Count-in</label></div>
                <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="o-metro" ${opts.metronome ? 'checked' : ''}><label class="form-check-label" for="o-metro">Metronome</label></div>
                <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="o-chords" checked><label class="form-check-label" for="o-chords">Play chords</label></div>
              </div>
              <div class="row g-2 mt-1">
                <div class="col-6"><label class="form-label small mb-1" for="o-groove">Backing band</label>
                  <select id="o-groove" class="form-select form-select-sm">${GROOVES.map((g) => `<option value="${g.id}" ${g.id === opts.groove ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('')}</select></div>
                <div class="col-6"><label class="form-label small mb-1" for="o-sub">Metronome clicks</label>
                  <select id="o-sub" class="form-select form-select-sm">${subdivisionOptions(opts.subdivision)}</select></div>
              </div>
            </div>
            <div class="col-sm-6">
              <fieldset class="small">
                <legend class="form-label small mb-1">Speed trainer</legend>
                <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="o-trainer"><label class="form-check-label" for="o-trainer">Speed up as I go</label></div>
                <div class="d-flex flex-wrap gap-1 align-items-center mt-1">
                  <label for="t-step">+</label><input id="t-step" type="number" class="form-control form-control-sm" style="width:4.2rem" min="1" max="30" value="${opts.step}">
                  <label for="t-every">bpm every</label><input id="t-every" type="number" class="form-control form-control-sm" style="width:4.2rem" min="1" max="20" value="${opts.every}">
                  <label for="t-max">loops, up to</label><input id="t-max" type="number" class="form-control form-control-sm" style="width:4.8rem" min="30" max="400" value="${opts.max}">
                </div>
              </fieldset>
              <label for="vol" class="form-label small mt-2 mb-1">Volume</label>
              <input type="range" class="form-range" id="vol" min="0" max="100" value="${settings.volume}">
            </div>
          </div>
          <details class="mt-2">
            <summary class="small fw-semibold">${icon('sliders')} Mixer</summary>
            <div class="mt-2">${mixerHTML(settings.mix, 'pr-mix')}</div>
          </details>
          <p class="small text-body-secondary mt-2 mb-0">${icon('keyboard')} <kbd>Space</kbd> start/stop · <kbd>←</kbd>/<kbd>→</kbd> step through chords · <kbd>+</kbd>/<kbd>−</kbd> tempo · <kbd>T</kbd> tap tempo</p>
        </div>
      </div>

      <details class="surface p-3 mb-3" id="fb-details">
        <summary class="fw-semibold">${icon('distribute-horizontal')} Fretboard &amp; scales <span class="small text-body-secondary fw-normal">— follows the current chord</span></summary>
        <div class="mt-2" id="fb-host"></div>
      </details>

      <section class="surface p-3 mb-3" aria-labelledby="bars-h">
        <h2 class="h6" id="bars-h">Bars</h2>
        <div class="practice-bars" id="bars"></div>
      </section>
      <section class="surface p-3" aria-label="Sheet music"><div id="sheet"></div></section>`;

    const $ = (s) => el.querySelector(s);
    const tl = () => timeline(song, { sectionIds: opts.section ? [opts.section] : null });
    let events = tl().events;

    function diagram(ev, width) {
      if (!ev) return '<div class="text-body-secondary small py-4">—</div>';
      const c = parseChord(ev.symbol);
      if (!c || c.nc) return `<div class="display-6 py-4">${escapeHtml(ev.symbol)}</div>`;
      const v = resolveVoicing(ev.symbol, tuning, { capo: song.capo, voicingId: ev.voicingId, prefs: songPrefs(song) });
      return chordDiagramSVG(ev.symbol, v, tuning, { width, leftHanded: getSettings().leftHanded, capo: song.capo });
    }

    function drawBars() {
      $('#bars').innerHTML = events.reduce((acc, ev, i) => {
        if (ev.chordIndex === 0) acc.push(`<span class="practice-bar" data-bar-of="${i}">`);
        acc[acc.length - 1] += `<span data-ev="${i}">${escapeHtml(chordLabel(ev.symbol, song.key, getSettings().chordDisplay))}</span> `;
        return acc;
      }, []).map((s) => s + '</span>').join('');
    }

    let fbPanel = null;
    const fbProps = (ev) => ({ symbol: ev?.symbol, key: song.key, style: song.style, tuning, capo: song.capo, leftHanded: getSettings().leftHanded,
      voicing: ev ? resolveVoicing(ev.symbol, tuning, { capo: song.capo, voicingId: ev.voicingId, prefs: songPrefs(song) }) : null });

    function highlight(i, speak = true) {
      currentIndex = i;
      const ev = events[i];
      if (fbPanel && ev && parseChord(ev.symbol) && !parseChord(ev.symbol).nc) fbPanel.update(fbProps(ev));
      const next = events[(i + 1) % events.length];
      $('#now').innerHTML = diagram(ev, 240);
      $('#next').innerHTML = diagram(next, 120);
      el.querySelectorAll('.practice-bar.current').forEach((b) => b.classList.remove('current'));
      const barStart = events.findLastIndex((e, k) => k <= i && e.chordIndex === 0);
      el.querySelector(`[data-bar-of="${barStart}"]`)?.classList.add('current');
      // notation highlight
      el.querySelectorAll('.bar-hl').forEach((r) => r.remove());
      if (ev) {
        const g = barRects.find((b) => b.section === ev.sectionId && b.index === ev.barIndex && b.occurrence === ev.occurrence)
          || barRects.find((b) => b.section === ev.sectionId && b.index === ev.barIndex);
        if (g) {
          const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          r.setAttribute('class', 'bar-hl');
          r.setAttribute('x', g.x); r.setAttribute('y', g.y); r.setAttribute('width', g.w); r.setAttribute('height', g.h); r.setAttribute('rx', 6);
          g.svg.insertBefore(r, g.svg.firstChild);
          if (player.playing) {
            const box = r.getBoundingClientRect();
            if (box.top < 80 || box.bottom > window.innerHeight) r.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          }
        }
      }
      if (ev && speak && getSettings().announceChords) announce(describeChord(ev.symbol));
    }

    function drawSheet() {
      const r = renderLeadSheet($('#sheet'), song, { tuning, settings: { ...getSettings(), notation: { ...getSettings().notation, diagrams: false } }, showMeta: false });
      barRects = r.bars;
      if (currentIndex >= 0) highlight(currentIndex, false);
    }

    const setPlayBtn = (playing) => { $('#play').innerHTML = `${icon(playing ? 'stop-fill' : 'play-fill')} <span>${playing ? 'Stop' : 'Start'}</span>`; };
    function setTempo(v) {
      tempo = Math.max(30, Math.min(300, Math.round(v)));
      $('#tempo-val').textContent = tempo;
      $('#tempo').value = tempo;
      $('#tempo').setAttribute('aria-valuetext', `${tempo} beats per minute`);
      player.setTempo(tempo);
    }

    async function start() {
      if (!player.available) { toast('Audio library is not available.', { type: 'warning' }); return; }
      events = tl().events;
      drawBars();
      const ok = await player.load({ ...song, tempo }, tuning, {
        sectionIds: opts.section ? [opts.section] : null, loop: opts.loop, countIn: opts.countIn, metronome: opts.metronome,
        chords: opts.chords, smooth: getSettings().smoothVoicing,
        trainer: opts.trainer ? { step: opts.step, every: opts.every, max: opts.max } : null,
        grooveId: opts.groove, subdivision: opts.subdivision,
      });
      if (!ok) { toast('Nothing to play — this song has no bars yet.', { type: 'warning' }); return; }
      $('#loop-count').innerHTML = '&nbsp;';
      player.play();
    }

    const offs = [];
    offs.push(player.on((type, d) => {
      if (type === 'state') { setPlayBtn(d.playing); if (!d.playing) { $('#countin').textContent = ''; el.querySelectorAll('.beat-dot').forEach((b) => b.classList.remove('on')); } }
      if (type === 'chord') { $('#countin').textContent = ''; highlight(d.index); stepIndex = d.index; pulse(d.event); }
      if (type === 'countin') { $('#countin').textContent = `Count-in: ${d.beat}`; }
      if (type === 'loop') $('#loop-count').textContent = `Loop ${d.count + 1}`;
      if (type === 'tempo') { setTempo(d.bpm); announce(`Tempo ${d.bpm}`); }
    }));
    // beat dots follow the chord position within the bar
    let beatTimer = null;
    function pulse(ev) {
      clearInterval(beatTimer);
      const dots = [...el.querySelectorAll('.beat-dot')];
      let beat = Math.round(ev.start % num);
      const tick = () => { dots.forEach((d, k) => d.classList.toggle('on', k === beat % num)); beat++; };
      tick();
      let remaining = ev.beats - 1;
      beatTimer = setInterval(() => { if (remaining-- <= 0 || !player.playing) { clearInterval(beatTimer); return; } tick(); }, 60000 / (player.tempo || tempo));
    }

    offs.push(trackPracticeSessions(() => ({ ref: params.id || `preset:${query.preset}`, detail: song.title })));
    offs.push(on(el, 'click', '#play', () => (player.playing ? player.stop() : start())));
    $('#fb-details').addEventListener('toggle', (e) => {
      if (e.target.open && !fbPanel) fbPanel = mountFretboardPanel($('#fb-host'), fbProps(events[Math.max(0, currentIndex)]));
    });
    offs.push(on(el, 'input', '#tempo', (e) => setTempo(Number(e.target.value))));
    offs.push(on(el, 'click', '[data-tempo]', (e, t) => setTempo(tempo + Number(t.dataset.tempo))));
    offs.push(on(el, 'input', '#vol', debounce((e) => { updateSettings({ volume: Number(e.target.value) }); player.setVolume(Number(e.target.value)); }, 100)));
    const restartIfPlaying = () => { if (player.playing) { player.stop(); start(); } };
    offs.push(on(el, 'change', '#sec', (e) => { opts.section = e.target.value; events = tl().events; drawBars(); currentIndex = -1; highlight(0, false); restartIfPlaying(); }));
    offs.push(on(el, 'change', '#o-loop', (e) => { opts.loop = e.target.checked; restartIfPlaying(); }));
    offs.push(on(el, 'change', '#o-countin', (e) => { opts.countIn = e.target.checked; }));
    offs.push(on(el, 'change', '#o-metro', (e) => { opts.metronome = e.target.checked; restartIfPlaying(); }));
    offs.push(on(el, 'change', '#o-chords', (e) => { opts.chords = e.target.checked; restartIfPlaying(); }));
    offs.push(on(el, 'change', '#o-groove', (e) => {
      opts.groove = e.target.value;
      if (params.id && getSong(params.id)) saveSong({ ...getSong(params.id), groove: opts.groove });
      restartIfPlaying();
    }));
    offs.push(on(el, 'change', '#o-sub', (e) => { opts.subdivision = Number(e.target.value); restartIfPlaying(); }));
    offs.push(on(el, 'input', '[data-mix]', (e, t) => {
      t.setAttribute('aria-valuetext', `${t.value} percent`);
      player.setMix({ [t.dataset.mix]: Number(t.value) });
    }));
    offs.push(on(el, 'change', '[data-mix]', (e, t) => updateSettings({ mix: { ...getSettings().mix, [t.dataset.mix]: Number(t.value) } })));
    const tap = () => {
      const bpm = tapper.tap();
      if (bpm) { setTempo(bpm); announce(`${bpm} beats per minute`); }
    };
    offs.push(on(el, 'click', '#tap', tap));
    offs.push(on(el, 'change', '#o-trainer', (e) => { opts.trainer = e.target.checked; if (opts.trainer && !opts.loop) { opts.loop = true; $('#o-loop').checked = true; } restartIfPlaying(); }));
    offs.push(on(el, 'change', '#t-step,#t-every,#t-max', () => {
      opts.step = Number($('#t-step').value) || 5; opts.every = Number($('#t-every').value) || 2; opts.max = Number($('#t-max').value) || 200;
    }));
    offs.push(on(el, 'click', '[data-ev]', (e, t) => {
      const i = Number(t.dataset.ev);
      stepIndex = i;
      highlight(i);
      player.previewChord(events[i].symbol, tuning, { capo: song.capo, voicingId: events[i].voicingId, prefs: songPrefs(song) });
    }));
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName) && e.key === ' ') {
        if (document.activeElement.id !== 'tempo') return;
      }
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && e.key !== ' ') return;
      if (e.key === ' ') { e.preventDefault(); player.playing ? player.stop() : start(); }
      else if (e.key === 'ArrowRight' && !player.playing) { stepIndex = (stepIndex + 1) % events.length; highlight(stepIndex); player.previewChord(events[stepIndex].symbol, tuning, { capo: song.capo, voicingId: events[stepIndex].voicingId, prefs: songPrefs(song) }); }
      else if (e.key === 'ArrowLeft' && !player.playing) { stepIndex = (stepIndex - 1 + events.length) % events.length; highlight(stepIndex); player.previewChord(events[stepIndex].symbol, tuning, { capo: song.capo, voicingId: events[stepIndex].voicingId, prefs: songPrefs(song) }); }
      else if (e.key === 't' || e.key === 'T') tap();
      else if (e.key === '+' || e.key === '=') setTempo(tempo + 5);
      else if (e.key === '-' || e.key === '_') setTempo(tempo - 5);
    };
    document.addEventListener('keydown', onKey);
    let lastW = 0;
    const ro = new ResizeObserver(() => { const w = $('#sheet').clientWidth; if (Math.abs(w - lastW) > 40) { lastW = w; drawSheet(); } });
    ro.observe($('#sheet'));

    drawBars();
    drawSheet();
    if (events.length) highlight(0, false);
    stepIndex = 0;
    return () => { offs.forEach((o) => o()); document.removeEventListener('keydown', onKey); ro.disconnect(); clearInterval(beatTimer); player.stop(); fbPanel?.destroy(); };
  },
};
