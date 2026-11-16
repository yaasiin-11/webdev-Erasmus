const MESSAGE_COLUMNS = 'm.id, m.group_id, m.user_id, m.body, m.created_at, u.name AS author_name';

export function messagesRepository(db) {
  return {
    async latest(groupId, limit) {
      const { rows } = await db.query(
        `SELECT ${MESSAGE_COLUMNS}
           FROM group_messages m
           JOIN users u ON u.id = m.user_id
          WHERE m.group_id = $1
          ORDER BY m.id DESC
          LIMIT $2`,
        [groupId, limit],
      );
      return rows.reverse();
    },

    async after(groupId, afterId, limit) {
      const { rows } = await db.query(
        `SELECT ${MESSAGE_COLUMNS}
           FROM group_messages m
           JOIN users u ON u.id = m.user_id
          WHERE m.group_id = $1 AND m.id > $2
          ORDER BY m.id
          LIMIT $3`,
        [groupId, afterId, limit],
      );
      return rows;
    },

    async findById(id) {
      const { rows } = await db.query(
        `SELECT ${MESSAGE_COLUMNS}
           FROM group_messages m
           JOIN users u ON u.id = m.user_id
          WHERE m.id = $1`,
        [id],
      );
      return rows[0] ?? null;
    },

    async insert({ groupId, userId, body, createdAt }) {
      const { rows } = await db.query(
        'INSERT INTO group_messages (group_id, user_id, body, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [groupId, userId, body, createdAt],
      );
      return rows[0].id;
    },

    async delete(id) {
      await db.query('DELETE FROM group_messages WHERE id = $1', [id]);
    },
  };
}
