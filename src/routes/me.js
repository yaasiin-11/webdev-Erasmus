import express from 'express';
import { asyncRoute, requireUser } from '../http/middleware.js';
import { limitRequests } from '../http/rateLimit.js';

export function agendaRoutes({ agenda, agendaLimiter }) {
  const router = express.Router();
  router.use(requireUser);

  const agendaLimit = limitRequests(
    agendaLimiter,
    (req) => req.user.id,
    'You asked for 20 agenda suggestions in the last hour. Write this one yourself, or try again later.',
  );

  router.post('/', agendaLimit, asyncRoute(async (req, res) => {
    res.json(await agenda.suggestAgenda(req.body ?? {}));
  }));

  return router;
}

export function meRoutes({ auth }) {
  const router = express.Router();
  router.use(requireUser);

  router.get('/mcp-token', asyncRoute(async (req, res) => {
    res.json({ token: await auth.mcpTokenInfo(req.user.id) });
  }));

  router.post('/mcp-token', asyncRoute(async (req, res) => {
    res.status(201).json({ token: await auth.issueMcpToken(req.user.id) });
  }));

  router.delete('/mcp-token', asyncRoute(async (req, res) => {
    await auth.revokeMcpToken(req.user.id);
    res.status(204).end();
  }));

  return router;
}
