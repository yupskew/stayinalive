import { log, chat as chatLog } from './logger.js';
import cfg from './config.js';

const GREETINGS = ['Hello!', 'Hey there!', 'Hi!', 'Hey!', 'Yo!'];

const AFK_RESPONSES = [
  'Still here!',
  'Yeah just hanging out',
  'Not really, just vibing',
  'Nah just chilling',
  'I\'m here',
  'Just a player passing through',
  'Hey what\'s up',
  'Still around yeah',
];

const BOT_RESPONSES = [
  'Nope, just a regular player',
  'Do I look like a bot?',
  'What makes you say that?',
  'Just a guy playing the game',
  'Not a bot, just quiet',
];

const GREET_WORDS = ['hi', 'hello', 'hey', 'sup', 'yo', 'howdy', 'greetings'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function setupChat(bot) {
  if (!bot) return;

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    chatLog(username, message);
    sendDiscord(username, message);

    const lower = message.toLowerCase().trim();

    if (GREET_WORDS.some(w => lower === w || lower.startsWith(w + ' ') || lower.startsWith(w + '!'))) {
      if (Math.random() < 0.5) return;
      setTimeout(() => {
        bot.chat(pick(GREETINGS));
      }, randomBetween(1000, 4000));
      return;
    }

    if (lower.includes('afk') || lower.includes('away')) {
      if (Math.random() < 0.3) return;
      setTimeout(() => {
        bot.chat(pick(AFK_RESPONSES));
      }, randomBetween(3000, 15000));
      return;
    }

    if (lower.includes('bot') || lower.includes('macro') || lower.includes('cheat')) {
      if (Math.random() < 0.4) return;
      setTimeout(() => {
        bot.chat(pick(BOT_RESPONSES));
      }, randomBetween(3000, 12000));
      return;
    }
  });
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function sendDiscord(username, message) {
  const url = cfg.discordWebhook;
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `**${username}**: ${message}` }),
  }).catch(() => {});
}
