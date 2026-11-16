const GROUP_SELECT = `
  SELECT g.id, g.title, g.subject, g.description, g.category, g.max_capacity, g.creator_id,
         g.created_at, u.name AS creator_name,
         COALESCE(mc.member_count, 0)::int AS member_count,
         (me.user_id IS NOT NULL) AS is_member,
         ns.next_session_at,
         COALESCE(ur.unread_count, 0)::int AS unread_count
    FROM study_groups g
    JOIN users u ON u.id = g.creator_id
    LEFT JOIN (SELECT group_id, COUNT(*) AS member_count FROM group_memberships GROUP BY group_id) mc
           ON mc.group_id = g.id
    LEFT JOIN group_memberships me ON me.group_id = g.id AND me.user_id = $1
    LEFT JOIN (SELECT group_id, MIN(starts_at) AS next_session_at
                 FROM study_sessions WHERE starts_at > $2 GROUP BY group_id) ns
           ON ns.group_id = g.id
    LEFT JOIN (SELECT msg.group_id, COUNT(*) AS unread_count
                 FROM group_messages msg
                 LEFT JOIN chat_reads cr ON cr.group_id = msg.group_id AND cr.user_id = $1
                WHERE msg.user_id <> $1 AND msg.id > COALESCE(cr.last_read_message_id, 0)
                GROUP BY msg.group_id) ur
           ON ur.group_id = g.id AND me.user_id IS NOT NULL`;

export function groupsRepository(db) {
  return {
    async list({ viewerId, now, category = null, search = null, onlyMine = false }) {
      const params = [viewerId, now];
      const where = [];
      if (category) {
        params.push(category);
        where.push(`g.category = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        where.push(`(g.title ILIKE $${params.length} OR g.subject ILIKE $${params.length} OR g.description ILIKE $${params.length})`);
      }
      if (onlyMine) {
        where.push('me.user_id IS NOT NULL');
      }
      const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const { rows } = await db.query(`${GROUP_SELECT} ${filter} ORDER BY g.created_at DESC, g.id DESC`, params);
      return rows;
    },

    async findForViewer(id, viewerId, now) {
      const { rows } = await db.query(`${GROUP_SELECT} WHERE g.id = $3`, [viewerId, now, id]);
      return rows[0] ?? null;
    },

    async lockById(id) {
      const { rows } = await db.query(
        'SELECT id, title, max_capacity, creator_id FROM study_groups WHERE id = $1 FOR UPDATE',
        [id],
      );
      return rows[0] ?? null;
    },

    async insert({ title, subject, description, category, maxCapacity, creatorId }) {
      const { rows } = await db.query(
        `INSERT INTO study_groups (title, subject, description, category, max_capacity, creator_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [title, subject, description, category, maxCapacity, creatorId],
      );
      return rows[0].id;
    },

    async delete(id) {
      await db.query('DELETE FROM session_rsvps WHERE session_id IN (SELECT id FROM study_sessions WHERE group_id = $1)', [id]);
      await db.query('DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM group_messages WHERE group_id = $1)', [id]);
      await db.query('DELETE FROM chat_reads WHERE group_id = $1', [id]);
      await db.query('DELETE FROM group_messages WHERE group_id = $1', [id]);
      await db.query('DELETE FROM study_sessions WHERE group_id = $1', [id]);
      await db.query('DELETE FROM group_memberships WHERE group_id = $1', [id]);
      await db.query('DELETE FROM study_groups WHERE id = $1', [id]);
    },

    async members(groupId) {
      const { rows } = await db.query(
        `SELECT u.id, u.name, m.joined_at
           FROM group_memberships m
           JOIN users u ON u.id = m.user_id
          WHERE m.group_id = $1
          ORDER BY m.joined_at, u.id`,
        [groupId],
      );
      return rows;
    },

    async countMembers(groupId) {
      const { rows } = await db.query(
        'SELECT COUNT(*)::int AS count FROM group_memberships WHERE group_id = $1',
        [groupId],
      );
      return rows[0].count;
    },

    async isMember(groupId, userId) {
      const { rows } = await db.query(
        'SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2',
        [groupId, userId],
      );
      return rows.length > 0;
    },

    async addMember(groupId, userId) {
      await db.query('INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2)', [groupId, userId]);
    },

    async removeMember(groupId, userId) {
      await db.query('DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    },
  };
}
