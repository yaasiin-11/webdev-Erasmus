const SESSION_COLUMNS = `
  s.id, s.group_id, s.created_by, s.topic, s.starts_at, s.duration_minutes, s.location,
  s.agenda, s.agenda_source, s.created_at, u.name AS created_by_name`;

export function studySessionsRepository(db) {
  return {
    async findById(id) {
      const { rows } = await db.query(
        `SELECT ${SESSION_COLUMNS}
           FROM study_sessions s
           JOIN users u ON u.id = s.created_by
          WHERE s.id = $1`,
        [id],
      );
      return rows[0] ?? null;
    },

    async listByGroup(groupId) {
      const { rows } = await db.query(
        `SELECT ${SESSION_COLUMNS}
           FROM study_sessions s
           JOIN users u ON u.id = s.created_by
          WHERE s.group_id = $1
          ORDER BY s.starts_at`,
        [groupId],
      );
      return rows;
    },

    async listForMember(userId, from) {
      const { rows } = await db.query(
        `SELECT ${SESSION_COLUMNS}, g.title AS group_title
           FROM study_sessions s
           JOIN users u ON u.id = s.created_by
           JOIN study_groups g ON g.id = s.group_id
           JOIN group_memberships m ON m.group_id = s.group_id AND m.user_id = $1
          WHERE s.starts_at >= $2
          ORDER BY s.starts_at`,
        [userId, from],
      );
      return rows;
    },

    async insert({ groupId, createdBy, topic, startsAt, durationMinutes, location, agenda, agendaSource }) {
      const { rows } = await db.query(
        `INSERT INTO study_sessions
           (group_id, created_by, topic, starts_at, duration_minutes, location, agenda, agenda_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [groupId, createdBy, topic, startsAt, durationMinutes, location, agenda, agendaSource],
      );
      return rows[0].id;
    },

    async update(id, { topic, startsAt, durationMinutes, location, agenda, agendaSource }) {
      await db.query(
        `UPDATE study_sessions
            SET topic = $2, starts_at = $3, duration_minutes = $4, location = $5, agenda = $6, agenda_source = $7
          WHERE id = $1`,
        [id, topic, startsAt, durationMinutes, location, agenda, agendaSource],
      );
    },

    async delete(id) {
      await db.query('DELETE FROM study_sessions WHERE id = $1', [id]);
    },
  };
}
