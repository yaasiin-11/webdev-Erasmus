import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${key.toString('hex')}`;
}

const DUMMY_HASH = `${'0'.repeat(32)}:${'0'.repeat(KEY_LENGTH * 2)}`;

export async function verifyPassword(password, stored) {
  const [salt, keyHex] = (stored ?? DUMMY_HASH).split(':');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, salt, KEY_LENGTH);
  return stored != null && crypto.timingSafeEqual(actual, expected);
}

export function randomToken(prefix = '') {
  return prefix + crypto.randomBytes(32).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
