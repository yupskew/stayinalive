import chalk from 'chalk';

const LEVELS = {
  info: { label: 'INFO', color: chalk.cyan },
  warn: { label: 'WARN', color: chalk.yellow },
  error: { label: 'ERROR', color: chalk.red },
  success: { label: 'OK', color: chalk.green },
  bot: { label: 'BOT', color: chalk.magenta },
  chat: { label: 'CHAT', color: chalk.blue },
  action: { label: 'ACTION', color: chalk.hex('#FFA500') },
  system: { label: 'SYS', color: chalk.gray },
};

export function log(level, message) {
  const lvl = LEVELS[level] || LEVELS.info;
  const timestamp = chalk.dim(new Date().toLocaleTimeString());
  console.log(`${timestamp} ${lvl.color(`[${lvl.label}]`)} ${message}`);
}

export function chat(username, message) {
  log('chat', `<${chalk.green(username)}> ${message}`);
}

export function action(description) {
  log('action', chalk.italic(description));
}
