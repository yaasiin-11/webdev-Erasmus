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

  test('AC-36 emoji from the picker are stored and returned exactly as typed', async () => {
    const sent = await post(ana, '📚🔥 good luck tomorrow 🍀👍🏽');
    assert.equal(sent.status, 201);
    const back = (await read(boris)).json.messages.at(-1);
    assert.equal(back.body, '📚🔥 good luck tomorrow 🍀👍🏽');
  });

  test('AC-39 HTML in a message is stored as plain text, never as markup', async () => {
    const sent = await post(ana, '<img src=x onerror=alert(1)>');
    assert.equal(sent.json.message.body, '<img src=x onerror=alert(1)>');
  });
});

describe('reactions and unread messages', () => {
  let world;
  let api;
  let group;
  let ana;
  let boris;
  before(async () => {
    world = await makeWorld();
    group = await world.group('ana', { title: 'Reactions group' });
    await world.services.groups.joinGroup(world.users.boris.id, group.id);
    api = await startServer(world);
    ana = await api.login('ana@test.dev');
    boris = await api.login('boris@test.dev');
  });
  after(() => api.close());

  const react = (cookie, messageId, emoji) => api.request(`/api/messages/${messageId}/reactions`, { method: 'POST', cookie, body: { emoji } });

  test('AC-43 a member reacts with an emoji, everyone sees the count and who reacted, and a second click takes it back', async () => {
    const message = (await api.request(`/api/groups/${group.id}/messages`, { method: 'POST', cookie: ana, body: { body: 'Exam moved to Friday!' } })).json.message;
    assert.deepEqual(message.reactions, []);

    const first = await react(boris, message.id, '🎉');
    assert.equal(first.status, 200);
    assert.deepEqual(first.json.message.reactions, [{ emoji: '🎉', count: 1, mine: true, names: ['Boris Ivanov'] }]);
    world.advance(0.01);
    await react(ana, message.id, '🎉');
    await react(ana, message.id, '👍');

    const seen = (await api.request(`/api/groups/${group.id}/messages`, { cookie: ana })).json.messages[0];
    assert.deepEqual(seen.reactions, [
      { emoji: '👍', count: 1, mine: true, names: ['Ana Petrova'] },
      { emoji: '🎉', count: 2, mine: true, names: ['Boris Ivanov', 'Ana Petrova'] },
    ]);

    const undone = await react(boris, message.id, '🎉');
    assert.deepEqual(undone.json.message.reactions.find((r) => r.emoji === '🎉'), { emoji: '🎉', count: 1, mine: false, names: ['Ana Petrova'] });
  });

  test('AC-43 only the offered emoji are accepted, and only members of the group can react', async () => {
    const message = (await api.request(`/api/groups/${group.id}/messages`, { method: 'POST', cookie: ana, body: { body: 'React to me' } })).json.message;
    assert.equal((await react(ana, message.id, '💩')).status, 422);
    const carmen = await api.login('carmen@test.dev');
    assert.equal((await react(carmen, message.id, '👍')).status, 403);
    assert.equal((await react(undefined, message.id, '👍')).status, 401);
    assert.equal((await react(ana, 999999, '👍')).status, 404);
  });

  test('AC-44 the groups list shows how many messages a member has not read yet, and opening the chat clears it', async () => {
    const unreadFor = async (cookie) => (await api.request('/api/groups', { cookie })).json.groups.find((g) => g.id === group.id).unreadCount;
    await api.request(`/api/groups/${group.id}/messages`, { cookie: boris });
    assert.equal(await unreadFor(boris), 0);

    for (const body of ['one', 'two', 'three']) {
      await api.request(`/api/groups/${group.id}/messages`, { method: 'POST', cookie: ana, body: { body } });
    }
    assert.equal(await unreadFor(boris), 3);
    assert.equal(await unreadFor(ana), 0);

    await api.request(`/api/groups/${group.id}/messages`, { cookie: boris });
    assert.equal(await unreadFor(boris), 0);

    const outsider = await api.login('carmen@test.dev');
    assert.equal(await unreadFor(outsider), 0);
  });

  test('AC-44 reading older messages never moves the read marker backwards', async () => {
    await world.services.chat.listMessages(world.users.boris.id, group.id, { after: 0 });
    const before = await world.repos.messages.lastRead(group.id, world.users.boris.id);
    await world.services.chat.listMessages(world.users.boris.id, group.id, { after: '1' });
    assert.equal(await world.repos.messages.lastRead(group.id, world.users.boris.id), before);
    assert.deepEqual(await world.services.chat.listMessages(world.users.boris.id, group.id, { after: before }), []);
  });

  test('AC-17 deleting a group removes its messages, reactions and read markers too', async () => {
    const doomed = await world.group('ana', { title: 'Short-lived' });
    const message = await world.services.chat.postMessage(world.users.ana.id, doomed.id, { body: 'bye' });
    await world.services.chat.toggleReaction(world.users.ana.id, message.id, '👀');
    await world.services.groups.deleteGroup(world.users.ana.id, doomed.id);
    const { rows } = await world.pool.query('SELECT COUNT(*)::int AS n FROM message_reactions WHERE message_id = $1', [message.id]);
    assert.equal(rows[0].n, 0);
    assert.equal(await world.repos.messages.findById(message.id), null);
  });
});
