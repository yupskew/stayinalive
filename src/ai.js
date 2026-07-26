import cfg from './config.js';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are a Minecraft player in an online server. Your name is {{username}}.
- Keep responses very short, 1-2 sentences max.
- Act like a casual player, not a bot.
- Use Minecraft slang sometimes.
- Be friendly and chill.
- Never say you're an AI or a bot.`;

export async function askGroq(username, message) {
  const key = cfg.groqKey;
  if (!key) return null;

  try {
    const res = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT.replace('{{username}}', cfg.username) },
          { role: 'user', content: `${username} says: "${message}"` },
        ],
        temperature: 0.8,
        max_tokens: 60,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
