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
      await db.query('DELETE FROM message_reactions WHERE message_id = $1', [id]);
      await db.query('DELETE FROM group_messages WHERE id = $1', [id]);
    },

    async reactionsBetween(groupId, fromId, toId) {
      const { rows } = await db.query(
        `SELECT r.message_id, r.user_id, r.emoji, u.name
           FROM message_reactions r
           JOIN group_messages m ON m.id = r.message_id
           JOIN users u ON u.id = r.user_id
          WHERE m.group_id = $1 AND r.message_id >= $2 AND r.message_id <= $3
          ORDER BY r.created_at, r.user_id`,
        [groupId, fromId, toId],
      );
      return rows;
    },

    async hasReaction(messageId, userId, emoji) {
      const { rows } = await db.query(
        'SELECT 1 FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
        [messageId, userId, emoji],
      );
      return rows.length > 0;
    },

    async addReaction(messageId, userId, emoji, createdAt) {
      await db.query(
        'INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES ($1, $2, $3, $4)',
        [messageId, userId, emoji, createdAt],
      );
    },

    async removeReaction(messageId, userId, emoji) {
      await db.query(
        'DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
        [messageId, userId, emoji],
      );
    },

    async lastRead(groupId, userId) {
      const { rows } = await db.query(
        'SELECT last_read_message_id FROM chat_reads WHERE group_id = $1 AND user_id = $2',
        [groupId, userId],
      );
      return rows[0]?.last_read_message_id ?? null;
    },

    async insertRead(groupId, userId, messageId) {
      await db.query(
        'INSERT INTO chat_reads (group_id, user_id, last_read_message_id) VALUES ($1, $2, $3)',
        [groupId, userId, messageId],
      );
    },

    async updateRead(groupId, userId, messageId) {
      await db.query(
        'UPDATE chat_reads SET last_read_message_id = $3 WHERE group_id = $1 AND user_id = $2',
        [groupId, userId, messageId],
      );
    },
  };
}
