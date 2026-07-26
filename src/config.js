import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

if (!existsSync(envPath)) {
  console.error('[CONFIG] No .env file found. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

config({ path: envPath });

function env(key, fallback) {
  return process.env[key] !== undefined && process.env[key] !== '' ? process.env[key] : fallback;
}

export default {
  host: env('HOST', 'localhost'),
  port: parseInt(env('PORT', '25565'), 10),
  username: env('USERNAME', 'BotPlayer'),
  password: env('PASSWORD', ''),
  version: env('VERSION', 'auto') === 'auto' ? false : env('VERSION', false),
  auth: env('AUTH', 'offline'),
  discordWebhook: env('DISCORD_WEBHOOK_URL', ''),
  groqKey: env('GROQ_API_KEY', ''),
};
