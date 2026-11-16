import { api } from './api.js';
import { initials, render, toast } from './dom.js';
import { forgotView, loginView, resetView } from './views/auth.js';
import { groupsView } from './views/groups.js';
import { groupView } from './views/group.js';
import { sessionsView } from './views/sessions.js';
import { profileView } from './views/profile.js';

const state = { user: null, next: null, providers: { google: false, demo: false } };
const main = document.getElementById('main');
const topbar = document.querySelector('.topbar');

const routes = [
  [/^\/login$/, () => loginView, false],
  [/^\/forgot$/, () => forgotView, false],
  [/^\/reset$/, () => resetView, false],
  [/^\/groups$/, () => groupsView, true],
  [/^\/groups\/(\d+)$/, () => groupView, true],
  [/^\/sessions$/, () => sessionsView, true],
  [/^\/profile$/, () => profileView, true],
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/groups';
  const [path, query = ''] = raw.split('?');
  return { path, query: new URLSearchParams(query) };
}

export function go(path) {
  if (location.hash === `#${path}`) route();
  else location.hash = path;
}

export function setUser(user) {
  state.user = user;
  topbar.hidden = !user;
  if (user) {
    document.querySelector('[data-user-name]').textContent = user.name;
    document.querySelector('.topbar .avatar').textContent = initials(user.name);
  }
}

function markNav(path) {
  for (const link of document.querySelectorAll('[data-nav]')) {
    const active = path.startsWith(`/${link.dataset.nav}`);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

let current = 0;
async function route() {
  const { path, query } = parseHash();
  const match = routes.find(([pattern]) => pattern.test(path));
  if (!match) return go('/groups');
  const [pattern, view, needsUser] = match;
  if (needsUser && !state.user) {
    state.next = path === '/groups' ? null : path;
    return go('/login');
  }
  if (!needsUser && state.user && path !== '/reset') return go('/groups');

  const token = ++current;
  markNav(path);
  const params = path.match(pattern).slice(1);
  const ctx = {
    state,
    params,
    query,
    go,
    setUser,
    isCurrent: () => token === current,
  };
  await view()(main, ctx);
  if (token === current) {
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

document.querySelector('[data-action="sign-out"]').addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    // signing out locally is enough when the server cannot be reached
  }
  setUser(null);
  toast('You are signed out.');
  go('/login');
});

window.addEventListener('hashchange', route);

async function boot() {
  try {
    const [me, providers] = await Promise.allSettled([api('/auth/me'), api('/auth/providers')]);
    if (providers.status === 'fulfilled') state.providers = providers.value;
    setUser(me.status === 'fulfilled' ? me.value.user : null);
  } catch {
    setUser(null);
  }
  await route();
}

render(main);
boot();
