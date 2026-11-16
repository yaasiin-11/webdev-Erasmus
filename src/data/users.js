const COLUMNS = 'id, email, name, password_hash, google_sub, created_at';

export function usersRepository(db) {
  return {
    async findById(id) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
      return rows[0] ?? null;
    },

    async findByEmail(email) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email]);
      return rows[0] ?? null;
    },

    async findByGoogleSub(sub) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM users WHERE google_sub = $1`, [sub]);
      return rows[0] ?? null;
    },

    async insert({ email, name, passwordHash = null, googleSub = null }) {
      const { rows } = await db.query(
        `INSERT INTO users (email, name, password_hash, google_sub)
         VALUES ($1, $2, $3, $4)
         RETURNING ${COLUMNS}`,
        [email, name, passwordHash, googleSub],
      );
      return rows[0];
    },

    async linkGoogle(id, sub) {
      const { rows } = await db.query(
        `UPDATE users SET google_sub = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, sub],
      );
      return rows[0];
    },
  };
}
