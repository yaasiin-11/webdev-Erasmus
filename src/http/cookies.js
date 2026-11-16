import crypto from 'node:crypto';

export const SESSION_COOKIE = 'sid';
export const OAUTH_COOKIE = 'oauth';

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const pair = part.trim();
    const index = pair.indexOf('=');
    if (index < 1) continue;
    const name = pair.slice(0, index);
    try {
      cookies[name] = decodeURIComponent(pair.slice(index + 1));
    } catch {
      cookies[name] = '';
    }
  }
  return cookies;
}

const mac = (value, secret) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

export function sign(value, secret) {
  return `${value}.${mac(value, secret)}`;
}

export function unsign(signed, secret) {
  if (typeof signed !== 'string') return null;
  const index = signed.lastIndexOf('.');
  if (index < 1) return null;
  const value = signed.slice(0, index);
  const expected = Buffer.from(mac(value, secret));
  const actual = Buffer.from(signed.slice(index + 1));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual) ? value : null;
}

export function cookieOptions(config, maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.production || config.baseUrl.startsWith('https://'),
    path: '/',
    maxAge: maxAgeMs,
  };
}
