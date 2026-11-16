import express from 'express';
import { asyncRoute, requireUser } from '../http/middleware.js';

export function agendaRoutes({ agenda }) {
  const router = express.Router();
  router.use(requireUser);

  router.post('/', asyncRoute(async (req, res) => {
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
