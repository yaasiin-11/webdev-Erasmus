import express from 'express';
import crypto from 'node:crypto';
import { AuthenticationError, RateLimitError } from '../services/errors.js';
import { asyncRoute, requireUser } from '../http/middleware.js';
import { OAUTH_COOKIE, SESSION_COOKIE, cookieOptions, parseCookies, sign, unsign } from '../http/cookies.js';
import { createPkcePair } from '../integrations/google.js';

const OAUTH_MAX_AGE = 10 * 60 * 1000;

export function authRoutes({ auth, config, google, limiter, log }) {
  const router = express.Router();

  async function startSession(res, user) {
    const { token, expiresAt } = await auth.startSession(user.id);
    res.cookie(SESSION_COOKIE, sign(token, config.sessionSecret), cookieOptions(config, expiresAt - Date.now()));
  }

  router.post('/register', asyncRoute(async (req, res) => {
    const user = await auth.register(req.body ?? {});
    await startSession(res, user);
    res.status(201).json({ user });
  }));

  router.post('/login', asyncRoute(async (req, res) => {
    const { email, password } = req.body ?? {};
    const key = `${req.ip}|${String(email ?? '').trim().toLowerCase()}`;
    if (limiter.isBlocked(key)) {
      throw new RateLimitError('Too many failed attempts. Wait 15 minutes and try again.', 'TooManyAttempts');
    }
    let user;
    try {
      user = await auth.authenticate({ email, password });
    } catch (error) {
      if (error instanceof AuthenticationError) limiter.fail(key);
      throw error;
    }
    limiter.reset(key);
    await startSession(res, user);
    res.json({ user });
  }));

  router.post('/logout', asyncRoute(async (req, res) => {
    await auth.endSession(req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  }));

  router.get('/me', requireUser, (req, res) => {
    res.json({ user: req.user });
  });

  router.get('/providers', (req, res) => {
    res.json({ google: Boolean(google) });
  });

  router.get('/google', (req, res) => {
    if (!google) {
      return res.status(404).json({ error: 'Sign-in with Google is not configured on this server.', code: 'GoogleOff' });
    }
    const state = crypto.randomBytes(16).toString('base64url');
    const { verifier, challenge } = createPkcePair();
    res.cookie(OAUTH_COOKIE, sign(JSON.stringify({ state, verifier }), config.sessionSecret), {
      ...cookieOptions(config, OAUTH_MAX_AGE),
      path: '/api/auth/google',
    });
    return res.redirect(302, google.authorizationUrl({ state, codeChallenge: challenge }));
  });

  router.get('/google/callback', async (req, res) => {
    const fail = (reason) => res.redirect(302, `/#/login?error=${reason}`);
    const saved = unsign(parseCookies(req.get('cookie'))[OAUTH_COOKIE], config.sessionSecret);
    res.clearCookie(OAUTH_COOKIE, { path: '/api/auth/google' });

    if (!google) return fail('google-off');
    if (req.query.error || !req.query.code) return fail('google-cancelled');
    const expected = saved ? JSON.parse(saved) : null;
    if (!expected || expected.state !== req.query.state) return fail('google-state');

    try {
      const profile = await google.exchange({ code: String(req.query.code), codeVerifier: expected.verifier });
      const user = await auth.signInWithGoogle(profile);
      await startSession(res, user);
      return res.redirect(302, '/#/groups');
    } catch (error) {
      if (error instanceof AuthenticationError) return fail('google-unverified');
      log.error(`Google sign-in failed: ${error.message}`);
      return fail('google-failed');
    }
  });

  return router;
}
