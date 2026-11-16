import {
  AuthenticationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '../services/errors.js';
import { SESSION_COOKIE, parseCookies, unsign } from './cookies.js';

const STATUS = new Map([
  [ValidationError, 422],
  [AuthenticationError, 401],
  [ForbiddenError, 403],
  [NotFoundError, 404],
  [ConflictError, 409],
  [RateLimitError, 429],
]);

export function securityHeaders(config) {
  return (req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    if (config.production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

function originHost(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function sameOriginWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && originHost(origin) !== req.get('host')) {
    return res.status(403).json({ error: 'This request came from another site and was refused.', code: 'CrossSite' });
  }
  return next();
}

export function attachUser({ auth, config }) {
  return async (req, res, next) => {
    try {
      const token = unsign(parseCookies(req.get('cookie'))[SESSION_COOKIE], config.sessionSecret);
      req.sessionToken = token;
      req.user = await auth.userForSession(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Sign in to continue.', code: 'NotSignedIn' });
  }
  return next();
}

export const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export function apiNotFound(req, res) {
  res.status(404).json({ error: 'Not found', code: 'NotFound' });
}

export function errorHandler(log) {
  return (error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request body is not valid JSON.', code: 'BadJson' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'The request body is too large.', code: 'TooLarge' });
    }
    for (const [type, status] of STATUS) {
      if (error instanceof type) return res.status(status).json({ error: error.message, code: error.code });
    }
    log.error(error);
    return res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.', code: 'ServerError' });
  };
}
