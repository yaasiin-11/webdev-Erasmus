import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, startServer } from './helpers.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../src/services/errors.js';

describe('group chat', () => {
  let world;
  let api;
  let group;
  let ana;
  let boris;
  let carmen;
  before(async () => {
    world = await makeWorld();
    group = await world.group('ana');
    await world.services.groups.joinGroup(world.users.boris.id, group.id);
    api = await startServer(world);
    ana = await api.login('ana@test.dev');
    boris = await api.login('boris@test.dev');
    carmen = await api.login('carmen@test.dev');
  });
  after(() => api.close());

  const post = (cookie, body, groupId = group.id) => api.request(`/api/groups/${groupId}/messages`, { method: 'POST', cookie, body: { body } });
  const read = (cookie, query = '', groupId = group.id) => api.request(`/api/groups/${groupId}/messages${query}`, { cookie });

  test('AC-36 a member writes a message and every member sees it with the author and the time', async () => {
    const sent = await post(ana, '  Who has the solutions to sheet 4?  ');
    assert.equal(sent.status, 201);
    assert.equal(sent.json.message.body, 'Who has the solutions to sheet 4?');
    assert.equal(sent.json.message.author.name, 'Ana Petrova');
    assert.equal(sent.json.message.mine, true);
    assert.equal(sent.json.message.createdAt, world.clock.current.toISOString());

    const seen = await read(boris);
    assert.equal(seen.status, 200);
    assert.deepEqual(seen.json.messages.map((m) => [m.author.name, m.body, m.mine]), [['Ana Petrova', 'Who has the solutions to sheet 4?', false]]);
  });

  test('AC-37 asking only for messages after the last one seen returns just the new ones, oldest first', async () => {
    const before = (await read(boris)).json.messages;
    const last = before[before.length - 1].id;
    await post(boris, 'I do, I will bring them on Tuesday.');
    await post(ana, 'Perfect, thanks!');
    const fresh = await read(ana, `?after=${last}`);
    assert.deepEqual(fresh.json.messages.map((m) => m.body), ['I do, I will bring them on Tuesday.', 'Perfect, thanks!']);
    assert.deepEqual((await read(ana, `?after=${fresh.json.messages[1].id}`)).json.messages, []);
    assert.equal((await read(ana, '?after=abc')).status, 422);
  });

  test('AC-37 the chat opens on the latest 50 messages', async () => {
    const busy = await world.group('boris', { title: 'Busy chat' });
    for (let i = 1; i <= 55; i += 1) {
      await world.services.chat.postMessage(world.users.boris.id, busy.id, { body: `message ${i}` });
    }
    const page = await world.services.chat.listMessages(world.users.boris.id, busy.id);
    assert.equal(page.length, 50);
    assert.equal(page[0].body, 'message 6');
    assert.equal(page[49].body, 'message 55');
  });

  test('AC-38 somebody who is not a member can neither read nor write, and nobody signed in gets 401', async () => {
    const reading = await read(carmen);
    assert.equal(reading.status, 403);
    assert.equal(reading.json.error, 'Only members of this group can read its chat.');
    const writing = await post(carmen, 'hello?');
    assert.equal(writing.status, 403);
    assert.equal((await read(undefined)).status, 401);
    assert.equal((await post(undefined, 'hi')).status, 401);
    assert.equal((await read(carmen, '', 99999)).status, 404);
  });

  test('AC-39 an empty message or one over 1000 characters is refused with 422', async () => {
    assert.equal((await post(ana, '   ')).status, 422);
    assert.equal((await post(ana, 'x'.repeat(1001))).status, 422);
    assert.equal((await post(ana, 'x'.repeat(1000))).status, 201);
    await assert.rejects(world.services.chat.postMessage(world.users.ana.id, group.id, {}), ValidationError);
  });

  test('AC-40 authors can delete their own messages, the group creator any message, others get 403', async () => {
    const borisMessage = (await post(boris, 'Typo, ignore')).json.message;
    const anaMessage = (await post(ana, 'Ana writes this')).json.message;

    const forbidden = await api.request(`/api/messages/${anaMessage.id}`, { method: 'DELETE', cookie: boris });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.json.error, 'You can only delete your own messages.');
    assert.equal((await api.request(`/api/messages/${borisMessage.id}`, { method: 'DELETE', cookie: boris })).status, 204);

    const another = (await post(boris, 'Off-topic advert')).json.message;
    assert.equal((await api.request(`/api/messages/${another.id}`, { method: 'DELETE', cookie: ana })).status, 204);
    assert.equal((await api.request(`/api/messages/${another.id}`, { method: 'DELETE', cookie: ana })).status, 404);
    assert.equal((await api.request(`/api/messages/${anaMessage.id}`, { method: 'DELETE' })).status, 401);

    const bodies = (await read(ana)).json.messages.map((m) => m.body);
    assert.ok(!bodies.includes('Typo, ignore') && !bodies.includes('Off-topic advert') && bodies.includes('Ana writes this'));
    await assert.rejects(world.services.chat.deleteMessage(world.users.carmen.id, anaMessage.id), ForbiddenError);
    await assert.rejects(world.services.chat.deleteMessage(world.users.ana.id, 123456), NotFoundError);
  });

  test('AC-38 leaving a group also closes its chat for that person', async () => {
    await world.services.groups.leaveGroup(world.users.boris.id, group.id);
    assert.equal((await read(boris)).status, 403);
    await world.services.groups.joinGroup(world.users.boris.id, group.id);
  });

  test('AC-39 HTML in a message is stored as plain text, never as markup', async () => {
    const sent = await post(ana, '<img src=x onerror=alert(1)>');
    assert.equal(sent.json.message.body, '<img src=x onerror=alert(1)>');
  });
});
