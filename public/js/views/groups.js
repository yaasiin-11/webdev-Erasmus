import { api } from '../api.js';
import { CATEGORIES, busy, categoryLabel, fmt, h, icons, openDialog, render, seatText, seats, svg, toast } from '../dom.js';

const filters = { q: '', category: '', mine: false };

export function membershipButton(group, onChange) {
  if (group.isOwner) {
    return h('a', { class: 'btn', href: `#/groups/${group.id}` }, 'Open your group');
  }
  if (group.isMember) {
    const button = h('button', { type: 'button', class: 'btn' }, 'Leave');
    button.addEventListener('click', async () => {
      const done = busy(button, 'Leaving…');
      try {
        const { group: updated } = await api(`/groups/${group.id}/membership`, { method: 'DELETE' });
        toast(`You left ${updated.title}.`);
        onChange(updated);
      } catch (error) {
        done();
        toast(error.message, { error: true });
      }
    });
    return button;
  }
  if (group.isFull) {
    return h('button', { type: 'button', class: 'btn', disabled: true, 'aria-describedby': `full-${group.id}` }, 'Full');
  }
  const button = h('button', { type: 'button', class: 'btn btn-marker' }, 'Join');
  button.addEventListener('click', async () => {
    const done = busy(button, 'Joining…');
    try {
      const { group: updated } = await api(`/groups/${group.id}/membership`, { method: 'POST' });
      toast(`You joined ${updated.title}.`);
      onChange(updated);
    } catch (error) {
      done();
      toast(error.message, { error: true });
    }
  });
  return button;
}

function groupRow(group) {
  const li = h('li');
  const draw = (g) => {
    render(li, h('article', { class: 'group-row', dataset: { cat: g.category }, 'aria-labelledby': `g-${g.id}` },
      h('div', {},
        h('h2', { id: `g-${g.id}` }, h('a', { href: `#/groups/${g.id}`, text: g.title })),
        h('p', { class: 'group-meta' },
          h('span', { class: 'cat', dataset: { cat: g.category }, text: categoryLabel(g.category) }),
          h('span', { text: g.subject }),
          h('span', { text: `by ${g.isOwner ? 'you' : g.creator.name}` }),
        ),
        g.unreadCount > 0
          ? h('a', { class: 'unread', href: `#/groups/${g.id}` }, `${g.unreadCount} new message${g.unreadCount === 1 ? '' : 's'} in the chat`)
          : null,
        g.description ? h('p', { class: 'group-desc', text: g.description }) : null,
      ),
      h('div', { class: 'group-seats' },
        seats(g, g.isMember),
        h('span', { class: 'seat-label', text: seatText(g) }),
        h('p', { class: 'next' },
          g.nextSessionAt
            ? ['Next: ', h('strong', { class: 'mark', text: fmt.short(g.nextSessionAt) })]
            : 'No session planned yet'),
      ),
      h('div', { class: 'group-action' },
        membershipButton(g, draw),
        g.isFull && !g.isMember ? h('span', { class: 'badge', id: `full-${g.id}`, text: 'Every place is taken' }) : null,
        g.isMember && !g.isOwner ? h('span', { class: 'badge', text: 'You are a member' }) : null,
      ),
    ));
  };
  draw(group);
  return li;
}

function skeleton() {
  return h('div', { class: 'ledger', 'aria-hidden': 'true' },
    [0, 1, 2].map(() => h('div', { class: 'skeleton-row' },
      h('div', {}, h('div', { class: 'skeleton sk-title' }), h('div', { class: 'skeleton sk-40' }), h('div', { class: 'skeleton sk-85' })),
      h('div', {}, h('div', { class: 'skeleton sk-70' }), h('div', { class: 'skeleton sk-40' })),
      h('div', {}, h('div', { class: 'skeleton sk-button' })),
    )));
}

export function newGroupDialog(go) {
  const form = h('div', { class: 'form-grid' },
    h('div', { class: 'field' }, h('label', { for: 'ng-title', text: 'Group name' }),
      h('input', { id: 'ng-title', name: 'title', required: true, minlength: 3, maxlength: 80, placeholder: 'Calculus II: finals crew' })),
    h('div', { class: 'field' }, h('label', { for: 'ng-subject', text: 'Subject or exam' }),
      h('input', { id: 'ng-subject', name: 'subject', required: true, minlength: 2, maxlength: 80 })),
    h('div', { class: 'form-row' },
      h('div', { class: 'field' }, h('label', { for: 'ng-category', text: 'Kind of group' }),
        h('select', { id: 'ng-category', name: 'category' }, CATEGORIES.map(([value, label]) => h('option', { value, text: label })))),
      h('div', { class: 'field' }, h('label', { for: 'ng-cap', text: 'Places' }),
        h('input', { id: 'ng-cap', name: 'maxCapacity', type: 'number', min: 2, max: 50, value: 6, required: true, 'aria-describedby': 'ng-cap-hint' }),
        h('span', { class: 'hint', id: 'ng-cap-hint', text: '2 to 50, you included.' })),
    ),
    h('div', { class: 'field' }, h('label', { for: 'ng-desc', text: 'What you will do together (optional)' }),
      h('textarea', { id: 'ng-desc', name: 'description', maxlength: 500, rows: 3 })),
  );
  openDialog({
    title: 'Start a study group',
    confirmLabel: 'Create group',
    form,
    async onConfirm(data) {
      const body = Object.fromEntries(data);
      body.maxCapacity = Number(body.maxCapacity);
      const { group } = await api('/groups', { method: 'POST', body });
      toast(`${group.title} is ready. Invite people by sharing the page.`);
      go(`/groups/${group.id}`);
    },
  });
}

export async function groupsView(main, ctx) {
  const list = h('div', { class: 'results', 'aria-live': 'polite' });
  const count = h('p', { class: 'visually-hidden', role: 'status' });

  const search = h('input', { type: 'search', id: 'q', name: 'q', value: filters.q, placeholder: 'Search by course, exam or topic', autocomplete: 'off' });
  const mine = h('input', { type: 'checkbox', id: 'mine', checked: filters.mine });
  const chips = h('fieldset', { class: 'chips' },
    h('legend', { class: 'visually-hidden', text: 'Kind of group' }),
    [['', 'All'], ...CATEGORIES].map(([value, label]) => h('label', { class: 'chip' },
      h('input', { type: 'radio', name: 'category', value, checked: filters.category === value }),
      h('span', {}, label),
    )),
  );

  let request = 0;
  async function load() {
    const mineOnly = filters.mine;
    const id = ++request;
    list.setAttribute('aria-busy', 'true');
    render(list, skeleton());
    count.textContent = 'Loading groups…';
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.category) params.set('category', filters.category);
    if (filters.mine) params.set('mine', '1');
    try {
      const { groups } = await api(`/groups?${params}`);
      if (id !== request || !ctx.isCurrent()) return;
      list.removeAttribute('aria-busy');
      count.textContent = `${groups.length} group${groups.length === 1 ? '' : 's'} found`;
      if (!groups.length) {
        const filtered = filters.q || filters.category;
        render(list, h('div', { class: 'state' },
          h('h2', { text: mineOnly && !filtered ? 'You are not in any group yet' : 'No group matches' }),
          h('p', {
            text: mineOnly && !filtered
              ? 'Join one from the full list, or start a group for the course or exam you are preparing.'
              : 'Try fewer words or another kind of group. If nobody is studying this yet, start the group yourself.',
          }),
          h('div', { class: 'form-actions' },
            h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => newGroupDialog(ctx.go) } }, 'Start a group'),
            filtered || mineOnly ? h('button', { type: 'button', class: 'btn', on: { click: reset } }, 'Show all groups') : null,
          ),
        ));
        return;
      }
      render(list, h('ul', { class: 'ledger' }, groups.map(groupRow)));
    } catch (error) {
      if (id !== request) return;
      list.removeAttribute('aria-busy');
      count.textContent = '';
      render(list, h('div', { class: 'state is-error', role: 'alert' },
        h('h2', { text: 'The groups could not be loaded' }),
        h('p', { text: error.message }),
        h('button', { type: 'button', class: 'btn', on: { click: load } }, 'Try again'),
      ));
    }
  }

  function reset() {
    filters.q = '';
    filters.category = '';
    filters.mine = false;
    search.value = '';
    mine.checked = false;
    chips.querySelector('input[value=""]').checked = true;
    load();
  }

  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      filters.q = search.value.trim();
      load();
    }, 250);
  });
  chips.addEventListener('change', (event) => {
    filters.category = event.target.value;
    load();
  });
  mine.addEventListener('change', () => {
    filters.mine = mine.checked;
    load();
  });

  render(main, h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {},
        h('h1', { text: 'Study groups' }),
        h('p', { text: 'Find people preparing the same course or exam, or start a group of your own.' }),
      ),
      h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => newGroupDialog(ctx.go) } }, 'Start a group'),
    ),
    h('form', { class: 'filters', role: 'search', on: { submit: (e) => e.preventDefault() } },
      h('div', { class: 'filters-top' },
        h('div', { class: 'search' },
          h('label', { for: 'q', class: 'visually-hidden', text: 'Search groups' }),
          svg(icons.search),
          search,
        ),
        h('label', { class: 'toggle', for: 'mine' }, mine, 'Only my groups'),
      ),
      chips,
    ),
    count,
    list,
  ));
  await load();
}
