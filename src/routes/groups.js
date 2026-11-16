import express from 'express';
import { asyncRoute, requireUser } from '../http/middleware.js';

export function groupRoutes({ groups, studySessions, chat }) {
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

  router.get('/:id/messages', asyncRoute(async (req, res) => {
    res.json({ messages: await chat.listMessages(req.user.id, req.params.id, { after: req.query.after }) });
  }));

  router.post('/:id/messages', asyncRoute(async (req, res) => {
    res.status(201).json({ message: await chat.postMessage(req.user.id, req.params.id, req.body ?? {}) });
  }));

  return router;
}

export function messageRoutes({ chat }) {
  const router = express.Router();
  router.use(requireUser);

  router.delete('/:id', asyncRoute(async (req, res) => {
    await chat.deleteMessage(req.user.id, req.params.id);
    res.status(204).end();
  }));

  router.post('/:id/reactions', asyncRoute(async (req, res) => {
    res.json({ message: await chat.toggleReaction(req.user.id, req.params.id, req.body?.emoji) });
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

  router.put('/:id/rsvp', asyncRoute(async (req, res) => {
    res.json({ session: await studySessions.setRsvp(req.user.id, req.params.id, req.body?.status ?? '') });
  }));

  router.delete('/:id/rsvp', asyncRoute(async (req, res) => {
    res.json({ session: await studySessions.setRsvp(req.user.id, req.params.id, null) });
  }));

  return router;
}
