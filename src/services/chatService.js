import { ForbiddenError, NotFoundError } from './errors.js';
import { id, integer, text } from './validate.js';

const PAGE = 50;

export function toMessageDto(row, viewerId) {
  return {
    id: row.id,
    groupId: row.group_id,
    author: { id: row.user_id, name: row.author_name },
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    mine: row.user_id === viewerId,
  };
}

export function createChatService({ repos, groups, now }) {
  async function requireMember(userId, groupId, action) {
    const group = await groups.requireGroup(userId, groupId);
    if (!group.is_member) {
      throw new ForbiddenError(`Only members of this group can ${action} its chat.`, 'NotMember');
    }
    return group;
  }

  async function listMessages(userId, groupId, { after } = {}) {
    const group = await requireMember(userId, groupId, 'read');
    const rows = after === undefined || after === ''
      ? await repos.messages.latest(group.id, PAGE)
      : await repos.messages.after(group.id, integer(after, { field: 'After', min: 0, max: 2_147_483_647 }), PAGE);
    return rows.map((row) => toMessageDto(row, userId));
  }

  async function postMessage(userId, groupId, input) {
    const group = await requireMember(userId, groupId, 'write in');
    const body = text(input.body, { field: 'Message', min: 1, max: 1000 });
    const messageId = await repos.messages.insert({ groupId: group.id, userId, body, createdAt: now() });
    return toMessageDto(await repos.messages.findById(messageId), userId);
  }

  async function deleteMessage(userId, messageId) {
    const message = await repos.messages.findById(id(messageId, 'Message id'));
    if (!message) throw new NotFoundError('This message does not exist.', 'MessageNotFound');
    if (message.user_id !== userId) {
      const group = await groups.requireGroup(userId, message.group_id);
      if (group.creator_id !== userId) {
        throw new ForbiddenError('You can only delete your own messages.', 'NotAuthor');
      }
    }
    await repos.messages.delete(message.id);
  }

  return { listMessages, postMessage, deleteMessage };
}
