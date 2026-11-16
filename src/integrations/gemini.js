const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export function createGeminiClient({ apiKey, model, timeoutMs = 8000, fetchImpl = fetch }) {
  return {
    name: model,

    async generate(prompt) {
      const response = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 800 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Gemini answered with status ${response.status}`);
      }
      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((part) => part.text ?? '').join('');
      if (!text) throw new Error('Gemini returned an empty answer');
      return text;
    },
  };
}
