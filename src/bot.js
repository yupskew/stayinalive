import { createBot } from 'mineflayer';
import pkg from 'mineflayer-pathfinder';
const { pathfinder, Movements, goals } = pkg;
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

const random = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(random(min, max + 1));
const chance = (pct) => Math.random() < pct;
const pick = (arr) => arr[randInt(0, arr.length - 1)];

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
    this._playerPositions = {};
    this._msgCooldowns = {};
    this._pendingFollow = null;
    this._lastPing = 0;
    this._combatTiredness = 0;

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
      checkTimeoutInterval: randInt(45000, 90000),
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
      sendWebhook(`Bot **${this.bot.username}** connected to **${cfg.host}**`);
    });

    this.bot.on('spawn', () => {
      log('success', `Spawned at ${Math.round(this.bot.entity.position.x)}, ${Math.round(this.bot.entity.position.y)}, ${Math.round(this.bot.entity.position.z)}`);
      this.antiIdle = new AntiIdle(this.bot);
      this.antiIdle.start();
      setupChat(this.bot);
    });

    this.bot.on('health', () => {
      const threshold = random(12, 19);
      const healthThreshold = random(10, 18);
      if (this.bot.food < threshold || this.bot.health < healthThreshold) {
        this.autoEat();
      }
      if (this.bot.health <= 0) {
        log('warn', 'Bot died');
      }
      if (this.bot.health < 8 && this._killTarget) {
        this.stopCombat();
        this.autoEat();
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
      delete this._playerPositions[player.username];
    });

    this.bot.on('entitySpawn', (entity) => {
      if (entity.type === 'player' && entity.username) {
        const pos = entity.position;
        this._playerPositions[entity.username] = { x: pos.x, y: pos.y, z: pos.z };
        this.checkPendingFollow(entity.username, entity);
      }
    });

    this.bot.on('entityMoved', (entity) => {
      if (entity.type === 'player' && entity.username) {
        this._playerPositions[entity.username] = { x: entity.position.x, y: entity.position.y, z: entity.position.z };
      }
    });

    this.bot.on('entityHurt', (entity) => {
      if (entity === this.bot?.entity) {
        if (this.antiIdle) this.antiIdle.stop();
        const nearbyMob = this.findNearestMob(6);
        if (nearbyMob && chance(0.7)) {
          setTimeout(() => this.startMobKilling(), random(500, 2000));
        }
      }
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
      case 'come': {
        if (this.antiIdle) this.antiIdle.stop();
        const target = this.resolvePlayer(data.name);
        if (target?.entity) {
          setTimeout(() => this.startFollow(target.entity), random(400, 2000));
        } else if (target?.pos) {
          setTimeout(() => this.startFollowPos(target.pos, data.name), random(300, 1500));
        } else if (this.bot?.players[data.name]) {
          this.setPendingFollow(data.name);
        }
        break;
      }
      case 'kill': {
        if (this.antiIdle) this.antiIdle.stop();
        const target = this.resolvePlayer(data.name);
        if (target?.entity) {
          setTimeout(() => this.startAttack(target.entity), random(500, 2500));
        }
        break;
      }
      case 'mobs':
        if (this.antiIdle) this.antiIdle.stop();
        setTimeout(() => this.startMobKilling(), random(800, 3000));
        break;
      case 'stop':
        this.stopCombat();
        this.stopMovement();
        this._pendingFollow = null;
        if (this.antiIdle) this.antiIdle.start();
        break;
    }
  }

  resolvePlayer(name) {
    const player = this.bot?.players[name];
    if (player?.entity) {
      const pos = player.entity.position;
      this._playerPositions[name] = { x: pos.x, y: pos.y, z: pos.z };
      return { entity: player.entity };
    }
    if (this._playerPositions[name]) {
      return { entity: null, pos: this._playerPositions[name] };
    }
    if (player) {
      return {};
    }
    return null;
  }

  setPendingFollow(name) {
    this._pendingFollow = name;
  }

  checkPendingFollow(name, entity) {
    if (this._pendingFollow === name && entity) {
      this._pendingFollow = null;
      setTimeout(() => this.startFollow(entity), random(800, 3000));
    }
  }

  startFollow(entity) {
    this.stopCombat();
    this._followTarget = entity;

    const interval = random(1800, 4000);
    this._followInterval = setInterval(() => {
      if (!this.bot?.entity || !this._followTarget) {
        this.stopMovement();
        return;
      }
      if (chance(0.12)) {
        if (this.antiIdle) this.antiIdle.doAction();
        return;
      }
      const range = random(1.8, 4);
      this.pathfindTo(this._followTarget.position, range);
    }, interval);

    this.pathfindTo(this._followTarget.position, random(1.8, 4));
  }

  startFollowPos(pos, name) {
    this.stopCombat();
    this.pathfindTo(pos, random(1.8, 4));
    if (name) {
      this._pendingFollow = name;
    }
  }

  startAttack(entity) {
    this.stopMovement();
    this._killTarget = entity;
    this._combatTiredness = 0;

    const interval = random(800, 1800);
    this._killInterval = setInterval(() => {
      if (!this.bot?.entity || !this._killTarget || this._combatTiredness > 5) {
        this.stopCombat();
        return;
      }
      this._combatTiredness += chance(0.15) ? 1 : 0;
      this.attackTarget(this._killTarget);
    }, interval);

    setTimeout(() => this.attackTarget(entity), random(300, 1200));
  }

  pathfindTo(pos, range) {
    try {
      const moves = new Movements(this.bot);
      moves.allowParkour = chance(0.6);
      moves.allow1by1towers = chance(0.5);
      if (chance(0.2)) {
        moves.allowParkour = false;
        moves.allow1by1towers = false;
      }
      this.bot.pathfinder.setMovements(moves);
      this.bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, range));
    } catch {}
  }

  async attackTarget(target) {
    if (!this.bot?.entity || !target) return;
    const dist = this.bot.entity.position.distanceTo(target.position);

    if (dist > 6 && this._followTarget) {
      this.pathfindTo(target.position, random(1.5, 3));
      return;
    }

    if (dist > 4) {
      this.pathfindTo(target.position, random(1.5, 3));
    } else {
      this.bot.pathfinder.stop();
      await this.equipBestWeapon();
      const swingDelay = random(50, 300);
      await this.sleep(swingDelay);
      this.bot.attack(target);
      if (chance(0.2)) {
        setTimeout(() => {
          if (this.bot?.entity && target && chance(0.6)) {
            this.bot.attack(target);
          }
        }, random(100, 400));
      }
      if (chance(0.08)) {
        this.bot.setControlState('jump', true);
        setTimeout(() => this.bot?.setControlState('jump', false), random(80, 150));
      }
    }
  }

  startMobKilling() {
    this.stopMovement();
    this._combatTiredness = 0;

    const interval = random(1200, 3000);
    this._killInterval = setInterval(() => {
      if (!this.bot?.entity || this._combatTiredness > 8) {
        this.stopCombat();
        if (this.antiIdle) this.antiIdle.start();
        return;
      }
      this._combatTiredness += chance(0.1) ? 1 : 0;
      const range = random(5, 10);
      const mob = this.findNearestMob(range);
      if (mob) {
        this._killTarget = mob;
        this.attackTarget(mob);
      } else {
        this._combatTiredness += 3;
      }
    }, interval);
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
      const weapons = this.bot.inventory.items().filter(i =>
        i.name.includes('sword') || i.name.includes('axe')
      );
      if (weapons.length) {
        const best = weapons.sort((a, b) => (b.attackDamage || 0) - (a.attackDamage || 0))[0];
        await this.sleep(random(100, 400));
        await this.bot.equip(best, 'hand');
      }
    } catch {}
  }

  stopCombat() {
    this._killTarget = null;
    this._combatTiredness = 0;
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
        const now = Date.now();
        if (now - this._lastPing > random(25000, 60000)) {
          this._lastPing = now;
        }
      }
    }, random(15000, 45000));

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
        await this.sleep(random(300, 900));
        await this.bot.consume();
        log('action', 'Auto-ate food');
      }
    } catch {}
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
