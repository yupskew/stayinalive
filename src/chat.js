import { log, chat as chatLog } from './logger.js';
import { askGemini } from './ai.js';
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
      const followTarget = bot.players[target];
      if (followTarget?.entity) {
        bot.chat(`Following ${target}`);
        emitCommand('follow', followTarget.entity);
      } else {
        bot.chat(`Can't see ${target} right now`);
      }
      break;

    case 'kill':
      if (!target) {
        bot.chat(`Kill what? Give me a name`);
        return;
      }
      const killTarget = bot.players[target];
      if (killTarget?.entity) {
        bot.chat(`Going after ${target}!`);
        emitCommand('kill', killTarget.entity);
      } else {
        bot.chat(`Can't find ${target}`);
      }
      break;

    case 'come':
      const sender = bot.players[username];
      if (sender?.entity) {
        bot.chat(`Coming to you!`);
        emitCommand('follow', sender.entity);
      }
      break;

    case 'stop':
      bot.chat(`Alright, stopping`);
      emitCommand('stop');
      break;

    case 'stay':
      bot.chat(`Okay I'll stay here`);
      emitCommand('stop');
      break;

    case 'mobs':
      bot.chat(`Time to clear some mobs!`);
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
  if (!cfg.geminiKey) return;

  const reply = await askGemini(username, message);
  if (reply) {
    setTimeout(() => {
      bot.chat(reply);
    }, randomBetween(1500, 5000));
  }
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}
