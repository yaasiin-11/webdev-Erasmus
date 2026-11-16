import { ConfigError, loadConfig } from './config.js';
import { createContainer } from './container.js';
import { createApp } from './app.js';
import { seedDemo, DEMO_PASSWORD, DEMO_USERS } from './seed.js';
import { createGoogleOAuth } from './integrations/google.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(error.message);
  process.exit(1);
}

const log = {
  info: (message) => console.log(message),
  error: (error) => console.error(error instanceof Error ? error.stack : error),
};

const { pool, repos, services } = await createContainer({
  databaseUrl: config.databaseUrl,
  model: config.model,
  log: log.info,
});

if (config.seedDemo && (await seedDemo({ services, repos }))) {
  log.info(`demo data ready: ${DEMO_USERS.map((u) => u.email).join(', ')} (password ${DEMO_PASSWORD})`);
}

const google = config.google ? createGoogleOAuth(config.google) : null;
const app = createApp({ config, services, repos, google, log });

const server = app.listen(config.port, () => {
  log.info(`studyhub listening on http://localhost:${config.port}`);
  log.info(`public address ${config.baseUrl}`);
  log.info(`database: ${config.databaseUrl === 'memory' ? 'in memory (data is lost on restart)' : 'postgres'}`);
  log.info(`google sign-in: ${google ? 'on' : 'off'} · agenda model: ${config.model ? config.model.name : 'off (template fallback)'}`);
});

setInterval(() => repos.authSessions.deleteExpired(new Date()).catch(() => {}), 60 * 60 * 1000).unref();

function shutdown() {
  server.close(() => pool.end().finally(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
