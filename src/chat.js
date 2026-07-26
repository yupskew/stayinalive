import { log, chat as chatLog } from './logger.js';
import { askGroq } from './ai.js';
import cfg from './config.js';

let lastAiCall = 0;
let aiCooldown = false;

export function setupChat(bot) {
  if (!bot) return;

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    chatLog(username, message);

    const lower = message.toLowerCase().trim();

    if (lower.startsWith('!')) {
      handleCommand(bot, username, lower.slice(1));
      return;
    }

    if (!cfg.groqKey) return;

    const now = Date.now();
    if (aiCooldown || now - lastAiCall < 3000) return;

    const mentioned = lower.includes(bot.username.toLowerCase());
    const prob = mentioned ? 0.9 : 0.15;
    if (Math.random() > prob) return;

    aiCooldown = true;
    lastAiCall = now;

    handleAIReply(bot, username, message);
  });
}

function handleCommand(bot, username, args) {
  const parts = args.split(/\s+/);
  const cmd = parts[0];
  const target = parts.slice(1).join(' ');

  switch (cmd) {
    case 'follow':
      if (!target) { bot.chat('Who?'); return; }
      emitCommand('follow', { name: target });
      break;
    case 'kill':
      if (!target) { bot.chat('Kill who?'); return; }
      emitCommand('kill', { name: target });
      break;
    case 'come':
    case 'comehere':
      emitCommand('come', { name: target || username });
      break;
    case 'stop':
    case 'stay':
      emitCommand('stop');
      break;
    case 'mobs':
      emitCommand('mobs');
      break;
  }
}

function emitCommand(type, data) {
  process.emit('botCmd', { type, data });
}

async function handleAIReply(bot, username, message) {
  const ctx = buildContext(bot);
  const reply = await askGroq(username, message, ctx);
  aiCooldown = false;

  if (!reply) return;

  const action = reply.match(/\[action:(\w+)(?:\s+(.+?))?\]/);
  let chatMsg = reply.replace(/\[action:.*?\]/g, '').trim();

  if (action) {
    const cmd = action[1];
    const arg = action[2]?.trim();

    switch (cmd) {
      case 'follow':
        emitCommand('follow', { name: arg || username });
        if (!chatMsg) chatMsg = `Following ${arg || username}!`;
        break;
      case 'come':
        emitCommand('come', { name: arg || username });
        if (!chatMsg) chatMsg = 'Coming!';
        break;
      case 'stop':
        emitCommand('stop');
        if (!chatMsg) chatMsg = 'Okay';
        break;
      case 'mobs':
        emitCommand('mobs');
        if (!chatMsg) chatMsg = 'Time to fight!';
        break;
      case 'jump':
        if (bot.entity) {
          bot.setControlState('jump', true);
          setTimeout(() => bot.setControlState('jump', false), 200);
        }
        break;
      case 'look':
        if (arg) {
          const target = bot.players[arg];
          if (target?.entity) {
            bot.lookAt(target.entity.position.offset(0, 1, 0));
          }
        }
        break;
    }
  }

  if (chatMsg) {
    const delay = 1000 + Math.random() * 3000;
    setTimeout(() => bot.chat(chatMsg), delay);
  }
}

function buildContext(bot) {
  if (!bot?.entity) return {};
  const e = bot.entity;
  const nearby = Object.values(bot.players)
    .filter(p => p.entity && p.username !== bot.username)
    .map(p => p.username);
  return {
    health: Math.round(bot.health),
    food: Math.round(bot.food),
    pos: `${Math.round(e.position.x)}, ${Math.round(e.position.y)}, ${Math.round(e.position.z)}`,
    nearby: nearby.length ? nearby.join(', ') : 'none',
    allPlayers: Object.keys(bot.players).filter(n => n !== bot.username).join(', ') || 'none',
  };
}
