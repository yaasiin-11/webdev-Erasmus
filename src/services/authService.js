import { AuthenticationError, ConflictError, ValidationError } from './errors.js';
import { hashPassword, randomToken, sha256, verifyPassword } from './passwords.js';
import { text } from './validate.js';

const SESSION_DAYS = 7;
const RESET_MINUTES = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MCP_TOKEN_PREFIX = 'shmcp_';

export const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email });

function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) {
    throw new ValidationError('Enter a valid email address.', 'InvalidEmail');
  }
  return email;
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new ValidationError('Password must be between 8 and 128 characters.', 'WeakPassword');
  }
}

export function createAuthService({ repos, now }) {
  async function register({ name, email, password }) {
    const cleanName = text(name, { field: 'Name', min: 2, max: 60 });
    const cleanEmail = normalizeEmail(email);
    checkPassword(password);
    if (await repos.users.findByEmail(cleanEmail)) {
      throw new ConflictError('An account with this email already exists. Sign in instead.', 'EmailTaken');
    }
    const user = await repos.users.insert({
      email: cleanEmail,
      name: cleanName,
      passwordHash: await hashPassword(password),
    });
    return publicUser(user);
  }

  async function authenticate({ email, password }) {
    if (!email || !password) {
      throw new ValidationError('Email and password are required', 'MissingCredentials');
    }
    const user = await repos.users.findByEmail(String(email).trim().toLowerCase());
    const valid = await verifyPassword(String(password), user?.password_hash);
    if (!valid) {
      throw new AuthenticationError('Email or password is incorrect.', 'BadCredentials');
    }
    return publicUser(user);
  }

  async function signInWithGoogle({ sub, email, emailVerified, name }) {
    if (!emailVerified) {
      throw new AuthenticationError('Your Google email address is not verified.', 'UnverifiedEmail');
    }
    const known = await repos.users.findByGoogleSub(sub);
    if (known) return publicUser(known);

    const cleanEmail = normalizeEmail(email);
    const existing = await repos.users.findByEmail(cleanEmail);
    if (existing) return publicUser(await repos.users.linkGoogle(existing.id, sub));

    const created = await repos.users.insert({
      email: cleanEmail,
      name: (name || cleanEmail.split('@')[0]).slice(0, 60),
      googleSub: sub,
    });
    return publicUser(created);
  }

  async function requestPasswordReset(email) {
    const user = await repos.users.findByEmail(normalizeEmail(email));
    if (!user) return null;
    const token = randomToken();
    const expiresAt = new Date(now().getTime() + RESET_MINUTES * 60 * 1000);
    await repos.passwordResets.replace({ userId: user.id, tokenHash: sha256(token), expiresAt });
    return { user: publicUser(user), token, expiresAt };
  }

  async function resetPassword({ token, password }) {
    checkPassword(password);
    const hash = sha256(String(token ?? ''));
    const reset = await repos.passwordResets.findUsable(hash, now());
    if (!reset) {
      throw new ValidationError('This reset link is invalid or has expired. Ask for a new one.', 'ResetLinkInvalid');
    }
    const passwordHash = await hashPassword(password);
    await repos.transaction(async (tx) => {
      await tx.users.setPassword(reset.user_id, passwordHash);
      await tx.passwordResets.markUsed(hash, now());
      await tx.authSessions.deleteForUser(reset.user_id);
    });
    return publicUser(await repos.users.findById(reset.user_id));
  }

  async function startSession(userId) {
    const token = randomToken();
    const expiresAt = new Date(now().getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await repos.authSessions.insert({ tokenHash: sha256(token), userId, expiresAt });
    return { token, expiresAt };
  }

  async function userForSession(token) {
    if (!token) return null;
    return repos.authSessions.findValid(sha256(token), now());
  }

  async function endSession(token) {
    if (token) await repos.authSessions.delete(sha256(token));
  }

  async function issueMcpToken(userId) {
    const token = randomToken(MCP_TOKEN_PREFIX);
    await repos.mcpTokens.upsert(userId, sha256(token));
    return token;
  }

  async function mcpTokenInfo(userId) {
    const info = await repos.mcpTokens.info(userId);
    return info ? { createdAt: info.created_at, lastUsedAt: info.last_used_at } : null;
  }

  async function revokeMcpToken(userId) {
    await repos.mcpTokens.delete(userId);
  }

  async function userForMcpToken(token) {
    if (typeof token !== 'string' || !token.startsWith(MCP_TOKEN_PREFIX)) {
      throw new AuthenticationError('This tool needs a valid MCP_TOKEN. Create one on your StudyHub profile page.', 'NoToken');
    }
    const hash = sha256(token);
    const user = await repos.mcpTokens.findUser(hash);
    if (!user) {
      throw new AuthenticationError('This MCP token is not valid any more. Create a new one on your profile page.', 'BadToken');
    }
    await repos.mcpTokens.touch(hash, now());
    return user;
  }

  return {
    register,
    authenticate,
    signInWithGoogle,
    requestPasswordReset,
    resetPassword,
    startSession,
    userForSession,
    endSession,
    issueMcpToken,
    mcpTokenInfo,
    revokeMcpToken,
    userForMcpToken,
  };
}
