import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, startServer, hoursFromStart } from './helpers.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../src/services/errors.js';
import { findClash } from '../src/services/studySessionService.js';

describe('scheduling study sessions', () => {
  let world;
  let api;
  let group;
  let ana;
  let boris;
  before(async () => {
    world = await makeWorld();
    group = await world.group('ana', { maxCapacity: 5 });
    await world.services.groups.joinGroup(world.users.boris.id, group.id);
    api = await startServer(world);
    ana = await api.login('ana@test.dev');
    boris = await api.login('boris@test.dev');
  });
  after(() => api.close());

  const schedule = (cookie, body, groupId = group.id) => api.request(`/api/groups/${groupId}/sessions`, { method: 'POST', cookie, body });

  test('AC-19 a member schedules a session and it appears in the group, sorted by start', async () => {
    const later = await schedule(ana, { topic: 'Determinants', startsAt: hoursFromStart(48), durationMinutes: 90, location: 'Room 101' });
    assert.equal(later.status, 201);
    assert.equal(later.json.session.topic, 'Determinants');
    assert.equal(later.json.session.endsAt, hoursFromStart(49.5));
    assert.equal(later.json.session.canEdit, true);
    assert.equal(later.json.session.agendaSource, 'manual');

    const sooner = await schedule(boris, {
      topic: 'Vectors', startsAt: hoursFromStart(24), durationMinutes: 60, agenda: '- intro', agendaSource: 'model',
    });
    assert.equal(sooner.status, 201);

    const page = await api.request(`/api/groups/${group.id}`, { cookie: ana });
    assert.deepEqual(page.json.group.sessions.map((s) => s.topic), ['Vectors', 'Determinants']);
    assert.deepEqual(page.json.group.sessions.map((s) => s.canEdit), [false, true]);
    assert.equal(page.json.group.nextSessionAt, hoursFromStart(24));
  });

  test('AC-20 a signed-in user who is not a member gets 403, nobody signed in gets 401', async () => {
    const carmen = await api.login('carmen@test.dev');
    const response = await schedule(carmen, { topic: 'Sneaky', startsAt: hoursFromStart(100), durationMinutes: 60 });
    assert.equal(response.status, 403);
    assert.equal(response.json.error, 'Only members of this group can schedule study sessions.');
    assert.equal((await schedule(undefined, { topic: 'Anon', startsAt: hoursFromStart(100), durationMinutes: 60 })).status, 401);
    assert.equal((await schedule(ana, { topic: 'Ghost', startsAt: hoursFromStart(100), durationMinutes: 60 }, 9999)).status, 404);
  });

  test('AC-21 a session that overlaps another one of the same group is refused with 409 naming the clash', async () => {
    await schedule(ana, { topic: 'Matrix rank', startsAt: hoursFromStart(72), durationMinutes: 60 });
    const clash = await schedule(boris, { topic: 'Overlap', startsAt: hoursFromStart(72.5), durationMinutes: 60 });
    assert.equal(clash.status, 409);
    assert.match(clash.json.error, /overlaps "Matrix rank", which runs 09:00–10:00 UTC on 2030-03-07/);

    const before = await schedule(boris, { topic: 'Ends as it starts', startsAt: hoursFromStart(71), durationMinutes: 60 });
    assert.equal(before.status, 201);
    const after = await schedule(boris, { topic: 'Starts as it ends', startsAt: hoursFromStart(73), durationMinutes: 30 });
    assert.equal(after.status, 201);
  });

  test('AC-21 another group may meet at the same time', async () => {
    const other = await world.group('boris');
    const response = await schedule(boris, { topic: 'Matrix rank too', startsAt: hoursFromStart(72), durationMinutes: 60 }, other.id);
    assert.equal(response.status, 201);
  });

  test('AC-22 a start in the past, a bad date or a length outside 15 to 480 minutes is 422', async () => {
    for (const body of [
      { topic: 'Past', startsAt: hoursFromStart(-1), durationMinutes: 60 },
      { topic: 'Bad date', startsAt: 'next tuesday', durationMinutes: 60 },
      { topic: 'No date', durationMinutes: 60 },
      { topic: 'Too short', startsAt: hoursFromStart(200), durationMinutes: 10 },
      { topic: 'Too long', startsAt: hoursFromStart(200), durationMinutes: 481 },
      { topic: 'x', startsAt: hoursFromStart(200), durationMinutes: 60 },
      { topic: 'Bad source', startsAt: hoursFromStart(200), durationMinutes: 60, agendaSource: 'oracle' },
    ]) {
      const response = await schedule(ana, body);
      assert.equal(response.status, 422, body.topic);
    }
    await assert.rejects(
      world.services.studySessions.scheduleSession(world.users.ana.id, group.id, { topic: 'Now', startsAt: hoursFromStart(0), durationMinutes: 30 }),
      ValidationError,
    );
  });

  test('AC-23 only the person who scheduled a session can move or cancel it', async () => {
    const created = await schedule(ana, { topic: 'Orthogonality', startsAt: hoursFromStart(120), durationMinutes: 60 });
    const id = created.json.session.id;

    const forbidden = await api.request(`/api/sessions/${id}`, { method: 'PATCH', cookie: boris, body: { topic: 'Hijacked' } });
    assert.equal(forbidden.status, 403);
    assert.equal((await api.request(`/api/sessions/${id}`, { method: 'DELETE', cookie: boris })).status, 403);
    assert.equal((await api.request(`/api/sessions/${id}`, { method: 'PATCH', body: { topic: 'Anon' } })).status, 401);

    const moved = await api.request(`/api/sessions/${id}`, {
      method: 'PATCH', cookie: ana, body: { startsAt: hoursFromStart(121), durationMinutes: 45 },
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.json.session.topic, 'Orthogonality');
    assert.equal(moved.json.session.startsAt, hoursFromStart(121));
    assert.equal(moved.json.session.durationMinutes, 45);

    assert.equal((await api.request(`/api/sessions/${id}`, { method: 'DELETE', cookie: ana })).status, 204);
    assert.equal((await api.request(`/api/sessions/${id}`, { method: 'DELETE', cookie: ana })).status, 404);
    await assert.rejects(world.services.studySessions.cancelSession(world.users.boris.id, 'zero'), ValidationError);
  });

  test('AC-23 moving a session onto another one is refused, moving it within its own slot is fine', async () => {
    const first = await world.services.studySessions.scheduleSession(world.users.ana.id, group.id, {
      topic: 'Slot A', startsAt: hoursFromStart(300), durationMinutes: 60,
    });
    await world.services.studySessions.scheduleSession(world.users.boris.id, group.id, {
      topic: 'Slot B', startsAt: hoursFromStart(302), durationMinutes: 60,
    });
    await assert.rejects(
      world.services.studySessions.rescheduleSession(world.users.ana.id, first.id, { startsAt: hoursFromStart(301.5) }),
      ConflictError,
    );
    const nudged = await world.services.studySessions.rescheduleSession(world.users.ana.id, first.id, { startsAt: hoursFromStart(300.25) });
    assert.equal(nudged.startsAt, hoursFromStart(300.25));
    await assert.rejects(world.services.studySessions.rescheduleSession(world.users.boris.id, first.id, {}), ForbiddenError);
    await assert.rejects(world.services.studySessions.rescheduleSession(world.users.ana.id, 777777, {}), NotFoundError);
  });

  test('AC-24 "My sessions" lists upcoming sessions from all my groups and hides finished ones', async () => {
    const fresh = await makeWorld();
    const g1 = await fresh.group('ana', { title: 'Group one' });
    const g2 = await fresh.group('boris', { title: 'Group two' });
    const g3 = await fresh.group('boris', { title: 'Not mine' });
    await fresh.services.groups.joinGroup(fresh.users.ana.id, g2.id);
    const s = fresh.services.studySessions;
    await s.scheduleSession(fresh.users.ana.id, g1.id, { topic: 'Soon over', startsAt: hoursFromStart(1), durationMinutes: 60 });
    await s.scheduleSession(fresh.users.boris.id, g2.id, { topic: 'Running long', startsAt: hoursFromStart(1.5), durationMinutes: 240 });
    await s.scheduleSession(fresh.users.boris.id, g2.id, { topic: 'Next week', startsAt: hoursFromStart(170), durationMinutes: 60 });
    await s.scheduleSession(fresh.users.boris.id, g3.id, { topic: 'Someone else', startsAt: hoursFromStart(3), durationMinutes: 60 });

    fresh.advance(2.5);
    const mine = await s.upcomingForUser(fresh.users.ana.id);
    assert.deepEqual(mine.map((x) => [x.topic, x.groupTitle]), [['Running long', 'Group two'], ['Next week', 'Group two']]);

    const freshApi = await startServer(fresh);
    try {
      const cookie = await freshApi.login('carmen@test.dev');
      const empty = await freshApi.request('/api/sessions/upcoming', { cookie });
      assert.equal(empty.status, 200);
      assert.deepEqual(empty.json.sessions, []);
    } finally {
      await freshApi.close();
    }
  });

  test('AC-31 the schedule of one group lists only its upcoming sessions', async () => {
    const schedule31 = await world.services.studySessions.groupSchedule(world.users.carmen.id, group.id);
    assert.equal(schedule31.group.title, 'Linear algebra');
    assert.ok(schedule31.sessions.every((s) => new Date(s.endsAt) > world.clock.current));
    await assert.rejects(world.services.studySessions.groupSchedule(world.users.carmen.id, 5555), NotFoundError);
  });

  test('AC-21 the clash rule treats touching sessions as fine and ignores the session being moved', () => {
    const existing = [{ id: 1, starts_at: '2030-01-01T10:00:00Z', duration_minutes: 60 }];
    const at = (iso) => new Date(iso);
    assert.equal(findClash(existing, at('2030-01-01T11:00:00Z'), 30), undefined);
    assert.equal(findClash(existing, at('2030-01-01T09:30:00Z'), 30), undefined);
    assert.equal(findClash(existing, at('2030-01-01T09:30:00Z'), 31).id, 1);
    assert.equal(findClash(existing, at('2030-01-01T10:30:00Z'), 60, 1), undefined);
  });
});
