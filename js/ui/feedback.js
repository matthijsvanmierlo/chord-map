// Toasts and modal dialogs built on Bootstrap components.
import { escapeHtml, announce } from './dom.js';

/**
 * Show a toast. Optional action button (e.g. Undo).
 * @param {string} message
 * @param {{type?:'success'|'danger'|'info'|'warning', action?:{label:string, run:Function}, delay?:number}} opts
 */
export function toast(message, { type = 'success', action = null, delay = 5000 } = {}) {
  const host = document.getElementById('toasts');
  const icons = { success: 'check-circle', danger: 'exclamation-octagon', info: 'info-circle', warning: 'exclamation-triangle' };
  const el = document.createElement('div');
  el.className = 'toast align-items-center border-0 shadow';
  el.setAttribute('role', type === 'danger' ? 'alert' : 'status');
  el.setAttribute('aria-live', type === 'danger' ? 'assertive' : 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.innerHTML = `<div class="d-flex">
      <div class="toast-body"><i class="bi bi-${icons[type]} me-2 text-${type === 'info' ? 'primary' : type}" aria-hidden="true"></i>${escapeHtml(message)}</div>
      ${action ? `<button type="button" class="btn btn-sm btn-outline-primary my-auto toast-action">${escapeHtml(action.label)}</button>` : ''}
      <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;
  host.append(el);
  const t = window.bootstrap ? new window.bootstrap.Toast(el, { delay: action ? Math.max(delay, 8000) : delay }) : null;
  if (action) el.querySelector('.toast-action').addEventListener('click', () => { action.run(); t?.hide(); });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  if (t) t.show(); else { announce(message); setTimeout(() => el.remove(), delay); }
}

/**
 * Generic modal. Resolves with the value returned by the clicked button's
 * `value` (or null when dismissed). `body` may be HTML.
 */
export function dialog({ title, body, buttons = [{ label: 'OK', value: true, variant: 'primary' }], size = '', onShown = null, collect = null }) {
  return new Promise((resolve) => {
    const id = 'dlg-' + Math.random().toString(36).slice(2);
    const el = document.createElement('div');
    el.className = 'modal fade';
    el.tabIndex = -1;
    el.setAttribute('aria-labelledby', id + '-title');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('role', 'dialog');
    el.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable ${size}">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title fs-5" id="${id}-title">${escapeHtml(title)}</h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">
          ${buttons.map((b, i) => `<button type="button" class="btn btn-${b.variant || 'secondary'}" data-idx="${i}">${escapeHtml(b.label)}</button>`).join('')}
        </div>
      </div></div>`;
    document.body.append(el);
    let result = null;
    let isShown = false;
    const modal = new window.bootstrap.Modal(el);
    // Bootstrap ignores hide() while the open animation runs, so defer it
    const close = () => (isShown ? modal.hide() : el.addEventListener('shown.bs.modal', () => modal.hide(), { once: true }));
    el.querySelectorAll('[data-idx]').forEach((btn) => btn.addEventListener('click', () => {
      const b = buttons[Number(btn.dataset.idx)];
      if (b.value !== null && b.value !== undefined && collect) {
        const v = collect(el, b.value);
        if (v === false) return; // validation failed — keep open
        result = v;
      } else result = b.value ?? null;
      close();
    }));
    el.addEventListener('shown.bs.modal', () => {
      isShown = true;
      if (onShown) onShown(el);
      else el.querySelector('.modal-footer .btn-primary, .modal-footer .btn-danger')?.focus();
    });
    el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(result); });
    modal.show();
  });
}

export function confirmDialog(title, message, { confirmLabel = 'Confirm', danger = false } = {}) {
  return dialog({
    title,
    body: `<p class="mb-0">${escapeHtml(message)}</p>`,
    buttons: [{ label: 'Cancel', value: null, variant: 'secondary' }, { label: confirmLabel, value: true, variant: danger ? 'danger' : 'primary' }],
  }).then((v) => v === true);
}

export function promptDialog(title, label, value = '', { placeholder = '', multiline = false, help = '' } = {}) {
  const input = multiline
    ? `<textarea class="form-control font-monospace" id="prompt-input" rows="6" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`
    : `<input class="form-control" id="prompt-input" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`;
  return dialog({
    title,
    body: `<label class="form-label" for="prompt-input">${escapeHtml(label)}</label>${input}${help ? `<div class="form-text">${help}</div>` : ''}`,
    buttons: [{ label: 'Cancel', value: null }, { label: 'OK', value: 'ok', variant: 'primary' }],
    onShown: (el) => { const i = el.querySelector('#prompt-input'); i.focus(); i.select?.(); },
    collect: (el) => el.querySelector('#prompt-input').value,
  });
}
