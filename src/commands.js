import { createInterface } from 'node:readline';
import { log } from './logger.js';

const random = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(random(min, max + 1));
const chance = (pct) => Math.random() < pct;

export function setupCommands(botManager) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
  });

  let cmdCooldown = 0;

  rl.on('line', async (line) => {
    const now = Date.now();
    if (now < cmdCooldown) return;

    const parts = line.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    cmdCooldown = now + random(100, 500);

    try {
      switch (cmd) {
        case 'reconnect':
          log('info', 'Manual reconnect triggered');
          setTimeout(() => botManager.reconnect(), random(500, 1500));
          break;

        case 'disconnect':
          log('info', 'Manual disconnect');
          botManager.disconnect();
          break;

        case 'say':
          if (args.length) {
            const delay = args.join(' ').length * random(30, 80);
            setTimeout(() => {
              botManager.bot?.chat?.(args.join(' '));
            }, delay);
          }
          break;

        case 'jump':
          if (botManager.bot?.entity) {
            setTimeout(() => {
              const duration = randInt(100, 250);
              botManager.bot.setControlState('jump', true);
              setTimeout(() => botManager.bot.setControlState('jump', false), duration);
            }, random(100, 400));
          }
          break;

        case 'follow':
          if (botManager.bot && args[0]) {
            setTimeout(() => {
              const target = botManager.bot.players[args[0]];
              if (target?.entity) {
                botManager.startFollow(target.entity);
                log('action', `Now following ${args[0]}`);
              } else {
                log('warn', `Player "${args[0]}" not found or not in range`);
              }
            }, random(300, 1500));
          }
          break;

        case 'stop':
          if (botManager.bot) {
            botManager.stopMovement();
            log('action', 'Movement stopped');
          }
          break;

        case 'status':
          if (botManager.bot?.entity) {
            const e = botManager.bot.entity;
            const playerCount = Object.keys(botManager.bot.players).length;
            log('info', `Position: ${e.position.x.toFixed(1)}, ${e.position.y.toFixed(1)}, ${e.position.z.toFixed(1)}`);
            log('info', `Health: ${botManager.bot.health?.toFixed(1)} | Food: ${botManager.bot.food} | Players: ${playerCount}`);
            log('info', `Ping: ${botManager.bot.player?.ping ?? '?'}ms | Uptime: ${formatUptime(botManager.uptime)}`);
          } else {
            log('warn', 'Bot is not connected');
          }
          break;

        case 'help':
          log('info', 'Commands: reconnect, disconnect, say <msg>, jump, follow <player>, stop, status, help');
          break;

        case '':
          break;

        default:
          log('warn', `Unknown command: ${cmd}. Type "help" for available commands.`);
      }
    } catch (err) {
      log('error', `Command "${cmd}" failed: ${err.message}`);
    }
  });

  rl.on('close', () => {
    log('system', 'Terminal input closed');
  });

  return rl;
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ${m % 60}m ${s % 60}s`;
}
