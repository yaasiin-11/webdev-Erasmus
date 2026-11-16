import express from 'express';
import { asyncRoute, requireUser } from '../http/middleware.js';

export function groupRoutes({ groups, studySessions }) {
  const router = express.Router();
  router.use(requireUser);

  router.get('/', asyncRoute(async (req, res) => {
    const { category, q, mine } = req.query;
    res.json({ groups: await groups.listGroups(req.user.id, { category, search: q, mine }) });
  }));

  router.post('/', asyncRoute(async (req, res) => {
    res.status(201).json({ group: await groups.createGroup(req.user.id, req.body ?? {}) });
  }));

  router.get('/:id', asyncRoute(async (req, res) => {
    res.json({ group: await groups.getGroup(req.user.id, req.params.id) });
  }));

  router.delete('/:id', asyncRoute(async (req, res) => {
    await groups.deleteGroup(req.user.id, req.params.id);
    res.status(204).end();
  }));

  router.post('/:id/membership', asyncRoute(async (req, res) => {
    res.status(201).json({ group: await groups.joinGroup(req.user.id, req.params.id) });
  }));

  router.delete('/:id/membership', asyncRoute(async (req, res) => {
    res.json({ group: await groups.leaveGroup(req.user.id, req.params.id) });
  }));

  router.post('/:id/sessions', asyncRoute(async (req, res) => {
    res.status(201).json({ session: await studySessions.scheduleSession(req.user.id, req.params.id, req.body ?? {}) });
  }));

  return router;
}

export function sessionRoutes({ studySessions }) {
  const router = express.Router();
  router.use(requireUser);

  router.get('/upcoming', asyncRoute(async (req, res) => {
    res.json({ sessions: await studySessions.upcomingForUser(req.user.id) });
  }));

  router.patch('/:id', asyncRoute(async (req, res) => {
    res.json({ session: await studySessions.rescheduleSession(req.user.id, req.params.id, req.body ?? {}) });
  }));

  router.delete('/:id', asyncRoute(async (req, res) => {
    await studySessions.cancelSession(req.user.id, req.params.id);
    res.status(204).end();
  }));

  return router;
}
