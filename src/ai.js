import cfg from './config.js';

const MODEL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are a Minecraft player in an online server. Your name is {{username}}.
- Keep responses short, 1-2 sentences max.
- Act like a casual player, not a bot.
- Use Minecraft slang sometimes.
- Be friendly and chill.
- Never say you're an AI or a bot.
- If asked to do something you can't, politely decline.`;

export async function askGemini(username, message) {
  const key = cfg.geminiKey;
  if (!key) return null;

  const prompt = SYSTEM_PROMPT.replace('{{username}}', cfg.username);
  const fullPrompt = `${prompt}\n\n${username} says: "${message}"\n\nYour response:`;

  try {
    const res = await fetch(`${MODEL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 60,
          topP: 0.9,
        },
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text?.trim() || null;
  } catch {
    return null;
  }
}
