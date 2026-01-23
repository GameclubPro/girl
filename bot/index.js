import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Telegraf, Markup } from 'telegraf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is missing in .env');
  process.exit(1);
}

const webAppUrl = process.env.WEB_APP_URL;

const bot = new Telegraf(token);

const withRoleParam = (url, role) => {
  if (!url) return url;
  if (!role) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('role')) {
      parsed.searchParams.set('role', role);
    }
    return parsed.toString();
  } catch (error) {
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}role=${encodeURIComponent(role)}`;
  }
};

const appKeyboard = (url, role) =>
  Markup.keyboard([[Markup.button.webApp('Open Mini App', withRoleParam(url, role))]])
    .resize()
    .oneTime();

bot.start(async (ctx) => {
  if (!webAppUrl) {
    await ctx.reply('WEB_APP_URL is not set. Add it to .env and restart.');
    return;
  }
  await ctx.reply('Tap to open the mini app:', appKeyboard(webAppUrl, 'pro'));
});

bot.command('app', async (ctx) => {
  if (!webAppUrl) {
    await ctx.reply('WEB_APP_URL is not set. Add it to .env and restart.');
    return;
  }
  await ctx.reply('Tap to open the mini app:', appKeyboard(webAppUrl, 'pro'));
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
