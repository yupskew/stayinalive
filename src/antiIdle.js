import { log } from './logger.js';

const ACTIONS = [
  'lookAround',
  'jump',
  'sneak',
  'walkForward',
  'walkBackward',
  'strafe',
  'rotate',
  'inventory',
  'hotbarSwitch',
  'punchAir',
  'lookUpDown',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

export class AntiIdle {
  constructor(bot) {
    this.bot = bot;
    this.timer = null;
    this.running = false;
    this.idleTimer = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    log('system', 'Anti-idle started');
    this.scheduleNext();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }

  scheduleNext() {
    if (!this.running) return;

    const wait = randomBetween(20000, 120000);
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.doAction();
      this.scheduleNext();
    }, wait);
  }

  async doAction() {
    if (!this.bot?.entity) return;

    const action = pick(ACTIONS);
    log('action', `Anti-idle: ${action}`);
    try {
      await this[action]();
    } catch (err) {
      log('warn', `Anti-idle action "${action}" failed: ${err.message}`);
    }
  }

  async lookAround() {
    const yaw = randomBetween(-Math.PI, Math.PI);
    const pitch = randomBetween(-Math.PI / 3, Math.PI / 3);
    await this.bot.look(yaw, pitch, false);
    await this.sleep(randomBetween(500, 3000));
    await this.bot.look(0, 0, false);
  }

  async jump() {
    const times = Math.floor(randomBetween(1, 4));
    for (let i = 0; i < times; i++) {
      this.bot.setControlState('jump', true);
      await this.sleep(100);
      this.bot.setControlState('jump', false);
      await this.sleep(randomBetween(200, 800));
    }
  }

  async sneak() {
    const duration = randomBetween(1500, 5000);
    this.bot.setControlState('sneak', true);
    await this.sleep(duration);
    this.bot.setControlState('sneak', false);
  }

  async walkForward() {
    const duration = randomBetween(500, 2500);
    this.bot.setControlState('forward', true);
    await this.sleep(duration);
    this.bot.setControlState('forward', false);

    if (Math.random() > 0.5) {
      const yaw = randomBetween(-Math.PI / 4, Math.PI / 4);
      await this.bot.look(yaw, 0, false);
    }
  }

  async walkBackward() {
    const duration = randomBetween(300, 1500);
    this.bot.setControlState('back', true);
    await this.sleep(duration);
    this.bot.setControlState('back', false);
  }

  async strafe() {
    const side = Math.random() > 0.5 ? 'left' : 'right';
    const duration = randomBetween(500, 2000);
    this.bot.setControlState(side, true);
    await this.sleep(duration);
    this.bot.setControlState(side, false);
  }

  async rotate() {
    const fullRotations = Math.floor(randomBetween(1, 3));
    const direction = Math.random() > 0.5 ? 1 : -1;
    for (let i = 0; i < fullRotations; i++) {
      const yaw = direction * randomBetween(Math.PI / 2, Math.PI);
      const pitch = randomBetween(-0.5, 0.5);
      await this.bot.look(yaw, pitch, false);
      await this.sleep(randomBetween(200, 600));
    }
  }

  async inventory() {
    if (!this.bot.inventory) return;
    try {
      await this.bot.openContainer(this.bot.inventory);
      await this.sleep(randomBetween(800, 2500));
      this.bot.closeWindow(this.bot.inventory.window);
    } catch {
      // quietly fail if inventory is not available
    }
  }

  async hotbarSwitch() {
    if (!this.bot.heldItem) return;
    const slot = Math.floor(randomBetween(0, 8));
    this.bot.setQuickBarSlot(slot);
    await this.sleep(randomBetween(200, 600));
  }

  async punchAir() {
    if (!this.bot.entity) return;
    const yaw = randomBetween(-Math.PI, Math.PI);
    const pitch = randomBetween(-Math.PI / 3, Math.PI / 3);
    await this.bot.look(yaw, pitch, false);
    this.bot.swingArm('right');
    await this.sleep(randomBetween(300, 1000));
  }

  async lookUpDown() {
    const pitch1 = randomBetween(-1.5, -0.5);
    await this.bot.look(0, pitch1, false);
    await this.sleep(randomBetween(500, 2000));
    const pitch2 = randomBetween(0.5, 1.5);
    await this.bot.look(0, pitch2, false);
    await this.sleep(randomBetween(300, 1500));
    await this.bot.look(0, 0, false);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
