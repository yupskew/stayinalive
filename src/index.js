import { log } from './logger.js';
import { BotManager } from './bot.js';
import { setupCommands } from './commands.js';

process.on('uncaughtException', (err) => {
  log('error', `Uncaught exception: ${err.message}`);
});

process.on('unhandledRejection', (err) => {
  log('error', `Unhandled rejection: ${err.message}`);
});

setInterval(() => {
  global.gc?.();
}, 300000);

const manager = new BotManager();
manager.connect();

setupCommands(manager);

log('system', 'Bot started. Type "help" for terminal commands.');
