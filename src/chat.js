import { log, chat as chatLog } from './logger.js';

const random = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(random(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const chance = (pct) => Math.random() < pct;

const COMMANDS = ['follow', 'kill', 'come', 'comehere', 'stop', 'stay', 'mobs'];
const HELP_MSG = 'commands: !follow <name> !kill <name> !come !stop !mobs';

function silently(cb) {
  setTimeout(cb, random(600, 3000));
}

function lookAtPlayer(bot, username) {
  if (!bot?.entity) return;
  const player = bot.players[username];
  if (!player?.entity) return;
  const pos = player.entity.position;
  const dx = pos.x - bot.entity.position.x;
  const dz = pos.z - bot.entity.position.z;
  const dy = pos.y - bot.entity.position.y;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const yaw = Math.atan2(-dx, -dz);
  const pitch = -Math.atan2(dy, dist);
  const steps = randInt(3, 7);
  smoothLookRaw(bot, yaw, pitch, steps);
}

function smoothLookRaw(bot, targetYaw, targetPitch, steps) {
  if (!bot?.entity) return;
  const startYaw = bot.entity.yaw;
  const startPitch = bot.entity.pitch;
  let diffYaw = targetYaw - startYaw;
  while (diffYaw > Math.PI) diffYaw -= 2 * Math.PI;
  while (diffYaw < -Math.PI) diffYaw += 2 * Math.PI;
  const diffPitch = targetPitch - startPitch;
  let i = 1;
  const tick = () => {
    if (!bot?.entity) return;
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const yaw = startYaw + diffYaw * eased + random(-0.02, 0.02);
    const pitch = startPitch + diffPitch * eased + random(-0.01, 0.01);
    bot.look(yaw, clamp(pitch, -Math.PI / 2, Math.PI / 2), false);
    i++;
    if (i <= steps) setTimeout(tick, random(30, 80));
  };
  tick();
}

function nod(bot) {
  if (!bot?.entity) return;
  const pitch = bot.entity.pitch;
  bot.look(bot.entity.yaw, pitch + random(0.3, 0.6), false);
  setTimeout(() => {
    if (bot?.entity) bot.look(bot.entity.yaw, pitch, false);
  }, random(200, 500));
}

function parseCmd(message) {
  const lower = message.toLowerCase().trim();
  if (!lower.startsWith('!')) return null;
  const parts = lower.slice(1).split(/\s+/);
  return { cmd: parts[0], target: parts.slice(1).join(' ') };
}

function whisper(bot, username, msg) {
  bot.chat(`/tell ${username} ${msg}`);
}

export function setupChat(bot) {
  if (!bot) return;

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    chatLog(username, message);

    const parsed = parseCmd(message);
    if (!parsed) return;
    const { cmd, target } = parsed;

    if (chance(0.03)) return;

    if (COMMANDS.includes(cmd)) {
      silently(() => {
        switch (cmd) {
          case 'follow':
            if (!target) return;
            break;
          case 'kill':
            if (!target) return;
            break;
        }
        emitCommand(cmd === 'comehere' ? 'come' : cmd === 'stay' ? 'stop' : cmd, { name: target || username });
      });
    } else if (cmd === 'help') {
      silently(() => whisper(bot, username, HELP_MSG));
    }
  });

  bot.on('whisper', (username, message) => {
    if (username === bot.username) return;
    chatLog(username, `[whisper] ${message}`);

    const parsed = parseCmd(message);
    if (!parsed) return;
    const { cmd, target } = parsed;

    if (chance(0.02)) return;

    if (COMMANDS.includes(cmd)) {
      silently(() => {
        switch (cmd) {
          case 'follow':
            if (!target) { whisper(bot, username, 'who?'); return; }
            break;
          case 'kill':
            if (!target) { whisper(bot, username, 'kill who?'); return; }
            break;
        }
        whisper(bot, username, pick(['got it', 'aight', 'on it', 'say less', 'kk', 'yeah']));
        lookAtPlayer(bot, username);
        emitCommand(cmd === 'comehere' ? 'come' : cmd === 'stay' ? 'stop' : cmd, { name: target || username });
      });
    } else if (cmd === 'help') {
      silently(() => whisper(bot, username, HELP_MSG));
    }
  });
}

function emitCommand(type, data) {
  process.emit('botCmd', { type, data });
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
