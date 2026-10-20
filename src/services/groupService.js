import db from '../db.js';

export function getAllStudyGroups() {
  const groups = db.prepare(`
    SELECT g.id, g.title, g.description, g.study_field, g.meeting_topic,
           (SELECT COUNT(*) FROM group_memberships gm WHERE gm.group_id = g.id) AS member_count
    FROM study_groups g
  `).all();
  return groups;
}
