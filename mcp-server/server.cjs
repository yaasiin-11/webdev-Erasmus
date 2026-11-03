const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');

let groupService = null;
async function getGroupService() {
  if (groupService) return groupService;
  try {
    const mod = await import('../src/services/groupService.js');
    groupService = mod.default || mod;
  } catch {
    try {
      const mod = await import('../services/groupService.js');
      groupService = mod.default || mod;
    } catch {
      groupService = {};
    }
  }
  return groupService;
}

let lectures = [];
const lecturesPath = path.join(__dirname, 'lectures.json');
if (fs.existsSync(lecturesPath)) {
  try {
    lectures = JSON.parse(fs.readFileSync(lecturesPath, 'utf8'));
  } catch {
    lectures = [];
  }
}

function textResult(id, text, isError = false) {
  return {
    jsonrpc: '2.0',
    id: id,
    result: {
      content: [{ type: 'text', text: String(text) }],
      isError: isError,
    },
  };
}

const tools = [
  {
    name: 'find_lecture',
    description: 'Return the title and topics of one course lecture by its number, 1 to 12. Use it when asked what a lecture covers.',
    inputSchema: {
      type: 'object',
      properties: { number: { type: 'integer', description: 'Lecture number, 1 to 12' } },
      required: ['number'],
    },
  },
  {
    name: 'list_lectures',
    description: 'List the number and title of every course lecture. Use it when asked what the course covers.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_study_groups',
    description: 'Retrieves all active study groups filtered by academic course or competitive exam category.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by study topic or category' },
        userId: { type: 'integer', description: 'Caller user identifier' },
      },
    },
  },
  {
    name: 'create_study_session',
    description: 'Schedules a new study session with date, time, topic, and location details for an existing group.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'integer', description: 'Target study group identifier' },
        topic: { type: 'string', description: 'Meeting topic' },
        startsAt: { type: 'string', description: 'Session ISO date and time' },
        userId: { type: 'integer', description: 'Caller user identifier' },
      },
      required: ['groupId', 'topic', 'userId'],
    },
  },
  {
    name: 'get_group_schedule',
    description: 'Returns the upcoming meetings and agendas planned for a specific study group identifier.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'integer', description: 'Study group identifier' },
        userId: { type: 'integer', description: 'Caller user identifier' },
      },
      required: ['groupId'],
    },
  },
];

function send(reply) {
  process.stdout.write(JSON.stringify(reply) + '\n');
}

async function handle(msg) {
  if (!msg || typeof msg !== 'object') return null;

  if (msg.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'studyhub-mcp', version: '0.1.0' },
      },
    };
  }

  if (msg.method === 'notifications/initialized') {
    return null;
  }

  if (msg.method === 'tools/list') {
    return { jsonrpc: '2.0', id: msg.id, result: { tools: tools } };
  }

  if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments || {};
    const callerId = args.userId || msg.params?.userId || msg.params?.context?.userId || 1;
    const service = await getGroupService();

    if (name === 'find_lecture') {
      const lecture = lectures.find((l) => l.number === args.number);
      if (!lecture) {
        return textResult(msg.id, 'There is no lecture ' + args.number + '. The course has lectures 1 to 12.', true);
      }
      return textResult(msg.id, 'Lecture ' + lecture.number + ': ' + lecture.title + '. Topics: ' + lecture.topics, false);
    }

    if (name === 'list_lectures') {
      return textResult(msg.id, lectures.map((l) => l.number + '. ' + l.title).join('\n'), false);
    }

    if (name === 'list_study_groups') {
      try {
        const fn = service.getAllStudyGroups;
        const result = typeof fn === 'function' ? await fn(args, callerId) : [];
        return textResult(msg.id, JSON.stringify(result));
      } catch (err) {
        return textResult(msg.id, 'Error listing groups: ' + err.message, true);
      }
    }

    if (name === 'create_study_session') {
      if (!callerId) {
        return textResult(msg.id, 'Unauthenticated caller', true);
      }
      try {
        const fn = service.createSession;
        const result = typeof fn === 'function'
          ? await fn(args, callerId)
          : { ok: true, groupId: args.groupId, topic: args.topic, createdBy: callerId };
        return textResult(msg.id, JSON.stringify(result));
      } catch (err) {
        return textResult(msg.id, 'Error creating session: ' + err.message, true);
      }
    }

    if (name === 'get_group_schedule') {
      try {
        const fn = service.getGroupSchedule;
        const result = typeof fn === 'function' ? await fn(args.groupId, callerId) : [];
        return textResult(msg.id, JSON.stringify(result));
      } catch (err) {
        return textResult(msg.id, 'Error fetching schedule: ' + err.message, true);
      }
    }

    return { jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: 'Unknown tool: ' + name } };
  }

  if (msg.id !== undefined) {
    return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Unknown method: ' + msg.method } };
  }
  return null;
}

const lines = readline.createInterface({ input: process.stdin });

lines.on('line', async (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    const reply = await handle(msg);
    if (reply) send(reply);
  } catch (err) {
    console.error('Error handling line:', err);
  }
});