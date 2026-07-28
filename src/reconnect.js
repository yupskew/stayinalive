import { log } from './logger.js';

const random = (min, max) => Math.random() * (max - min) + min;

export class ReconnectManager {
  constructor(options = {}) {
    this.baseDelay = options.baseDelay || 8000;
    this.maxDelay = options.maxDelay || 180000;
    this.attempt = 0;
    this.timer = null;
    this.onReconnect = null;
  }

  getDelay() {
    const delay = Math.min(this.baseDelay * Math.pow(1.8, this.attempt), this.maxDelay);
    const jitter = random(-delay * 0.15, delay * 0.25);
    return Math.round(Math.max(2000, delay + jitter));
  }

  schedule() {
    this.attempt++;
    const delay = this.getDelay();
    log('warn', `Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt #${this.attempt})`);
    this.timer = setTimeout(() => {
      if (this.onReconnect) this.onReconnect();
    }, delay);
  }

  reset() {
    this.attempt = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  cancel() {
    this.reset();
  }
}
