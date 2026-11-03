import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStudyAgenda } from '../src/services/aiAgendaService.js';

test('model feature returns agenda using fake client without network', async () => {
  const fakeClient = {
    async generateContent(prompt) {
      return { text: '# Mock Agenda\n- 0-30m: Introduction' };
    }
  };

  const result = await generateStudyAgenda({
    topic: 'Calculus',
    durationMinutes: 60,
    client: fakeClient
  });

  assert.equal(result.source, 'model');
  assert.match(result.agenda, /Mock Agenda/);
});

test('model feature uses fallback when timeout or error occurs', async () => {
  const hangingClient = {
    async generateContent(prompt, { signal }) {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
  };

  const result = await generateStudyAgenda({
    topic: 'Calculus',
    durationMinutes: 60,
    client: hangingClient,
    timeoutMs: 50
  });

  assert.equal(result.source, 'fallback');
  assert.match(result.agenda, /Study Agenda: Calculus/);
});