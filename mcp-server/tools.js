import { DomainError } from '../src/services/errors.js';

export const PROTOCOL_VERSION = '2025-11-25';

export const TOOLS = [
  {
    name: 'find_lecture',
    description: 'Return the title and topics of one course lecture by its number, 1 to 10. Use it when asked what a lecture covers. Returns one line of text.',
    inputSchema: {
      type: 'object',
      properties: { number: { type: 'integer', description: 'Lecture number, 1 to 10' } },
      required: ['number'],
    },
  },
  {
    name: 'list_lectures',
    description: 'List the number and title of every course lecture, one per line. Use it when asked what the whole course covers or which lecture talks about a subject.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_study_groups',
    description: 'List StudyHub study groups with their subject, category, member count, capacity and next session. Use it to find a group to join or to answer "which groups are there for X". Optional filters: category, a search text, or only the groups the caller belongs to.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['university', 'civil-service', 'certification', 'languages', 'other'],
          description: 'Only groups of this kind',
        },
        search: { type: 'string', description: 'Words to look for in the title, subject or description' },
        mine: { type: 'boolean', description: 'true to list only groups the caller is a member of' },
      },
    },
  },
  {
    name: 'get_group_schedule',
    description: 'Return the upcoming study sessions of one StudyHub group: topic, start and end time in UTC, place and agenda. Use it when asked when a group meets next or what a session will cover. Needs the group id from list_study_groups.',
    inputSchema: {
      type: 'object',
      properties: { groupId: { type: 'integer', description: 'The study group id' } },
      required: ['groupId'],
    },
  },
  {
    name: 'create_study_session',
    description: 'Schedule a new study session in a StudyHub group the caller is a member of. It follows the same rules as the website: the start must be in the future, the length 15 to 480 minutes, and it must not overlap another session of the same group. Returns the created session or the reason it was refused.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'integer', description: 'The study group id' },
        topic: { type: 'string', description: 'What the session is about, 3 to 120 characters' },
        startsAt: { type: 'string', description: 'Start time as ISO 8601 with a time zone, for example 2026-12-01T17:00:00Z' },
        durationMinutes: { type: 'integer', description: 'Length in minutes, 15 to 480' },
        location: { type: 'string', description: 'A room or a meeting link (optional)' },
        agenda: { type: 'string', description: 'A short plan for the session (optional)' },
      },
      required: ['groupId', 'topic', 'startsAt', 'durationMinutes'],
    },
  },
];

const result = (id, text, isError = false) => ({
  jsonrpc: '2.0',
  id,
  result: { content: [{ type: 'text', text }], isError },
});

const protocolError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

const when = (iso) => iso.replace('T', ' ').slice(0, 16) + ' UTC';

function describeGroup(group) {
  const next = group.nextSessionAt ? `, next session ${when(group.nextSessionAt)}` : ', no session planned';
  const membership = group.isMember ? ', you are a member' : '';
  return `#${group.id} ${group.title} (${group.category}, ${group.subject}): ${group.memberCount}/${group.maxCapacity} members${group.isFull ? ', full' : ''}${membership}${next}`;
}

function describeSession(session) {
  const place = session.location ? ` at ${session.location}` : session.locationHidden ? ' (place shown to members only)' : '';
  const agenda = session.agenda ? `\n  ${session.agenda.split('\n').join('\n  ')}` : '';
  return `#${session.id} ${session.topic}: ${when(session.startsAt)} to ${when(session.endsAt)}${place}, by ${session.createdBy.name}, ${session.attendance.going} going${agenda}`;
}

export function createMcpHandler({ lectures, getServices, token, log = () => {} }) {
  async function caller(services) {
    return services.auth.userForMcpToken(token);
  }

  const project = {
    async list_study_groups(args, services) {
      const user = await caller(services);
      const groups = await services.groups.listGroups(user.id, {
        category: args.category,
        search: args.search,
        mine: args.mine === true,
      });
      return groups.length ? groups.map(describeGroup).join('\n') : 'No study groups match.';
    },

    async get_group_schedule(args, services) {
      const user = await caller(services);
      const { group, sessions } = await services.studySessions.groupSchedule(user.id, args.groupId);
      if (!sessions.length) return `${group.title} has no upcoming sessions.`;
      return [`Upcoming sessions of ${group.title}:`, ...sessions.map(describeSession)].join('\n');
    },

    async create_study_session(args, services) {
      const user = await caller(services);
      const session = await services.studySessions.scheduleSession(user.id, args.groupId, {
        topic: args.topic,
        startsAt: args.startsAt,
        durationMinutes: args.durationMinutes,
        location: args.location,
        agenda: args.agenda,
        agendaSource: 'manual',
      });
      return `Scheduled. ${describeSession(session)}`;
    },
  };

  function lectureTool(name, args) {
    if (name === 'list_lectures') {
      return { text: lectures.map((l) => `${l.number}. ${l.title}`).join('\n'), isError: false };
    }
    const lecture = lectures.find((l) => l.number === args.number);
    if (!lecture) {
      return { text: `There is no lecture ${args.number}. The course has lectures 1 to ${lectures.length}.`, isError: true };
    }
    return { text: `Lecture ${lecture.number}: ${lecture.title}. Topics: ${lecture.topics}`, isError: false };
  }

  async function callTool(id, name, args) {
    if (name === 'find_lecture' || name === 'list_lectures') {
      const { text, isError } = lectureTool(name, args);
      return result(id, text, isError);
    }
    if (!project[name]) return protocolError(id, -32602, `Unknown tool: ${name}`);
    try {
      return result(id, await project[name](args, await getServices()));
    } catch (error) {
      if (error instanceof DomainError) return result(id, error.message, true);
      log(`tool ${name} failed: ${error.stack ?? error.message}`);
      return result(id, error.userMessage ?? 'The StudyHub server could not complete this call. Try again later.', true);
    }
  }

  return async function handle(message) {
    if (!message || typeof message !== 'object') return null;
    const { id, method, params = {} } = message;

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'studyhub', version: '1.0.0' },
        },
      };
    }
    if (method === 'notifications/initialized') return null;
    if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    if (method === 'tools/call') return callTool(id, params.name, params.arguments ?? {});
    if (id !== undefined) return protocolError(id, -32601, `Unknown method: ${method}`);
    return null;
  };
}
