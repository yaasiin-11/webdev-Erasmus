import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, startServer, PASSWORD } from './helpers.js';
import { AuthenticationError, ConflictError, ValidationError } from '../src/services/errors.js';
import { createAttemptLimiter } from '../src/http/rateLimit.js';
import { createGoogleOAuth, createPkcePair } from '../src/integrations/google.js';
import { createBrevoMailer, createConsoleMailer } from '../src/integrations/mailer.js';
import { passwordResetEmail } from '../src/emails.js';

describe('local sign-in', () => {
  let world;
  let api;
  before(async () => {
    world = await makeWorld();
    api = await startServer(world);
  });
  after(() => api.close());

  test('AC-1 a registered user signs in and the API returns their name for the navigation bar', async () => {
    const response = await api.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'ana@test.dev', password: PASSWORD },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.user.name, 'Ana Petrova');
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /^sid=.+; Max-Age=\d+; Path=\/; Expires=.+; HttpOnly; SameSite=Lax$/);

    const me = await api.request('/api/auth/me', { cookie: cookie.split(';')[0] });
    assert.equal(me.status, 200);
    assert.deepEqual(me.json.user, { id: world.users.ana.id, name: 'Ana Petrova', email: 'ana@test.dev' });
  });

  test('AC-2 an empty sign-in form is refused with "Email and password are required"', async () => {
    const response = await api.request('/api/auth/login', { method: 'POST', body: { email: '', password: '' } });
    assert.equal(response.status, 422);
    assert.equal(response.json.error, 'Email and password are required');
    await assert.rejects(world.services.auth.authenticate({ email: 'ana@test.dev' }), ValidationError);
  });

  test('AC-3 a wrong password or unknown email gets the same 401 and no session cookie', async () => {
    for (const email of ['ana@test.dev', 'nobody@test.dev']) {
      const response = await api.request('/api/auth/login', { method: 'POST', body: { email, password: 'wrong-password' } });
      assert.equal(response.status, 401);
      assert.equal(response.json.error, 'Email or password is incorrect.');
      assert.equal(response.headers.get('set-cookie'), null);
    }
  });

  test('AC-3 an account created with Google only has no password to guess', async () => {
    await world.services.auth.signInWithGoogle({ sub: 'g-only', email: 'gonly@test.dev', emailVerified: true, name: 'G' });
    await assert.rejects(world.services.auth.authenticate({ email: 'gonly@test.dev', password: 'anything' }), AuthenticationError);
  });

  test('AC-4 a visitor creates an account, is signed in at once, and the password is stored only as a scrypt hash', async () => {
    const response = await api.request('/api/auth/register', {
      method: 'POST',
      body: { name: '  Dimitar Georgiev ', email: 'Dimitar@Test.dev', password: 'a-long-password' },
    });
    assert.equal(response.status, 201);
    assert.deepEqual(response.json.user.name, 'Dimitar Georgiev');
    assert.equal(response.json.user.email, 'dimitar@test.dev');
    assert.ok(response.headers.get('set-cookie').startsWith('sid='));

    const stored = await world.repos.users.findByEmail('dimitar@test.dev');
    assert.notEqual(stored.password_hash, 'a-long-password');
    assert.match(stored.password_hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  test('AC-4 registration refuses a taken email, a short password, a bad email and a short name', async () => {
    const attempt = (body) => api.request('/api/auth/register', { method: 'POST', body });
    const taken = await attempt({ name: 'Ana', email: 'ana@test.dev', password: 'another-password' });
    assert.equal(taken.status, 409);
    assert.equal((await attempt({ name: 'Eve', email: 'eve@test.dev', password: 'short' })).status, 422);
    assert.equal((await attempt({ name: 'Eve', email: 'not-an-email', password: 'long-enough' })).status, 422);
    assert.equal((await attempt({ name: 'E', email: 'eve@test.dev', password: 'long-enough' })).status, 422);
    assert.equal((await attempt({ name: 'Eve', email: 42, password: 'long-enough' })).status, 422);
    await assert.rejects(
      world.services.auth.register({ name: 'Ana', email: 'ana@test.dev', password: 'another-password' }),
      ConflictError,
    );
  });

  test('AC-6 without a session the groups API answers 401 and no rows, also with a forged cookie', async () => {
    const none = await api.request('/api/groups');
    assert.equal(none.status, 401);
    assert.equal(none.json.groups, undefined);
    const forged = await api.request('/api/groups', { cookie: 'sid=abc.def' });
    assert.equal(forged.status, 401);
  });

  test('AC-7 signing out deletes the session, so the old cookie stops working', async () => {
    const cookie = await api.login('boris@test.dev');
    assert.equal((await api.request('/api/auth/me', { cookie })).status, 200);
    const out = await api.request('/api/auth/logout', { method: 'POST', cookie });
    assert.equal(out.status, 204);
    assert.match(out.headers.get('set-cookie'), /^sid=;/);
    assert.equal((await api.request('/api/auth/me', { cookie })).status, 401);
    assert.equal((await api.request('/api/auth/logout', { method: 'POST' })).status, 204);
  });

  test('AC-7 a session stops working after seven days', async () => {
    const { token } = await world.services.auth.startSession(world.users.carmen.id);
    assert.equal((await world.services.auth.userForSession(token)).name, 'Carmen Ruiz');
    world.advance(24 * 7 + 1);
    assert.equal(await world.services.auth.userForSession(token), null);
    assert.equal(await world.services.auth.userForSession(undefined), null);
    await world.repos.authSessions.deleteExpired(world.clock.current);
  });
});

describe('Google sign-in', () => {
  let world;
  before(async () => {
    world = await makeWorld();
  });

  test('AC-8 a new Google user gets an account named after their profile, or their email when there is no name', async () => {
    const auth = world.services.auth;
    const fresh = await auth.signInWithGoogle({ sub: 'g-1', email: 'New@Gmail.com', emailVerified: true, name: 'New Person' });
    assert.equal(fresh.email, 'new@gmail.com');
    assert.equal(fresh.name, 'New Person');
    const nameless = await auth.signInWithGoogle({ sub: 'g-2', email: 'quiet@gmail.com', emailVerified: true });
    assert.equal(nameless.name, 'quiet');
    const again = await auth.signInWithGoogle({ sub: 'g-1', email: 'changed@gmail.com', emailVerified: true, name: 'x' });
    assert.equal(again.id, fresh.id);
  });

  test('AC-8 an existing local account with the same verified email is linked, not duplicated', async () => {
    const linked = await world.services.auth.signInWithGoogle({
      sub: 'g-ana', email: 'ana@test.dev', emailVerified: true, name: 'Ana from Google',
    });
    assert.equal(linked.id, world.users.ana.id);
    assert.equal(linked.name, 'Ana Petrova');
    assert.equal((await world.repos.users.findById(world.users.ana.id)).google_sub, 'g-ana');
  });

  test('AC-8 an unverified Google email is refused and nothing is linked', async () => {
    await assert.rejects(
      world.services.auth.signInWithGoogle({ sub: 'g-bad', email: 'boris@test.dev', emailVerified: false }),
      AuthenticationError,
    );
    assert.equal((await world.repos.users.findById(world.users.boris.id)).google_sub, null);
  });

  function fakeGoogle(profile) {
    const calls = [];
    return {
      calls,
      authorizationUrl: ({ state, codeChallenge }) => `https://accounts.example/auth?state=${state}&code_challenge=${codeChallenge}`,
      async exchange(args) {
        calls.push(args);
        if (profile instanceof Error) throw profile;
        return profile;
      },
    };
  }

  async function startFlow(api) {
    const start = await api.request('/api/auth/google');
    assert.equal(start.status, 302);
    const location = new URL(start.headers.get('location'));
    const oauthCookie = start.headers.get('set-cookie');
    assert.match(oauthCookie, /^oauth=.+Path=\/api\/auth\/google; .*HttpOnly; SameSite=Lax$/);
    return { state: location.searchParams.get('state'), challenge: location.searchParams.get('code_challenge'), cookie: oauthCookie.split(';')[0] };
  }

  test('AC-8 the Google flow checks state, sends the PKCE verifier and signs the user in', async () => {
    const google = fakeGoogle({ sub: 'g-flow', email: 'flow@gmail.com', emailVerified: true, name: 'Flow' });
    const api = await startServer(world, { google });
    try {
      assert.deepEqual((await api.request('/api/auth/providers')).json, { google: true, demo: true });
      const { state, challenge, cookie } = await startFlow(api);
      assert.ok(state.length >= 16);
      assert.ok(challenge.length >= 43);

      const done = await api.request(`/api/auth/google/callback?code=abc&state=${state}`, { cookie });
      assert.equal(done.status, 302);
      assert.equal(done.headers.get('location'), '/#/groups');
      assert.match(done.headers.get('set-cookie'), /sid=/);
      assert.equal(google.calls[0].code, 'abc');
      assert.ok(google.calls[0].codeVerifier.length >= 43);

      const wrongState = await startFlow(api);
      const forged = await api.request('/api/auth/google/callback?code=abc&state=attacker', { cookie: wrongState.cookie });
      assert.equal(forged.headers.get('location'), '/#/login?error=google-state');
      const noCookie = await api.request(`/api/auth/google/callback?code=abc&state=${state}`);
      assert.equal(noCookie.headers.get('location'), '/#/login?error=google-state');
      const cancelled = await api.request('/api/auth/google/callback?error=access_denied');
      assert.equal(cancelled.headers.get('location'), '/#/login?error=google-cancelled');
    } finally {
      await api.close();
    }
  });

  test('AC-8 a failed exchange or an unverified email ends on the sign-in screen with a reason', async () => {
    for (const [profile, reason] of [
      [new Error('network down'), 'google-failed'],
      [{ sub: 'g-x', email: 'x@gmail.com', emailVerified: false }, 'google-unverified'],
    ]) {
      const api = await startServer(world, { google: fakeGoogle(profile) });
      try {
        const { state, cookie } = await startFlow(api);
        const done = await api.request(`/api/auth/google/callback?code=abc&state=${state}`, { cookie });
        assert.equal(done.headers.get('location'), `/#/login?error=${reason}`);
      } finally {
        await api.close();
      }
    }
  });

  test('AC-8 without Google configured the button is hidden and the routes say so', async () => {
    const api = await startServer(world);
    try {
      assert.deepEqual((await api.request('/api/auth/providers')).json, { google: false, demo: true });
      assert.equal((await api.request('/api/auth/google')).status, 404);
      const callback = await api.request('/api/auth/google/callback?code=a&state=b');
      assert.equal(callback.headers.get('location'), '/#/login?error=google-off');
    } finally {
      await api.close();
    }
  });
});

describe('brute force protection', () => {
  test('AC-35 after 10 failed sign-ins for one email from one address, even the right password gets 429', async () => {
    const world = await makeWorld();
    const api = await startServer(world);
    try {
      for (let i = 0; i < 10; i += 1) {
        const response = await api.request('/api/auth/login', { method: 'POST', body: { email: 'ana@test.dev', password: `guess-${i}` } });
        assert.equal(response.status, 401);
      }
      const blocked = await api.request('/api/auth/login', { method: 'POST', body: { email: 'ana@test.dev', password: PASSWORD } });
      assert.equal(blocked.status, 429);
      assert.match(blocked.json.error, /Wait 15 minutes/);
      assert.equal((await api.request('/api/auth/login', { method: 'POST', body: { email: 'boris@test.dev', password: PASSWORD } })).status, 200);
    } finally {
      await api.close();
    }
  });

  test('AC-35 the limit forgets failures after the window and after a success', () => {
    let now = 0;
    const limiter = createAttemptLimiter({ limit: 2, windowMs: 1000, now: () => now });
    limiter.fail('k');
    limiter.fail('k');
    assert.equal(limiter.isBlocked('k'), true);
    now = 1001;
    assert.equal(limiter.isBlocked('k'), false);
    limiter.fail('k');
    limiter.reset('k');
    assert.equal(limiter.isBlocked('k'), false);
  });
});

describe('MCP tokens', () => {
  test('AC-32 a token is shown once, stored only as a hash, and a new one revokes the old one', async () => {
    const world = await makeWorld();
    const api = await startServer(world);
    try {
      const cookie = await api.login('ana@test.dev');
      assert.equal((await api.request('/api/me/mcp-token', { cookie })).json.token, null);

      const first = await api.request('/api/me/mcp-token', { method: 'POST', cookie });
      assert.equal(first.status, 201);
      assert.match(first.json.token, /^shmcp_/);
      const { rows } = await world.pool.query('SELECT token_hash FROM mcp_tokens');
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].token_hash, first.json.token);

      const user = await world.services.auth.userForMcpToken(first.json.token);
      assert.equal(user.id, world.users.ana.id);
      const info = (await api.request('/api/me/mcp-token', { cookie })).json.token;
      assert.ok(info.createdAt && info.lastUsedAt);

      const second = await api.request('/api/me/mcp-token', { method: 'POST', cookie });
      await assert.rejects(world.services.auth.userForMcpToken(first.json.token), /not valid any more/);
      assert.equal((await world.services.auth.userForMcpToken(second.json.token)).id, world.users.ana.id);

      assert.equal((await api.request('/api/me/mcp-token', { method: 'DELETE', cookie })).status, 204);
      await assert.rejects(world.services.auth.userForMcpToken(second.json.token), AuthenticationError);
      await assert.rejects(world.services.auth.userForMcpToken(undefined), /needs a valid MCP_TOKEN/);
      assert.equal((await api.request('/api/me/mcp-token', { method: 'POST' })).status, 401);
    } finally {
      await api.close();
    }
  });
});

describe('Google OAuth client', () => {
  const settings = { clientId: 'client-1', clientSecret: 'secret-1', redirectUri: 'https://app.example/api/auth/google/callback' };

  test('AC-8 the authorization URL asks for openid email profile with state and an S256 challenge', () => {
    const { verifier, challenge } = createPkcePair();
    assert.notEqual(verifier, challenge);
    const url = new URL(createGoogleOAuth(settings).authorizationUrl({ state: 'st', codeChallenge: challenge }));
    assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(url.searchParams.get('scope'), 'openid email profile');
    assert.equal(url.searchParams.get('state'), 'st');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('redirect_uri'), settings.redirectUri);
  });

  test('AC-8 the code is exchanged with the verifier and the profile is read', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (url.includes('token')) return { ok: true, json: async () => ({ access_token: 'at-1' }) };
      return { ok: true, json: async () => ({ sub: '123', email: 'a@gmail.com', email_verified: true, name: 'A' }) };
    };
    const profile = await createGoogleOAuth({ ...settings, fetchImpl }).exchange({ code: 'c-1', codeVerifier: 'v-1' });
    assert.deepEqual(profile, { sub: '123', email: 'a@gmail.com', emailVerified: true, name: 'A' });
    const body = new URLSearchParams(calls[0].init.body);
    assert.equal(body.get('code_verifier'), 'v-1');
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(calls[1].init.headers.authorization, 'Bearer at-1');
  });

  test('AC-8 an error from either Google endpoint is reported', async () => {
    const tokenFails = async () => ({ ok: false, status: 400 });
    await assert.rejects(createGoogleOAuth({ ...settings, fetchImpl: tokenFails }).exchange({ code: 'c', codeVerifier: 'v' }), /token endpoint answered 400/);
    const profileFails = async (url) => (url.includes('token')
      ? { ok: true, json: async () => ({ access_token: 'x' }) }
      : { ok: false, status: 401 });
    await assert.rejects(createGoogleOAuth({ ...settings, fetchImpl: profileFails }).exchange({ code: 'c', codeVerifier: 'v' }), /userinfo answered 401/);
  });
});

describe('session lookup failures', () => {
  test('a database error while reading the session becomes a 500 with one sentence', async () => {
    const world = await makeWorld();
    const services = { ...world.services, auth: { ...world.services.auth, userForSession: async () => { throw new Error('db gone'); } } };
    const api = await startServer(world, { services });
    try {
      const response = await api.request('/api/groups', { cookie: 'sid=x' });
      assert.equal(response.status, 500);
      assert.match(response.json.error, /Something went wrong/);
    } finally {
      await api.close();
    }
  });
});

describe('forgotten password', () => {
  function fakeMailer() {
    const sent = [];
    return { sent, async send(message) { sent.push(message); } };
  }

  test('AC-41 asking for a reset sends a single-use link to the account email, and the answer never says whether the account exists', async () => {
    const world = await makeWorld();
    const mailer = fakeMailer();
    const api = await startServer(world, { mailer, env: { PUBLIC_BASE_URL: 'https://studyhub.example' } });
    try {
      const known = await api.request('/api/auth/forgot', { method: 'POST', body: { email: 'Ana@Test.dev ' } });
      const unknown = await api.request('/api/auth/forgot', { method: 'POST', body: { email: 'nobody@test.dev' } });
      assert.equal(known.status, 202);
      assert.equal(unknown.status, 202);
      assert.deepEqual(known.json, unknown.json);
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(mailer.sent.length, 1);
      assert.equal(mailer.sent[0].to, 'ana@test.dev');
      assert.equal(mailer.sent[0].subject, 'Reset your StudyHub password');
      const link = mailer.sent[0].text.match(/https:\/\/studyhub\.example\/#\/reset\?token=(\S+)/);
      assert.ok(link);
      assert.match(mailer.sent[0].html, /href="https:\/\/studyhub\.example\/#\/reset\?token=/);

      const { rows } = await world.pool.query('SELECT token_hash FROM password_resets');
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].token_hash, decodeURIComponent(link[1]));
      assert.equal((await api.request('/api/auth/forgot', { method: 'POST', body: { email: 'not-an-email' } })).status, 422);
    } finally {
      await api.close();
    }
  });

  test('AC-42 the link sets a new password, signs the user in, signs out every other session and cannot be used twice', async () => {
    const world = await makeWorld();
    const mailer = fakeMailer();
    const api = await startServer(world, { mailer });
    try {
      const oldSession = await api.login('boris@test.dev');
      await api.request('/api/auth/forgot', { method: 'POST', body: { email: 'boris@test.dev' } });
      await new Promise((resolve) => setImmediate(resolve));
      const token = decodeURIComponent(mailer.sent[0].text.match(/token=(\S+)/)[1]);

      const short = await api.request('/api/auth/reset', { method: 'POST', body: { token, password: 'short' } });
      assert.equal(short.status, 422);

      const reset = await api.request('/api/auth/reset', { method: 'POST', body: { token, password: 'a-brand-new-password' } });
      assert.equal(reset.status, 200);
      assert.equal(reset.json.user.email, 'boris@test.dev');
      assert.match(reset.headers.get('set-cookie'), /^sid=/);

      assert.equal((await api.request('/api/auth/me', { cookie: oldSession })).status, 401);
      assert.equal((await api.request('/api/auth/login', { method: 'POST', body: { email: 'boris@test.dev', password: PASSWORD } })).status, 401);
      assert.equal((await api.request('/api/auth/login', { method: 'POST', body: { email: 'boris@test.dev', password: 'a-brand-new-password' } })).status, 200);

      const again = await api.request('/api/auth/reset', { method: 'POST', body: { token, password: 'yet-another-password' } });
      assert.equal(again.status, 422);
      assert.equal(again.json.error, 'This reset link is invalid or has expired. Ask for a new one.');
      assert.equal((await api.request('/api/auth/reset', { method: 'POST', body: { password: 'long-enough-1' } })).status, 422);
    } finally {
      await api.close();
    }
  });

  test('AC-42 a link expires after 30 minutes and a newer request replaces the older link', async () => {
    const world = await makeWorld();
    const first = await world.services.auth.requestPasswordReset('carmen@test.dev');
    const second = await world.services.auth.requestPasswordReset('carmen@test.dev');
    await assert.rejects(world.services.auth.resetPassword({ token: first.token, password: 'new-password-1' }), /invalid or has expired/);
    world.advance(0.51);
    await assert.rejects(world.services.auth.resetPassword({ token: second.token, password: 'new-password-1' }), ValidationError);
    assert.equal(await world.services.auth.requestPasswordReset('ghost@test.dev'), null);
  });

  test('AC-41 more than 10 reset requests for one email from one address within 15 minutes get 429', async () => {
    const world = await makeWorld();
    const api = await startServer(world, { mailer: fakeMailer() });
    try {
      for (let i = 0; i < 10; i += 1) {
        assert.equal((await api.request('/api/auth/forgot', { method: 'POST', body: { email: 'ana@test.dev' } })).status, 202);
      }
      assert.equal((await api.request('/api/auth/forgot', { method: 'POST', body: { email: 'ana@test.dev' } })).status, 429);
    } finally {
      await api.close();
    }
  });

  test('AC-41 a failing mail provider is logged and the user still gets the same answer', async () => {
    const world = await makeWorld();
    const api = await startServer(world, { mailer: { async send() { throw new Error('provider down'); } } });
    try {
      const response = await api.request('/api/auth/forgot', { method: 'POST', body: { email: 'ana@test.dev' } });
      assert.equal(response.status, 202);
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      await api.close();
    }
  });
});

describe('mail delivery', () => {
  test('AC-41 Brevo gets the sender, the recipient and both versions of the email, with the key in a header', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return { ok: true };
    };
    const mailer = createBrevoMailer({ apiKey: 'brevo-key', from: 'studyhub@example.org', fetchImpl });
    await mailer.send({ to: 'ana@test.dev', toName: 'Ana', subject: 'S', text: 'T', html: '<p>H</p>' });
    assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(calls[0].init.headers['api-key'], 'brevo-key');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      sender: { email: 'studyhub@example.org', name: 'StudyHub' },
      to: [{ email: 'ana@test.dev', name: 'Ana' }],
      subject: 'S',
      textContent: 'T',
      htmlContent: '<p>H</p>',
    });
    const failing = createBrevoMailer({ apiKey: 'k', from: 'f@x.org', fetchImpl: async () => ({ ok: false, status: 401 }) });
    await assert.rejects(failing.send({ to: 'a@b.c', subject: 's', text: 't', html: 'h' }), /status 401/);
  });

  test('AC-41 without a provider the email is printed in development and only mentioned in production', async () => {
    const lines = [];
    await createConsoleMailer((line) => lines.push(line), { showContent: true }).send({ to: 'a@b.c', subject: 'Reset', text: 'the link' });
    await createConsoleMailer((line) => lines.push(line), { showContent: false }).send({ to: 'a@b.c', subject: 'Reset', text: 'the link' });
    assert.match(lines[0], /the link/);
    assert.doesNotMatch(lines[1], /the link/);
    assert.match(lines[1], /BREVO_API_KEY/);
    const email = passwordResetEmail({ name: 'Ana <b>Petrova</b>', link: 'https://x/#/reset?token=a&b', minutes: 30 });
    assert.match(email.html, /Hi Ana,/);
    assert.match(email.html, /token=a&amp;b/);
  });
});
