const base = (process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const password = process.env.DEMO_PASSWORD ?? 'StudyHub2026!';
const lines = [];
const say = (text) => {
  lines.push(text);
  console.log(text);
};

async function call(path, { method = 'GET', body, raw, cookie, headers = {} } = {}) {
  const started = performance.now();
  const response = await fetch(base + path, {
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
  return { status: response.status, headers: response.headers, text, json, ms: Math.round(performance.now() - started) };
}

const short = (text) => (text.length > 160 ? `${text.slice(0, 160)}…` : text).replace(/\s+/g, ' ');

async function login(email) {
  const response = await call('/api/auth/login', { method: 'POST', body: { email, password } });
  return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null };
}

say(`# Readiness check of ${base}`);
say(`Run at ${new Date().toISOString()}`);
say('');

say('## Live URL');
const first = await call('/health');
say(`- GET /health -> ${first.status} ${first.text.trim()} in ${first.ms} ms (a slow first answer means the free service was asleep)`);
const second = await call('/health');
say(`- GET /health again -> ${second.status} in ${second.ms} ms`);
const home = await call('/');
say(`- GET / -> ${home.status}, title "${home.text.match(/<title>(.*?)<\/title>/)?.[1] ?? 'none'}", https: ${base.startsWith('https://')}`);

say('');
say('## Failures');
const page404 = await call('/no-such-page');
say(`- GET /no-such-page -> ${page404.status}, ${page404.headers.get('content-type')}`);
const api404 = await call('/api/no-such-thing');
say(`- GET /api/no-such-thing -> ${api404.status} ${short(api404.text)}`);
const broken = await call('/api/groups', { method: 'POST', raw: '{"title": 12' });
say(`- POST /api/groups with broken JSON -> ${broken.status} ${short(broken.text)}`);
say(`  stack trace or file path in the body: ${/\bat \w|node_modules|\/app\/|\/src\//.test(broken.text) ? 'YES, fix this' : 'no'}`);
const anonymous = await call('/api/groups', { method: 'POST', body: { title: 'x' } });
say(`- POST /api/groups with a valid body and no session -> ${anonymous.status} ${short(anonymous.text)}`);

say('');
say('## Security');
const headers = home.headers;
say(`- Strict-Transport-Security: ${headers.get('strict-transport-security') ?? 'missing'}`);
say(`- Content-Security-Policy: ${headers.get('content-security-policy') ?? 'missing'}`);
say(`- X-Content-Type-Options: ${headers.get('x-content-type-options') ?? 'missing'}`);

const ana = await login('ana@studyhub.test');
const boris = await login('boris@studyhub.test');
if (!ana.cookie || !boris.cookie) {
  say(`- demo accounts could not sign in (${ana.response.status}, ${boris.response.status}): set SEED_DEMO=true or run npm run seed, then run this again`);
} else {
  const raw = ana.response.headers.get('set-cookie');
  say(`- session cookie flags: ${raw.split(';').slice(1).map((part) => part.trim()).filter((part) => !/^(Max-Age|Expires)=/i.test(part)).join(', ')}`);
  const groups = (await call('/api/groups', { cookie: ana.cookie })).json?.groups ?? [];
  const owned = groups.find((g) => g.isOwner);
  if (owned) {
    const attempt = await call(`/api/groups/${owned.id}`, { method: 'DELETE', cookie: boris.cookie });
    say(`- Boris deletes Ana's group "${owned.title}" -> ${attempt.status} ${short(attempt.text)}`);
    const noCookie = await call(`/api/groups/${owned.id}`, { method: 'DELETE' });
    say(`- the same delete with no session -> ${noCookie.status}`);
    const still = await call(`/api/groups/${owned.id}`, { cookie: ana.cookie });
    say(`- the group still exists afterwards: ${still.status === 200}`);
  }
  const cross = await call('/api/groups', { method: 'POST', cookie: ana.cookie, body: {}, headers: { origin: 'https://evil.example' } });
  say(`- a write sent from another site with Ana's cookie -> ${cross.status} ${short(cross.text)}`);

  say('');
  say('## Model feature');
  const agenda = await call('/api/agenda', {
    method: 'POST',
    cookie: ana.cookie,
    body: { topic: 'Integration by parts', category: 'university', durationMinutes: 60, startTime: '17:00' },
  });
  say(`- POST /api/agenda -> ${agenda.status} in ${agenda.ms} ms, source "${agenda.json?.source}"${agenda.json?.notice ? `, notice "${agenda.json.notice}"` : ''}`);

  say('');
  say('## Request timing');
  for (const path of ['/api/auth/me', '/api/groups', `/api/groups/${groups[0]?.id ?? 1}`, '/api/sessions/upcoming']) {
    const timed = await call(path, { cookie: ana.cookie });
    say(`- GET ${path} -> ${timed.status} in ${timed.ms} ms`);
  }
}

say('');
say('## Brute force');
let blockedAt = null;
for (let i = 1; i <= 12 && !blockedAt; i += 1) {
  const response = await call('/api/auth/login', { method: 'POST', body: { email: 'readiness-probe@studyhub.test', password: `wrong-${i}` } });
  if (response.status === 429) blockedAt = i;
}
say(`- wrong passwords for one email: ${blockedAt ? `refused with 429 from attempt ${blockedAt}` : 'never refused in 12 attempts'}`);
