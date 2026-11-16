import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, startServer } from './helpers.js';
import { loadConfig, ConfigError } from '../src/config.js';
import { parseCookies, sign, unsign } from '../src/http/cookies.js';
import { seedDemo, DEMO_PASSWORD } from '../src/seed.js';
import { createContainer } from '../src/container.js';

describe('health, errors and headers', () => {
  let world;
  let api;
  before(async () => {
    world = await makeWorld();
    api = await startServer(world);
  });
  after(() => api.close());

  test('AC-33 /health answers 200 when the database answers', async () => {
    const response = await api.request('/health');
    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { status: 'ok', db: 'ok' });
  });

  test('AC-33 /health answers 503 when the database is down', async () => {
    const broken = { ...world.repos, ping: async () => { throw new Error('connection refused'); } };
    const down = await startServer(world, { repos: broken });
    try {
      const response = await down.request('/health');
      assert.equal(response.status, 503);
      assert.deepEqual(response.json, { status: 'error', db: 'down' });
    } finally {
      await down.close();
    }
  });

  test('AC-34 broken JSON gets 400 and one readable sentence, never a stack trace', async () => {
    const cookie = await api.login('ana@test.dev');
    const response = await api.request('/api/groups', { method: 'POST', cookie, raw: '{"title": 12' });
    assert.equal(response.status, 400);
    assert.deepEqual(response.json, { error: 'The request body is not valid JSON.', code: 'BadJson' });
    assert.doesNotMatch(response.text, /at |node_modules|\/src\//);
  });

  test('AC-34 a body over 20 kB is refused with 413', async () => {
    const response = await api.request('/api/auth/login', { method: 'POST', raw: JSON.stringify({ email: 'x'.repeat(25000) }) });
    assert.equal(response.status, 413);
  });

  test('AC-34 an unknown API path is a JSON 404 and an unknown page is the 404 page', async () => {
    const apiMissing = await api.request('/api/nothing-here');
    assert.equal(apiMissing.status, 404);
    assert.deepEqual(apiMissing.json, { error: 'Not found', code: 'NotFound' });
    const page = await api.request('/no-such-page');
    assert.equal(page.status, 404);
    assert.match(page.headers.get('content-type'), /text\/html/);
  });

  test('AC-34 an unexpected error is logged on the server and the user gets one sentence', async () => {
    const services = { ...world.services, groups: { ...world.services.groups, listGroups: async () => { throw new Error('secret detail'); } } };
    const failing = await startServer(world, { services });
    try {
      const cookie = await failing.login('ana@test.dev');
      const response = await failing.request('/api/groups', { cookie });
      assert.equal(response.status, 500);
      assert.equal(response.json.error, 'Something went wrong on our side. Please try again in a moment.');
      assert.doesNotMatch(response.text, /secret detail/);
    } finally {
      await failing.close();
    }
  });

  test('a write from another site is refused before it reaches any route', async () => {
    const cookie = await api.login('ana@test.dev');
    const cross = await api.request('/api/groups', {
      method: 'POST', cookie, body: {}, headers: { origin: 'https://evil.example' },
    });
    assert.equal(cross.status, 403);
    assert.equal(cross.json.code, 'CrossSite');
    const opaque = await api.request('/api/auth/logout', { method: 'POST', headers: { origin: 'null' } });
    assert.equal(opaque.status, 403);
    const same = await api.request('/api/auth/logout', { method: 'POST', headers: { origin: api.url } });
    assert.equal(same.status, 204);
  });

  test('pages carry a strict content security policy and no framework banner', async () => {
    const response = await api.request('/');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'.*frame-ancestors 'none'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('strict-transport-security'), null);
  });

  test('in production the session cookie is Secure and HSTS is on', async () => {
    const production = await startServer(world, { env: { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', PUBLIC_BASE_URL: 'https://studyhub.example/' } });
    try {
      assert.match((await production.request('/')).headers.get('strict-transport-security'), /max-age=31536000/);
      const login = await production.request('/api/auth/login', { method: 'POST', body: { email: 'ana@test.dev', password: 'password-123' } });
      assert.match(login.headers.get('set-cookie'), /; Secure; SameSite=Lax/);
    } finally {
      await production.close();
    }
  });
});

describe('configuration', () => {
  const base = { DATABASE_URL: 'memory', SESSION_SECRET: 'a'.repeat(32) };

  test('the app refuses to start without a required variable and names it', () => {
    assert.throws(() => loadConfig({ SESSION_SECRET: 'a'.repeat(32) }), { message: 'missing DATABASE_URL: see .env.example' });
    assert.throws(() => loadConfig({ DATABASE_URL: 'memory', SESSION_SECRET: '  ' }), ConfigError);
    assert.throws(() => loadConfig({ ...base, SESSION_SECRET: 'short' }), /too short/);
    assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production' }), /memory loses every record/);
  });

  test('optional features switch on only when their keys are present', () => {
    const plain = loadConfig(base);
    assert.equal(plain.port, 3000);
    assert.equal(plain.baseUrl, 'http://localhost:3000');
    assert.equal(plain.google, null);
    assert.equal(plain.model, null);
    assert.equal(plain.seedDemo, true);

    const full = loadConfig({
      ...base,
      DATABASE_URL: 'postgres://db',
      PORT: '8080',
      SEED_DEMO: 'true',
      PUBLIC_BASE_URL: 'https://studyhub.example/',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GEMINI_API_KEY: 'key',
    });
    assert.equal(full.seedDemo, true);
    assert.equal(full.google.redirectUri, 'https://studyhub.example/api/auth/google/callback');
    assert.deepEqual(full.model, { apiKey: 'key', name: 'gemini-2.5-flash-lite' });
    assert.equal(loadConfig({ ...base, GEMINI_API_KEY: 'k', MODEL_NAME: 'gemini-x' }).model.name, 'gemini-x');
    assert.equal(loadConfig({ ...base, DATABASE_URL: 'postgres://db' }).seedDemo, false);
  });

  test('inside a codespace the public address is the forwarded port', () => {
    const config = loadConfig({ ...base, CODESPACE_NAME: 'fuzzy-train', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev' });
    assert.equal(config.baseUrl, 'https://fuzzy-train-3000.app.github.dev');
  });
});

describe('cookies', () => {
  test('a signed value survives the round trip and any tampering is detected', () => {
    const signed = sign('token-value', 'secret');
    assert.equal(unsign(signed, 'secret'), 'token-value');
    assert.equal(unsign(signed, 'other-secret'), null);
    assert.equal(unsign(`${signed}x`, 'secret'), null);
    assert.equal(unsign('nodot', 'secret'), null);
    assert.equal(unsign(undefined, 'secret'), null);
  });

  test('the cookie header parser ignores broken pairs', () => {
    assert.deepEqual(parseCookies('a=1; b=%E0%A4%A; =x; c'), { a: '1', b: '' });
    assert.deepEqual(parseCookies(), {});
  });
});

describe('demo data', () => {
  test('the seed creates three accounts and runs only once', async () => {
    const { pool, repos, services } = await createContainer({ databaseUrl: 'memory' });
    assert.equal(await seedDemo({ services, repos, now: new Date('2030-01-01T12:00:00Z') }), true);
    assert.equal(await seedDemo({ services, repos }), false);
    const ana = await services.auth.authenticate({ email: 'ana@studyhub.test', password: DEMO_PASSWORD });
    const groups = await services.groups.listGroups(ana.id);
    assert.equal(groups.length, 5);
    assert.ok(groups.some((g) => g.isFull));
    const carmen = await services.auth.authenticate({ email: 'carmen@studyhub.test', password: DEMO_PASSWORD });
    assert.deepEqual(await services.groups.listGroups(carmen.id, { mine: true }), []);
    await pool.end();
  });
});
