import { PRESETS, STYLES } from '../data/presets/index.js';
import { getSettings, toggleFavorite, subscribe, saveSong } from '../state/store.js';
import { escapeHtml, icon, on, debounce, announce } from '../ui/dom.js';
import { setQuery, navigate } from '../router.js';
import { presetToSong } from '../music/song.js';
import { player } from '../audio/player.js';
import { toast } from '../ui/feedback.js';
import { currentTuning, styleInfo, difficultyBadge, presetLines, miniDiagrams, keyOptions, emptyState } from './shared.js';
import { prettyAcc } from '../music/theory.js';

export default {
  title: () => 'Explore progressions',
  render(el, { query }) {
    const f = {
      q: query.q || '',
      style: query.style || '',
      diff: query.diff || '',
      meter: query.meter || '',
      key: query.key || '',
      fav: query.fav === '1',
    };
    let playingId = null;

    el.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h1 class="page-title mb-1">Explore progressions</h1>
          <p class="lead-soft mb-0">Open any card for diagrams, tab and notation. Use the key menu to transpose everything at once.</p>
        </div>
      </div>
      <form class="surface p-3 mb-3" role="search" aria-label="Filter progressions">
        <div class="row g-2 align-items-end">
          <div class="col-12 col-md-4">
            <label class="form-label small mb-1" for="f-q">Search</label>
            <input id="f-q" class="form-control" type="search" placeholder="e.g. ii–V, 12-bar, Pachelbel, cadence" value="${escapeHtml(f.q)}">
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small mb-1" for="f-diff">Difficulty</label>
            <select id="f-diff" class="form-select">
              <option value="">Any</option>
              ${['beginner', 'intermediate', 'advanced'].map((d) => `<option value="${d}" ${f.diff === d ? 'selected' : ''}>${d[0].toUpperCase() + d.slice(1)}</option>`).join('')}
            </select>
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small mb-1" for="f-meter">Time</label>
            <select id="f-meter" class="form-select">
              <option value="">Any</option>
              ${['4/4', '3/4', '6/8', '12/8'].map((m) => `<option ${f.meter === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label small mb-1" for="f-key">Key</label>
            <select id="f-key" class="form-select"><option value="">Original</option>${keyOptions(f.key)}</select>
          </div>
          <div class="col-6 col-md-2">
            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" role="switch" id="f-fav" ${f.fav ? 'checked' : ''}>
              <label class="form-check-label" for="f-fav">${icon('star-fill', 'text-warning')} Favourites</label>
            </div>
          </div>
        </div>
        <div class="chip-row mt-3" role="group" aria-label="Style">
          <button type="button" class="chip" data-style="" aria-pressed="${!f.style}">All styles</button>
          ${STYLES.map((s) => `<button type="button" class="chip" data-style="${s.id}" aria-pressed="${f.style === s.id}">${icon(s.icon)} ${escapeHtml(s.name)}</button>`).join('')}
        </div>
      </form>
      <p class="small text-body-secondary" id="result-count" aria-live="polite"></p>
      <div class="row g-3" id="results"></div>`;

    const results = el.querySelector('#results');

    function filtered() {
      const q = f.q.trim().toLowerCase();
      const favs = new Set(getSettings().favorites);
      return PRESETS.filter((p) => (!f.style || p.style === f.style)
        && (!f.diff || p.difficulty === f.diff)
        && (!f.meter || p.timeSignature.join('/') === f.meter)
        && (!f.fav || favs.has(p.id))
        && (!q || [p.name, p.description, p.style, ...(p.tags || []), ...(p.examples || []), p.progression || '', ...(p.sections || []).map((s) => s.progression)]
          .join(' ').toLowerCase().includes(q)));
    }

    function draw() {
      const list = filtered();
      const tuning = currentTuning();
      const favs = new Set(getSettings().favorites);
      el.querySelector('#result-count').textContent = `${list.length} progression${list.length === 1 ? '' : 's'}${f.style ? ` in ${styleInfo(f.style).name}` : ''}`;
      if (!list.length) {
        results.innerHTML = `<div class="col-12">${emptyState('search', 'No matches', 'Try another search term or clear a filter.', '<button class="btn btn-outline-primary" type="button" data-act="clear">Clear filters</button>')}</div>`;
        return;
      }
      results.innerHTML = list.map((p) => {
        const tonic = f.key || p.defaultKey.tonic;
        const lines = presetLines(p, tonic);
        const st = styleInfo(p.style);
        const isFav = favs.has(p.id);
        const href = `#/progression/${p.id}${f.key ? `?key=${encodeURIComponent(f.key)}` : ''}`;
        return `<div class="col-12 col-md-6 col-xl-4">
          <article class="card prog-card card-hover" aria-labelledby="t-${p.id}">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="badge badge-style">${icon(st.icon)} ${escapeHtml(st.name)}</span>
                ${difficultyBadge(p.difficulty)}
              </div>
              <h2 class="h5 card-title" id="t-${p.id}"><a href="${href}">${escapeHtml(p.name)}</a></h2>
              <p class="roman-line mb-1" aria-label="Roman numerals">${escapeHtml(lines.romanText)}</p>
              <p class="chord-line small mb-2">${escapeHtml(lines.chordsText)} <span class="text-body-secondary fw-normal">· ${prettyAcc(tonic)} · ${p.timeSignature.join('/')}</span></p>
              <div class="mini-diagrams" aria-hidden="true">${miniDiagrams(lines.unique, tuning, 5)}</div>
            </div>
            <div class="card-footer d-flex gap-2">
              <button type="button" class="btn btn-sm btn-outline-primary" data-act="play" data-id="${p.id}" aria-pressed="${playingId === p.id}">
                ${icon(playingId === p.id ? 'stop-fill' : 'play-fill')} <span>${playingId === p.id ? 'Stop' : 'Listen'}</span>
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-act="fav" data-id="${p.id}" aria-pressed="${isFav}" aria-label="${isFav ? 'Remove from' : 'Add to'} favourites: ${escapeHtml(p.name)}">
                ${icon(isFav ? 'star-fill' : 'star', isFav ? 'text-warning' : '')}
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" data-act="save" data-id="${p.id}">${icon('plus-lg')} Save as song</button>
            </div>
          </article>
        </div>`;
      }).join('');
    }

    function sync() {
      setQuery({ q: f.q, style: f.style, diff: f.diff, meter: f.meter, key: f.key, fav: f.fav ? '1' : '' });
      draw();
    }

    const offs = [];
    offs.push(on(el, 'submit', 'form', (e) => e.preventDefault()));
    offs.push(on(el, 'input', '#f-q', debounce((e) => { f.q = e.target.value; sync(); }, 200)));
    offs.push(on(el, 'change', '#f-diff', (e) => { f.diff = e.target.value; sync(); }));
    offs.push(on(el, 'change', '#f-meter', (e) => { f.meter = e.target.value; sync(); }));
    offs.push(on(el, 'change', '#f-key', (e) => { f.key = e.target.value; sync(); }));
    offs.push(on(el, 'change', '#f-fav', (e) => { f.fav = e.target.checked; sync(); }));
    offs.push(on(el, 'click', '[data-style]', (e, t) => {
      f.style = t.dataset.style;
      el.querySelectorAll('[data-style]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.style === f.style)));
      sync();
    }));
    offs.push(on(el, 'click', '[data-act]', async (e, t) => {
      const p = PRESETS.find((x) => x.id === t.dataset.id);
      const act = t.dataset.act;
      if (act === 'clear') {
        Object.assign(f, { q: '', style: '', diff: '', meter: '', key: '', fav: false });
        navigate('explore', { replace: true });
        return;
      }
      if (act === 'fav') {
        const nowFav = toggleFavorite(p.id);
        announce(nowFav ? `${p.name} added to favourites` : `${p.name} removed from favourites`);
        el.querySelector(`[data-act="fav"][data-id="${p.id}"]`)?.focus();
      }
      if (act === 'play') {
        if (playingId === p.id) { player.stop(); return; }
        const song = presetToSong(p, { tonic: f.key || p.defaultKey.tonic, instrumentId: getSettings().instrumentId });
        if (!player.available) { toast('Audio library is not available.', { type: 'warning' }); return; }
        const ok = await player.load(song, currentTuning(), { loop: false, countIn: false, metronome: false, smooth: getSettings().smoothVoicing });
        if (ok) { playingId = p.id; player.play(); draw(); el.querySelector(`[data-act="play"][data-id="${p.id}"]`)?.focus(); }
      }
      if (act === 'save') {
        const song = saveSong(presetToSong(p, { tonic: f.key || p.defaultKey.tonic, instrumentId: getSettings().instrumentId }), { touch: false });
        toast(`Saved “${song.title}” to My Songs`, { action: { label: 'Open', run: () => navigate(`song/${song.id}`) } });
      }
    }));
    offs.push(player.on((type, d) => {
      if (type === 'state' && !d.playing && playingId) {
        const id = playingId; playingId = null; draw();
        el.querySelector(`[data-act="play"][data-id="${id}"]`)?.focus();
      }
    }));
    offs.push(subscribe((s, reason) => { if (reason === 'settings') draw(); }));
    draw();
    return () => { offs.forEach((o) => o()); player.stop(); };
  },
};
