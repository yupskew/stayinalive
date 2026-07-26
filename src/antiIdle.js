import { log } from './logger.js';

const ACTIONS = [
  { name: 'lookAround', weight: 15 },
  { name: 'jump', weight: 10 },
  { name: 'sneak', weight: 8 },
  { name: 'walkForward', weight: 12 },
  { name: 'walkBackward', weight: 6 },
  { name: 'strafe', weight: 8 },
  { name: 'rotate', weight: 10 },
  { name: 'inventory', weight: 5 },
  { name: 'hotbarSwitch', weight: 7 },
  { name: 'punchAir', weight: 8 },
  { name: 'lookUpDown', weight: 10 },
  { name: 'headTurn', weight: 15 },
  { name: 'crouchWalk', weight: 5 },
  { name: 'spinAround', weight: 3 },
  { name: 'idle', weight: 20 },
];

function weightedPick() {
  const total = ACTIONS.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const action of ACTIONS) {
    r -= action.weight;
    if (r <= 0) return action.name;
  }
  return 'lookAround';
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

export class AntiIdle {
  constructor(bot) {
    this.bot = bot;
    this.timer = null;
    this.running = false;
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
  }

  scheduleNext() {
    if (!this.running) return;

    const wait = randomBetween(15000, 180000);
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.doAction();
      this.scheduleNext();
    }, wait);
  }

  async doAction() {
    if (!this.bot?.entity) return;

    const action = weightedPick();
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
    const times = Math.floor(randomBetween(1, 5));
    for (let i = 0; i < times; i++) {
      this.bot.setControlState('jump', true);
      await this.sleep(100);
      this.bot.setControlState('jump', false);
      await this.sleep(randomBetween(150, 600));
    }
  }

  async sneak() {
    const duration = randomBetween(1000, 6000);
    this.bot.setControlState('sneak', true);
    await this.sleep(duration);
    this.bot.setControlState('sneak', false);
  }

  async walkForward() {
    const duration = randomBetween(500, 3000);
    this.bot.setControlState('forward', true);
    await this.sleep(duration);
    this.bot.setControlState('forward', false);
    if (Math.random() > 0.4) {
      const yaw = randomBetween(-Math.PI / 3, Math.PI / 3);
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
    const duration = randomBetween(500, 2500);
    this.bot.setControlState(side, true);
    await this.sleep(duration);
    this.bot.setControlState(side, false);
  }

  async rotate() {
    const direction = Math.random() > 0.5 ? 1 : -1;
    const steps = Math.floor(randomBetween(2, 6));
    for (let i = 0; i < steps; i++) {
      const yaw = direction * randomBetween(0.5, Math.PI);
      const pitch = randomBetween(-0.5, 0.5);
      await this.bot.look(yaw, pitch, false);
      await this.sleep(randomBetween(100, 400));
    }
  }

  async inventory() {
    try {
      await this.bot.openContainer(this.bot.inventory);
      await this.sleep(randomBetween(800, 3000));
      this.bot.closeWindow(this.bot.inventory.window);
    } catch {}
  }

  async hotbarSwitch() {
    const slot = Math.floor(randomBetween(0, 8));
    this.bot.setQuickBarSlot(slot);
    await this.sleep(randomBetween(200, 800));
  }

  async punchAir() {
    const yaw = randomBetween(-Math.PI, Math.PI);
    const pitch = randomBetween(-Math.PI / 3, Math.PI / 3);
    await this.bot.look(yaw, pitch, false);
    const arm = Math.random() > 0.5 ? 'right' : 'left';
    this.bot.swingArm(arm);
    await this.sleep(randomBetween(300, 1200));
  }

  async lookUpDown() {
    const pitch1 = randomBetween(-1.5, -0.5);
    await this.bot.look(0, pitch1, false);
    await this.sleep(randomBetween(500, 2500));
    const pitch2 = randomBetween(0.5, 1.5);
    await this.bot.look(0, pitch2, false);
    await this.sleep(randomBetween(300, 1500));
    await this.bot.look(0, 0, false);
  }

  async headTurn() {
    const yaw = randomBetween(-2.0, 2.0);
    const pitch = randomBetween(-0.8, 0.8);
    await this.bot.look(yaw, pitch, false);
    await this.sleep(randomBetween(1000, 4000));
  }

  async crouchWalk() {
    const duration = randomBetween(1000, 3000);
    this.bot.setControlState('sneak', true);
    this.bot.setControlState('forward', true);
    await this.sleep(duration);
    this.bot.setControlState('sneak', false);
    this.bot.setControlState('forward', false);
  }

  async spinAround() {
    const spins = Math.floor(randomBetween(1, 3));
    for (let i = 0; i < spins; i++) {
      for (let deg = 0; deg < 360; deg += 15) {
        const rad = (deg * Math.PI) / 180;
        await this.bot.look(rad, 0, false);
        await this.sleep(30);
      }
    }
  }

  async idle() {
    await this.sleep(randomBetween(3000, 8000));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
