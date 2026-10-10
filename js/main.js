// App bootstrap.
import { initStore, getSettings, updateSettings, subscribe, isStorageAvailable, getState } from './state/store.js';
import { allTunings } from './music/tunings.js';
import { fillInstrumentSelect } from './views/shared.js';
import { startRouter, rerender } from './router.js';
import { player } from './audio/player.js';
import { escapeHtml } from './ui/dom.js';

const BACKUP_REMINDER_DAYS = 30;

function applyTheme() {
  const t = getSettings().theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
}

function setupInstrumentSwitch() {
  const sel = document.getElementById('global-instrument');
  const fill = () => fillInstrumentSelect(sel, getSettings().instrumentId);
  fill();
  sel.addEventListener('change', () => updateSettings({ instrumentId: sel.value }));
  subscribe((s, reason) => {
    if (reason === 'settings' || reason === 'replaced' || reason === 'external') {
      if (sel.value !== s.settings.instrumentId || sel.options.length !== allTunings().length) fill();
    }
  });
}

function banner(html, type = 'warning', id = '') {
  const host = document.getElementById('banners');
  if (id && document.getElementById(id)) return;
  const div = document.createElement('div');
  div.className = `alert alert-${type} alert-dismissible fade show mt-3 mb-0`;
  if (id) div.id = id;
  div.setAttribute('role', type === 'danger' ? 'alert' : 'status');
  div.innerHTML = `${html}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Dismiss"></button>`;
  host.append(div);
}

function checkBanners(vendorReport) {
  if (!isStorageAvailable()) {
    banner('<strong>Browser storage is unavailable</strong> (private mode or blocked). You can use the app, but changes will be lost when you close this tab. Export a backup to keep your work.', 'danger', 'b-storage');
  }
  const failed = Object.entries(vendorReport || {}).filter(([, v]) => v === 'failed').map(([k]) => k);
  if (failed.length) banner(`Some libraries could not load (${escapeHtml(failed.join(', '))}). Parts of the app (notation or audio) may not work.`, 'warning', 'b-vendor');
  const { meta, songs } = getState();
  if (songs.length) {
    const last = meta.lastBackupAt ? Date.parse(meta.lastBackupAt) : 0;
    const days = (Date.now() - last) / 86400000;
    if (days > BACKUP_REMINDER_DAYS) {
      banner(`<i class="bi bi-cloud-arrow-down me-1" aria-hidden="true"></i> Your songs live only in this browser${last ? ` and haven't been backed up for ${Math.floor(days)} days` : ' and have never been backed up'}. <a href="#/settings#backup" class="alert-link">Export a backup</a>.`, 'info', 'b-backup');
    }
  }
}

function setupSaveStatus() {
  const el = document.getElementById('save-status');
  let t;
  subscribe((_s, reason) => {
    if (reason === 'saved') {
      el.innerHTML = '<i class="bi bi-check2-circle" aria-hidden="true"></i> Saved in this browser';
      clearTimeout(t);
      t = setTimeout(() => { el.textContent = ''; }, 2500);
    } else if (reason === 'save-error') {
      el.innerHTML = '<span class="text-danger"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i> Could not save — storage may be full. Export a backup.</span>';
    }
  });
}

async function boot() {
  let report = {};
  try { report = await window.vendorReady; } catch { /* reported below */ }
  const warnings = initStore();
  if (warnings.length) console.warn('Data warnings:', warnings);
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  subscribe((s, reason) => {
    if (reason === 'settings' || reason === 'replaced' || reason === 'external') {
      applyTheme();
      player.setVolume(s.settings.volume);
      player.setMix(s.settings.mix);
    }
    if (reason === 'external') rerender();
  });
  player.volume = getSettings().volume;
  player.mix = { ...getSettings().mix };
  setupInstrumentSwitch();
  setupSaveStatus();
  checkBanners(report);
  startRouter();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
  }
}

boot();
