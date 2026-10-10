// Train → Tuner tab.
import { Tuner } from '../audio/tuner.js';
import { getTuning } from '../music/tunings.js';
import { midiOf, prettyAcc } from '../music/theory.js';
import { getSettings } from '../state/store.js';
import { player } from '../audio/player.js';
import { escapeHtml, icon, on } from '../ui/dom.js';

function gaugeSVG(cents) {
  const c = cents == null ? 0 : Math.max(-50, Math.min(50, cents));
  const angle = (c / 50) * 60;
  const ok = cents != null && Math.abs(cents) <= 5;
  const ticks = [-50, -25, 0, 25, 50].map((t) => {
    const a = ((t / 50) * 60 - 90) * (Math.PI / 180);
    return `<line x1="${100 + Math.cos(a) * 78}" y1="${100 + Math.sin(a) * 78}" x2="${100 + Math.cos(a) * 90}" y2="${100 + Math.sin(a) * 90}" stroke="currentColor" stroke-width="${t === 0 ? 3 : 1.5}"/>`;
  }).join('');
  return `<svg viewBox="0 0 200 120" width="260" class="tuner-gauge" aria-hidden="true">
    <path d="M ${100 - 90 * Math.sin(Math.PI / 3)} ${100 - 90 * Math.cos(Math.PI / 3)} A 90 90 0 0 1 ${100 + 90 * Math.sin(Math.PI / 3)} ${100 - 90 * Math.cos(Math.PI / 3)}" fill="none" stroke="currentColor" stroke-width="2" opacity=".35"/>
    <path d="M ${100 - 90 * Math.sin(Math.PI / 36)} ${100 - 90 * Math.cos(Math.PI / 36)} A 90 90 0 0 1 ${100 + 90 * Math.sin(Math.PI / 36)} ${100 - 90 * Math.cos(Math.PI / 36)}" fill="none" stroke="var(--fp-brand)" stroke-width="8"/>
    ${ticks}
    <line x1="100" y1="100" x2="100" y2="16" stroke="${ok ? 'var(--fp-brand)' : 'var(--fp-accent)'}" stroke-width="4" stroke-linecap="round" transform="rotate(${angle} 100 100)" ${cents == null ? 'opacity=".25"' : ''}/>
    <circle cx="100" cy="100" r="6" fill="currentColor"/>
    <text x="10" y="116" font-size="11" fill="currentColor">♭ −50</text><text x="190" y="116" font-size="11" text-anchor="end" fill="currentColor">+50 ♯</text>
  </svg>`;
}

export function mountTuner(host) {
  const tuning = getTuning(getSettings().instrumentId);
  const strings = tuning.strings.map((s, i) => ({ i, label: s, midi: midiOf(s) }));
  let a4 = 440;
  let lastSpoken = 0;
  let lastText = '';
  host.innerHTML = `
    <div class="row g-4 align-items-start">
      <div class="col-lg-6 text-center">
        <div class="surface p-3">
          <div class="tuner-note" id="tn-note" aria-hidden="true">–</div>
          <div id="tn-gauge">${gaugeSVG(null)}</div>
          <p class="fs-5 mb-1" id="tn-text">Press <strong>Start tuner</strong> and play one string.</p>
          <p class="small text-body-secondary mb-3" id="tn-freq">&nbsp;</p>
          <div class="d-flex flex-wrap justify-content-center gap-2">
            <button class="btn btn-primary btn-lg" type="button" id="tn-start">${icon('mic-fill')} <span>Start tuner</span></button>
          </div>
          <p class="small text-body-secondary mt-3 mb-0">${icon('shield-lock')} The microphone is analysed live in your browser — nothing is recorded or sent.</p>
          <div class="visually-hidden" aria-live="polite" id="tn-live"></div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="surface p-3">
          <h2 class="h6">${escapeHtml(tuning.name)}</h2>
          <p class="small text-body-secondary">The closest string lights up. Tap a string to hear its target note.</p>
          <div class="d-flex flex-wrap gap-2 mb-3" id="tn-strings">
            ${strings.map((s) => `<button type="button" class="btn btn-outline-secondary tuner-string" data-string="${s.i}" aria-label="Play reference ${escapeHtml(s.label)}">${escapeHtml(prettyAcc(s.label.replace(/\d+$/, '')))}<small class="d-block">${escapeHtml(s.label.match(/\d+$/)[0])}</small></button>`).join('')}
          </div>
          <label class="form-label small" for="tn-a4">Reference pitch A4 (Hz)</label>
          <input id="tn-a4" class="form-control" type="number" min="415" max="466" step="1" value="440" style="max-width: 8rem">
          <p class="small text-body-secondary mt-2 mb-0">Tip: tune with a capo off, pluck firmly and let the note ring.</p>
        </div>
      </div>
    </div>`;
  const $ = (s) => host.querySelector(s);
  const tuner = new Tuner({
    a4,
    onPitch: (p) => {
      if (!p) { $('#tn-freq').innerHTML = '&nbsp;'; return; }
      const nearest = strings.reduce((b, s) => (Math.abs(s.midi - (p.midi + p.cents / 100)) < Math.abs(b.midi - (p.midi + p.cents / 100)) ? s : b), strings[0]);
      host.querySelectorAll('.tuner-string').forEach((b) => b.classList.toggle('active', Number(b.dataset.string) === nearest.i));
      $('#tn-note').innerHTML = `${escapeHtml(prettyAcc(p.name))}<small>${p.octave}</small>`;
      $('#tn-gauge').innerHTML = gaugeSVG(p.cents);
      const inTune = Math.abs(p.cents) <= 5;
      const text = inTune ? `${prettyAcc(p.name)}${p.octave} — in tune` : `${prettyAcc(p.name)}${p.octave} — ${Math.abs(p.cents)} cents ${p.cents < 0 ? 'flat, tune up' : 'sharp, tune down'}`;
      $('#tn-text').innerHTML = `<span class="${inTune ? 'text-success-emphasis fw-bold' : ''}">${escapeHtml(text)}</span>`;
      $('#tn-freq').textContent = `${p.freq.toFixed(1)} Hz · nearest string ${prettyAcc(nearest.label)}`;
      const now = performance.now();
      if (text !== lastText && now - lastSpoken > 1500) { $('#tn-live').textContent = text; lastSpoken = now; lastText = text; }
    },
  });
  const setBtn = () => { $('#tn-start').innerHTML = tuner.running ? `${icon('stop-fill')} <span>Stop tuner</span>` : `${icon('mic-fill')} <span>Start tuner</span>`; };
  const offs = [
    on(host, 'click', '#tn-start', async () => {
      if (tuner.running) { tuner.stop(); setBtn(); $('#tn-text').textContent = 'Tuner stopped.'; return; }
      try {
        player.stop();
        await tuner.startMicrophone();
        $('#tn-text').textContent = 'Listening… play one string.';
      } catch (e) {
        $('#tn-text').innerHTML = `<span class="text-danger">${escapeHtml(e.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in your browser’s site settings and try again.' : e.message || 'Could not start the microphone.')}</span>`;
      }
      setBtn();
    }),
    on(host, 'click', '[data-string]', (e, t) => {
      const s = strings[Number(t.dataset.string)];
      // reference tone at the chosen A4 (shift by cents from 440)
      const offset = 12 * Math.log2(a4 / 440);
      player.playNote(s.midi + offset);
    }),
    on(host, 'change', '#tn-a4', (e) => { a4 = Math.max(415, Math.min(466, Number(e.target.value) || 440)); e.target.value = a4; tuner.a4 = a4; }),
  ];
  // test hook: lets automated tests feed a known frequency without a microphone
  host.tunerForTest = (freq) => { tuner.stop(); tuner.startOscillator(freq); setBtn(); };
  return () => { tuner.stop(); offs.forEach((o) => o()); };
}

