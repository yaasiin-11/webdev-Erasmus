import { api } from '../api.js';
import { busy, fmt, h, render, toast } from '../dom.js';

const POLL_MS = 5000;

const stamp = (iso) => (new Date(iso).toDateString() === new Date().toDateString() ? fmt.time(iso) : fmt.short(iso));

export function chatPanel(group) {
  const panel = h('section', { class: 'aside-block chat', 'aria-labelledby': 'chat-title' },
    h('h2', { id: 'chat-title', text: 'Group chat' }));

  if (!group.isMember) {
    panel.append(h('p', { class: 'hint', text: 'Join the group to read and write in its chat.' }));
    return panel;
  }

  const log = h('ol', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages', tabindex: '0' });
  const status = h('p', { class: 'chat-status', role: 'status' });
  const input = h('textarea', { id: 'chat-input', name: 'body', rows: 2, maxlength: 1000, required: true, placeholder: 'Write to the group', 'aria-describedby': 'chat-hint' });
  const send = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Send');
  const form = h('form', { class: 'chat-form' },
    h('label', { for: 'chat-input', class: 'visually-hidden', text: 'Message to the group' }),
    input,
    send,
    h('p', { class: 'hint', id: 'chat-hint', text: 'Enter sends, Shift+Enter starts a new line.' }),
  );
  panel.append(log, status, form);

  let lastId = null;

  function messageItem(message) {
    const remove = message.mine || group.isOwner
      ? h('button', {
          type: 'button',
          class: 'chat-delete',
          'aria-label': `Delete the message from ${message.mine ? 'you' : message.author.name} at ${stamp(message.createdAt)}`,
          on: {
            async click(event) {
              const button = event.currentTarget;
              button.disabled = true;
              try {
                await api(`/messages/${message.id}`, { method: 'DELETE' });
                item.remove();
                if (!log.children.length) showEmpty();
              } catch (error) {
                button.disabled = false;
                toast(error.message, { error: true });
              }
            },
          },
        }, 'Delete')
      : null;
    const item = h('li', { class: `chat-message${message.mine ? ' is-mine' : ''}` },
      h('p', { class: 'chat-meta' },
        h('strong', { text: message.mine ? 'You' : message.author.name }),
        h('time', { datetime: message.createdAt, text: stamp(message.createdAt) }),
        remove),
      h('p', { class: 'chat-body', text: message.body }),
    );
    return item;
  }

  function showEmpty() {
    render(log, h('li', { class: 'chat-empty', text: 'No messages yet. Say hello, or agree on the next session here.' }));
  }

  function add(messages) {
    if (!messages.length) return;
    log.querySelector('.chat-empty')?.remove();
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    for (const message of messages) {
      if (log.querySelector(`[data-id="${message.id}"]`)) continue;
      const item = messageItem(message);
      item.dataset.id = message.id;
      log.append(item);
      lastId = message.id;
    }
    if (nearBottom || messages.some((m) => m.mine)) log.scrollTop = log.scrollHeight;
  }

  async function firstLoad() {
    render(log, h('li', { class: 'chat-empty' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Loading messages…'));
    try {
      const { messages } = await api(`/groups/${group.id}/messages`);
      render(log);
      if (!messages.length) showEmpty();
      add(messages);
      status.textContent = '';
    } catch (error) {
      render(log, h('li', { class: 'chat-empty' }, error.message, ' ', h('button', { type: 'button', class: 'btn btn-quiet', on: { click: firstLoad } }, 'Try again')));
    }
  }

  async function poll() {
    if (!document.contains(panel)) {
      clearInterval(timer);
      return;
    }
    if (document.hidden || lastId === null) return;
    try {
      const { messages } = await api(`/groups/${group.id}/messages?after=${lastId}`);
      add(messages);
      status.textContent = '';
    } catch {
      status.textContent = 'Reconnecting to the chat…';
    }
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    const done = busy(send, 'Sending…');
    try {
      const { message } = await api(`/groups/${group.id}/messages`, { method: 'POST', body: { body } });
      input.value = '';
      if (lastId === null) render(log);
      add([message]);
    } catch (error) {
      toast(error.message, { error: true });
    } finally {
      done();
      input.focus();
    }
  });

  const timer = setInterval(poll, POLL_MS);
  firstLoad();
  return panel;
}
