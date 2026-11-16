export function authSessionsRepository(db) {
  return {
    async insert({ tokenHash, userId, expiresAt }) {
      await db.query(
        'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
        [tokenHash, userId, expiresAt],
      );
    },

    async findValid(tokenHash, now) {
      const { rows } = await db.query(
        `SELECT u.id, u.email, u.name
           FROM auth_sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > $2`,
        [tokenHash, now],
      );
      return rows[0] ?? null;
    },

    async delete(tokenHash) {
      await db.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash]);
    },

    async deleteForUser(userId) {
      await db.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
    },

    async deleteExpired(now) {
      await db.query('DELETE FROM auth_sessions WHERE expires_at <= $1', [now]);
    },
  };
}

export function mcpTokensRepository(db) {
  return {
    async upsert(userId, tokenHash) {
      await db.query('DELETE FROM mcp_tokens WHERE user_id = $1', [userId]);
      await db.query('INSERT INTO mcp_tokens (user_id, token_hash) VALUES ($1, $2)', [userId, tokenHash]);
    },

    async findUser(tokenHash) {
      const { rows } = await db.query(
        `SELECT u.id, u.email, u.name
           FROM mcp_tokens t
           JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = $1`,
        [tokenHash],
      );
      return rows[0] ?? null;
    },

    async touch(tokenHash, now) {
      await db.query('UPDATE mcp_tokens SET last_used_at = $2 WHERE token_hash = $1', [tokenHash, now]);
    },

    async info(userId) {
      const { rows } = await db.query(
        'SELECT created_at, last_used_at FROM mcp_tokens WHERE user_id = $1',
        [userId],
      );
      return rows[0] ?? null;
    },

    async delete(userId) {
      await db.query('DELETE FROM mcp_tokens WHERE user_id = $1', [userId]);
    },
  };
}

export function passwordResetsRepository(db) {
  return {
    async replace({ userId, tokenHash, expiresAt }) {
      await db.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
      await db.query(
        'INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
        [tokenHash, userId, expiresAt],
      );
    },

    async findUsable(tokenHash, now) {
      const { rows } = await db.query(
        `SELECT user_id FROM password_resets
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2`,
        [tokenHash, now],
      );
      return rows[0] ?? null;
    },

    async markUsed(tokenHash, now) {
      await db.query('UPDATE password_resets SET used_at = $2 WHERE token_hash = $1', [tokenHash, now]);
    },
  };
}
