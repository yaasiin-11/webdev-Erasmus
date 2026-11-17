import express from 'express';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './routes/auth.js';
import { groupRoutes, messageRoutes, sessionRoutes } from './routes/groups.js';
import { agendaRoutes, meRoutes } from './routes/me.js';
import { apiNotFound, attachUser, errorHandler, sameOriginWrites, securityHeaders } from './http/middleware.js';
import { createLimits } from './http/rateLimit.js';
import { createConsoleMailer } from './integrations/mailer.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

export function createApp({
  config,
  services,
  repos,
  google = null,
  limits = createLimits(),
  log = console,
  mailer = createConsoleMailer(log.info, { showContent: !config.production }),
}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.production) app.set('trust proxy', 1);

  app.use(securityHeaders(config));

  app.get('/health', async (req, res) => {
    try {
      await repos.ping();
      res.json({ status: 'ok', db: 'ok' });
    } catch (error) {
      log.error(`health check: database unreachable: ${error.message}`);
      res.status(503).json({ status: 'error', db: 'down' });
    }
  });

  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: config.production ? '1h' : 0 }));

  const api = express.Router();
  api.use(express.json({ limit: '20kb' }));
  api.use(sameOriginWrites);
  api.use(attachUser({ auth: services.auth, config }));
  api.use('/auth', authRoutes({ auth: services.auth, config, google, limiter: limits.login, registerLimiter: limits.register, mailer, log }));
  api.use('/groups', groupRoutes({ ...services, chatLimiter: limits.chat }));
  api.use('/sessions', sessionRoutes(services));
  api.use('/messages', messageRoutes(services));
  api.use('/agenda', agendaRoutes({ ...services, agendaLimiter: limits.agenda }));
  api.use('/me', meRoutes(services));
  api.use(apiNotFound);
  app.use('/api', api);

  app.use((req, res) => {
    res.status(404).sendFile('404.html', { root: PUBLIC_DIR });
  });
  app.use(errorHandler(log));
  return app;
}
