import test from 'node:test';
import assert from 'node:assert';
import { joinGroup } from '../src/services/groupService.js';

test('AC-15 duplicate join attempts are rejected', () => {
  // Jane Doe (user ID 1) is already seeded as a member of Group 1
  assert.throws(() => {
    joinGroup(1, 1);
  }, /already a member/i);
});
