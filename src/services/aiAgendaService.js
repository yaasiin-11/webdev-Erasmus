export async function generateStudyAgenda({ topic, durationMinutes = 60, client = null, timeoutMs = 5000 }) {
  const fallbackAgenda = `# Study Agenda: ${topic || 'General Session'}\n- 00-15m: Review core concepts\n- 15-45m: Problem solving & practice\n- 45-${durationMinutes}m: Q&A and summary`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !client) {
    return { agenda: fallbackAgenda, source: 'fallback' };
  }

  const prompt = `Create a structured study agenda for topic "${topic}" lasting ${durationMinutes} minutes with recommended sub-topics.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (client && typeof client.generateContent === 'function') {
      const response = await client.generateContent(prompt, { signal: controller.signal });
      clearTimeout(timer);
      return { agenda: response.text || fallbackAgenda, source: 'model' };
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: controller.signal
    });

    clearTimeout(timer);
    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return { agenda: text || fallbackAgenda, source: 'model' };
  } catch (err) {
    clearTimeout(timer);
    return { agenda: fallbackAgenda, source: 'fallback', error: err.message };
  }
}