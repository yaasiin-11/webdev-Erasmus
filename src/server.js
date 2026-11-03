import express from 'express';
import path from 'node:path';
import { authenticateUser } from './services/userService.js';
import { getAllStudyGroups, joinGroup, leaveGroup, deleteGroup } from './services/groupService.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// API: Login route
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = authenticateUser(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    // Simple session simulation via JSON response / header
    res.json({ message: 'Login successful', user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// API: Get study groups route
app.get('/api/groups', (req, res) => {
  try {
    const groups = getAllStudyGroups();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Join group route
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

// API: Leave group route
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

// API: Delete group route (Owner-only action)
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

app.listen(PORT, () => {
  console.log(`StudyHub server running at http://localhost:${PORT}`);
});
