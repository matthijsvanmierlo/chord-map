// Form for chord-shape preferences (global in Settings, per-song in the editor).
import { STYLE_LABELS } from '../music/voicingPrefs.js';
import { sanitizeVoicingPrefs } from '../state/schema.js';
import { escapeHtml } from './dom.js';

export function voicingPrefsFormHTML(prefs, id = 'vp') {
  const p = sanitizeVoicingPrefs(prefs);
  return `<div class="row g-2 align-items-end" data-vp-form="${id}">
    <div class="col-sm-6"><label class="form-label small mb-1" for="${id}-style">Shape style</label>
      <select class="form-select form-select-sm" id="${id}-style" data-vp="style">
        ${Object.entries(STYLE_LABELS).map(([k, l]) => `<option value="${k}" ${p.style === k ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
      </select></div>
    <div class="col-3 col-sm-2"><label class="form-label small mb-1" for="${id}-min">From fret</label>
      <input class="form-control form-control-sm" type="number" min="0" max="20" id="${id}-min" data-vp="minFret" value="${p.minFret}"></div>
    <div class="col-3 col-sm-2"><label class="form-label small mb-1" for="${id}-max">To fret</label>
      <input class="form-control form-control-sm" type="number" min="3" max="24" id="${id}-max" data-vp="maxFret" value="${p.maxFret}"></div>
    <div class="col-6 col-sm-2"><label class="form-label small mb-1" for="${id}-stretch">Max stretch</label>
      <select class="form-select form-select-sm" id="${id}-stretch" data-vp="maxStretch">
        ${[2, 3, 4, 5].map((n) => `<option value="${n}" ${p.maxStretch === n ? 'selected' : ''}>${n} frets</option>`).join('')}
      </select></div>
    <div class="col-12 d-flex flex-wrap gap-3">
      <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" role="switch" id="${id}-open" data-vp="preferOpen" ${p.preferOpen ? 'checked' : ''}><label class="form-check-label small" for="${id}-open">Prefer open-string shapes</label></div>
      <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" role="switch" id="${id}-barre" data-vp="avoidBarre" ${p.avoidBarre ? 'checked' : ''}><label class="form-check-label small" for="${id}-barre">Avoid barre chords</label></div>
    </div>
  </div>`;
}

/** Read the form back into a sanitised prefs object. */
export function readVoicingPrefsForm(root, id = 'vp') {
  const form = root.querySelector(`[data-vp-form="${id}"]`);
  const val = (k) => form.querySelector(`[data-vp="${k}"]`);
  return sanitizeVoicingPrefs({
    style: val('style').value,
    minFret: Number(val('minFret').value),
    maxFret: Number(val('maxFret').value),
    maxStretch: Number(val('maxStretch').value),
    preferOpen: val('preferOpen').checked,
    avoidBarre: val('avoidBarre').checked,
  });
}
