import { createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { createRepositories } from './data/index.js';
import { createAuthService } from './services/authService.js';
import { createGroupService } from './services/groupService.js';
import { createStudySessionService } from './services/studySessionService.js';
import { createAgendaService } from './services/agendaService.js';
import { createGeminiClient } from './integrations/gemini.js';

export function createServices({ repos, modelClient = null, now = () => new Date(), log = () => {} }) {
  const groups = createGroupService({ repos, now });
  return {
    auth: createAuthService({ repos, now }),
    groups,
    studySessions: createStudySessionService({ repos, groups, now }),
    agenda: createAgendaService({ client: modelClient, log }),
  };
}

export async function createContainer({ databaseUrl, model = null, log = () => {} }) {
  const pool = await createPool(databaseUrl);
  await migrate(pool, { log });
  const repos = createRepositories(pool);
  const modelClient = model ? createGeminiClient({ apiKey: model.apiKey, model: model.name }) : null;
  return { pool, repos, services: createServices({ repos, modelClient, log }) };
}
