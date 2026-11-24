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
