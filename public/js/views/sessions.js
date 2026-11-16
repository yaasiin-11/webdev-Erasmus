import { api } from '../api.js';
import { fmt, h, render } from '../dom.js';
import { sessionSlot } from './group.js';

export async function sessionsView(main, ctx) {
  const body = h('div', { 'aria-live': 'polite' });
  render(main, h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {},
        h('h1', { text: 'My sessions' }),
        h('p', { text: 'Everything planned in the groups you belong to, in your local time.' }),
      ),
    ),
    body,
  ));

  async function load() {
    body.setAttribute('aria-busy', 'true');
    render(body, h('p', { class: 'boot', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading your timetable…'));
    try {
      const { sessions } = await api('/sessions/upcoming');
      if (!ctx.isCurrent()) return;
      body.removeAttribute('aria-busy');
      if (!sessions.length) {
        render(body, h('div', { class: 'state' },
          h('h2', { text: 'Your timetable is empty' }),
          h('p', { text: 'Sessions appear here once a group you belong to plans one. Join a group, or open one of yours and plan the first session.' }),
          h('a', { class: 'btn btn-primary', href: '#/groups' }, 'Browse groups'),
        ));
        return;
      }
      const days = new Map();
      for (const session of sessions) {
        const key = fmt.dayKey(session.startsAt);
        if (!days.has(key)) days.set(key, []);
        days.get(key).push(session);
      }
      render(body, [...days.values()].map((list) => h('section', { class: 'day-group' },
        h('h2', { text: fmt.date(list[0].startsAt) }),
        h('ol', { class: 'timetable' }, list.map((s) => sessionSlot(s, { showGroup: true, onChanged: load }))),
      )));
    } catch (error) {
      body.removeAttribute('aria-busy');
      render(body, h('div', { class: 'state is-error', role: 'alert' },
        h('h2', { text: 'Your timetable could not be loaded' }),
        h('p', { text: error.message }),
        h('button', { type: 'button', class: 'btn', on: { click: load } }, 'Try again'),
      ));
    }
  }

  await load();
}
