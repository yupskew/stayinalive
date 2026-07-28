import pkg from 'mineflayer-pathfinder';
const { Movements, goals } = pkg;
import { log } from './logger.js';

const random = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(random(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const chance = (pct) => Math.random() < pct;

const ACTIONS = [
  { name: 'explore', weight: 35 },
  { name: 'exploreNear', weight: 25 },
  { name: 'climbHigh', weight: 12 },
  { name: 'traverse', weight: 15 },
  { name: 'lookAround', weight: 8 },
  { name: 'checkInventory', weight: 4 },
  { name: 'hotbarCycle', weight: 6 },
  { name: 'headTilt', weight: 8 },
  { name: 'examineGround', weight: 5 },
  { name: 'lookAtSky', weight: 3 },
  { name: 'stretch', weight: 2 },
  { name: 'rest', weight: 18 },
  { name: 'lookAtPlayer', weight: 8 },
  { name: 'microAdjust', weight: 10 },
];

function weightedPick() {
  const total = ACTIONS.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const action of ACTIONS) {
    r -= action.weight;
    if (r <= 0) return action.name;
  }
  return 'explore';
}

export class AntiIdle {
  constructor(bot) {
    this.bot = bot;
    this.timer = null;
    this.running = false;
    this._lastAction = null;
    this._exploring = false;
    this._checkLookInterval = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    log('system', 'Anti-idle started (explorer mode)');
    this.scheduleNext();
  }

  stop() {
    this.running = false;
    this._exploring = false;
    if (this.timer) clearTimeout(this.timer);
    if (this._checkLookInterval) clearInterval(this._checkLookInterval);
    this.stopPathfind();
    this.releaseControls();
  }

  scheduleNext() {
    if (!this.running) return;
    const wait = random(5000, 20000);
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.doAction();
      this.scheduleNext();
    }, wait);
  }

  async doAction() {
    if (!this.bot?.entity) return;
    const action = weightedPick();
    this._lastAction = action;

    try {
      await this[action]();
    } catch (err) {
      log('warn', `Action "${action}" failed: ${err.message}`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stopPathfind() {
    if (this.bot?.pathfinder) {
      try { this.bot.pathfinder.stop(); } catch {}
    }
  }

  releaseControls() {
    if (!this.bot?.entity) return;
    ['forward', 'back', 'left', 'right', 'sneak', 'jump'].forEach(c => {
      try { this.bot.setControlState(c, false); } catch {}
    });
  }

  startLookInterval() {
    this._checkLookInterval = setInterval(() => {
      if (!this.running || !this.bot?.entity || !this._exploring) {
        clearInterval(this._checkLookInterval);
        this._checkLookInterval = null;
        return;
      }
      this.smoothLookAsync(
        this.bot.entity.yaw + random(-1.2, 1.2),
        random(-0.6, 0.5),
        randInt(3, 6)
      );
    }, random(2500, 6000));
  }

  async pathfindToTarget(pos, range) {
    try {
      const moves = new Movements(this.bot);
      moves.allowParkour = true;
      moves.allow1by1towers = true;
      this.bot.pathfinder.setMovements(moves);
      this.bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, range || random(2, 5)));
    } catch {}
  }

  async explore() {
    if (!this.bot?.entity || this._exploring) return;
    this._exploring = true;

    const pos = this.bot.entity.position;
    const angle = random(0, Math.PI * 2);
    const dist = random(40, 120);
    const target = {
      x: pos.x + Math.cos(angle) * dist,
      y: pos.y,
      z: pos.z + Math.sin(angle) * dist,
    };

    log('action', `Exploring to ${Math.round(target.x)}, ${Math.round(target.z)} (${Math.round(dist)} blocks)`);
    this.startLookInterval();
    this.pathfindToTarget(target, random(3, 7));

    const travelTime = Math.max(5000, dist * random(150, 400));
    await this.sleep(travelTime);
    this.releaseControls();
    await this.sleep(random(1000, 3000));

    if (chance(0.5)) {
      this.smoothLookAsync(
        random(-Math.PI, Math.PI),
        random(-0.5, 0.5),
        randInt(4, 8)
      );
    }

    this._exploring = false;
  }

  async exploreNear() {
    if (!this.bot?.entity || this._exploring) return;
    this._exploring = true;

    const pos = this.bot.entity.position;
    const angle = random(0, Math.PI * 2);
    const dist = random(15, 45);
    const target = {
      x: pos.x + Math.cos(angle) * dist,
      y: pos.y,
      z: pos.z + Math.sin(angle) * dist,
    };

    log('action', `Exploring near to ${Math.round(target.x)}, ${Math.round(target.z)}`);
    this.startLookInterval();
    this.pathfindToTarget(target, random(2, 4));

    const travelTime = Math.max(4000, dist * random(120, 350));
    await this.sleep(travelTime);
    this.releaseControls();

    if (chance(0.6)) {
      await this.sleep(random(500, 2000));
      const lookYaw = random(-Math.PI, Math.PI);
      const lookPitch = random(-0.4, 0.4);
      this.smoothLookAsync(lookYaw, lookPitch, randInt(4, 8));
    }

    this._exploring = false;
  }

  async climbHigh() {
    if (!this.bot?.entity || this._exploring) return;
    this._exploring = true;

    const pos = this.bot.entity.position;
    const angle = random(0, Math.PI * 2);
    const dist = random(20, 60);
    const target = {
      x: pos.x + Math.cos(angle) * dist,
      y: pos.y + random(5, 20),
      z: pos.z + Math.sin(angle) * dist,
    };

    log('action', 'Climbing to higher ground');
    try {
      const moves = new Movements(this.bot);
      moves.allowParkour = true;
      moves.allow1by1towers = true;
      moves.scafoldingBlocks = [];
      this.bot.pathfinder.setMovements(moves);
      this.bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, random(3, 6)));
    } catch {}

    const travelTime = Math.max(4000, dist * random(130, 380));
    await this.sleep(travelTime);
    this.releaseControls();

    if (chance(0.6)) {
      this.smoothLookAsync(
        random(-Math.PI, Math.PI),
        random(-0.6, -0.2),
        randInt(5, 10)
      );
    }

    this._exploring = false;
  }

  async traverse() {
    if (!this.bot?.entity || this._exploring) return;
    this._exploring = true;

    const pos = this.bot.entity.position;
    const angle = random(0, Math.PI * 2);
    const dist = random(30, 80);
    const target = {
      x: pos.x + Math.cos(angle) * dist,
      y: pos.y,
      z: pos.z + Math.sin(angle) * dist,
    };

    log('action', 'Traversing terrain');
    try {
      const moves = new Movements(this.bot);
      moves.allowParkour = true;
      moves.allow1by1towers = true;
      moves.allowParkour = true;
      this.bot.pathfinder.setMovements(moves);
      this.bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, random(3, 6)));
    } catch {}

    const steps = randInt(3, 7);
    for (let i = 0; i < steps; i++) {
      if (!this.running || !this._exploring) break;
      this.smoothLookAsync(
        random(-Math.PI, Math.PI),
        random(-0.5, 0.4),
        randInt(3, 6)
      );
      await this.sleep(random(2000, 5000));
    }

    this.releaseControls();
    await this.sleep(random(500, 2000));
    this._exploring = false;
  }

  async rest() {
    if (!this.bot?.entity || this._exploring) return;
    const duration = random(5000, 20000);
    const fidgets = randInt(1, 4);
    for (let i = 0; i < fidgets; i++) {
      if (!this.running || !this.bot?.entity) return;
      await this.sleep(duration / fidgets);
      if (chance(0.5)) {
        this.microAdjust();
      }
    }
  }

  smoothLookAsync(targetYaw, targetPitch, steps) {
    if (!this.bot?.entity) return;
    const startYaw = this.bot.entity.yaw;
    const startPitch = this.bot.entity.pitch;
    let diffYaw = targetYaw - startYaw;
    while (diffYaw > Math.PI) diffYaw -= 2 * Math.PI;
    while (diffYaw < -Math.PI) diffYaw += 2 * Math.PI;
    const diffPitch = targetPitch - startPitch;
    let i = 1;
    const tick = () => {
      if (!this.bot?.entity || !this.running) return;
      const t = i / steps;
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const yaw = startYaw + diffYaw * eased + random(-0.02, 0.02);
      const pitch = startPitch + diffPitch * eased + random(-0.01, 0.01);
      this.bot.look(yaw, clamp(pitch, -Math.PI / 2, Math.PI / 2), false);
      i++;
      if (i <= steps) setTimeout(tick, random(30, 80));
    };
    tick();
  }

  async microAdjust() {
    if (!this.bot?.entity) return;
    const yaw = random(-0.2, 0.2);
    const pitch = random(-0.15, 0.15);
    await this.bot.look(
      this.bot.entity.yaw + yaw,
      clamp(this.bot.entity.pitch + pitch, -Math.PI / 2, Math.PI / 2),
      false
    );
  }

  async lookAround() {
    const yaw = random(-Math.PI, Math.PI);
    const pitch = random(-0.8, 0.8);
    this.smoothLookAsync(yaw, pitch, randInt(4, 10));
    await this.sleep(random(2000, 5000));
    if (chance(0.5)) {
      this.smoothLookAsync(random(-Math.PI, Math.PI), random(-0.3, 0.3), randInt(3, 6));
    }
  }

  async headTilt() {
    if (!this.bot?.entity) return;
    const pitch = random(-0.6, 0.6);
    const yaw = random(-0.3, 0.3);
    this.smoothLookAsync(this.bot.entity.yaw + yaw, pitch, randInt(3, 6));
    await this.sleep(random(2000, 6000));
  }

  async checkInventory() {
    try {
      await this.bot.openContainer(this.bot.inventory);
      await this.sleep(random(500, 2000));
      if (chance(0.4)) {
        const from = randInt(9, 35);
        const to = pick([...Array(36)].map((_, i) => i).filter(i => i !== from));
        this.bot.moveSlotItem(from, to);
        await this.sleep(random(100, 400));
      }
      if (chance(0.25)) {
        const slot = randInt(9, 35);
        this.bot.moveSlotItem(slot, slot);
        await this.sleep(random(100, 300));
      }
      if (chance(0.15)) {
        await this.sleep(random(800, 2000));
      }
      this.bot.closeWindow(this.bot.inventory.window);
    } catch {}
  }

  async hotbarCycle() {
    const current = this.bot.quickBarSlot;
    const target = randInt(0, 8);
    const steps = Math.abs(target - current);
    for (let i = 0; i < steps; i++) {
      if (!this.running) return;
      this.bot.setQuickBarSlot(current + (target > current ? 1 : -1) * (i + 1));
      await this.sleep(random(60, 250));
    }
  }

  async examineGround() {
    if (!this.bot?.entity) return;
    const pitch = random(0.8, 1.4);
    const yaw = random(-0.6, 0.6);
    this.smoothLookAsync(yaw, pitch, randInt(4, 8));
    await this.sleep(random(2000, 5000));
    if (chance(0.3)) {
      this.smoothLookAsync(yaw + random(-0.3, 0.3), pitch + random(-0.1, 0.1), randInt(2, 4));
      await this.sleep(random(1000, 3000));
    }
  }

  async lookAtSky() {
    if (!this.bot?.entity) return;
    const pitch = random(-1.4, -0.8);
    const yaw = random(-0.5, 0.5);
    this.smoothLookAsync(yaw, pitch, randInt(5, 10));
    await this.sleep(random(2000, 6000));
  }

  async stretch() {
    if (!this.bot?.entity) return;
    this.bot.setControlState('jump', true);
    this.bot.swingArm('right');
    await this.sleep(random(80, 150));
    this.bot.setControlState('jump', false);
    await this.sleep(random(100, 300));
    if (chance(0.5)) {
      this.bot.swingArm('left');
      await this.sleep(random(100, 200));
    }
    if (chance(0.3)) {
      await this.sleep(random(200, 600));
      this.bot.setControlState('jump', true);
      await this.sleep(random(60, 120));
      this.bot.setControlState('jump', false);
    }
  }

  async lookAtPlayer() {
    if (!this.bot?.entity) return;
    const players = Object.values(this.bot.players).filter(p => p.entity && p.username !== this.bot.username);
    if (!players.length) return;
    const target = pick(players);
    const pos = target.entity.position;
    const dx = pos.x - this.bot.entity.position.x;
    const dz = pos.z - this.bot.entity.position.z;
    const dy = pos.y - this.bot.entity.position.y;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const yaw = Math.atan2(-dx, -dz);
    const pitch = -Math.atan2(dy, dist);
    this.smoothLookAsync(yaw, clamp(pitch, -Math.PI / 2, Math.PI / 2), randInt(5, 10));
    await this.sleep(random(1500, 4000));
    if (chance(0.35)) {
      this.smoothLookAsync(yaw + random(-0.2, 0.2), pitch + random(-0.1, 0.1), randInt(2, 4));
      await this.sleep(random(1000, 3000));
    }
  }
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
