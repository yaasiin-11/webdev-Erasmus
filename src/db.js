import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dbDir = path.resolve('data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'studyhub.db');
const db = new DatabaseSync(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS study_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    study_field TEXT NOT NULL,
    meeting_topic TEXT NOT NULL,
    max_capacity INTEGER DEFAULT 5,
    creator_id INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS group_memberships (
    user_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, group_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (group_id) REFERENCES study_groups(id)
  );
`);

// Seed initial data if missing (idempotent)
const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get('student@example.com');
let userId = existingUser ? existingUser.id : null;

if (!userId) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync('password123', salt, 64).toString('hex');
  const passwordHash = `${salt}:${hash}`;

  const insertUser = db.prepare('INSERT OR IGNORE INTO users (email, password_hash, name) VALUES (?, ?, ?)');
  const res = insertUser.run('student@example.com', passwordHash, 'Jane Doe');
  userId = res.lastInsertRowid || db.prepare('SELECT id FROM users WHERE email = ?').get('student@example.com')?.id;
}

const existingGroup = db.prepare('SELECT id FROM study_groups LIMIT 1').get();
if (!existingGroup && userId) {
  const insertGroup = db.prepare('INSERT INTO study_groups (title, description, study_field, meeting_topic) VALUES (?, ?, ?, ?)');
  const group1Id = insertGroup.run('Advanced Mathematics Study Circle', 'Preparing for university calculus finals.', 'Mathematics', 'Multivariable Calculus').lastInsertRowid;
  insertGroup.run('Civil Service Exam Prep', 'Group revision for administrative services exam.', 'Civil Service', 'Public Administration');

  const insertMembership = db.prepare('INSERT OR IGNORE INTO group_memberships (user_id, group_id) VALUES (?, ?)');
  insertMembership.run(userId, group1Id);
}

export default db;
