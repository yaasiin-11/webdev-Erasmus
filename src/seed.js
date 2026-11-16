import { fallbackItems, renderAgenda } from './services/agendaService.js';

export const DEMO_PASSWORD = 'StudyHub2026!';

export const DEMO_USERS = [
  { key: 'ana', name: 'Ana Petrova', email: 'ana@studyhub.test' },
  { key: 'boris', name: 'Boris Ivanov', email: 'boris@studyhub.test' },
  { key: 'carmen', name: 'Carmen Ruiz', email: 'carmen@studyhub.test' },
];

const GROUPS = [
  {
    owner: 'ana',
    members: ['boris'],
    title: 'Calculus II: finals crew',
    subject: 'Multivariable calculus',
    category: 'university',
    maxCapacity: 6,
    description: 'We work through the problem sheets together every week and swap notes before the January finals.',
    messages: [
      ['ana', 'Hi both! I uploaded my notes on polar coordinates to our shared folder.'],
      ['boris', 'Thanks Ana. Can we spend ten minutes on exercise 7 before the past exam?'],
      ['ana', 'Sure, I added it to the agenda of Tuesday\u2019s session.'],
    ],
    sessions: [
      { by: 'ana', topic: 'Double integrals and Fubini', day: 1, hour: 17, minutes: 90, location: 'Library, room 2.14', withAgenda: true },
      { by: 'boris', topic: 'Past exam 2025, part A', day: 4, hour: 16, minutes: 120, location: 'https://meet.example.org/calc-finals' },
    ],
  },
  {
    owner: 'boris',
    members: [],
    title: 'State administration exam prep',
    subject: 'Public administration law',
    category: 'civil-service',
    maxCapacity: 8,
    description: 'Daily practice for the civil service entrance exam: constitutional law, procedure and timed quizzes.',
    sessions: [{ by: 'boris', topic: 'Constitutional bodies quiz', day: 2, hour: 18, minutes: 60, location: 'Online' }],
  },
  {
    owner: 'ana',
    members: [],
    title: 'AWS Cloud Practitioner sprint',
    subject: 'Cloud fundamentals',
    category: 'certification',
    maxCapacity: 4,
    description: 'Four weeks, one practice exam per week, and a shared flashcard deck for the services list.',
    sessions: [],
  },
  {
    owner: 'boris',
    members: ['ana'],
    title: 'Bulgarian for Erasmus students',
    subject: 'Everyday Bulgarian, A1',
    category: 'languages',
    maxCapacity: 10,
    description: 'Cyrillic, café vocabulary and enough grammar to survive the market. Beginners welcome.',
    sessions: [{ by: 'boris', topic: 'Cyrillic and café vocabulary', day: 3, hour: 15, minutes: 45, location: 'Student centre café' }],
  },
  {
    owner: 'boris',
    members: ['ana'],
    title: 'SQL and normalisation clinic',
    subject: 'Databases',
    category: 'university',
    maxCapacity: 2,
    description: 'A pair for the databases lab: normal forms, joins, and reading each other’s queries.',
    sessions: [],
  },
];

export async function seedDemo({ services, repos, now = new Date() }) {
  if (await repos.users.findByEmail(DEMO_USERS[0].email)) return false;

  const users = {};
  for (const demo of DEMO_USERS) {
    users[demo.key] = await services.auth.register({ name: demo.name, email: demo.email, password: DEMO_PASSWORD });
  }

  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  for (const group of GROUPS) {
    const created = await services.groups.createGroup(users[group.owner].id, group);
    for (const member of group.members) await services.groups.joinGroup(users[member].id, created.id);
    for (const [author, body] of group.messages ?? []) {
      await services.chat.postMessage(users[author].id, created.id, { body });
    }
    for (const session of group.sessions) {
      const startsAt = new Date(tomorrow.getTime() + ((session.day - 1) * 24 + session.hour) * 3600 * 1000);
      await services.studySessions.scheduleSession(users[session.by].id, created.id, {
        topic: session.topic,
        startsAt: startsAt.toISOString(),
        durationMinutes: session.minutes,
        location: session.location,
        agenda: session.withAgenda ? renderAgenda(session.topic, fallbackItems(session.minutes), session.hour * 60) : '',
        agendaSource: session.withAgenda ? 'fallback' : 'manual',
      });
    }
  }
  return true;
}
