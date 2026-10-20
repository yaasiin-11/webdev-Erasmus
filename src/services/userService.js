import db from '../db.js';
import crypto from 'node:crypto';

export function authenticateUser(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return null;
  }

  const [salt, key] = user.password_hash.split(':');
  const hashedBuffer = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(key, 'hex');

  if (hashedBuffer.length !== storedBuffer.length || !crypto.timingSafeEqual(hashedBuffer, storedBuffer)) {
    return null;
  }

  return { id: user.id, email: user.email, name: user.name };
}
