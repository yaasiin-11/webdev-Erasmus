import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import { date, id, integer, oneOf, text } from './validate.js';

const MINUTE = 60 * 1000;
const MAX_DURATION = 480;
export const AGENDA_SOURCES = ['manual', 'model', 'fallback'];

const endOf = (session) => new Date(new Date(session.starts_at).getTime() + session.duration_minutes * MINUTE);

export function upcoming(sessions, now) {
  return sessions.filter((session) => endOf(session) > now);
}

export const RSVP_STATUSES = ['going', 'not_going'];

export function attendance(sessionId, rsvps, viewerId) {
  const mineRow = rsvps.find((r) => r.session_id === sessionId && r.user_id === viewerId);
  const going = rsvps.filter((r) => r.session_id === sessionId && r.status === 'going');
  return {
    going: going.length,
    notGoing: rsvps.filter((r) => r.session_id === sessionId && r.status === 'not_going').length,
    goingNames: going.map((r) => r.name),
    mine: mineRow ? mineRow.status : null,
  };
}

export function toSessionDto(row, viewerId, rsvps = [], { member = true } = {}) {
  return {
    id: row.id,
    groupId: row.group_id,
    groupTitle: row.group_title,
    topic: row.topic,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: endOf(row).toISOString(),
    durationMinutes: row.duration_minutes,
    location: member ? row.location : '',
    locationHidden: !member && row.location !== '',
    agenda: row.agenda,
    agendaSource: row.agenda_source,
    createdBy: { id: row.created_by, name: row.created_by_name },
    canEdit: row.created_by === viewerId,
    attendance: attendance(row.id, rsvps, viewerId),
  };
}

const hhmm = (value) => value.toISOString().slice(11, 16);

export function findClash(sessions, startsAt, durationMinutes, ignoreId = null) {
  const end = startsAt.getTime() + durationMinutes * MINUTE;
  return sessions.find((other) => {
    if (other.id === ignoreId) return false;
    const otherStart = new Date(other.starts_at).getTime();
    return startsAt.getTime() < endOf(other).getTime() && otherStart < end;
  });
}

export function createStudySessionService({ repos, groups, now }) {
  function clean(input, current = {}) {
    const startsAt = date(input.startsAt ?? current.starts_at, 'Start time');
    if (startsAt <= now()) {
      throw new ValidationError('A study session has to start in the future.', 'StartsInPast');
    }
    return {
      topic: text(input.topic ?? current.topic, { field: 'Topic', min: 3, max: 120 }),
      startsAt,
      durationMinutes: integer(input.durationMinutes ?? current.duration_minutes, {
        field: 'Duration',
        min: 15,
        max: MAX_DURATION,
      }),
      location: text(input.location ?? current.location, { field: 'Location', max: 300, optional: true }),
      agenda: text(input.agenda ?? current.agenda, { field: 'Agenda', max: 4000, optional: true }),
      agendaSource: oneOf(input.agendaSource ?? current.agenda_source ?? 'manual', AGENDA_SOURCES, 'Agenda source'),
    };
  }

  function assertNoClash(sessions, session, ignoreId) {
    const clash = findClash(sessions, session.startsAt, session.durationMinutes, ignoreId);
    if (clash) {
      const start = new Date(clash.starts_at);
      throw new ConflictError(
        `This time overlaps "${clash.topic}", which runs ${hhmm(start)}–${hhmm(endOf(clash))} UTC on ${start.toISOString().slice(0, 10)}.`,
        'SessionClash',
      );
    }
  }

  async function withAttendance(sessionId, viewerId) {
    const row = await repos.studySessions.findById(sessionId);
    return toSessionDto(row, viewerId, await repos.studySessions.rsvpsForGroup(row.group_id));
  }

  async function requireSession(sessionId) {
    const session = await repos.studySessions.findById(id(sessionId, 'Session id'));
    if (!session) throw new NotFoundError('This study session does not exist.', 'SessionNotFound');
    return session;
  }

  async function scheduleSession(userId, groupId, input) {
    const group = await groups.requireGroup(userId, groupId);
    if (!group.is_member) {
      throw new ForbiddenError('Only members of this group can schedule study sessions.', 'NotMember');
    }
    const session = clean(input);
    const sessionId = await repos.transaction(async (tx) => {
      await tx.groups.lockById(group.id);
      assertNoClash(await tx.studySessions.listByGroup(group.id), session);
      const newId = await tx.studySessions.insert({ groupId: group.id, createdBy: userId, ...session });
      await tx.studySessions.insertRsvp(newId, userId, 'going', now());
      return newId;
    });
    return withAttendance(sessionId, userId);
  }

  async function rescheduleSession(userId, sessionId, input) {
    const current = await requireSession(sessionId);
    if (current.created_by !== userId) {
      throw new ForbiddenError('Only the person who scheduled this session can change it.', 'NotSessionOwner');
    }
    const session = clean(input, current);
    await repos.transaction(async (tx) => {
      await tx.groups.lockById(current.group_id);
      assertNoClash(await tx.studySessions.listByGroup(current.group_id), session, current.id);
      await tx.studySessions.update(current.id, session);
    });
    return withAttendance(current.id, userId);
  }

  async function cancelSession(userId, sessionId) {
    const current = await requireSession(sessionId);
    if (current.created_by !== userId) {
      throw new ForbiddenError('Only the person who scheduled this session can cancel it.', 'NotSessionOwner');
    }
    await repos.studySessions.delete(current.id);
  }

  async function upcomingForUser(userId) {
    const from = new Date(now().getTime() - MAX_DURATION * MINUTE);
    const [rows, rsvps] = await Promise.all([
      repos.studySessions.listForMember(userId, from),
      repos.studySessions.rsvpsForMember(userId),
    ]);
    return upcoming(rows, now()).map((row) => toSessionDto(row, userId, rsvps));
  }

  async function groupSchedule(viewerId, groupId) {
    const group = await groups.requireGroup(viewerId, groupId);
    const [rows, rsvps] = await Promise.all([
      repos.studySessions.listByGroup(group.id),
      repos.studySessions.rsvpsForGroup(group.id),
    ]);
    return {
      group: { id: group.id, title: group.title },
      sessions: upcoming(rows, now()).map((row) => toSessionDto(row, viewerId, rsvps, { member: group.is_member })),
    };
  }

  async function setRsvp(userId, sessionId, status) {
    const session = await requireSession(sessionId);
    const group = await groups.requireGroup(userId, session.group_id);
    if (!group.is_member) {
      throw new ForbiddenError('Only members of this group can answer for its sessions.', 'NotMember');
    }
    if (endOf(session) <= now()) {
      throw new ValidationError('This session is already over.', 'SessionOver');
    }
    const existing = await repos.studySessions.findRsvp(session.id, userId);
    if (status === null) {
      if (existing) await repos.studySessions.deleteRsvp(session.id, userId);
    } else {
      oneOf(status, RSVP_STATUSES, 'Answer');
      if (existing) await repos.studySessions.updateRsvp(session.id, userId, status, now());
      else await repos.studySessions.insertRsvp(session.id, userId, status, now());
    }
    return withAttendance(session.id, userId);
  }

  return { scheduleSession, rescheduleSession, cancelSession, upcomingForUser, groupSchedule, setRsvp };
}
