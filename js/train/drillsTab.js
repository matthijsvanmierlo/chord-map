// Train → Chord-change drills ("one-minute changes").
import { getState, getSettings, logPractice } from '../state/store.js';
import { parseChord, prettyChord } from '../music/chordParser.js';
import { getTuning } from '../music/tunings.js';
import { resolveVoicing } from '../music/voicingEngine.js';
import { chordDiagramSVG } from '../render/chordDiagram.js';
import { sparklineSVG } from '../render/charts.js';
import { uniqueChords } from '../music/song.js';
import { player } from '../audio/player.js';
import { escapeHtml, icon, on, announce } from '../ui/dom.js';
import { pairKey, drillStats } from './stats.js';

const PAIRS = [['C', 'G'], ['G', 'D'], ['D', 'A'], ['Am', 'F'], ['Em', 'C'], ['C', 'F'], ['G', 'Em'], ['A', 'E'], ['D', 'Am'], ['Dm7', 'G7'], ['F', 'Bb'], ['Bm', 'G']];

export function mountDrills(host, query = {}) {
  const tuning = getTuning(getSettings().instrumentId);
  let a = parseChord(query.a || '')?.symbol || 'C';
  let b = parseChord(query.b || '')?.symbol || 'G';
  let seconds = 60;
  let count = 0;
  let target = 1;
  let running = false;
  let timer = null;
  let endAt = 0;
  const songChords = [...new Set(getState().songs.flatMap((s) => uniqueChords(s).map((c) => c.symbol)))].slice(0, 60);

  host.innerHTML = `
    <div class="row g-4">
      <div class="col-lg-5">
        <div class="surface p-3">
          <h2 class="h6">Choose two chords</h2>
          <div class="row g-2 mb-2">
            <div class="col-6"><label class="form-label small mb-0" for="dr-a">First chord</label><input id="dr-a" class="form-control fw-bold" list="dr-list" value="${escapeHtml(a)}" autocomplete="off"></div>
            <div class="col-6"><label class="form-label small mb-0" for="dr-b">Second chord</label><input id="dr-b" class="form-control fw-bold" list="dr-list" value="${escapeHtml(b)}" autocomplete="off"></div>
          </div>
          <datalist id="dr-list">${[...new Set([...songChords, ...PAIRS.flat()])].map((c) => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
          <div class="chip-row mb-3" role="group" aria-label="Common pairs">
            ${PAIRS.map(([x, y]) => `<button type="button" class="chip" data-pair="${escapeHtml(x)}|${escapeHtml(y)}">${escapeHtml(prettyChord(x))} ⇄ ${escapeHtml(prettyChord(y))}</button>`).join('')}
          </div>
          <div class="row g-2 align-items-end">
            <div class="col-6"><label class="form-label small mb-0" for="dr-dur">Length</label>
              <select id="dr-dur" class="form-select form-select-sm"><option value="30">30 seconds</option><option value="60" selected>1 minute</option><option value="120">2 minutes</option></select></div>
            <div class="col-6"><div class="form-check form-switch mb-1"><input class="form-check-input" type="checkbox" role="switch" id="dr-metro"><label class="form-check-label small" for="dr-metro">Metronome</label></div>
              <label class="visually-hidden" for="dr-bpm">Metronome tempo</label><input id="dr-bpm" class="form-control form-control-sm" type="number" min="30" max="240" value="80"></div>
          </div>
          <div class="mt-3" id="dr-stats" aria-live="polite"></div>
        </div>
      </div>
      <div class="col-lg-7">
        <div class="surface p-3 text-center">
          <div class="d-flex justify-content-center gap-3 flex-wrap mb-2" id="dr-diagrams"></div>
          <div class="drill-timer mb-1" id="dr-timer" aria-live="off">1:00</div>
          <div class="drill-count" id="dr-count" aria-live="polite">0</div>
          <div class="small text-body-secondary mb-3">changes</div>
          <button class="btn btn-primary btn-lg w-100 big-btn mb-2" type="button" id="dr-main" aria-keyshortcuts="Space">${icon('play-fill')} Start</button>
          <p class="small text-body-secondary mb-0">Switch between the two chords as many times as you can. Press the big button (or <kbd>Space</kbd>) every time you land a clean change.</p>
        </div>
      </div>
    </div>`;
  const $ = (s) => host.querySelector(s);

  function drawDiagrams() {
    $('#dr-diagrams').innerHTML = [a, b].map((sym, i) => {
      const c = parseChord(sym);
      const v = c && !c.nc ? resolveVoicing(sym, tuning) : null;
      return `<div class="drill-chord ${running && target === i ? 'target' : ''}">${c && !c.nc ? chordDiagramSVG(sym, v, tuning, { width: 130, leftHanded: getSettings().leftHanded }) : `<div class="p-4 text-danger">“${escapeHtml(sym)}”?</div>`}</div>`;
    }).join('<div class="align-self-center fs-3" aria-hidden="true">⇄</div>');
  }

  function drawStats() {
    const st = drillStats(getState().practiceLog, pairKey(a, b));
    $('#dr-stats').innerHTML = st.runs
      ? `<div class="stat-tile"><div class="stat-label">${escapeHtml(prettyChord(a))} ⇄ ${escapeHtml(prettyChord(b))} · ${st.runs} run${st.runs === 1 ? '' : 's'}</div>
          <div class="d-flex align-items-end justify-content-between gap-2"><div><div class="stat-value">${st.best}</div><div class="small text-body-secondary">best changes / minute · last ${st.last}</div></div>
          ${sparklineSVG(st.history.slice(-12), { label: `Changes per minute over the last ${Math.min(12, st.history.length)} runs: ${st.history.slice(-12).join(', ')}` })}</div></div>`
      : '<p class="small text-body-secondary mb-0">No runs yet for this pair. A good goal: 30+ clean changes per minute.</p>';
  }

  function fmt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function finish() {
    clearInterval(timer);
    running = false;
    player.stop();
    const prev = drillStats(getState().practiceLog, pairKey(a, b)).best;
    logPractice({ kind: 'drill', ref: pairKey(a, b), seconds, score: count, detail: `${a} ⇄ ${b}` });
    const perMin = Math.round(count * 60 / seconds);
    const msg = `Time! ${count} changes (${perMin} per minute)${prev === null || perMin > prev ? ' — new best!' : `, best ${prev}`}`;
    $('#dr-main').innerHTML = `${icon('arrow-repeat')} Again`;
    $('#dr-timer').textContent = msg;
    announce(msg);
    drawDiagrams();
    drawStats();
  }

  async function startRun() {
    if (!parseChord(a) || !parseChord(b)) { announce('Please enter two valid chords'); return; }
    count = 0; target = 1; running = true; endAt = 0;
    $('#dr-count').textContent = '0';
    for (const n of [3, 2, 1]) {
      $('#dr-timer').textContent = `Get ready… ${n}`;
      announce(String(n));
      await new Promise((r) => setTimeout(r, 700));
      if (!running) return;
    }
    if ($('#dr-metro').checked) await player.metronomeStart(Number($('#dr-bpm').value) || 80);
    endAt = performance.now() + seconds * 1000;
    $('#dr-main').innerHTML = `${icon('check2-circle')} Changed!`;
    announce('Go');
    drawDiagrams();
    timer = setInterval(() => {
      const left = endAt - performance.now();
      $('#dr-timer').textContent = fmt(left);
      if (left <= 0) finish();
    }, 200);
  }

  function changed() {
    if (!running || performance.now() > endAt || !endAt) return;
    count++;
    target = 1 - target;
    $('#dr-count').textContent = String(count);
    drawDiagrams();
  }

  function setPair(x, y) {
    a = x; b = y;
    $('#dr-a').value = a; $('#dr-b').value = b;
    drawDiagrams(); drawStats();
  }

  const onKey = (e) => {
    if (e.key !== ' ' || /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) return;
    e.preventDefault();
    if (running) changed(); else startRun();
  };
  document.addEventListener('keydown', onKey);
  const offs = [
    on(host, 'click', '#dr-main', () => { if (running && endAt) changed(); else if (!running) startRun(); }),
    on(host, 'click', '[data-pair]', (e, t) => { const [x, y] = t.dataset.pair.split('|'); setPair(x, y); }),
    on(host, 'change', '#dr-a', (e) => setPair(parseChord(e.target.value)?.symbol || e.target.value, b)),
    on(host, 'change', '#dr-b', (e) => setPair(a, parseChord(e.target.value)?.symbol || e.target.value)),
    on(host, 'change', '#dr-dur', (e) => { seconds = Number(e.target.value); $('#dr-timer').textContent = fmt(seconds * 1000); }),
  ];
  drawDiagrams();
  drawStats();
  $('#dr-timer').textContent = fmt(seconds * 1000);
  host.drillForTest = { start: startRun, changed, finish, setDuration: (s) => { seconds = s; } };
  return () => { running = false; clearInterval(timer); player.stop(); document.removeEventListener('keydown', onKey); offs.forEach((o) => o()); };
}
