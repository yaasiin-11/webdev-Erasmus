import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, startServer, hoursFromStart } from './helpers.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../src/services/errors.js';

describe('study groups list', () => {
  let world;
  let api;
  let cookie;
  before(async () => {
    world = await makeWorld();
    const algebra = await world.group('ana', { title: 'Linear algebra', subject: 'Matrices', maxCapacity: 5 });
    await world.group('boris', { title: 'Civil service law', subject: 'Administrative procedure', category: 'civil-service', description: '' });
    await world.group('boris', { title: 'German B2', subject: 'Goethe exam', category: 'languages', description: 'Speaking practice' });
    await world.services.groups.joinGroup(world.users.boris.id, algebra.id);
    await world.services.studySessions.scheduleSession(world.users.ana.id, algebra.id, {
      topic: 'Eigenvalues', startsAt: hoursFromStart(30), durationMinutes: 60,
    });
    api = await startServer(world);
    cookie = await api.login('carmen@test.dev');
  });
  after(() => api.close());

  test('AC-5 every group shows its title, subject, category and "members / capacity"', async () => {
    const response = await api.request('/api/groups', { cookie });
    assert.equal(response.status, 200);
    assert.equal(response.json.groups.length, 3);
    const algebra = response.json.groups.find((g) => g.title === 'Linear algebra');
    assert.equal(algebra.subject, 'Matrices');
    assert.equal(algebra.category, 'university');
    assert.equal(algebra.memberCount, 2);
    assert.equal(algebra.maxCapacity, 5);
    assert.equal(algebra.isMember, false);
    assert.equal(algebra.isFull, false);
    assert.equal(algebra.creator.name, 'Ana Petrova');
    assert.equal(algebra.nextSessionAt, hoursFromStart(30));
  });

  test('AC-9 the list filters by category, by search text and by "only my groups"', async () => {
    const byCategory = await api.request('/api/groups?category=languages', { cookie });
    assert.deepEqual(byCategory.json.groups.map((g) => g.title), ['German B2']);
    const bySearch = await api.request('/api/groups?q=procedure', { cookie });
    assert.deepEqual(bySearch.json.groups.map((g) => g.title), ['Civil service law']);
    const borisCookie = await api.login('boris@test.dev');
    const mine = await api.request('/api/groups?mine=1', { cookie: borisCookie });
    assert.equal(mine.json.groups.length, 3);
    const carmenMine = await api.request('/api/groups?mine=true', { cookie });
    assert.deepEqual(carmenMine.json.groups, []);
    const bad = await api.request('/api/groups?category=astrology', { cookie });
    assert.equal(bad.status, 422);
    assert.match(bad.json.error, /Category must be one of/);
  });

  test('AC-5 the group page lists members and upcoming sessions, and says if the viewer owns it', async () => {
    const [algebra] = (await world.services.groups.listGroups(world.users.ana.id, { search: 'algebra' }));
    const response = await api.request(`/api/groups/${algebra.id}`, { cookie: await api.login('ana@test.dev') });
    assert.equal(response.status, 200);
    assert.equal(response.json.group.isOwner, true);
    assert.deepEqual(response.json.group.members.map((m) => m.name), ['Ana Petrova', 'Boris Ivanov']);
    assert.equal(response.json.group.sessions[0].topic, 'Eigenvalues');
    assert.equal((await api.request('/api/groups/9999', { cookie })).status, 404);
    assert.equal((await api.request('/api/groups/abc', { cookie })).status, 422);
  });
});

describe('creating, joining and leaving groups', () => {
  let world;
  let api;
  before(async () => {
    world = await makeWorld();
    api = await startServer(world);
  });
  after(() => api.close());

  test('AC-16 the creator becomes the first member of a new group', async () => {
    const cookie = await api.login('ana@test.dev');
    const response = await api.request('/api/groups', {
      method: 'POST',
      cookie,
      body: { title: 'Organic chemistry', subject: 'Reactions', category: 'university', maxCapacity: '3' },
    });
    assert.equal(response.status, 201);
    assert.equal(response.json.group.memberCount, 1);
    assert.equal(response.json.group.isMember, true);
    assert.equal(response.json.group.isOwner, true);
    assert.equal(response.json.group.description, '');
  });

  test('AC-16 a title of 3 to 80 characters and a capacity of 2 to 50 are required', async () => {
    const cookie = await api.login('ana@test.dev');
    const base = { title: 'Physics', subject: 'Optics', category: 'university', maxCapacity: 4 };
    for (const change of [{ title: 'ab' }, { title: 'x'.repeat(81) }, { maxCapacity: 1 }, { maxCapacity: 51 }, { maxCapacity: 2.5 }, { category: 'gaming' }, { subject: undefined }]) {
      const response = await api.request('/api/groups', { method: 'POST', cookie, body: { ...base, ...change } });
      assert.equal(response.status, 422, JSON.stringify(change));
    }
    assert.equal((await api.request('/api/groups', { method: 'POST', body: base })).status, 401);
  });

  test('AC-10 joining a group with free places adds the member and turns the button into "Leave"', async () => {
    const group = await world.group('ana', { maxCapacity: 3 });
    const cookie = await api.login('boris@test.dev');
    const response = await api.request(`/api/groups/${group.id}/membership`, { method: 'POST', cookie });
    assert.equal(response.status, 201);
    assert.equal(response.json.group.memberCount, 2);
    assert.equal(response.json.group.isMember, true);
  });

  test('AC-11 a full group refuses a join with 409 "This group is full." and the count stays the same', async () => {
    const group = await world.group('ana', { maxCapacity: 2 });
    await world.services.groups.joinGroup(world.users.boris.id, group.id);
    const cookie = await api.login('carmen@test.dev');
    const listed = (await api.request('/api/groups', { cookie })).json.groups.find((g) => g.id === group.id);
    assert.equal(listed.isFull, true);
    const response = await api.request(`/api/groups/${group.id}/membership`, { method: 'POST', cookie });
    assert.equal(response.status, 409);
    assert.equal(response.json.error, 'This group is full.');
    assert.equal(await world.repos.groups.countMembers(group.id), 2);
  });

  test('AC-12 joining twice is refused with 409 and the count stays the same', async () => {
    const group = await world.group('ana');
    await assert.rejects(world.services.groups.joinGroup(world.users.ana.id, group.id), ConflictError);
    const cookie = await api.login('ana@test.dev');
    const response = await api.request(`/api/groups/${group.id}/membership`, { method: 'POST', cookie });
    assert.equal(response.status, 409);
    assert.equal(response.json.code, 'AlreadyMember');
    assert.equal(await world.repos.groups.countMembers(group.id), 1);
  });

  test('AC-13 leaving removes the membership and the button goes back to "Join"', async () => {
    const group = await world.group('ana');
    await world.services.groups.joinGroup(world.users.carmen.id, group.id);
    const cookie = await api.login('carmen@test.dev');
    const response = await api.request(`/api/groups/${group.id}/membership`, { method: 'DELETE', cookie });
    assert.equal(response.status, 200);
    assert.equal(response.json.group.memberCount, 1);
    assert.equal(response.json.group.isMember, false);
  });

  test('AC-14 leaving a group you are not in is 409, and a group that does not exist is 404', async () => {
    const group = await world.group('ana');
    const cookie = await api.login('carmen@test.dev');
    const notMember = await api.request(`/api/groups/${group.id}/membership`, { method: 'DELETE', cookie });
    assert.equal(notMember.status, 409);
    assert.equal(notMember.json.code, 'NotMember');
    assert.equal((await api.request('/api/groups/4242/membership', { method: 'DELETE', cookie })).status, 404);
    assert.equal((await api.request('/api/groups/4242/membership', { method: 'POST', cookie })).status, 404);
    await assert.rejects(world.services.groups.joinGroup(world.users.carmen.id, 4242), NotFoundError);
  });

  test('AC-15 joining or leaving without signing in is 401 and nothing changes', async () => {
    const group = await world.group('ana');
    assert.equal((await api.request(`/api/groups/${group.id}/membership`, { method: 'POST' })).status, 401);
    assert.equal((await api.request(`/api/groups/${group.id}/membership`, { method: 'DELETE' })).status, 401);
    assert.equal(await world.repos.groups.countMembers(group.id), 1);
  });

  test('AC-18 the creator cannot leave their own group and is told to delete it instead', async () => {
    const group = await world.group('ana');
    const cookie = await api.login('ana@test.dev');
    const response = await api.request(`/api/groups/${group.id}/membership`, { method: 'DELETE', cookie });
    assert.equal(response.status, 409);
    assert.match(response.json.error, /Delete the group instead/);
  });

  test('AC-17 only the creator can delete a group: others get 403, nobody signed in gets 401', async () => {
    const group = await world.group('ana');
    await world.services.groups.joinGroup(world.users.boris.id, group.id);
    await world.services.studySessions.scheduleSession(world.users.boris.id, group.id, {
      topic: 'Revision', startsAt: hoursFromStart(5), durationMinutes: 30,
    });

    const boris = await api.login('boris@test.dev');
    const forbidden = await api.request(`/api/groups/${group.id}`, { method: 'DELETE', cookie: boris });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.json.error, 'Only the person who created this group can delete it.');
    assert.equal((await api.request(`/api/groups/${group.id}`, { method: 'DELETE' })).status, 401);
    await assert.rejects(world.services.groups.deleteGroup(world.users.carmen.id, group.id), ForbiddenError);

    const ana = await api.login('ana@test.dev');
    assert.equal((await api.request(`/api/groups/${group.id}`, { method: 'DELETE', cookie: ana })).status, 204);
    assert.equal((await api.request(`/api/groups/${group.id}`, { cookie: ana })).status, 404);
    assert.equal(await world.repos.groups.countMembers(group.id), 0);
    assert.deepEqual(await world.repos.studySessions.listByGroup(group.id), []);
  });

  test('AC-16 a search text longer than 80 characters is refused', async () => {
    await assert.rejects(world.services.groups.listGroups(world.users.ana.id, { search: 'x'.repeat(81) }), ValidationError);
    assert.ok(Array.isArray(await world.services.groups.listGroups(world.users.ana.id)));
  });
});
