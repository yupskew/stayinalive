import { log, chat as chatLog } from './logger.js';
import { askGroq } from './ai.js';
import cfg from './config.js';

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

    if (lower.includes(bot.username.toLowerCase())) {
      handleAIReply(bot, username, message);
      return;
    }
  });
}

function handleCommand(bot, username, args) {
  const parts = args.split(/\s+/);
  const cmd = parts[0];
  const target = parts.slice(1).join(' ');

  switch (cmd) {
    case 'follow':
      if (!target) {
        bot.chat(`Who should I follow?`);
        return;
      }
      emitCommand('follow', { name: target, sender: username });
      break;

    case 'kill':
      if (!target) {
        bot.chat(`Kill what? Give me a name`);
        return;
      }
      emitCommand('kill', { name: target, sender: username });
      break;

    case 'come':
    case 'comehere':
      emitCommand('come', { name: target || username, sender: username });
      break;

    case 'stop':
    case 'stay':
      bot.chat(`Alright`);
      emitCommand('stop');
      break;

    case 'mobs':
      bot.chat(`Clearing mobs!`);
      emitCommand('mobs');
      break;

    default:
      handleAIReply(bot, username, args);
  }
}

function emitCommand(type, data) {
  process.emit('botCmd', { type, data });
}

async function handleAIReply(bot, username, message) {
  if (!cfg.groqKey) return;

  const reply = await askGroq(username, message);
  if (reply) {
    setTimeout(() => {
      bot.chat(reply);
    }, randomBetween(1500, 5000));
  }
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}
