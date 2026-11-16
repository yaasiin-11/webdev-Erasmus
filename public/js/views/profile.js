import { api } from '../api.js';
import { busy, fmt, h, initials, render, toast } from '../dom.js';

export async function profileView(main, ctx) {
  const { user } = ctx.state;
  const tokenArea = h('div', { class: 'form-grid', 'aria-live': 'polite' });

  async function drawToken(fresh = null) {
    if (!fresh) {
      render(tokenArea, h('p', { class: 'boot', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Checking your token…'));
    }
    let info = null;
    try {
      ({ token: info } = await api('/me/mcp-token'));
    } catch (error) {
      render(tokenArea, h('p', { class: 'alert', role: 'alert', text: error.message }),
        h('button', { type: 'button', class: 'btn', on: { click: () => drawToken() } }, 'Try again'));
      return;
    }

    const create = h('button', { type: 'button', class: 'btn btn-primary' }, info ? 'Replace token' : 'Create token');
    create.addEventListener('click', async () => {
      const done = busy(create, 'Creating…');
      try {
        const { token } = await api('/me/mcp-token', { method: 'POST' });
        toast('New token created. Copy it now.');
        drawToken(token);
      } catch (error) {
        done();
        toast(error.message, { error: true });
      }
    });

    const revoke = info
      ? h('button', { type: 'button', class: 'btn btn-danger' }, 'Revoke token')
      : null;
    revoke?.addEventListener('click', async () => {
      const done = busy(revoke, 'Revoking…');
      try {
        await api('/me/mcp-token', { method: 'DELETE' });
        toast('Token revoked. Agents using it are signed out.');
        drawToken();
      } catch (error) {
        done();
        toast(error.message, { error: true });
      }
    });

    let reveal = null;
    if (fresh) {
      const input = h('input', { id: 'token-value', readonly: true, value: fresh, 'aria-describedby': 'token-warning' });
      const copy = h('button', { type: 'button', class: 'btn btn-marker' }, 'Copy');
      copy.addEventListener('click', async () => {
        input.select();
        try {
          await navigator.clipboard.writeText(fresh);
          toast('Token copied.');
        } catch {
          toast('Select the text and copy it with Ctrl+C.', { error: true });
        }
      });
      reveal = h('div', { class: 'field' },
        h('label', { for: 'token-value', text: 'Your new token' }),
        h('div', { class: 'token-box' }, input, copy),
        h('p', { class: 'alert is-info', id: 'token-warning', text: 'This is the only time it is shown. Put it in MCP_TOKEN, never in a file you commit.' }),
      );
    }

    render(tokenArea,
      h('p', {
        text: info
          ? `Your token was created ${fmt.short(info.createdAt)}${info.lastUsedAt ? ` and last used ${fmt.short(info.lastUsedAt)}` : ' and has not been used yet'}.`
          : 'You have no token. An agent cannot act for you until you create one.',
      }),
      reveal,
      h('div', { class: 'form-actions' }, create, revoke),
    );
  }

  render(main, h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {},
        h('h1', { text: 'Profile' }),
        h('p', { text: 'Your account and the access you give to AI agents.' }),
      ),
    ),
    h('div', { class: 'profile-grid' },
      h('section', { class: 'aside-block', 'aria-labelledby': 'acct-title' },
        h('h2', { id: 'acct-title', text: 'Account' }),
        h('p', { class: 'members' }, h('span', { class: 'avatar', 'aria-hidden': 'true', text: initials(user.name) })),
        h('p', {}, h('strong', { text: user.name })),
        h('p', { text: user.email }),
      ),
      h('section', { class: 'aside-block', 'aria-labelledby': 'mcp-title' },
        h('h2', { id: 'mcp-title', text: 'Agent access (MCP)' }),
        h('p', { text: 'A token lets an AI agent such as Gemini CLI list groups, read timetables and plan sessions as you. It can do exactly what you can do on this site, nothing more.' }),
        tokenArea,
        h('ol', { class: 'steps' },
          h('li', {}, 'Create a token and copy it.'),
          h('li', {}, 'In your codespace, add it as the secret ', h('code', { text: 'MCP_TOKEN' }), '.'),
          h('li', {}, 'Start ', h('code', { text: 'gemini' }), ' and check ', h('code', { text: '/mcp' }), ' lists the StudyHub tools.'),
        ),
      ),
    ),
  ));
  await drawToken();
}
