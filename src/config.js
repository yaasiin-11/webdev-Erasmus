export class ConfigError extends Error {}

const REQUIRED = ['DATABASE_URL', 'SESSION_SECRET'];

function publicBaseUrl(env, port) {
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/$/, '');
  if (env.CODESPACE_NAME && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return `https://${env.CODESPACE_NAME}-${port}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
  }
  return `http://localhost:${port}`;
}

export function loadConfig(env = process.env) {
  for (const name of REQUIRED) {
    if (!env[name] || !env[name].trim()) {
      throw new ConfigError(`missing ${name}: see .env.example`);
    }
  }
  const production = env.NODE_ENV === 'production';
  if (env.SESSION_SECRET.length < 16) {
    throw new ConfigError('SESSION_SECRET is too short: generate one with openssl rand -hex 32');
  }
  if (production && env.DATABASE_URL === 'memory') {
    throw new ConfigError('DATABASE_URL=memory loses every record on restart: use a Postgres URL in production');
  }

  const port = Number(env.PORT) || 3000;
  const baseUrl = publicBaseUrl(env, port);
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return {
    production,
    port,
    baseUrl,
    databaseUrl: env.DATABASE_URL,
    sessionSecret: env.SESSION_SECRET,
    seedDemo: env.DATABASE_URL === 'memory' || env.SEED_DEMO === 'true',
    google: googleEnabled
      ? {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectUri: `${baseUrl}/api/auth/google/callback`,
        }
      : null,
    mail: env.BREVO_API_KEY && env.MAIL_FROM
      ? { apiKey: env.BREVO_API_KEY, from: env.MAIL_FROM, fromName: env.MAIL_FROM_NAME || 'StudyHub' }
      : null,
    model: env.GEMINI_API_KEY
      ? { apiKey: env.GEMINI_API_KEY, name: env.MODEL_NAME || 'gemini-2.5-flash-lite' }
      : null,
  };
}
