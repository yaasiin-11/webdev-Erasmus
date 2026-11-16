import readline from 'node:readline';
import { readFileSync } from 'node:fs';
import { createMcpHandler } from './tools.js';

try {
  process.loadEnvFile();
} catch {
  // no .env file: the variables come from the environment instead
}

const lectures = JSON.parse(readFileSync(new URL('./lectures.json', import.meta.url), 'utf8'));
const log = (line) => console.error(line);

let container = null;
async function getServices() {
  const url = process.env.DATABASE_URL;
  if (!url || url === 'memory') {
    const error = new Error('no shared database');
    error.userMessage = 'The MCP server needs DATABASE_URL to point at the same Postgres database as the StudyHub app.';
    throw error;
  }
  if (!container) {
    const { createContainer } = await import('../src/container.js');
    container = createContainer({ databaseUrl: url }).catch((error) => {
      container = null;
      throw error;
    });
  }
  return (await container).services;
}

const handle = createMcpHandler({ lectures, getServices, token: process.env.MCP_TOKEN, log });

async function answer(line) {
  if (!line.trim()) return;
  log(`got: ${line}`);
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
    return;
  }
  const reply = await handle(message);
  if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
}

let queue = Promise.resolve();
const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (line) => {
  queue = queue.then(() => answer(line)).catch((error) => log(error.stack));
});
lines.on('close', () => {
  queue.then(async () => {
    if (container) await (await container).pool.end();
  }).catch(() => {});
});
