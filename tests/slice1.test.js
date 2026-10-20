import test from 'node:test';
import assert from 'node:assert';
import { authenticateUser } from '../src/services/userService.js';
import { getAllStudyGroups } from '../src/services/groupService.js';

test('AC-2 & AC-10 authenticated user login with valid credentials', () => {
  const user = authenticateUser('student@example.com', 'password123');
  assert.notStrictEqual(user, null);
  assert.strictEqual(user.name, 'Jane Doe');
});

test('AC-3 empty login submission handled', () => {
  assert.throws(() => {
    authenticateUser('', '');
  }, /Email and password are required/);
});

test('AC-11 study groups list contains subject title, meeting topic, and member count', () => {
  const groups = getAllStudyGroups();
  assert.ok(groups.length > 0);
  const group = groups[0];
  assert.ok(group.title);
  assert.ok(group.meeting_topic);
  assert.notStrictEqual(group.member_count, undefined);
});
