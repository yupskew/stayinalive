import { log } from './logger.js';

export class ReconnectManager {
  constructor(options = {}) {
    this.baseDelay = options.baseDelay || 5000;
    this.maxDelay = options.maxDelay || 120000;
    this.attempt = 0;
    this.timer = null;
    this.onReconnect = null;
  }

  getDelay() {
    const delay = Math.min(this.baseDelay * Math.pow(2, this.attempt), this.maxDelay);
    const jitter = Math.random() * 1000;
    return Math.round(delay + jitter);
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
