import { h, initials, render } from '../dom.js';

export async function profileView(main, ctx) {
  const { user } = ctx.state;

  render(main, h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {},
        h('h1', { text: 'Profile' }),
        h('p', { text: 'Your account.' }),
      ),
    ),
    h('div', { class: 'profile-grid' },
      h('section', { class: 'aside-block', 'aria-labelledby': 'acct-title' },
        h('h2', { id: 'acct-title', text: 'Account' }),
        h('p', { class: 'members' }, h('span', { class: 'avatar', 'aria-hidden': 'true', text: initials(user.name) })),
        h('p', {}, h('strong', { text: user.name })),
        h('p', { text: user.email }),
      ),
    ),
  ));
}
