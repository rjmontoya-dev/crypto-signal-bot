// test-telegram.js (ES module version)
import 'dotenv/config';
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

(async () => {
  try {
    await bot.telegram.sendMessage(
      process.env.TELEGRAM_USER_ID, 
      '🚀 Bot is online and configured!'
    );
    console.log('✅ Success! Check your Telegram for the message.');
    process.exit();
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('Did you /start the bot? Is your TELEGRAM_USER_ID correct?');
    process.exit();
  }
})();