import { createBot } from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
import { Movements } from 'mineflayer-pathfinder';
import cfg from './config.js';
import { log } from './logger.js';
import { ReconnectManager } from './reconnect.js';
import { AntiIdle } from './antiIdle.js';
import { setupChat } from './chat.js';

export class BotManager {
  constructor() {
    this.bot = null;
    this.antiIdle = null;
    this.reconnector = new ReconnectManager();
    this.reconnector.onReconnect = () => this.connect();
    this.startTime = null;
    this._followTarget = null;
    this._followInterval = null;
    this._watchdog = null;
    this._memoryLog = null;
  }

  get uptime() {
    return this.startTime ? Date.now() - this.startTime : 0;
  }

  connect() {
    if (this.bot) {
      this.bot.removeAllListeners();
      this.stopMovement();
      this.clearIntervals();
      try { this.bot.end(); } catch {}
      this.bot = null;
    }

    const options = {
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      version: cfg.version,
      auth: cfg.auth,
      viewDistance: 'far',
      hideErrors: true,
      logErrors: false,
      checkTimeoutInterval: 60000,
    };

    if (cfg.auth === 'microsoft') {
      options.auth = 'microsoft';
    } else if (cfg.password) {
      options.password = cfg.password;
    }

    log('info', `Connecting to ${cfg.host}:${cfg.port} as ${cfg.username} [${cfg.auth}]`);

    this.bot = createBot(options);

    this.bot.loadPlugin(pathfinder);

    this.bot.on('login', () => {
      this.startTime = Date.now();
      this.reconnector.reset();
      log('success', `Logged in as ${this.bot.username} | Server: ${this.bot.game.serverBrand || this.bot.game.server || 'unknown'}`);
      this.startWatchdog();
      sendWebhook(`Bot **${this.bot.username}** connected to **${cfg.host}**`);
    });

    this.bot.on('spawn', () => {
      log('success', `Spawned at ${Math.round(this.bot.entity.position.x)}, ${Math.round(this.bot.entity.position.y)}, ${Math.round(this.bot.entity.position.z)}`);
      this.antiIdle = new AntiIdle(this.bot);
      this.antiIdle.start();
      setupChat(this.bot);
    });

    this.bot.on('health', () => {
      if (this.bot.food < 18 || this.bot.health < 20) {
        this.autoEat();
      }
      if (this.bot.health <= 0) {
        log('warn', 'Bot died, auto-respawning...');
      }
    });

    this.bot.on('death', () => {
      log('warn', 'Bot died');
      if (this.antiIdle) this.antiIdle.stop();
    });

    this.bot.on('respawn', () => {
      log('success', 'Respawned');
      if (this.antiIdle) this.antiIdle.start();
    });

    this.bot.on('playerJoined', (player) => {
      log('chat', `${player.username} joined the game`);
    });

    this.bot.on('playerLeft', (player) => {
      log('chat', `${player.username} left the game`);
    });

    this.bot.on('kicked', (reason) => {
      const clean = typeof reason === 'string' ? reason : JSON.stringify(reason);
      log('error', `Kicked: ${clean}`);
      sendWebhook(`Bot **${cfg.username}** was kicked from **${cfg.host}**: ${clean}`);
      this.clearIntervals();
      this.scheduleReconnect();
    });

    this.bot.on('error', (err) => {
      log('error', `Bot error: ${err.message}`);
    });

    this.bot.on('end', (reason) => {
      log('warn', `Disconnected: ${reason || 'connection ended'}`);
      if (this.antiIdle) this.antiIdle.stop();
      this.clearIntervals();
      if (this.startTime) {
        sendWebhook(`Bot **${cfg.username}** disconnected from **${cfg.host}** after ${formatDuration(Date.now() - this.startTime)}`);
      }
      this.scheduleReconnect();
    });
  }

  startWatchdog() {
    this.clearIntervals();

    this._watchdog = setInterval(() => {
      if (this.bot?.entity) {
        this.bot.player.ping;
      }
    }, 30000);

    this._memoryLog = setInterval(() => {
      const usage = process.memoryUsage();
      const rss = (usage.rss / 1024 / 1024).toFixed(1);
      const heap = (usage.heapUsed / 1024 / 1024).toFixed(1);
      log('system', `Memory: ${rss}MB RSS, ${heap}MB heap | Uptime: ${formatDuration(this.uptime)}`);

      if (usage.heapUsed > 200 * 1024 * 1024) {
        global.gc?.();
      }
    }, 600000);
  }

  clearIntervals() {
    if (this._watchdog) { clearInterval(this._watchdog); this._watchdog = null; }
    if (this._memoryLog) { clearInterval(this._memoryLog); this._memoryLog = null; }
  }

  scheduleReconnect() {
    if (this._manualDisconnect) {
      this._manualDisconnect = false;
      return;
    }
    this.reconnector.schedule();
  }

  disconnect() {
    this._manualDisconnect = true;
    this.reconnector.cancel();
    if (this.antiIdle) this.antiIdle.stop();
    this.stopMovement();
    this.clearIntervals();
    if (this.bot) {
      try { this.bot.end(); } catch {}
      this.bot = null;
    }
    log('system', 'Bot disconnected');
  }

  reconnect() {
    this.reconnector.cancel();
    this.connect();
  }

  startFollow(player) {
    this._followTarget = player;
    this.stopMovement();

    this._followInterval = setInterval(() => {
      if (!this.bot?.entity || !this._followTarget?.entity) return;
      try {
        const pos = this._followTarget.entity.position;
        this.bot.pathfinder.setMovements(new Movements(this.bot));
        this.bot.pathfinder.goto(pos);
      } catch {}
    }, 3000);
  }

  stopMovement() {
    this._followTarget = null;
    if (this._followInterval) {
      clearInterval(this._followInterval);
      this._followInterval = null;
    }
    if (this.bot?.pathfinder) {
      this.bot.pathfinder.stop();
    }
    if (this.bot?.entity) {
      ['forward', 'back', 'left', 'right', 'sneak', 'jump'].forEach(c => this.bot.setControlState(c, false));
    }
  }

  async autoEat() {
    if (!this.bot?.inventory) return;
    try {
      const food = this.bot.inventory.items().find(i => i.foodPoints > 0);
      if (food) {
        await this.bot.equip(food, 'hand');
        await this.bot.consume();
        log('action', 'Auto-ate food');
      }
    } catch {}
  }
}

function sendWebhook(message) {
  const url = cfg.discordWebhook;
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  }).catch(() => {});
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ${m % 60}m`;
}
