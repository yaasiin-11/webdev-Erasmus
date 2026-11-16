import { createPool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { createRepositories } from '../src/data/index.js';
import { createServices } from '../src/container.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

export const PASSWORD = 'password-123';
export const START = new Date('2030-03-04T09:00:00Z');

export const hoursFromStart = (hours) => new Date(START.getTime() + hours * 3600 * 1000).toISOString();

export async function makeWorld({ modelClient = null } = {}) {
  const pool = await createPool('memory');
  await migrate(pool);
  const repos = createRepositories(pool);
  const clock = { current: START };
  const now = () => clock.current;
  const services = createServices({ repos, modelClient, now });

  const register = (name, email) => services.auth.register({ name, email, password: PASSWORD });
  const users = {
    ana: await register('Ana Petrova', 'ana@test.dev'),
    boris: await register('Boris Ivanov', 'boris@test.dev'),
    carmen: await register('Carmen Ruiz', 'carmen@test.dev'),
  };

  return {
    pool,
    repos,
    services,
    users,
    clock,
    advance(hours) {
      clock.current = new Date(clock.current.getTime() + hours * 3600 * 1000);
    },
    group(owner, overrides = {}) {
      return services.groups.createGroup(users[owner].id, {
        title: 'Linear algebra',
        subject: 'Matrices',
        description: 'Weekly problem sheets',
        category: 'university',
        maxCapacity: 4,
        ...overrides,
      });
    },
  };
}

export const silentLog = { info() {}, error() {} };

export async function startServer(world, { env = {}, google = null, limiter, mailer, services = world.services, repos = world.repos } = {}) {
  const config = loadConfig({ DATABASE_URL: 'memory', SESSION_SECRET: 'test-secret-test-secret', ...env });
  const app = createApp({ config, services, repos, google, limiter, mailer, log: silentLog });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = 'GET', body, cookie, headers = {}, raw } = {}) {
    const response = await fetch(url + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, headers: response.headers, json, text };
  }

  async function login(email, password = PASSWORD) {
    const response = await request('/api/auth/login', { method: 'POST', body: { email, password } });
    if (response.status !== 200) throw new Error(`login failed for ${email}: ${response.status}`);
    return response.headers.get('set-cookie').split(';')[0];
  }

  return { url, request, login, close: () => new Promise((resolve) => server.close(resolve)) };
}
