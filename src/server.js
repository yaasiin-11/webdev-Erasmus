import express from 'express';
import path from 'node:path';
import { authenticateUser } from './services/userService.js';
import { getAllStudyGroups } from './services/groupService.js';

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

app.listen(PORT, () => {
  console.log(`StudyHub server running at http://localhost:${PORT}`);
});
