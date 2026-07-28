function color(code) {
  return (s) => `\x1b[${code}m${s}\x1b[0m`;
}

const dim = color(90);
const italic = (s) => `\x1b[3m${s}\x1b[0m`;
const gray = color(90);
const cyan = color(36);
const yellow = color(33);
const red = color(31);
const green = color(32);
const magenta = color(35);
const blue = color(34);
const orange = color(38);

const LEVELS = {
  info: { label: 'INFO', color: cyan },
  warn: { label: 'WARN', color: yellow },
  error: { label: 'ERROR', color: red },
  success: { label: 'OK', color: green },
  bot: { label: 'BOT', color: magenta },
  chat: { label: 'CHAT', color: blue },
  action: { label: 'ACTION', color: orange },
  system: { label: 'SYS', color: gray },
};

export function log(level, message) {
  const lvl = LEVELS[level] || LEVELS.info;
  const timestamp = dim(new Date().toLocaleTimeString());
  console.log(`${timestamp} ${lvl.color(`[${lvl.label}]`)} ${message}`);
}

export function chat(username, message) {
  log('chat', `<${green(username)}> ${message}`);
}

export function action(description) {
  log('action', italic(description));
}
