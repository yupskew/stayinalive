import http from 'node:http';
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

const HTTP_PORT = parseInt(process.env.PORT || '8080', 10);
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(HTTP_PORT, () => {
  log('system', `Health server listening on port ${HTTP_PORT}`);
});

const manager = new BotManager();
manager.connect();

setupCommands(manager);

log('system', 'Bot started. Type "help" for terminal commands.');
