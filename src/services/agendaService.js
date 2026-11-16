import { CATEGORIES } from './groupService.js';
import { ValidationError } from './errors.js';
import { integer, oneOf, text } from './validate.js';

const CATEGORY_LABELS = {
  university: 'a university course',
  'civil-service': 'a civil service (public sector) exam',
  certification: 'a professional certification exam',
  languages: 'a language exam',
  other: 'general self-study',
};

const FALLBACK_SHAPE = [
  ['Warm-up: recap what everyone already knows', 0.15],
  ['Core concepts, explained in turns', 0.45],
  ['Practice problems or past exam questions', 0.3],
  ['Wrap-up: open questions and next steps', 0.1],
];

export class InvalidModelAnswer extends Error {}

export function buildPrompt({ topic, category, durationMinutes }) {
  return [
    `You plan study sessions for a group preparing ${CATEGORY_LABELS[category]}.`,
    `Topic: ${JSON.stringify(topic)}. Total length: ${durationMinutes} minutes.`,
    'Split the session into 3 to 6 consecutive blocks with recommended sub-topics.',
    `The minutes of all blocks must add up to exactly ${durationMinutes}.`,
    'Answer with JSON only, in this shape: {"items":[{"title":"short sub-topic, max 80 characters","minutes":15}]}',
  ].join('\n');
}

const DAY = 24 * 60;
const clock = (minutes) => {
  const wrapped = minutes % DAY;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

export function parseStartTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? '');
  if (!match) throw new ValidationError('Start time must look like 17:30.', 'InvalidField');
  return Number(match[1]) * 60 + Number(match[2]);
}

export function renderAgenda(topic, items, startMinute = 0) {
  let elapsed = startMinute;
  const lines = items.map((item) => {
    const line = `- ${clock(elapsed)}–${clock(elapsed + item.minutes)} · ${item.title} (${item.minutes} min)`;
    elapsed += item.minutes;
    return line;
  });
  return [`Study agenda: ${topic}`, ...lines].join('\n');
}

function fitToDuration(items, durationMinutes) {
  const total = items.reduce((sum, item) => sum + item.minutes, 0);
  if (Math.abs(total - durationMinutes) > durationMinutes * 0.2) {
    throw new InvalidModelAnswer(`blocks add up to ${total} minutes instead of ${durationMinutes}`);
  }
  const scaled = items.map((item) => ({ ...item, minutes: Math.max(1, Math.round((item.minutes * durationMinutes) / total)) }));
  const last = scaled[scaled.length - 1];
  last.minutes += durationMinutes - scaled.reduce((sum, item) => sum + item.minutes, 0);
  if (last.minutes < 1) throw new InvalidModelAnswer('the last block ended up empty');
  return scaled;
}

export function parseModelAnswer(raw, durationMinutes) {
  let data;
  try {
    data = JSON.parse(String(raw).replace(/^\s*```(?:json)?|```\s*$/g, ''));
  } catch {
    throw new InvalidModelAnswer('the answer is not JSON');
  }
  const items = data?.items;
  if (!Array.isArray(items) || items.length < 2 || items.length > 8) {
    throw new InvalidModelAnswer('expected between 2 and 8 blocks');
  }
  const clean = items.map((item) => {
    const title = typeof item?.title === 'string' ? item.title.replace(/[<>`*_#\r\n]/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (title.length < 3 || title.length > 80) throw new InvalidModelAnswer('a block has no usable title');
    if (!Number.isInteger(item.minutes) || item.minutes < 1 || item.minutes > durationMinutes) {
      throw new InvalidModelAnswer('a block has an impossible length');
    }
    return { title, minutes: item.minutes };
  });
  return fitToDuration(clean, durationMinutes);
}

export function fallbackItems(durationMinutes) {
  const items = FALLBACK_SHAPE.map(([title, share]) => ({ title, minutes: Math.max(1, Math.round(durationMinutes * share)) }));
  const last = items[items.length - 1];
  last.minutes += durationMinutes - items.reduce((sum, item) => sum + item.minutes, 0);
  return items;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createAgendaService({ client = null, timeoutMs = 8000, log = () => {} } = {}) {
  async function suggestAgenda(input) {
    const request = {
      topic: text(input.topic, { field: 'Topic', min: 3, max: 120 }),
      category: oneOf(input.category, CATEGORIES, 'Category'),
      durationMinutes: integer(input.durationMinutes, { field: 'Duration', min: 15, max: 480 }),
      startMinute: input.startTime === undefined ? 0 : parseStartTime(input.startTime),
    };

    const fallback = (notice) => {
      const items = fallbackItems(request.durationMinutes);
      return { source: 'fallback', notice, items, agenda: renderAgenda(request.topic, items, request.startMinute) };
    };

    if (!client) {
      return fallback('The AI assistant is switched off here, so this is the standard template. Edit it freely.');
    }

    try {
      const raw = await withTimeout(client.generate(buildPrompt(request)), timeoutMs);
      const items = parseModelAnswer(raw, request.durationMinutes);
      return { source: 'model', notice: null, items, agenda: renderAgenda(request.topic, items, request.startMinute) };
    } catch (error) {
      log(`agenda suggestion fell back: ${error.message}`);
      const reason = error instanceof InvalidModelAnswer
        ? 'The AI suggestion did not fit this session, so this is the standard template instead.'
        : 'The AI assistant did not answer in time, so this is the standard template instead.';
      return fallback(reason);
    }
  }

  return { suggestAgenda };
}
