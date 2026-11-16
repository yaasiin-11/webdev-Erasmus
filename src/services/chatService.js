import { ForbiddenError, NotFoundError } from './errors.js';
import { id, integer, oneOf, text } from './validate.js';

const PAGE = 50;
export const REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '🤔', '👀', '✅'];

function groupReactions(messageId, reactions, viewerId) {
  return REACTIONS.map((emoji) => {
    const rows = reactions.filter((r) => r.message_id === messageId && r.emoji === emoji);
    return { emoji, count: rows.length, mine: rows.some((r) => r.user_id === viewerId), names: rows.map((r) => r.name) };
  }).filter((r) => r.count > 0);
}

export function toMessageDto(row, viewerId, reactions = []) {
  return {
    id: row.id,
    groupId: row.group_id,
    author: { id: row.user_id, name: row.author_name },
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    mine: row.user_id === viewerId,
    reactions: groupReactions(row.id, reactions, viewerId),
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

  async function withReactions(groupId, rows, viewerId) {
    if (!rows.length) return [];
    const reactions = await repos.messages.reactionsBetween(groupId, rows[0].id, rows[rows.length - 1].id);
    return rows.map((row) => toMessageDto(row, viewerId, reactions));
  }

  async function markRead(groupId, userId, messageId) {
    const last = await repos.messages.lastRead(groupId, userId);
    if (last === null) await repos.messages.insertRead(groupId, userId, messageId);
    else if (messageId > last) await repos.messages.updateRead(groupId, userId, messageId);
  }

  async function listMessages(userId, groupId, { after } = {}) {
    const group = await requireMember(userId, groupId, 'read');
    const rows = after === undefined || after === ''
      ? await repos.messages.latest(group.id, PAGE)
      : await repos.messages.after(group.id, integer(after, { field: 'After', min: 0, max: 2_147_483_647 }), PAGE);
    if (rows.length) await markRead(group.id, userId, rows[rows.length - 1].id);
    return withReactions(group.id, rows, userId);
  }

  async function postMessage(userId, groupId, input) {
    const group = await requireMember(userId, groupId, 'write in');
    const body = text(input.body, { field: 'Message', min: 1, max: 1000 });
    const messageId = await repos.messages.insert({ groupId: group.id, userId, body, createdAt: now() });
    await markRead(group.id, userId, messageId);
    return toMessageDto(await repos.messages.findById(messageId), userId);
  }

  async function requireMessage(messageId) {
    const message = await repos.messages.findById(id(messageId, 'Message id'));
    if (!message) throw new NotFoundError('This message does not exist.', 'MessageNotFound');
    return message;
  }

  async function deleteMessage(userId, messageId) {
    const message = await requireMessage(messageId);
    if (message.user_id !== userId) {
      const group = await groups.requireGroup(userId, message.group_id);
      if (group.creator_id !== userId) {
        throw new ForbiddenError('You can only delete your own messages.', 'NotAuthor');
      }
    }
    await repos.messages.delete(message.id);
  }

  async function toggleReaction(userId, messageId, emoji) {
    const message = await requireMessage(messageId);
    await requireMember(userId, message.group_id, 'react in');
    oneOf(emoji, REACTIONS, 'Reaction');
    if (await repos.messages.hasReaction(message.id, userId, emoji)) {
      await repos.messages.removeReaction(message.id, userId, emoji);
    } else {
      await repos.messages.addReaction(message.id, userId, emoji, now());
    }
    const [dto] = await withReactions(message.group_id, [message], userId);
    return dto;
  }

  return { listMessages, postMessage, deleteMessage, toggleReaction };
}
