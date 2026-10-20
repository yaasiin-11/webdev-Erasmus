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

// Seed initial data if empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount === 0) {
  // Hash password "password123" with a simple pbkdf2 or scrypt or plain hash for demo seeding
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync('password123', salt, 64).toString('hex');
  const passwordHash = `${salt}:${hash}`;

  const insertUser = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)');
  const userId = insertUser.run('student@example.com', passwordHash, 'Jane Doe').lastInsertRowid;

  const insertGroup = db.prepare('INSERT INTO study_groups (title, description, study_field, meeting_topic) VALUES (?, ?, ?, ?)');
  const group1Id = insertGroup.run('Advanced Mathematics Study Circle', 'Preparing for university calculus finals.', 'Mathematics', 'Multivariable Calculus').lastInsertRowid;
  const group2Id = insertGroup.run('Civil Service Exam Prep', 'Group revision for administrative services exam.', 'Civil Service', 'Public Administration').lastInsertRowid;

  const insertMembership = db.prepare('INSERT INTO group_memberships (user_id, group_id) VALUES (?, ?)');
  insertMembership.run(userId, group1Id);
}

export default db;
