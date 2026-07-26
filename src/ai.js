import cfg from './config.js';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are a Minecraft player named {{username}}. You are in an online server with other players.

RULES:
- Keep responses VERY short (1-2 sentences max). Be human, use slang.
- NEVER say you're an AI or a bot.
- Be friendly and chill. Don't be annoying.
- Don't respond to every message. Sometimes ignore people.
- If someone greets you, greet back sometimes.
- If someone asks you to do something, decide if you want to.

ACTIONS:
You can trigger bot actions by including [action:COMMAND] in your response.
Available commands:
- [action:follow NAME] — follow a player
- [action:come] — come to the player who spoke
- [action:stop] — stop moving, stand still
- [action:mobs] — attack nearby hostile mobs
- [action:jump] — jump
- [action:look DIR] — look at a player (e.g. [action:look yepskew])

Examples:
- "Hey what's up" (just chat, no action)
- "Coming!" (just chat)
- "On my way! [action:follow yepskew]" (chat + action)
- "Got it [action:stop]" (chat + action)

Only use actions when someone asks you to do something. Don't spam them.`;

export async function askGroq(username, message, context = {}) {
  const key = cfg.groqKey;
  if (!key) return null;

  const state = [
    `Health: ${context.health ?? '?'}/20`,
    `Food: ${context.food ?? '?'}/20`,
    `Position: ${context.pos ?? '?'}`,
    `Players nearby: ${context.nearby ?? 'none'}`,
    `Players on server: ${context.allPlayers ?? '?'}`,
  ].join('\n');

  const userMsg = `${username} says: "${message}"\n\nYour state:\n${state}`;

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
          { role: 'user', content: userMsg },
        ],
        temperature: 0.9,
        max_tokens: 100,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
