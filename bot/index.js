import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Telegraf, Markup } from 'telegraf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../env/.env') });

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is missing in env/.env');
  process.exit(1);
}

const webAppUrl = process.env.WEB_APP_URL;

const bot = new Telegraf(token);

const appKeyboard = (url) =>
  Markup.keyboard([[Markup.button.webApp('Open Mini App', url)]])
    .resize()
    .oneTime();

bot.start(async (ctx) => {
  if (!webAppUrl) {
    await ctx.reply('WEB_APP_URL is not set. Add it to env/.env and restart.');
    return;
  }
  await ctx.reply('Tap to open the mini app:', appKeyboard(webAppUrl));
});

bot.command('app', async (ctx) => {
  if (!webAppUrl) {
    await ctx.reply('WEB_APP_URL is not set. Add it to env/.env and restart.');
    return;
  }
  await ctx.reply('Tap to open the mini app:', appKeyboard(webAppUrl));
});

bot.on('message', async (ctx) => {
  await ctx.reply('Send /app to open the mini app.');
});

bot.catch((err) => {
  console.error('Bot error:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch().then(() => {
  console.log('Bot started');
});
