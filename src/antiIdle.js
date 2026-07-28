import pkg from 'mineflayer-pathfinder';
const { Movements, goals } = pkg;
import { log } from './logger.js';

const random = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(random(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const chance = (pct) => Math.random() < pct;

const GREETINGS = ['hello', 'hi', 'hey', 'yo', 'sup', 'wassup', 'whats up', 'howdy', 'greetings', 'good morning', 'good evening'];
const FAREWELLS = ['bye', 'goodbye', 'cya', 'see ya', 'later', 'gtg', 'gotta go'];

const SWING_REASONS = ['', '', '', '', '', '', 'killing a fly', 'stretching', 'checking my hand', ''];
const CHATTER = [
  'yeah', 'lol', 'fr', 'ong', 'nah', 'bet', 'facts', 'real', 'same',
  'lmao', 'lol true', 'fax', 'no cap', 'fr fr', 'based', 'w', 'big W',
  'oof', 'yikes', 'damn', 'rip', 'gg', 'mb', 'np', 'ty',
];

const TOSSABLE_ITEMS = [
  'dirt', 'cobblestone', 'stone', 'andesite', 'granite', 'diorite',
  'gravel', 'sand', 'red_sand', 'poppy', 'dandelion', 'grass_block',
  'oak_sapling', 'spruce_sapling', 'birch_sapling', 'stick', 'bone',
  'rotten_flesh', 'string', 'feather', 'flint', 'clay_ball', 'wheat_seeds',
  'pumpkin_seeds', 'melon_seeds', 'beetroot_seeds', 'ink_sac', 'cocoa_beans',
  'lapis_lazuli', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley',
  'sweet_berries', 'apple', 'bread', 'cooked_chicken', 'cooked_porkchop',
];

const ACTIONS = [
  { name: 'explore', weight: 25 },
  { name: 'exploreNear', weight: 20 },
  { name: 'lookAround', weight: 10 },
  { name: 'swingArm', weight: 12 },
  { name: 'sneakAround', weight: 8 },
  { name: 'breakBlock', weight: 6 },
  { name: 'placeBlock', weight: 4 },
  { name: 'tossItem', weight: 4 },
  { name: 'hotbarCycle', weight: 6 },
  { name: 'checkInventory', weight: 4 },
  { name: 'lookAtSky', weight: 3 },
  { name: 'examineGround', weight: 5 },
  { name: 'stretch', weight: 3 },
  { name: 'rest', weight: 15 },
  { name: 'lookAtPlayer', weight: 8 },
  { name: 'microAdjust', weight: 10 },
  { name: 'fish', weight: 2 },
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
    this._chatCooldown = 0;
    this._lastMessage = '';
    this._lastMessageTime = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    log('system', 'Anti-idle started (elite mode)');
    this.scheduleNext();
  }

  stop() {
    this.running = false;
    this._exploring = false;
    if (this.timer) clearTimeout(this.timer);
    if (this._checkLookInterval) clearInterval(this._checkLookInterval);
    this.stopPathfind();
    this.releaseControls();
    this.bot?.setControlState('sneak', false);
  }

  scheduleNext() {
    if (!this.running) return;
    const wait = random(4000, 18000);
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
    } catch {}
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
      this.smoothLookAsync(random(-Math.PI, Math.PI), random(-0.5, 0.5), randInt(4, 8));
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
      this.smoothLookAsync(random(-Math.PI, Math.PI), random(-0.4, 0.4), randInt(4, 8));
    }
    this._exploring = false;
  }

  async swingArm() {
    if (!this.bot?.entity) return;
    const arm = chance(0.7) ? 'right' : 'left';
    const swings = randInt(1, 3);
    for (let i = 0; i < swings; i++) {
      if (!this.running || !this.bot?.entity) return;
      this.bot.swingArm(arm);
      if (chance(0.1)) {
        this.smoothLookAsync(
          this.bot.entity.yaw + random(-0.1, 0.1),
          this.bot.entity.pitch + random(-0.05, 0.05),
          randInt(2, 4)
        );
      }
      await this.sleep(random(400, 1200));
    }
    if (chance(0.15)) {
      await this.sleep(random(100, 500));
      this.tryChat(pick(['*stretches*', '*cracks knuckles*', '*yawns*', '']));
    }
  }

  async sneakAround() {
    if (!this.bot?.entity) return;
    this.bot.setControlState('sneak', true);
    const duration = random(1500, 5000);
    const moves = randInt(1, 4);
    for (let i = 0; i < moves; i++) {
      if (!this.running || !this.bot?.entity) {
        this.bot.setControlState('sneak', false);
        return;
      }
      const dir = pick(['forward', 'back', 'left', 'right']);
      this.bot.setControlState(dir, true);
      await this.sleep(random(300, 1200));
      this.bot.setControlState(dir, false);
      if (chance(0.3)) {
        this.smoothLookAsync(random(-0.5, 0.5), random(-0.3, 0.3), randInt(2, 5));
      }
      await this.sleep(random(100, 400));
    }
    await this.sleep(random(200, 800));
    this.bot.setControlState('sneak', false);
  }

  async breakBlock() {
    if (!this.bot?.entity) return;
    try {
      const blocks = this.bot.findBlocks({
        matching: (b) => b && b.name && (
          b.name.includes('grass') || b.name.includes('flower') ||
          b.name.includes('tall_grass') || b.name === 'poppy' ||
          b.name === 'dandelion' || b.name.includes('mushroom') ||
          b.name === 'dead_bush' || b.name.includes('sapling') ||
          b.name.includes('torch') || b.name === 'snow' ||
          b.name === 'fern' || b.name.includes('vine') ||
          b.name === 'brown_mushroom' || b.name === 'red_mushroom'
        ),
        maxDistance: 4.5,
        count: 1,
      });
      if (!blocks.length) return;
      const block = blocks[0];
      if (!block) return;
      const pos = block.position;
      const dx = pos.x - this.bot.entity.position.x + 0.5;
      const dz = pos.z - this.bot.entity.position.z + 0.5;
      const dy = pos.y - (this.bot.entity.position.y + 1.6);
      const dist = Math.sqrt(dx * dx + dz * dz);
      const yaw = Math.atan2(-dx, -dz);
      const pitch = -Math.atan2(dy, dist);
      this.smoothLookAsync(yaw, clamp(pitch, -Math.PI / 2, Math.PI / 2), randInt(3, 6));
      await this.sleep(random(200, 600));
      await this.bot.dig(block);
      await this.sleep(random(500, 1500));
    } catch {}
  }

  async placeBlock() {
    if (!this.bot?.inventory) return;
    try {
      const placeable = this.bot.inventory.items().filter(i =>
        i.name.includes('dirt') || i.name.includes('cobblestone') ||
        i.name.includes('planks') || i.name === 'stone' ||
        i.name.includes('log') || i.name.includes('wool')
      );
      if (!placeable.length) return;
      const item = pick(placeable);
      await this.bot.equip(item, 'hand');
      await this.sleep(random(200, 500));

      const ref = this.bot.blockAtCursor(4.5);
      if (!ref) return;
      const pos = ref.position;
      const dx = pos.x - this.bot.entity.position.x + 0.5;
      const dz = pos.z - this.bot.entity.position.z + 0.5;
      const dy = pos.y - (this.bot.entity.position.y + 1.6);
      const dist = Math.sqrt(dx * dx + dz * dz);
      const yaw = Math.atan2(-dx, -dz);
      const pitch = -Math.atan2(dy, dist);
      this.smoothLookAsync(yaw, clamp(pitch, -Math.PI / 2, Math.PI / 2), randInt(3, 6));
      await this.sleep(random(200, 800));
      await this.bot.placeBlock(ref, pick([0, 1, 2, 3, 4, 5]));
      await this.sleep(random(500, 1500));
    } catch {}
  }

  async tossItem() {
    if (!this.bot?.inventory) return;
    const tossable = this.bot.inventory.items().filter(i =>
      TOSSABLE_ITEMS.includes(i.name) && i.count > 1
    );
    if (!tossable.length) return;
    const item = pick(tossable);
    try {
      await this.bot.toss(item.type, null, 1);
      await this.sleep(random(300, 800));
      if (chance(0.2)) {
        this.tryChat(pick(['*throws away stuff*', '*clears inventory*', 'need space']));
      }
    } catch {}
  }

  async fish() {
    if (!this.bot?.entity || !this.bot?.inventory) return;
    const rod = this.bot.inventory.items().find(i => i.name.includes('fishing_rod') || i.name.includes('fishingrod'));
    if (!rod) return;
    const block = this.bot.blockAt(this.bot.entity.position);
    if (!block || block.name !== 'water') {
      const below = this.bot.blockAt({ x: this.bot.entity.position.x, y: this.bot.entity.position.y - 1, z: this.bot.entity.position.z });
      if (!below || below.name !== 'water') return;
    }
    try {
      await this.bot.equip(rod, 'hand');
      await this.sleep(random(300, 800));
      this.bot.look(random(-Math.PI, Math.PI), random(-0.6, 0.2), false);
      await this.sleep(random(500, 1500));
      this.bot.fish();
      log('action', 'Casting fishing rod');
      await this.sleep(random(8000, 20000));
      this.bot.activateItem();
      await this.sleep(random(1000, 3000));
    } catch {}
  }

  async rest() {
    if (!this.bot?.entity || this._exploring) return;
    const duration = random(5000, 20000);
    const fidgets = randInt(1, 4);
    for (let i = 0; i < fidgets; i++) {
      if (!this.running || !this.bot?.entity) return;
      await this.sleep(duration / fidgets);
      if (chance(0.4)) this.microAdjust();
      if (chance(0.15)) this.bot?.swingArm('right');
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

  async hotbarCycle() {
    const current = this.bot.quickBarSlot;
    const target = randInt(0, 8);
    const steps = Math.abs(target - current);
    for (let i = 0; i < steps; i++) {
      if (!this.running) return;
      this.bot.setQuickBarSlot(current + (target > current ? 1 : -1) * (i + 1));
      await this.sleep(random(60, 250));
    }
    if (chance(0.3)) {
      await this.sleep(random(300, 800));
      const extra = randInt(0, 8);
      this.bot.setQuickBarSlot(extra);
    }
  }

  async checkInventory() {
    try {
      this.smoothLookAsync(random(-0.3, 0.3), random(-0.4, -0.1), randInt(3, 6));
      await this.sleep(random(200, 600));
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
      await this.sleep(random(200, 500));
      if (chance(0.3)) {
        this.microAdjust();
      }
    } catch {}
  }

  handleChat(username, message) {
    const lower = message.toLowerCase().trim();
    const now = Date.now();
    if (now < this._chatCooldown) return;
    if (username === this.bot?.username) return;

    const isGreeting = GREETINGS.some(g => lower.startsWith(g) || lower === g || lower.includes(g));
    const isFarewell = FAREWELLS.some(f => lower.includes(f));

    if (isGreeting && chance(0.6)) {
      this._chatCooldown = now + random(30000, 120000);
      const responses = [
        `hey ${username}`, `yo ${username}`, `sup ${username}`,
        `hey!`, `yo what's good`, `heyy`, `hey what's up`,
        `hello :)`, `howdy`, `yo!`,
      ];
      this.scheduleChat(pick(responses), random(2000, 6000));
      return true;
    }

    if (isFarewell && chance(0.3)) {
      this._chatCooldown = now + random(20000, 60000);
      const responses = ['cya', 'later', 'bye', 'see ya', 'later gator'];
      this.scheduleChat(pick(responses), random(1000, 4000));
      return true;
    }

    if (lower.includes(this.bot?.username?.toLowerCase() || '') && chance(0.7)) {
      this._chatCooldown = now + random(20000, 90000);
      const responses = [
        `what's up`, `yo`, `sup`,
        `hmm?`, `yeah?`, `who me?`,
        `i heard u`, `what's good`,
      ];
      this.scheduleChat(pick(responses), random(1500, 5000));
      return true;
    }

    if (chance(0.08) && lower.length > 10) {
      this._chatCooldown = now + random(60000, 300000);
      this.scheduleChat(pick(CHATTER), random(3000, 10000));
      return true;
    }

    return false;
  }

  scheduleChat(message, delay) {
    if (!message || !this.bot?.chat) return;
    setTimeout(() => {
      if (this.bot?.chat) {
        try { this.bot.chat(message); } catch {}
      }
    }, delay);
  }

  tryChat(message) {
    if (!message || !this.bot?.chat) return;
    const now = Date.now();
    if (now < this._chatCooldown) return;
    this._chatCooldown = now + random(15000, 60000);
    try { this.bot.chat(message); } catch {}
  }
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
