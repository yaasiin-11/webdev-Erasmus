import { usersRepository } from './users.js';
import { groupsRepository } from './groups.js';
import { studySessionsRepository } from './sessions.js';
import { authSessionsRepository, mcpTokensRepository } from './tokens.js';
import { withTransaction } from '../db/pool.js';

function bind(db) {
  return {
    users: usersRepository(db),
    groups: groupsRepository(db),
    studySessions: studySessionsRepository(db),
    authSessions: authSessionsRepository(db),
    mcpTokens: mcpTokensRepository(db),
  };
}

export function createRepositories(pool) {
  return {
    ...bind(pool),
    transaction: (work) => withTransaction(pool, (client) => work(bind(client))),
    ping: () => pool.query('SELECT 1'),
  };
}
