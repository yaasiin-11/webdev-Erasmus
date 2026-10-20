import db from '../src/db.js';

const users = db.prepare('SELECT * FROM users').all();
const groups = db.prepare('SELECT * FROM study_groups').all();
const memberships = db.prepare('SELECT * FROM group_memberships').all();

console.log('--- USERS ---');
console.log(users);
console.log('--- STUDY GROUPS ---');
console.log(groups);
console.log('--- MEMBERSHIPS ---');
console.log(memberships);
