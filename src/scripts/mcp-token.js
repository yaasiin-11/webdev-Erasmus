// Creates or revokes the MCP token of one StudyHub user, from the terminal.
//   npm run mcp:token -- ana@example.com            prints a new token (the old one stops working)
//   npm run mcp:token -- ana@example.com --revoke   the user's token stops working
// It needs the same DATABASE_URL as the app. The token is printed once and stored only as a hash.
import { createContainer } from '../container.js';

const [email, flag] = process.argv.slice(2);
if (!process.env.DATABASE_URL || !email) {
  console.error('usage: npm run mcp:token -- <email> [--revoke]   (needs DATABASE_URL: see .env.example)');
  process.exit(1);
}
const { pool, repos, services } = await createContainer({ databaseUrl: process.env.DATABASE_URL, log: () => {} });
try {
  const user = await repos.users.findByEmail(email.trim().toLowerCase());
  if (!user) {
    console.error(`no StudyHub account with the email ${email}`);
    process.exitCode = 1;
  } else if (flag === '--revoke') {
    await services.auth.revokeMcpToken(user.id);
    console.log(`the MCP token of ${user.email} is revoked`);
  } else {
    const token = await services.auth.issueMcpToken(user.id);
    console.log(`MCP token for ${user.email} (shown once, any older token stops working):\n${token}`);
    console.log('Put it in the MCP_TOKEN secret of your codespace, never in a file you commit.');
  }
} finally {
  await pool.end();
}
