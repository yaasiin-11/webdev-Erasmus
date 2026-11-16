export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'on') for (const [event, handler] of Object.entries(value)) el.addEventListener(event, handler);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function svg(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstChild;
}

export const icons = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
};

export function render(target, ...children) {
  target.replaceChildren();
  append(target, children);
}

export function toast(message, { error = false } = {}) {
  const box = document.querySelector('.toasts');
  const item = h('div', { class: `toast${error ? ' is-error' : ''}`, text: message });
  box.append(item);
  setTimeout(() => item.remove(), 4500);
}

export function busy(button, label) {
  const original = [...button.childNodes];
  button.disabled = true;
  button.classList.add('is-busy');
  button.setAttribute('aria-busy', 'true');
  button.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), label);
  return () => {
    button.disabled = false;
    button.classList.remove('is-busy');
    button.removeAttribute('aria-busy');
    button.replaceChildren(...original);
  };
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

const locale = undefined;
export const fmt = {
  dow: (iso) => new Date(iso).toLocaleDateString(locale, { weekday: 'short' }),
  day: (iso) => new Date(iso).toLocaleDateString(locale, { day: 'numeric' }),
  month: (iso) => new Date(iso).toLocaleDateString(locale, { month: 'short' }),
  time: (iso) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
  date: (iso) => new Date(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
  short: (iso) => new Date(iso).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  dayKey: (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  },
};

export const CATEGORIES = [
  ['university', 'University course'],
  ['civil-service', 'Civil service exam'],
  ['certification', 'Certification'],
  ['languages', 'Languages'],
  ['other', 'Other'],
];

export const categoryLabel = (key) => (CATEGORIES.find(([k]) => k === key) ?? [key, key])[1];

export function seats(group, viewerIsMember) {
  const box = h('span', { class: 'seats', 'aria-hidden': 'true' });
  for (let i = 0; i < group.maxCapacity; i += 1) {
    const taken = i < group.memberCount;
    const you = viewerIsMember && i === group.memberCount - 1;
    box.append(h('i', { class: taken ? (you ? 'you' : '') : 'free' }));
  }
  return box;
}

export const seatText = (group) => `${group.memberCount} / ${group.maxCapacity} members`;

export function isLink(text) {
  return /^https:\/\/[^\s]+$/i.test(text);
}

export function openDialog({ title, body, confirmLabel, danger = false, onConfirm, form }) {
  const errorBox = h('p', { class: 'alert', role: 'alert', hidden: true });
  const confirm = h('button', { type: 'submit', class: `btn ${danger ? 'btn-danger is-solid' : 'btn-primary'}`, text: confirmLabel });
  const cancel = h('button', { type: 'button', class: 'btn', text: 'Keep it' });
  const formEl = h('form', { class: 'dialog-body', method: 'dialog' },
    h('h2', { id: 'dialog-title', text: title }),
    body ? h('p', { text: body }) : null,
    form ?? null,
    errorBox,
    h('div', { class: 'form-actions' }, confirm, cancel),
  );
  const dialog = h('dialog', { 'aria-labelledby': 'dialog-title' }, formEl);
  document.body.append(dialog);
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const done = busy(confirm, 'Working…');
    try {
      await onConfirm(new FormData(formEl));
      dialog.close();
    } catch (error) {
      done();
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  });
  dialog.showModal();
  return dialog;
}
