import { api } from '../api.js';
import { busy, fmt, h, render, toast } from '../dom.js';

const POLL_MS = 5000;
const FOLLOW_UP_MS = 5 * 60 * 1000;
const MAX_LENGTH = 1000;

export const REACTIONS = [
  ['👍', 'thumbs up'], ['❤️', 'heart'], ['😂', 'laughing'], ['🎉', 'party'],
  ['🙏', 'thank you'], ['🤔', 'thinking'], ['👀', 'eyes'], ['✅', 'done'],
];

const PICKER = [
  ['Smileys', [
    ['😀', 'grinning'], ['😄', 'smiling'], ['😂', 'laughing'], ['🙂', 'slight smile'], ['😉', 'wink'], ['😍', 'heart eyes'],
    ['🥳', 'celebrating'], ['😎', 'cool'], ['🤓', 'nerd'], ['🤔', 'thinking'], ['😅', 'relieved sweat'], ['😴', 'sleepy'],
    ['😬', 'grimacing'], ['😱', 'shocked'], ['🥲', 'smiling with a tear'], ['😭', 'crying'], ['🤯', 'mind blown'], ['🙃', 'upside down'],
  ]],
  ['Gestures', [
    ['👍', 'thumbs up'], ['👎', 'thumbs down'], ['👏', 'clapping'], ['🙌', 'raised hands'], ['🙏', 'thank you'], ['💪', 'strong'],
    ['👋', 'waving'], ['🤝', 'handshake'], ['✌️', 'peace'], ['👀', 'eyes'], ['❤️', 'heart'], ['🔥', 'fire'],
  ]],
  ['Studying', [
    ['📚', 'books'], ['📖', 'open book'], ['📝', 'notes'], ['✏️', 'pencil'], ['🧠', 'brain'], ['💡', 'idea'],
    ['🎓', 'graduation cap'], ['📐', 'triangle ruler'], ['🧪', 'test tube'], ['💻', 'laptop'], ['⏰', 'alarm clock'], ['☕', 'coffee'],
    ['📅', 'calendar'], ['✅', 'done'], ['❓', 'question'], ['⚠️', 'warning'], ['🎉', 'party'], ['🍀', 'good luck'],
  ]],
];

const EMOJI_ONLY = /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s){1,12}$/u;
const LINK = /(https:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

function richText(body) {
  const parts = body.split(LINK);
  return parts.map((part, i) => (i % 2 === 1
    ? h('a', { href: part, target: '_blank', rel: 'noopener noreferrer', text: part })
    : part));
}

function dayLabel(iso) {
  const day = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
  if (day.toDateString() === today.toDateString()) return 'Today';
  if (day.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return fmt.date(iso);
}

function popover(trigger, content, { label, onClose }) {
  const box = h('div', { class: 'popover', role: 'dialog', 'aria-label': label }, content);
  function close(returnFocus = true) {
    box.remove();
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (returnFocus) trigger.focus();
    onClose?.();
  }
  function outside(event) {
    if (!box.contains(event.target) && event.target !== trigger) close(false);
  }
  box.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  });
  trigger.setAttribute('aria-expanded', 'true');
  trigger.insertAdjacentElement('afterend', box);
  document.addEventListener('pointerdown', outside, true);
  box.querySelector('button')?.focus();
  return close;
}

export function chatPanel(group) {
  const panel = h('section', { class: 'aside-block chat', 'aria-labelledby': 'chat-title' },
    h('h2', { id: 'chat-title', text: 'Group chat' }));

  if (!group.isMember) {
    panel.append(h('p', { class: 'hint', text: 'Join the group to read and write in its chat.' }));
    return panel;
  }

  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'off', 'aria-label': 'Messages', tabindex: '0' });
  const announcer = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const status = h('p', { class: 'chat-status', role: 'status' });
  const input = h('textarea', {
    id: 'chat-input', name: 'body', rows: 2, maxlength: MAX_LENGTH, required: true,
    placeholder: 'Write to the group', 'aria-describedby': 'chat-hint chat-count',
  });
  const counter = h('span', { class: 'chat-count', id: 'chat-count', 'aria-live': 'polite' });
  const emojiButton = h('button', { type: 'button', class: 'chat-tool', 'aria-label': 'Add an emoji', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, '😊');
  const send = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Send');
  const form = h('form', { class: 'chat-form' },
    h('label', { for: 'chat-input', class: 'visually-hidden', text: 'Message to the group' }),
    h('div', { class: 'chat-compose' }, input, emojiButton),
    send,
    h('p', { class: 'hint', id: 'chat-hint' }, 'Enter sends, Shift+Enter starts a new line. Point at or tap a message to react to it.', ' ', counter),
  );
  panel.append(log, announcer, status, form);

  let messages = [];
  let signature = '';
  let loaded = false;
  let activeId = null;

  function updateCounter() {
    const left = MAX_LENGTH - input.value.length;
    counter.textContent = left <= 200 ? `${left} characters left.` : '';
  }

  function insertAtCursor(text) {
    const { selectionStart: start, selectionEnd: end, value } = input;
    input.value = value.slice(0, start) + text + value.slice(end);
    input.selectionStart = input.selectionEnd = start + text.length;
    updateCounter();
  }

  emojiButton.addEventListener('click', () => {
    if (emojiButton.getAttribute('aria-expanded') === 'true') return;
    let close;
    const grid = PICKER.map(([title, list]) => h('div', { class: 'emoji-section' },
      h('p', { class: 'emoji-title', text: title }),
      h('div', { class: 'emoji-grid' }, list.map(([emoji, name]) => h('button', {
        type: 'button', class: 'emoji', 'aria-label': name, title: name,
        on: { click: () => { insertAtCursor(emoji); close(false); input.focus(); } },
      }, emoji))),
    ));
    close = popover(emojiButton, grid, { label: 'Choose an emoji' });
  });

  async function toggleReaction(message, emoji) {
    try {
      const { message: updated } = await api(`/messages/${message.id}/reactions`, { method: 'POST', body: { emoji } });
      messages = messages.map((m) => (m.id === updated.id ? updated : m));
      draw(`react-${updated.id}-${emoji}`);
    } catch (error) {
      toast(error.message, { error: true });
    }
  }

  async function remove(message) {
    try {
      await api(`/messages/${message.id}`, { method: 'DELETE' });
      messages = messages.filter((m) => m.id !== message.id);
      draw();
      toast('Message deleted.');
    } catch (error) {
      toast(error.message, { error: true });
    }
  }

  function reactionBar(message) {
    const add = h('button', {
      type: 'button', class: 'reaction-add', 'aria-label': 'Add a reaction', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
      dataset: { focusKey: `add-${message.id}` },
    }, '+');
    add.addEventListener('click', () => {
      let close;
      const row = h('div', { class: 'reaction-picker' }, REACTIONS.map(([emoji, name]) => h('button', {
        type: 'button', class: 'emoji', 'aria-label': `React with ${name}`, title: name,
        on: { click: () => { close(false); toggleReaction(message, emoji); } },
      }, emoji)));
      close = popover(add, row, { label: 'Choose a reaction' });
    });
    return h('div', { class: 'reactions' },
      message.reactions.map((r) => h('button', {
        type: 'button',
        class: 'reaction',
        'aria-pressed': String(r.mine),
        'aria-label': `${r.emoji} ${r.count}: ${r.names.join(', ')}. ${r.mine ? 'Click to take yours back.' : 'Click to add yours.'}`,
        title: r.names.join(', '),
        dataset: { focusKey: `react-${message.id}-${r.emoji}` },
        on: { click: () => toggleReaction(message, r.emoji) },
      }, h('span', { 'aria-hidden': 'true' }, r.emoji), h('span', { class: 'reaction-count', 'aria-hidden': 'true', text: r.count }))),
      add,
    );
  }

  function messageItem(message, followUp) {
    const canDelete = message.mine || group.isOwner;
    const emojiOnly = EMOJI_ONLY.test(message.body) && !/^[\d\s#*]+$/.test(message.body);
    return h('article', {
      class: `chat-message${message.mine ? ' is-mine' : ''}${followUp ? ' is-followup' : ''}${activeId === message.id ? ' is-active' : ''}`,
      on: {
        click(event) {
          if (event.target.closest('a, button')) return;
          activeId = activeId === message.id ? null : message.id;
          draw();
        },
      },
      'aria-label': `${message.mine ? 'You' : message.author.name}, ${fmt.time(message.createdAt)}`,
    },
      h('p', { class: `chat-meta${followUp ? ' visually-hidden' : ''}` },
        h('strong', { text: message.mine ? 'You' : message.author.name }),
        h('time', { datetime: message.createdAt, text: fmt.time(message.createdAt) })),
      h('div', { class: 'chat-bubble' },
        h('p', { class: `chat-body${emojiOnly ? ' is-emoji' : ''}` }, richText(message.body)),
        canDelete ? h('button', {
          type: 'button', class: 'chat-delete', dataset: { focusKey: `del-${message.id}` },
          'aria-label': `Delete the message from ${message.mine ? 'you' : message.author.name} at ${fmt.time(message.createdAt)}`,
          on: { click: () => remove(message) },
        }, 'Delete') : null),
      reactionBar(message),
    );
  }

  function draw(focusKey) {
    const activeKey = focusKey ?? (log.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null);
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    const previousTop = log.scrollTop;

    if (!messages.length) {
      render(log, h('p', { class: 'chat-empty', text: 'No messages yet. Say hello, or agree on the next session here.' }));
      return;
    }
    const nodes = [];
    let lastDay = null;
    let previous = null;
    for (const message of messages) {
      const day = new Date(message.createdAt).toDateString();
      if (day !== lastDay) {
        nodes.push(h('p', { class: 'chat-day' }, h('span', { text: dayLabel(message.createdAt) })));
        lastDay = day;
        previous = null;
      }
      const followUp = previous
        && previous.author.id === message.author.id
        && new Date(message.createdAt) - new Date(previous.createdAt) < FOLLOW_UP_MS;
      nodes.push(messageItem(message, followUp));
      previous = message;
    }
    render(log, nodes);
    log.scrollTop = nearBottom ? log.scrollHeight : previousTop;
    if (activeKey) log.querySelector(`[data-focus-key="${CSS.escape(activeKey)}"]`)?.focus();
  }

  function apply(list, { scrollToEnd = false } = {}) {
    const next = JSON.stringify(list.map((m) => [m.id, m.reactions]));
    if (next === signature && loaded) return;
    signature = next;
    if (loaded) {
      const known = new Set(messages.map((m) => m.id));
      const incoming = list.filter((m) => !known.has(m.id) && !m.mine);
      if (incoming.length) {
        const last = incoming[incoming.length - 1];
        announcer.textContent = incoming.length === 1
          ? `New message from ${last.author.name}: ${last.body.slice(0, 140)}`
          : `${incoming.length} new messages, the last from ${last.author.name}.`;
      }
    }
    messages = list;
    loaded = true;
    draw();
    if (scrollToEnd) log.scrollTop = log.scrollHeight;
  }

  async function firstLoad() {
    render(log, h('p', { class: 'chat-empty' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Loading messages…'));
    try {
      const { messages: list } = await api(`/groups/${group.id}/messages`);
      apply(list, { scrollToEnd: true });
      status.textContent = '';
    } catch (error) {
      render(log, h('p', { class: 'chat-empty' }, error.message, ' ',
        h('button', { type: 'button', class: 'btn btn-quiet', on: { click: firstLoad } }, 'Try again')));
    }
  }

  async function poll() {
    if (!document.contains(panel)) {
      clearInterval(timer);
      return;
    }
    if (document.hidden || !loaded || panel.querySelector('.popover')) return;
    try {
      const { messages: list } = await api(`/groups/${group.id}/messages`);
      apply(list);
      status.textContent = '';
    } catch {
      status.textContent = 'Reconnecting to the chat…';
    }
  }

  input.addEventListener('input', updateCounter);
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
      updateCounter();
      apply([...messages, message].slice(-50), { scrollToEnd: true });
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
