import { ConflictError, ForbiddenError, NotFoundError } from './errors.js';
import { id, integer, oneOf, text } from './validate.js';
import { toSessionDto, upcoming } from './studySessionService.js';

export const CATEGORIES = ['university', 'civil-service', 'certification', 'languages', 'other'];

export function toGroupDto(row, viewerId) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    description: row.description,
    category: row.category,
    maxCapacity: row.max_capacity,
    memberCount: row.member_count,
    isFull: row.member_count >= row.max_capacity,
    isMember: Boolean(row.is_member),
    isOwner: row.creator_id === viewerId,
    creator: { id: row.creator_id, name: row.creator_name },
    nextSessionAt: row.next_session_at ? new Date(row.next_session_at).toISOString() : null,
    unreadCount: row.unread_count,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function createGroupService({ repos, now }) {
  async function requireGroup(viewerId, groupId, db = repos) {
    const row = await db.groups.findForViewer(id(groupId, 'Group id'), viewerId, now());
    if (!row) throw new NotFoundError('This study group does not exist.', 'GroupNotFound');
    return row;
  }

  async function listGroups(viewerId, { category, search, mine } = {}) {
    const rows = await repos.groups.list({
      viewerId,
      now: now(),
      category: category ? oneOf(category, CATEGORIES, 'Category') : null,
      search: text(search, { field: 'Search', max: 80, optional: true }) || null,
      onlyMine: mine === true || mine === 'true' || mine === '1',
    });
    return rows.map((row) => toGroupDto(row, viewerId));
  }

  async function getGroup(viewerId, groupId) {
    const row = await requireGroup(viewerId, groupId);
    const [members, sessions, rsvps] = await Promise.all([
      repos.groups.members(row.id),
      repos.studySessions.listByGroup(row.id),
      repos.studySessions.rsvpsForGroup(row.id),
    ]);
    return {
      ...toGroupDto(row, viewerId),
      members: members.map((m) => ({ id: m.id, name: m.name, joinedAt: new Date(m.joined_at).toISOString() })),
      sessions: upcoming(sessions, now()).map((s) => toSessionDto(s, viewerId, rsvps)),
    };
  }

  async function createGroup(userId, input) {
    const group = {
      title: text(input.title, { field: 'Title', min: 3, max: 80 }),
      subject: text(input.subject, { field: 'Subject', min: 2, max: 80 }),
      description: text(input.description, { field: 'Description', max: 500, optional: true }),
      category: oneOf(input.category, CATEGORIES, 'Category'),
      maxCapacity: integer(input.maxCapacity, { field: 'Capacity', min: 2, max: 50 }),
      creatorId: userId,
    };
    const groupId = await repos.transaction(async (tx) => {
      const newId = await tx.groups.insert(group);
      await tx.groups.addMember(newId, userId);
      return newId;
    });
    return getGroup(userId, groupId);
  }

  async function joinGroup(userId, groupId) {
    const gid = id(groupId, 'Group id');
    await repos.transaction(async (tx) => {
      const group = await tx.groups.lockById(gid);
      if (!group) throw new NotFoundError('This study group does not exist.', 'GroupNotFound');
      if (await tx.groups.isMember(gid, userId)) {
        throw new ConflictError('You are already a member of this group.', 'AlreadyMember');
      }
      if ((await tx.groups.countMembers(gid)) >= group.max_capacity) {
        throw new ConflictError('This group is full.', 'GroupFull');
      }
      await tx.groups.addMember(gid, userId);
    });
    return getGroup(userId, gid);
  }

  async function leaveGroup(userId, groupId) {
    const row = await requireGroup(userId, groupId);
    if (row.creator_id === userId) {
      throw new ConflictError('You created this group, so you cannot leave it. Delete the group instead.', 'OwnerCannotLeave');
    }
    if (!row.is_member) {
      throw new ConflictError('You are not a member of this group.', 'NotMember');
    }
    await repos.groups.removeMember(row.id, userId);
    return getGroup(userId, row.id);
  }

  async function deleteGroup(userId, groupId) {
    const row = await requireGroup(userId, groupId);
    if (row.creator_id !== userId) {
      throw new ForbiddenError('Only the person who created this group can delete it.', 'NotOwner');
    }
    await repos.transaction((tx) => tx.groups.delete(row.id));
  }

  return { listGroups, getGroup, createGroup, joinGroup, leaveGroup, deleteGroup, requireGroup };
}
