import db from '../db.js';

export function getAllStudyGroups() {
  const groups = db.prepare(`
    SELECT g.id, g.title, g.description, g.study_field, g.meeting_topic, g.max_capacity,
           (SELECT COUNT(*) FROM group_memberships gm WHERE gm.group_id = g.id) AS member_count
    FROM study_groups g
  `).all();
  return groups;
}

export function joinGroup(userId, groupId) {
  const group = db.prepare('SELECT * FROM study_groups WHERE id = ?').get(groupId);
  if (!group) {
    throw new Error('Group not found');
  }

  const existingMembership = db.prepare('SELECT 1 FROM group_memberships WHERE user_id = ? AND group_id = ?').get(userId, groupId);
  if (existingMembership) {
    throw new Error('User is already a member of this group');
  }

  const memberCount = db.prepare('SELECT COUNT(*) as count FROM group_memberships WHERE group_id = ?').get(groupId).count;
  const maxCapacity = group.max_capacity || 5;
  if (memberCount >= maxCapacity) {
    throw new Error('Group is at maximum capacity');
  }

  db.prepare('INSERT INTO group_memberships (user_id, group_id) VALUES (?, ?)').run(userId, groupId);
  return { success: true };
}

export function leaveGroup(userId, groupId) {
  const group = db.prepare('SELECT * FROM study_groups WHERE id = ?').get(groupId);
  if (!group) {
    throw new Error('Group not found');
  }

  const existingMembership = db.prepare('SELECT 1 FROM group_memberships WHERE user_id = ? AND group_id = ?').get(userId, groupId);
  if (!existingMembership) {
    throw new Error('User is not a member of this group');
  }

  db.prepare('DELETE FROM group_memberships WHERE user_id = ? AND group_id = ?').run(userId, groupId);
  return { success: true };
}
