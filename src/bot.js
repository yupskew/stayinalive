import { createBot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import cfg from './config.js';
import { log } from './logger.js';
import { ReconnectManager } from './reconnect.js';
import { AntiIdle } from './antiIdle.js';
import { setupChat } from './chat.js';

const HOSTILE_MOBS = [
  'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch',
  'blaze', 'ghast', 'hoglin', 'piglin_brute', 'phantom', 'drowned',
  'husk', 'stray', 'cave_spider', 'silverfish', 'endermite', 'shulker',
  'evoker', 'vindicator', 'pillager', 'ravager', 'vex', 'warden',
];

export class BotManager {
  constructor() {
    this.bot = null;
    this.antiIdle = null;
    this.reconnector = new ReconnectManager();
    this.reconnector.onReconnect = () => this.connect();
    this.startTime = null;
    this._followTarget = null;
    this._followInterval = null;
    this._killTarget = null;
    this._killInterval = null;
    this._watchdog = null;
    this._memoryLog = null;

    process.on('botCmd', ({ type, data }) => this.handleCmd(type, data));
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
        log('warn', 'Bot died');
      }
    });

    this.bot.on('death', () => {
      log('warn', 'Bot died');
      this.stopCombat();
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
      this.stopCombat();
      this.clearIntervals();
      this.scheduleReconnect();
    });

    this.bot.on('error', (err) => {
      log('error', `Bot error: ${err.message}`);
    });

    this.bot.on('end', (reason) => {
      log('warn', `Disconnected: ${reason || 'connection ended'}`);
      this.stopCombat();
      if (this.antiIdle) this.antiIdle.stop();
      this.clearIntervals();
      if (this.startTime) {
        sendWebhook(`Bot **${cfg.username}** disconnected from **${cfg.host}** after ${formatDuration(Date.now() - this.startTime)}`);
      }
      this.scheduleReconnect();
    });
  }

  handleCmd(type, data) {
    switch (type) {
      case 'follow':
        if (this.antiIdle) this.antiIdle.stop();
        this.startFollow(data);
        break;
      case 'kill':
        if (this.antiIdle) this.antiIdle.stop();
        this.startAttack(data);
        break;
      case 'mobs':
        if (this.antiIdle) this.antiIdle.stop();
        this.startMobKilling();
        break;
      case 'stop':
        this.stopCombat();
        this.stopMovement();
        if (this.antiIdle) this.antiIdle.start();
        break;
    }
  }

  startFollow(entity) {
    this.stopCombat();
    this._followTarget = entity;

    const move = new Movements(this.bot);
    this.bot.pathfinder.setMovements(move);

    this._followInterval = setInterval(() => {
      if (!this.bot?.entity || !this._followTarget) {
        this.stopMovement();
        return;
      }
      try {
        const pos = this._followTarget.position;
        this.bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 2));
      } catch {}
    }, 2000);
  }

  startAttack(entity) {
    this.stopMovement();
    this._killTarget = entity;
    this._lastAttack = 0;

    this._killInterval = setInterval(() => {
      if (!this.bot?.entity || !this._killTarget) {
        this.stopCombat();
        return;
      }
      try {
        this.attackTarget(this._killTarget);
      } catch {}
    }, 1000);
  }

  async attackTarget(target) {
    const dist = this.bot.entity.position.distanceTo(target.position);
    if (dist > 4) {
      const pos = target.position;
      this.bot.pathfinder.setMovements(new Movements(this.bot));
      this.bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 2));
    } else {
      this.bot.pathfinder.stop();
      await this.equipBestWeapon();
      this.bot.attack(target);
    }
  }

  startMobKilling() {
    this.stopMovement();

    this._killInterval = setInterval(() => {
      if (!this.bot?.entity) return;
      const mob = this.findNearestMob(8);
      if (mob) {
        this._killTarget = mob;
        this.attackTarget(mob);
      }
    }, 1500);
  }

  findNearestMob(range) {
    if (!this.bot?.entity) return null;
    return this.bot.nearestEntity(e =>
      e.type === 'mob' && HOSTILE_MOBS.includes(e.name) &&
      this.bot.entity.position.distanceTo(e.position) <= range
    );
  }

  async equipBestWeapon() {
    if (!this.bot?.inventory) return;
    try {
      const swords = this.bot.inventory.items().filter(i =>
        i.name.includes('sword') || i.name.includes('axe')
      );
      if (swords.length) {
        const best = swords.sort((a, b) => (b.attackDamage || 0) - (a.attackDamage || 0))[0];
        await this.bot.equip(best, 'hand');
      }
    } catch {}
  }

  stopCombat() {
    this._killTarget = null;
    if (this._killInterval) {
      clearInterval(this._killInterval);
      this._killInterval = null;
    }
    this.stopMovement();
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
    this.stopCombat();
    if (this.antiIdle) this.antiIdle.stop();
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
