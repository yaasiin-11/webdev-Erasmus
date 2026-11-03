import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import { joinGroup, leaveGroup, getAllStudyGroups, deleteGroup } from '../src/services/groupService.js';
import db from '../src/db.js';

// Setup test app and server for API integration tests
const app = express();
app.use(express.json());

app.post('/api/groups/:id/join', (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const groupId = req.params.id;
    joinGroup(userId, Number(groupId));
    res.json({ message: 'Successfully joined group' });
  } catch (err) {
    const message = err.message;
    if (message === 'Group not found') {
      return res.status(404).json({ error: message });
    }
    if (message === 'User is already a member of this group' || message === 'Group is at maximum capacity') {
      return res.status(400).json({ error: message });
    }
    res.status(400).json({ error: message });
  }
});

app.post('/api/groups/:id/leave', (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const groupId = req.params.id;
    leaveGroup(userId, Number(groupId));
    res.json({ message: 'Successfully left group' });
  } catch (err) {
    const message = err.message;
    if (message === 'Group not found') {
      return res.status(404).json({ error: message });
    }
    if (message === 'User is not a member of this group') {
      return res.status(400).json({ error: message });
    }
    res.status(400).json({ error: message });
  }
});

app.delete('/api/groups/:id', (req, res) => {
  const userId = req.body.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const groupId = req.params.id;
    deleteGroup(userId, Number(groupId));
    res.json({ message: 'Successfully deleted group' });
  } catch (err) {
    const message = err.message;
    if (message === 'Group not found') {
      return res.status(404).json({ error: message });
    }
    if (message.includes('Forbidden')) {
      return res.status(403).json({ error: message });
    }
    res.status(400).json({ error: message });
  }
});

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
  });
});

test('AC-15 duplicate join attempts are rejected', () => {
  // Ensure membership exists first
  try {
    db.prepare('INSERT OR IGNORE INTO group_memberships (user_id, group_id) VALUES (1, 1)').run();
  } catch (e) {}

  assert.throws(() => {
    joinGroup(1, 1);
  }, /already a member/i);
});

test('AC-16 & AC-17 study groups list displays capacity and member count', () => {
  const groups = getAllStudyGroups();
  assert.ok(groups.length > 0);
  assert.notStrictEqual(groups[0].max_capacity, undefined);
  assert.notStrictEqual(groups[0].member_count, undefined);
});

test('AC-12 API join group success', async () => {
  // Use user id 2 and group id 2 (ensure user 2 exists)
  db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, name) VALUES (2, \'user2@example.com\', \'hash\', \'User Two\')').run();
  db.prepare('DELETE FROM group_memberships WHERE user_id = 2 AND group_id = 2').run();

  const response = await fetch(`${baseUrl}/api/groups/2/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 2 })
  });
  const data = await response.json();
  assert.strictEqual(response.status, 200);
  assert.strictEqual(data.message, 'Successfully joined group');
});

test('AC-15 & AC-17 API duplicate join returns 400 failure path', async () => {
  const response = await fetch(`${baseUrl}/api/groups/2/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 2 })
  });
  const data = await response.json();
  assert.strictEqual(response.status, 400);
  assert.ok(data.error);
});

test('AC-20 API unauthenticated join returns 401', async () => {
  const response = await fetch(`${baseUrl}/api/groups/1/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(response.status, 401);
});

test('AC-18 API join non-existent group returns 404', async () => {
  const response = await fetch(`${baseUrl}/api/groups/9999/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 2 })
  });
  assert.strictEqual(response.status, 404);
});

test('AC-14 API leave group success', async () => {
  const response = await fetch(`${baseUrl}/api/groups/2/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 2 })
  });
  const data = await response.json();
  assert.strictEqual(response.status, 200);
  assert.strictEqual(data.message, 'Successfully left group');
});

test('API delete group without session gets 401 before service is called', async () => {
  const response = await fetch(`${baseUrl}/api/groups/1`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(response.status, 401);
});

test('API delete group by non-owner gets 403 raised in service', async () => {
  // Group 1 creator is user 1 (Jane Doe). User 2 tries to delete it.
  const response = await fetch(`${baseUrl}/api/groups/1`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 2 })
  });
  assert.strictEqual(response.status, 403);
});
