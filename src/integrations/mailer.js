const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

export function createBrevoMailer({ apiKey, from, fromName = 'StudyHub', fetchImpl = fetch, timeoutMs = 8000 }) {
  return {
    enabled: true,
    async send({ to, toName, subject, text, html }) {
      const response = await fetchImpl(BREVO_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          sender: { email: from, name: fromName },
          to: [{ email: to, name: toName }],
          subject,
          textContent: text,
          htmlContent: html,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`Brevo answered with status ${response.status}`);
    },
  };
}

export function createConsoleMailer(log, { showContent }) {
  return {
    enabled: false,
    async send({ to, subject, text }) {
      if (showContent) {
        log(`email to ${to} (no mail provider configured, so it is printed here)\nSubject: ${subject}\n${text}`);
      } else {
        log(`an email "${subject}" was not sent: set BREVO_API_KEY and MAIL_FROM`);
      }
    },
  };
}
