import crypto from 'node:crypto';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function createGoogleOAuth({ clientId, clientSecret, redirectUri, fetchImpl = fetch, timeoutMs = 8000 }) {
  return {
    redirectUri,

    authorizationUrl({ state, codeChallenge }) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      return `${AUTH_URL}?${params}`;
    },

    async exchange({ code, codeVerifier }) {
      const tokenResponse = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!tokenResponse.ok) throw new Error(`Google token endpoint answered ${tokenResponse.status}`);
      const { access_token: accessToken } = await tokenResponse.json();

      const profileResponse = await fetchImpl(USERINFO_URL, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!profileResponse.ok) throw new Error(`Google userinfo answered ${profileResponse.status}`);
      const profile = await profileResponse.json();
      return {
        sub: profile.sub,
        email: profile.email,
        emailVerified: profile.email_verified === true,
        name: profile.name,
      };
    },
  };
}
