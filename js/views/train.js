// Train: tuner, chord-change drills, ear training, flashcards.
import { icon, on } from '../ui/dom.js';
import { setQuery } from '../router.js';
import { mountTuner } from '../train/tunerTab.js';
import { mountDrills } from '../train/drillsTab.js';
import { mountEar } from '../train/earTab.js';
import { mountFlash } from '../train/flashTab.js';

const TABS = [
  { id: 'tuner', label: 'Tuner', icon: 'mic', mount: mountTuner },
  { id: 'drills', label: 'Chord changes', icon: 'arrow-left-right', mount: mountDrills },
  { id: 'ear', label: 'Ear training', icon: 'ear', mount: mountEar },
  { id: 'cards', label: 'Flashcards', icon: 'card-text', mount: mountFlash },
];

export default {
  title: () => 'Train',
  render(el, { query }) {
    let active = TABS.some((t) => t.id === query.tab) ? query.tab : 'tuner';
    let cleanup = null;
    el.innerHTML = `
      <h1 class="page-title mb-1">Train</h1>
      <p class="lead-soft">Tune up, drill your chord changes, train your ears and memorise shapes.</p>
      <ul class="nav nav-pills mb-3 flex-wrap gap-1" role="tablist" aria-label="Training tools">
        ${TABS.map((t) => `<li class="nav-item" role="presentation"><button class="nav-link" type="button" role="tab" id="tt-${t.id}" data-tab="${t.id}" aria-controls="train-pane">${icon(t.icon)} ${t.label}</button></li>`).join('')}
      </ul>
      <div id="train-pane" role="tabpanel"></div>`;
    const pane = el.querySelector('#train-pane');

    function show(id, focus = false) {
      cleanup?.();
      active = id;
      el.querySelectorAll('[data-tab]').forEach((b) => {
        const on2 = b.dataset.tab === id;
        b.classList.toggle('active', on2);
        b.setAttribute('aria-selected', String(on2));
        b.tabIndex = on2 ? 0 : -1;
      });
      pane.setAttribute('aria-labelledby', `tt-${id}`);
      setQuery({ ...(id !== 'tuner' ? { tab: id } : {}) });
      cleanup = TABS.find((t) => t.id === id).mount(pane, query);
      if (focus) el.querySelector(`[data-tab="${id}"]`).focus();
    }

    const offs = [
      on(el, 'click', '[data-tab]', (e, t) => { if (t.dataset.tab !== active) show(t.dataset.tab); }),
      on(el, 'keydown', '[role="tab"]', (e, t) => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const i = TABS.findIndex((x) => x.id === t.dataset.tab);
        const j = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
        show(TABS[j].id, true);
      }),
    ];
    show(active);
    return () => { cleanup?.(); offs.forEach((o) => o()); };
  },
};
