import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld, hoursFromStart } from './helpers.js';
import { createMcpHandler, TOOLS } from '../mcp-server/tools.js';

const lectures = JSON.parse(readFileSync(new URL('../mcp-server/lectures.json', import.meta.url), 'utf8'));
const call = (id, name, args = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const textOf = (reply) => reply.result.content[0].text;

describe('MCP server', () => {
  let world;
  let algebra;
  let anaToken;
  let carmenToken;
  const handlerFor = (token, getServices = async () => world.services) => createMcpHandler({ lectures, getServices, token });

  before(async () => {
    world = await makeWorld();
    algebra = await world.group('ana', { title: 'Linear algebra', category: 'university' });
    await world.group('boris', { title: 'Spanish C1', subject: 'DELE', category: 'languages' });
    await world.services.studySessions.scheduleSession(world.users.ana.id, algebra.id, {
      topic: 'Eigenvalues', startsAt: hoursFromStart(24), durationMinutes: 60, location: 'Room 4', agenda: '- warm-up\n- proofs',
    });
    anaToken = await world.services.auth.issueMcpToken(world.users.ana.id);
    carmenToken = await world.services.auth.issueMcpToken(world.users.carmen.id);
  });

  test('the handshake, the tool list and protocol errors follow the MCP shape', async () => {
    const handle = handlerFor(anaToken);
    const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
    assert.equal(init.result.protocolVersion, '2025-11-25');
    assert.deepEqual(init.result.capabilities, { tools: {} });
    assert.equal((await handle({ jsonrpc: '2.0', id: 9, method: 'initialize' })).result.protocolVersion, '2025-11-25');
    assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
    const list = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.deepEqual(list.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
    assert.ok(list.result.tools.every((t) => t.description.length >= 20 && t.inputSchema.type === 'object'));
    assert.equal((await handle(call(3, 'no_such_tool'))).error.code, -32602);
    assert.equal((await handle({ jsonrpc: '2.0', id: 4, method: 'nonsense' })).error.code, -32601);
    assert.equal(await handle({ jsonrpc: '2.0', method: 'nonsense' }), null);
    assert.equal(await handle(null), null);
  });

  test('find_lecture and list_lectures read the course file', async () => {
    const handle = handlerFor(undefined);
    assert.match(textOf(await handle(call(1, 'find_lecture', { number: 5 }))), /^Lecture 5: /);
    const missing = await handle(call(2, 'find_lecture', { number: 99 }));
    assert.equal(missing.result.isError, true);
    assert.match(textOf(await handle(call(3, 'list_lectures'))), /^1\. /);
  });

  test('AC-29 list_study_groups returns the same groups as the website filter, as the token\'s user', async () => {
    const handle = handlerFor(anaToken);
    const all = textOf(await handle(call(1, 'list_study_groups')));
    assert.match(all, /Linear algebra \(university, Matrices\): 1\/4 members, you are a member, next session 2030-03-05 09:00 UTC/);
    assert.match(all, /Spanish C1 \(languages, DELE\): 1\/4 members, no session planned/);

    const languages = textOf(await handle(call(2, 'list_study_groups', { category: 'languages' })));
    const website = await world.services.groups.listGroups(world.users.ana.id, { category: 'languages' });
    assert.equal(languages.split('\n').length, website.length);

    assert.equal(textOf(await handle(call(3, 'list_study_groups', { search: 'zzz' }))), 'No study groups match.');
    assert.equal(textOf(await handle(call(4, 'list_study_groups', { mine: true }))).split('\n').length, 1);
    const invalid = await handle(call(5, 'list_study_groups', { category: 'astrology' }));
    assert.equal(invalid.result.isError, true);
  });

  test('AC-30 create_study_session goes through the same rules as the website', async () => {
    const ana = handlerFor(anaToken);
    const created = await ana(call(1, 'create_study_session', {
      groupId: algebra.id, topic: 'Diagonalisation', startsAt: hoursFromStart(48), durationMinutes: 90,
    }));
    assert.equal(created.result.isError, false);
    assert.match(textOf(created), /^Scheduled\. #\d+ Diagonalisation: 2030-03-06 09:00 UTC to 2030-03-06 10:30 UTC, by Ana Petrova, 1 going$/);

    const clash = await ana(call(2, 'create_study_session', {
      groupId: algebra.id, topic: 'Clash', startsAt: hoursFromStart(48.5), durationMinutes: 30,
    }));
    assert.equal(clash.result.isError, true);
    assert.match(textOf(clash), /overlaps "Diagonalisation"/);

    const outsider = await handlerFor(carmenToken)(call(3, 'create_study_session', {
      groupId: algebra.id, topic: 'Not my group', startsAt: hoursFromStart(200), durationMinutes: 30,
    }));
    assert.equal(outsider.result.isError, true);
    assert.equal(textOf(outsider), 'Only members of this group can schedule study sessions.');

    const anonymous = await handlerFor(undefined)(call(4, 'create_study_session', {
      groupId: algebra.id, topic: 'Who am I', startsAt: hoursFromStart(200), durationMinutes: 30,
    }));
    assert.equal(anonymous.result.isError, true);
    assert.match(textOf(anonymous), /needs a valid MCP_TOKEN/);

    const revoked = await handlerFor('shmcp_made-up')(call(5, 'list_study_groups'));
    assert.match(textOf(revoked), /not valid any more/);
  });

  test('AC-31 get_group_schedule lists upcoming sessions with their agenda, and says when there are none', async () => {
    const handle = handlerFor(carmenToken);
    const schedule = textOf(await handle(call(1, 'get_group_schedule', { groupId: algebra.id })));
    assert.match(schedule, /^Upcoming sessions of Linear algebra:\n#\d+ Eigenvalues: 2030-03-05 09:00 UTC to 2030-03-05 10:00 UTC at Room 4, by Ana Petrova, 1 going\n  - warm-up\n  - proofs/);
    const spanish = (await world.services.groups.listGroups(world.users.carmen.id, { category: 'languages' }))[0];
    assert.equal(textOf(await handle(call(2, 'get_group_schedule', { groupId: spanish.id }))), 'Spanish C1 has no upcoming sessions.');
    const missing = await handle(call(3, 'get_group_schedule', { groupId: 424242 }));
    assert.equal(missing.result.isError, true);
    assert.equal(textOf(missing), 'This study group does not exist.');
  });

  test('a broken database connection becomes a readable tool error, not a crash', async () => {
    const logged = [];
    const unavailable = createMcpHandler({
      lectures,
      token: anaToken,
      log: (line) => logged.push(line),
      getServices: async () => {
        throw Object.assign(new Error('ECONNREFUSED'), { userMessage: 'The MCP server needs DATABASE_URL.' });
      },
    });
    const reply = await unavailable(call(1, 'list_study_groups'));
    assert.equal(reply.result.isError, true);
    assert.equal(textOf(reply), 'The MCP server needs DATABASE_URL.');
    assert.match(logged[0], /ECONNREFUSED/);

    const generic = createMcpHandler({ lectures, token: anaToken, getServices: async () => { throw new Error('boom'); } });
    assert.match(textOf(await generic(call(2, 'get_group_schedule', { groupId: 1 }))), /could not complete this call/);
  });
});
