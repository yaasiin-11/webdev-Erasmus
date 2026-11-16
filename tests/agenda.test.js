import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, startServer } from './helpers.js';
import {
  buildPrompt,
  createAgendaService,
  fallbackItems,
  parseModelAnswer,
  renderAgenda,
} from '../src/services/agendaService.js';
import { createGeminiClient } from '../src/integrations/gemini.js';
import { ValidationError } from '../src/services/errors.js';

const request = { topic: 'Eigenvalues', category: 'university', durationMinutes: 60 };
const total = (items) => items.reduce((sum, item) => sum + item.minutes, 0);

function fakeClient(answer) {
  const prompts = [];
  return {
    prompts,
    async generate(prompt) {
      prompts.push(prompt);
      if (answer instanceof Error) throw answer;
      return typeof answer === 'string' ? answer : JSON.stringify(answer);
    },
  };
}

describe('agenda suggestion', () => {
  test('AC-25 a good model answer is used, with blocks that add up to the session length', async () => {
    const client = fakeClient({ items: [
      { title: 'Recap of determinants', minutes: 10 },
      { title: 'Characteristic polynomial', minutes: 30 },
      { title: 'Exercises from sheet 4', minutes: 20 },
    ] });
    const result = await createAgendaService({ client }).suggestAgenda(request);
    assert.equal(result.source, 'model');
    assert.equal(result.notice, null);
    assert.equal(total(result.items), 60);
    assert.equal(result.agenda, [
      'Study agenda: Eigenvalues',
      '- 00:00–00:10 · Recap of determinants (10 min)',
      '- 00:10–00:40 · Characteristic polynomial (30 min)',
      '- 00:40–01:00 · Exercises from sheet 4 (20 min)',
    ].join('\n'));
  });

  test('AC-25 an answer up to 20% off is rescaled to the exact length, and code fences are ignored', async () => {
    const raw = '```json\n{"items":[{"title":"Theory","minutes":30},{"title":"Practice","minutes":40}]}\n```';
    const items = parseModelAnswer(raw, 60);
    assert.equal(total(items), 60);
    assert.deepEqual(items.map((i) => i.minutes), [26, 34]);
  });

  test('AC-26 nonsense from the model is rejected and the template is used instead', async () => {
    const bad = [
      'not json at all',
      { items: 'many' },
      { items: [{ title: 'Only one', minutes: 60 }] },
      { items: Array.from({ length: 9 }, () => ({ title: 'Block', minutes: 5 })) },
      { items: [null, { title: 'Second', minutes: 30 }] },
      { items: [{ title: 'ok', minutes: 30 }, { title: 'Second', minutes: 30 }] },
      { items: [{ title: 'First block', minutes: 30.5 }, { title: 'Second', minutes: 30 }] },
      { items: [{ title: 'First block', minutes: 61 }, { title: 'Second', minutes: 30 }] },
      { items: [{ title: 'First block', minutes: 10 }, { title: 'Second', minutes: 10 }] },
      { items: [3, 3, 3, 3, 3, 3, 3, 1].map((minutes, i) => ({ title: `Block ${i}`, minutes })) },
    ];
    for (const answer of bad) {
      const duration = Array.isArray(answer.items) && answer.items.length === 8 ? 20 : 60;
      const client = fakeClient(answer);
      const result = await createAgendaService({ client }).suggestAgenda({ ...request, durationMinutes: duration });
      assert.equal(result.source, 'fallback', JSON.stringify(answer));
      assert.match(result.notice, /did not fit this session/);
      assert.equal(total(result.items), duration);
    }
  });

  test('AC-26 HTML and markdown in a block title are stripped before anyone sees it', () => {
    const items = parseModelAnswer(JSON.stringify({ items: [
      { title: '<script>alert(1)</script> **Proofs**', minutes: 30 },
      { title: '# Practice\nproblems', minutes: 30 },
    ] }), 60);
    assert.deepEqual(items.map((i) => i.title), ['script alert(1) /script Proofs', 'Practice problems']);
  });

  test('AC-27 with no key, a provider error or no answer in time, the template is used and says why', async () => {
    const off = await createAgendaService().suggestAgenda(request);
    assert.equal(off.source, 'fallback');
    assert.match(off.notice, /switched off/);

    const failing = await createAgendaService({ client: fakeClient(new Error('429 Too Many Requests')) }).suggestAgenda(request);
    assert.equal(failing.source, 'fallback');
    assert.match(failing.notice, /did not answer in time/);

    const logged = [];
    const hanging = { generate: () => new Promise(() => {}) };
    const slow = await createAgendaService({ client: hanging, timeoutMs: 20, log: (line) => logged.push(line) }).suggestAgenda(request);
    assert.equal(slow.source, 'fallback');
    assert.match(logged[0], /no answer within 20 ms/);
    assert.equal(total(slow.items), 60);
  });

  test('AC-27 the template always adds up to the session length', () => {
    for (const minutes of [15, 45, 60, 97, 480]) {
      assert.equal(total(fallbackItems(minutes)), minutes);
    }
    assert.match(renderAgenda('Topic', fallbackItems(90)), /^Study agenda: Topic\n- 00:00–00:14 · Warm-up/);
  });

  test('AC-28 only the topic, category and length are sent to the model, never who is asking', async () => {
    const client = fakeClient(new Error('stop here'));
    await createAgendaService({ client }).suggestAgenda({ ...request, category: 'civil-service', name: 'Ana', email: 'ana@test.dev' });
    assert.equal(client.prompts.length, 1);
    assert.match(client.prompts[0], /Topic: "Eigenvalues"\. Total length: 60 minutes/);
    assert.match(client.prompts[0], /civil service/);
    assert.doesNotMatch(client.prompts[0], /Ana|ana@test\.dev/);
    assert.equal(buildPrompt(request).includes('exactly 60'), true);
  });

  test('AC-25 the request itself is validated before the model is called', async () => {
    const client = fakeClient({ items: [] });
    const service = createAgendaService({ client });
    await assert.rejects(service.suggestAgenda({ ...request, topic: 'x' }), ValidationError);
    await assert.rejects(service.suggestAgenda({ ...request, durationMinutes: 5 }), ValidationError);
    assert.equal(client.prompts.length, 0);
  });

  test('AC-25 POST /api/agenda answers signed-in users and refuses everyone else', async () => {
    const world = await makeWorld({ modelClient: fakeClient({ items: [
      { title: 'Warm-up questions', minutes: 15 },
      { title: 'Worked examples', minutes: 45 },
    ] }) });
    const api = await startServer(world);
    try {
      assert.equal((await api.request('/api/agenda', { method: 'POST', body: request })).status, 401);
      const cookie = await api.login('ana@test.dev');
      const response = await api.request('/api/agenda', { method: 'POST', cookie, body: request });
      assert.equal(response.status, 200);
      assert.equal(response.json.source, 'model');
      assert.equal(response.json.items.length, 2);
    } finally {
      await api.close();
    }
  });
});

describe('Gemini client', () => {
  function fakeFetch(status, body) {
    const calls = [];
    const fn = async (url, init) => {
      calls.push({ url, init });
      return { ok: status < 400, status, json: async () => body };
    };
    fn.calls = calls;
    return fn;
  }

  test('AC-28 the key travels in a header, not in the URL, and the answer text is returned', async () => {
    const fetchImpl = fakeFetch(200, { candidates: [{ content: { parts: [{ text: '{"items":' }, { text: '[]}' }] } }] });
    const client = createGeminiClient({ apiKey: 'test-key', model: 'gemini-test', fetchImpl });
    assert.equal(await client.generate('hello'), '{"items":[]}');
    assert.equal(fetchImpl.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    assert.equal(fetchImpl.calls[0].init.headers['x-goog-api-key'], 'test-key');
    assert.ok(fetchImpl.calls[0].init.signal instanceof AbortSignal);
  });

  test('AC-27 an error status or an empty answer becomes an error the service falls back from', async () => {
    const limited = createGeminiClient({ apiKey: 'k', model: 'm', fetchImpl: fakeFetch(429, {}) });
    await assert.rejects(limited.generate('x'), /status 429/);
    const empty = createGeminiClient({ apiKey: 'k', model: 'm', fetchImpl: fakeFetch(200, { candidates: [] }) });
    await assert.rejects(empty.generate('x'), /empty answer/);
    const noText = createGeminiClient({ apiKey: 'k', model: 'm', fetchImpl: fakeFetch(200, { candidates: [{ content: { parts: [{}] } }] }) });
    await assert.rejects(noText.generate('x'), /empty answer/);
    const nothing = createGeminiClient({ apiKey: 'k', model: 'm', fetchImpl: fakeFetch(200, null) });
    await assert.rejects(nothing.generate('x'), /empty answer/);
  });

  test('AC-27 a provider that never answers is cut off by the timeout, and a network error is reported', async () => {
    const hanging = (url, init) => new Promise((_, reject) => {
      const keepAlive = setTimeout(() => {}, 1000);
      init.signal.addEventListener('abort', () => {
        clearTimeout(keepAlive);
        reject(init.signal.reason);
      });
    });
    const slow = createGeminiClient({ apiKey: 'k', model: 'm', timeoutMs: 20, fetchImpl: hanging });
    await assert.rejects(slow.generate('x'), /no answer within 20 ms/);
    const offline = createGeminiClient({ apiKey: 'k', model: 'm', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
    await assert.rejects(offline.generate('x'), /could not be reached: fetch failed/);
  });
});
