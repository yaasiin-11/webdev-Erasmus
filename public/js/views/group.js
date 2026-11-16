import { api } from '../api.js';
import { busy, categoryLabel, fmt, h, initials, isLink, openDialog, render, seatText, seats, toast } from '../dom.js';
import { membershipButton } from './groups.js';
import { chatPanel } from './chat.js';

const DURATIONS = [30, 45, 60, 90, 120, 180, 240];

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function toIso(date, time) {
  if (!date || !time) return '';
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? '' : value.toISOString();
}

function agendaBlock(session) {
  if (!session.agenda) return null;
  const lines = session.agenda.split('\n').filter(Boolean);
  const items = lines.filter((line) => /^- /.test(line));
  const parsed = items.map((line) => line.slice(2).match(/^(\d\d:\d\d–\d\d:\d\d) · (.*)$/));
  const structured = parsed.length > 0 && parsed.every(Boolean);
  const label = session.agendaSource === 'model' ? 'AI suggestion, reviewed by the organiser'
    : session.agendaSource === 'fallback' ? 'Standard template' : null;
  return h('details', { class: 'agenda' },
    h('summary', {}, 'Agenda'),
    label ? h('p', {}, h('span', { class: 'tag-ai', text: label })) : null,
    structured
      ? h('ol', { class: 'agenda-list' }, parsed.map(([, time, title]) => h('li', {}, h('time', { text: time }), h('span', { text: title }))))
      : h('pre', { class: 'agenda-text', text: session.agenda }),
  );
}

function rsvpRow(session, canAnswer, onAnswered) {
  const { attendance } = session;
  const names = attendance.goingNames;
  const who = names.length
    ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`
    : 'nobody yet';
  const count = h('p', { class: 'rsvp-count', text: `${attendance.going} going: ${who}${attendance.notGoing ? `. ${attendance.notGoing} can't make it` : ''}.` });
  if (!canAnswer) return h('div', { class: 'rsvp' }, count);

  const choice = (status, label) => h('button', {
    type: 'button',
    'aria-pressed': String(attendance.mine === status),
    on: {
      async click(event) {
        const button = event.currentTarget;
        button.disabled = true;
        const clearing = attendance.mine === status;
        try {
          const { session: updated } = await api(`/sessions/${session.id}/rsvp`, clearing
            ? { method: 'DELETE' }
            : { method: 'PUT', body: { status } });
          toast(clearing ? 'Answer removed.' : status === 'going' ? `See you at ${session.topic}.` : 'Thanks for letting the group know.');
          onAnswered(updated, status);
        } catch (error) {
          button.disabled = false;
          toast(error.message, { error: true });
        }
      },
    },
  }, label);

  return h('div', { class: 'rsvp' },
    h('div', { class: 'rsvp-choice', role: 'group', 'aria-label': `Will you come to ${session.topic}?` },
      choice('going', 'Going'), choice('not_going', "Can't go")),
    count,
  );
}

export function sessionSlot(session, { showGroup = false, onChanged, canAnswer = true } = {}) {
  const place = session.location
    ? (isLink(session.location)
        ? h('a', { href: session.location, rel: 'noopener noreferrer', target: '_blank', text: session.location })
        : h('span', { text: session.location }))
    : null;

  const actions = session.canEdit && onChanged
    ? h('div', { class: 'slot-actions' },
        h('button', { type: 'button', class: 'btn', on: { click: () => moveDialog(session, onChanged) } }, 'Move'),
        h('button', { type: 'button', class: 'btn btn-danger', on: { click: () => cancelDialog(session, onChanged) } }, 'Cancel session'),
      )
    : null;

  const li = h('li');
  const replaceWith = (updated, status) => {
    const fresh = sessionSlot({ ...session, ...updated }, { showGroup, onChanged, canAnswer });
    li.replaceWith(fresh);
    fresh.querySelector(`.rsvp-choice button:nth-child(${status === 'not_going' ? 2 : 1})`)?.focus();
  };
  render(li,
    h('article', { class: 'slot', 'aria-labelledby': `s-${session.id}` },
      h('div', { class: 'slot-date', 'aria-hidden': 'true' },
        h('span', { class: 'dow', text: fmt.dow(session.startsAt) }),
        h('span', { class: 'day', text: fmt.day(session.startsAt) }),
        h('span', { class: 'month', text: fmt.month(session.startsAt) }),
      ),
      h('div', { class: 'slot-body' },
        h('p', { class: 'slot-time' },
          h('span', { class: 'visually-hidden', text: `${fmt.date(session.startsAt)}, ` }),
          `${fmt.time(session.startsAt)} to ${fmt.time(session.endsAt)}`),
        h('h3', { id: `s-${session.id}`, text: session.topic }),
        h('p', { class: 'slot-meta' },
          showGroup ? h('a', { class: 'group-link', href: `#/groups/${session.groupId}`, text: session.groupTitle }) : null,
          place,
          h('span', { text: `${session.durationMinutes} min` }),
          h('span', { text: `planned by ${session.canEdit ? 'you' : session.createdBy.name}` }),
        ),
        agendaBlock(session),
        rsvpRow(session, canAnswer, replaceWith),
        actions,
      ),
    ),
  );
  return li;
}

function moveDialog(session, onChanged) {
  const start = new Date(session.startsAt);
  const form = h('div', { class: 'form-row' },
    h('div', { class: 'field' }, h('label', { for: 'mv-date', text: 'Day' }), h('input', { id: 'mv-date', name: 'date', type: 'date', value: localDate(start), required: true })),
    h('div', { class: 'field' }, h('label', { for: 'mv-time', text: 'Start' }), h('input', { id: 'mv-time', name: 'time', type: 'time', value: localTime(start), required: true })),
    h('div', { class: 'field' }, h('label', { for: 'mv-dur', text: 'Length' }),
      h('select', { id: 'mv-dur', name: 'durationMinutes' }, [...new Set([...DURATIONS, session.durationMinutes])].sort((a, b) => a - b)
        .map((m) => h('option', { value: m, selected: m === session.durationMinutes, text: `${m} minutes` })))),
  );
  openDialog({
    title: `Move "${session.topic}"`,
    confirmLabel: 'Move session',
    form,
    async onConfirm(data) {
      await api(`/sessions/${session.id}`, {
        method: 'PATCH',
        body: { startsAt: toIso(data.get('date'), data.get('time')), durationMinutes: Number(data.get('durationMinutes')) },
      });
      toast('Session moved.');
      onChanged();
    },
  });
}

function cancelDialog(session, onChanged) {
  openDialog({
    title: `Cancel "${session.topic}"?`,
    body: 'The session disappears from the group timetable for everyone.',
    confirmLabel: 'Cancel session',
    danger: true,
    async onConfirm() {
      await api(`/sessions/${session.id}`, { method: 'DELETE' });
      toast('Session cancelled.');
      onChanged();
    },
  });
}

function planner(group, reload) {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const errorBox = h('p', { class: 'alert', role: 'alert', tabindex: '-1', hidden: true });
  const note = h('p', { class: 'suggestion-note', id: 'agenda-note', 'aria-live': 'polite' });
  const agenda = h('textarea', { id: 'pl-agenda', name: 'agenda', maxlength: 4000, rows: 7, 'aria-describedby': 'agenda-note', placeholder: 'What will you cover, and in what order?' });
  let agendaSource = 'manual';
  agenda.addEventListener('input', () => {
    if (agendaSource === 'model') {
      note.textContent = 'AI suggestion, edited by you.';
    }
  });

  const suggest = h('button', { type: 'button', class: 'btn' }, 'Suggest an agenda');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Schedule session');

  const form = h('form', { class: 'form-grid', novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'pl-topic', text: 'Topic' }),
      h('input', { id: 'pl-topic', name: 'topic', required: true, minlength: 3, maxlength: 120, placeholder: 'Past exam 2025, part A' })),
    h('div', { class: 'form-row' },
      h('div', { class: 'field' }, h('label', { for: 'pl-date', text: 'Day' }), h('input', { id: 'pl-date', name: 'date', type: 'date', min: localDate(new Date()), value: localDate(tomorrow), required: true })),
      h('div', { class: 'field' }, h('label', { for: 'pl-time', text: 'Start' }), h('input', { id: 'pl-time', name: 'time', type: 'time', value: '17:00', required: true })),
      h('div', { class: 'field' }, h('label', { for: 'pl-dur', text: 'Length' }),
        h('select', { id: 'pl-dur', name: 'durationMinutes' }, DURATIONS.map((m) => h('option', { value: m, selected: m === 60, text: `${m} minutes` })))),
    ),
    h('div', { class: 'field' }, h('label', { for: 'pl-loc', text: 'Where (optional)' }),
      h('input', { id: 'pl-loc', name: 'location', maxlength: 300, placeholder: 'Library room 2.14, or a meeting link', 'aria-describedby': 'pl-loc-hint' }),
      h('span', { class: 'hint', id: 'pl-loc-hint', text: 'Links that start with https:// become clickable.' })),
    h('div', { class: 'field' },
      h('label', { for: 'pl-agenda', text: 'Agenda (optional)' }),
      h('div', { class: 'agenda-tools' }, suggest, note),
      agenda,
    ),
    errorBox,
    h('div', { class: 'form-actions' }, submit),
  );

  for (const name of ['time', 'durationMinutes']) {
    form.elements[name].addEventListener('change', () => {
      if (agendaSource !== 'manual' && agenda.value) {
        note.textContent = 'The start or the length changed. Click "Suggest an agenda" again to update the times.';
      }
    });
  }

  suggest.addEventListener('click', async () => {
    const topic = form.elements.topic.value.trim();
    if (topic.length < 3) {
      note.textContent = 'Write the topic first, so the suggestion has something to plan around.';
      form.elements.topic.focus();
      return;
    }
    const done = busy(suggest, 'Thinking…');
    note.textContent = 'Asking the AI assistant for an agenda. This can take a few seconds.';
    try {
      const result = await api('/agenda', {
        method: 'POST',
        body: {
          topic,
          category: group.category,
          durationMinutes: Number(form.elements.durationMinutes.value),
          startTime: form.elements.time.value || undefined,
        },
      });
      agenda.value = result.agenda;
      agendaSource = result.source;
      note.textContent = result.source === 'model'
        ? 'AI suggestion: read it and change anything before you save.'
        : result.notice;
    } catch (error) {
      note.textContent = `${error.message} You can still write the agenda yourself.`;
    } finally {
      done();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const data = new FormData(form);
    const done = busy(submit, 'Scheduling…');
    try {
      await api(`/groups/${group.id}/sessions`, {
        method: 'POST',
        body: {
          topic: data.get('topic'),
          startsAt: toIso(data.get('date'), data.get('time')),
          durationMinutes: Number(data.get('durationMinutes')),
          location: data.get('location'),
          agenda: data.get('agenda'),
          agendaSource: data.get('agenda') ? agendaSource : 'manual',
        },
      });
      toast(`${data.get('topic')} is in the timetable.`);
      reload();
    } catch (error) {
      done();
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      errorBox.focus();
    }
  });

  return h('section', { class: 'planner', 'aria-labelledby': 'planner-title' },
    h('h2', { id: 'planner-title', text: 'Plan a session' }),
    form,
  );
}

async function copyInvite(group) {
  const link = `${location.origin}/#/groups/${group.id}`;
  try {
    await navigator.clipboard.writeText(link);
    toast(`Invite link copied. Anyone signed in can open ${group.title} with it.`);
  } catch {
    openDialog({
      title: 'Invite link',
      body: 'Copy this address and send it to the people you want in the group.',
      confirmLabel: 'Done',
      form: h('input', { readonly: true, value: link, 'aria-label': 'Invite link', on: { focus: (e) => e.target.select() } }),
      async onConfirm() {},
    });
  }
}

function deleteGroup(group, go) {
  openDialog({
    title: `Delete ${group.title}?`,
    body: `This removes the group, its ${group.memberCount} membership${group.memberCount === 1 ? '' : 's'} and every planned session. It cannot be undone.`,
    confirmLabel: 'Delete group',
    danger: true,
    async onConfirm() {
      await api(`/groups/${group.id}`, { method: 'DELETE' });
      toast(`${group.title} was deleted.`);
      go('/groups');
    },
  });
}

function loadingState() {
  return h('div', { class: 'page', 'aria-busy': 'true' },
    h('p', { class: 'boot', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading the group…'));
}

export async function groupView(main, ctx) {
  const [id] = ctx.params;
  render(main, loadingState());

  let group;
  try {
    ({ group } = await api(`/groups/${id}`));
  } catch (error) {
    if (!ctx.isCurrent()) return;
    const missing = error.status === 404;
    render(main, h('div', { class: 'page' },
      h('a', { class: 'back', href: '#/groups' }, 'All groups'),
      h('div', { class: `state${missing ? '' : ' is-error'}`, role: 'alert' },
        h('h1', { text: missing ? 'This group does not exist any more' : 'The group could not be loaded' }),
        h('p', { text: missing ? 'Its creator may have deleted it. Pick another one from the list.' : error.message }),
        missing
          ? h('a', { class: 'btn btn-primary', href: '#/groups' }, 'Browse groups')
          : h('button', { type: 'button', class: 'btn', on: { click: () => groupView(main, ctx) } }, 'Try again'),
      ),
    ));
    return;
  }
  if (!ctx.isCurrent()) return;

  const reload = () => groupView(main, ctx);

  const sessions = group.sessions.length
    ? h('ol', { class: 'timetable' }, group.sessions.map((s) => sessionSlot(s, { onChanged: reload, canAnswer: group.isMember })))
    : h('div', { class: 'state' },
        h('h3', { text: 'Nothing planned yet' }),
        h('p', { text: group.isMember ? 'Pick a time below and the whole group will see it here.' : 'Join the group to plan the first session.' }),
      );

  render(main, h('div', { class: 'page' },
    h('a', { class: 'back', href: '#/groups' }, 'All groups'),
    h('header', { class: 'group-head', dataset: { cat: group.category } },
      h('span', { class: 'cat', dataset: { cat: group.category }, text: categoryLabel(group.category) }),
      h('h1', { text: group.title }),
      h('p', { class: 'lede', text: group.subject }),
      h('div', { class: 'group-head-actions' },
        h('span', { class: 'group-seats' }, seats(group, group.isMember)),
        h('span', { class: 'seat-label', text: seatText(group) }),
        group.isOwner
          ? h('button', { type: 'button', class: 'btn btn-danger', on: { click: () => deleteGroup(group, ctx.go) } }, 'Delete group')
          : membershipButton(group, reload),
        h('button', { type: 'button', class: 'btn', on: { click: () => copyInvite(group) } }, 'Copy invite link'),
      ),
    ),
    h('div', { class: 'split' },
      h('section', { 'aria-labelledby': 'upcoming-title' },
        h('div', { class: 'section-title' }, h('h2', { id: 'upcoming-title', text: 'Upcoming sessions' })),
        sessions,
        group.isMember ? planner(group, reload) : null,
      ),
      h('aside', {},
        chatPanel(group),
        h('section', { class: 'aside-block', 'aria-labelledby': 'about-title' },
          h('h2', { id: 'about-title', text: 'About' }),
          h('p', { text: group.description || 'The creator has not described this group yet.' }),
          h('p', { class: 'hint', text: `Started by ${group.isOwner ? 'you' : group.creator.name}.` }),
        ),
        h('section', { class: 'aside-block', 'aria-labelledby': 'members-title' },
          h('h2', { id: 'members-title', text: 'Members' }),
          h('ul', { class: 'members' }, group.members.map((m) => h('li', {},
            h('span', { class: 'avatar', 'aria-hidden': 'true', text: initials(m.name) }),
            h('span', {}, m.name, m.id === group.creator.id ? h('small', { text: ' (created the group)' }) : null),
          ))),
        ),
      ),
    ),
  ));
}
