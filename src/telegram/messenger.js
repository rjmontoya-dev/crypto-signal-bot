import { Telegraf, Markup } from 'telegraf';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Telegram bot instance
let bot = null;
let db = null;

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

/**
 * Initialize SQLite database
 */
function initDatabase() {
  if (!db) {
    const dbDir = path.join(__dirname, '..', '..', 'data');
    const dbPath = path.join(dbDir, 'signals.db');
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log('✅ Created data directory');
    }
    
    db = new Database(dbPath);
    
    // Create signals table
    db.exec(`
      CREATE TABLE IF NOT EXISTS signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_id TEXT UNIQUE NOT NULL,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry REAL NOT NULL,
        tp REAL NOT NULL,
        sl REAL NOT NULL,
        score REAL NOT NULL,
        max_score REAL NOT NULL,
        reasons TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        timestamp TEXT NOT NULL,
        action_timestamp TEXT,
        outcome TEXT,
        pnl_percent REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Database initialized');
  }
  return db;
}

/**
 * Get or create Telegram bot instance
 */
function getBot() {
  if (!bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || token === 'your_bot_token_from_BotFather') {
      console.warn('⚠️  Telegram bot token not configured');
      return null;
    }
    bot = new Telegraf(token);
  }
  return bot;
}

// ============================================================================
// SIGNAL LOGGING
// ============================================================================

/**
 * Log a signal to the database
 * @param {Object} signal - Signal object
 * @returns {string} Signal ID
 */
function logSignal(signal) {
  const database = initDatabase();
  const signalId = `${signal.symbol.replace('/', '')}_${Date.now()}`;
  
  const stmt = database.prepare(`
    INSERT INTO signals (signal_id, symbol, direction, entry, tp, sl, score, max_score, reasons, timestamp, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    signalId,
    signal.symbol,
    signal.direction,
    signal.entry,
    signal.tp,
    signal.sl,
    signal.score,
    signal.maxScore,
    JSON.stringify(signal.reasons),
    signal.timestamp,
    'pending'
  );
  
  console.log(`📝 Signal logged to database: ${signalId}`);
  return signalId;
}

/**
 * Update signal status when user takes action
 * @param {string} signalId - Signal ID
 * @param {string} status - 'taken' or 'skipped'
 */
function updateSignalStatus(signalId, status) {
  const database = initDatabase();
  const stmt = database.prepare(`
    UPDATE signals 
    SET status = ?, action_timestamp = ? 
    WHERE signal_id = ?
  `);
  
  stmt.run(status, new Date().toISOString(), signalId);
  console.log(`✅ Signal ${signalId} marked as ${status}`);
}

/**
 * Get count of open trades (signals with no outcome)
 * @returns {number} Count of open trades
 */
export function getOpenTradesCount() {
  const database = initDatabase();
  const result = database.prepare('SELECT COUNT(*) as count FROM signals WHERE outcome IS NULL').get();
  return result.count;
}

/**
 * Close a trade manually by ID
 * @param {number} signalId - Signal ID
 * @param {string} outcome - 'win', 'loss', or 'skip'
 * @param {number} pnlPercent - PnL percentage (0 for skip)
 * @returns {Object} Result with success status and message
 */
export function closeTradeManually(signalId, outcome, pnlPercent) {
  try {
    const database = initDatabase();
    
    // Check if signal exists
    const signal = database.prepare('SELECT * FROM signals WHERE id = ?').get(signalId);
    if (!signal) {
      return { success: false, message: `Signal #${signalId} not found in database.` };
    }
    
    // Allow re-closing if changing to skip (flexible for trades that were taken then removed)
    // Only block if trying to change from one final outcome to another (win<->loss)
    if (signal.outcome !== null && signal.outcome !== 'skip' && outcome !== 'skip') {
      return { success: false, message: `Signal #${signalId} is already closed with outcome: ${signal.outcome}. Cannot change between win/loss.` };
    }
    
    // Update outcome
    const stmt = database.prepare(`
      UPDATE signals 
      SET outcome = ?, pnl_percent = ?, action_timestamp = ? 
      WHERE id = ?
    `);
    
    const timestamp = new Date().toISOString();
    stmt.run(outcome, pnlPercent, timestamp, signalId);
    
    const emoji = outcome === 'win' ? '🎯' : outcome === 'loss' ? '📉' : '⏭️';
    const sign = pnlPercent >= 0 ? '+' : '';
    const pnlText = outcome === 'skip' ? 'Not Taken' : `${sign}${pnlPercent}%`;
    
    console.log(`✅ Manually closed signal #${signalId}: ${outcome} (${pnlText})`);
    
    return {
      success: true,
      message: `${emoji} Trade #${signalId} closed: ${outcome.toUpperCase()} (${pnlText})`,
      data: {
        id: signalId,
        symbol: signal.symbol,
        direction: signal.direction,
        outcome,
        pnlPercent
      }
    };
    
  } catch (error) {
    console.error('❌ Error closing trade:', error.message);
    return { success: false, message: 'Database error: ' + error.message };
  }
}

// ============================================================================
// MESSAGE FORMATTING
// ============================================================================

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Format a signal for Telegram display
 * @param {Object} signal - Signal object from generateSignal()
 * @returns {string} Formatted message text
 */
function formatSignalMessage(signal) {
  const directionEmoji = signal.direction === 'LONG' ? '🟢' : '🔴';
  const profitPercent = ((signal.tp - signal.entry) / signal.entry * 100).toFixed(2);
  const lossPercent = ((signal.entry - signal.sl) / signal.entry * 100).toFixed(2);
  
  let message = `${directionEmoji} <b>${signal.direction} ${signal.symbol}</b>\n\n`;
  message += `📊 <b>Entry:</b> $${signal.entry.toLocaleString()} | `;
  message += `<b>TP:</b> $${signal.tp.toLocaleString()} | `;
  message += `<b>SL:</b> $${signal.sl.toLocaleString()}\n`;
  message += `📈 <b>Score:</b> ${signal.score}/${signal.maxScore}\n`;
  message += `💰 <b>Risk/Reward:</b> -${lossPercent}% / +${profitPercent}%\n\n`;
  message += `<b>Confluences:</b>\n`;
  
  signal.reasons.forEach(reason => {
    message += `• ${escapeHtml(reason)}\n`;
  });
  
  message += `\n🕐 ${new Date(signal.timestamp).toLocaleString()}`;
  
  return message;
}

/**
 * Create inline keyboard for signal
 * @param {string} signalId - Unique signal identifier
 * @returns {Object} Telegraf inline keyboard markup
 */
function createSignalKeyboard(signalId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ I Took This Trade', `take_${signalId}`),
      Markup.button.callback('❌ Skip', `skip_${signalId}`)
    ]
  ]);
}

// ============================================================================
// TELEGRAM MESSAGING
// ============================================================================

/**
 * Send a trading signal to Telegram with interactive buttons
 * @param {Object} signal - Signal object from generateSignal()
 * @returns {Promise<boolean>} Success status
 */
export async function sendSignal(signal) {
  try {
    // Always log signal to database first
    const signalId = logSignal(signal);
    
    const telegramBot = getBot();
    if (!telegramBot) {
      console.log('📱 [Telegram disabled] Signal logged to database:', signal.symbol, signal.direction);
      return false;
    }
    
    // Format message
    const messageText = formatSignalMessage(signal);
    const keyboard = createSignalKeyboard(signalId);
    
    // Send to Telegram
    const userId = process.env.TELEGRAM_USER_ID;
    await telegramBot.telegram.sendMessage(userId, messageText, {
      parse_mode: 'HTML',
      ...keyboard
    });
    
    console.log('✅ Signal sent to Telegram');
    return true;
    
  } catch (error) {
    console.error('❌ Failed to send signal to Telegram:', error.message);
    return false;
  }
}

/**
 * Send a plain text message to Telegram
 * @param {string} text - Message text
 * @returns {Promise<boolean>} Success status
 */
export async function sendMessage(text) {
  try {
    const telegramBot = getBot();
    if (!telegramBot) {
      console.log('📱 [Telegram disabled] Would send:', text);
      return false;
    }
    
    const userId = process.env.TELEGRAM_USER_ID;
    await telegramBot.telegram.sendMessage(userId, text);
    console.log('✅ Message sent to Telegram');
    return true;
    
  } catch (error) {
    console.error('❌ Failed to send message:', error.message);
    return false;
  }
}

// ============================================================================
// BUTTON HANDLERS
// ============================================================================

/**
 * Handle "Take Trade" button click
 */
function handleTakeTrade(ctx, signalId) {
  try {
    updateSignalStatus(signalId, 'taken');
    ctx.answerCbQuery('✅ Trade logged as taken!');
    ctx.editMessageReplyMarkup({ inline_keyboard: [] }); // Remove buttons
    ctx.reply(`📝 Trade recorded: ${signalId}`);
  } catch (error) {
    console.error('❌ Error handling take trade:', error.message);
    ctx.answerCbQuery('❌ Error logging trade');
  }
}

/**
 * Handle "Skip" button click
 */
function handleSkip(ctx, signalId) {
  try {
    updateSignalStatus(signalId, 'skipped');
    ctx.answerCbQuery('⏭️ Signal skipped');
    ctx.editMessageReplyMarkup({ inline_keyboard: [] }); // Remove buttons
  } catch (error) {
    console.error('❌ Error handling skip:', error.message);
    ctx.answerCbQuery('❌ Error logging skip');
  }
}

/**
 * Handle /log command - Manually log trade outcome
 * Syntax: /log <signal_id> <win|loss> <pnl_percent>
 * Example: /log 15 win 2.5
 */
function handleLogCommand(ctx) {
  const text = ctx.message.text.trim();
  const parts = text.split(/\s+/);
  
  // Validate format
  if (parts.length !== 4) {
    ctx.reply('❌ Invalid format!\n\nUsage: /log <signal_id> <win|loss> <pnl_percent>\nExample: /log 15 win 2.5');
    return;
  }
  
  const signalId = parseInt(parts[1]);
  const outcome = parts[2].toLowerCase();
  const pnlPercent = parseFloat(parts[3]);
  
  // Validate signal ID
  if (isNaN(signalId) || signalId <= 0) {
    ctx.reply('❌ Invalid signal_id. Must be a positive number.');
    return;
  }
  
  // Validate outcome
  if (outcome !== 'win' && outcome !== 'loss') {
    ctx.reply('❌ Outcome must be "win" or "loss"');
    return;
  }
  
  // Validate PnL percent
  if (isNaN(pnlPercent)) {
    ctx.reply('❌ Invalid pnl_percent. Must be a number.');
    return;
  }
  
  try {
    const database = initDatabase();
    
    // Check if signal exists
    const signal = database.prepare('SELECT * FROM signals WHERE id = ?').get(signalId);
    if (!signal) {
      ctx.reply(`❌ Signal #${signalId} not found in database.`);
      return;
    }
    
    // Update outcome
    const stmt = database.prepare(`
      UPDATE signals 
      SET outcome = ?, pnl_percent = ?, action_timestamp = ? 
      WHERE id = ?
    `);
    
    const timestamp = new Date().toISOString();
    stmt.run(outcome, pnlPercent, timestamp, signalId);
    
    const emoji = outcome === 'win' ? '🎯' : '📉';
    const sign = pnlPercent >= 0 ? '+' : '';
    
    ctx.reply(
      `${emoji} Trade logged!\n\n` +
      `📊 Signal #${signalId}\n` +
      `📈 ${signal.symbol} ${signal.direction}\n` +
      `💰 Outcome: ${outcome.toUpperCase()}\n` +
      `📊 PnL: ${sign}${pnlPercent.toFixed(2)}%\n` +
      `⏰ Logged at ${timestamp}`
    );
    
    console.log(`✅ Logged outcome for signal #${signalId}: ${outcome} (${sign}${pnlPercent}%)`);
    
  } catch (error) {
    console.error('❌ Error logging outcome:', error.message);
    ctx.reply('❌ Database error. Check logs.');
  }
}

/**
 * Handle /status command - Show bot health and open trades
 */
function handleStatusCommand(ctx) {
  try {
    const database = initDatabase();
    
    // Get open trades (no outcome)
    const openTrades = database.prepare(`
      SELECT id, symbol, direction, entry, tp, sl, score, timestamp 
      FROM signals 
      WHERE outcome IS NULL 
      ORDER BY created_at DESC
    `).all();
    
    // Get total signals count
    const totalSignals = database.prepare('SELECT COUNT(*) as count FROM signals').get().count;
    
    // Get completed trades
    const completedTrades = database.prepare(`
      SELECT outcome, pnl_percent 
      FROM signals 
      WHERE outcome IS NOT NULL
    `).all();
    
    // Calculate win rate
    const wins = completedTrades.filter(t => t.outcome === 'win').length;
    const losses = completedTrades.filter(t => t.outcome === 'loss').length;
    const totalCompleted = wins + losses;
    const winRate = totalCompleted > 0 ? ((wins / totalCompleted) * 100).toFixed(1) : 0;
    
    // Calculate average PnL
    const avgPnl = completedTrades.length > 0
      ? (completedTrades.reduce((sum, t) => sum + (t.pnl_percent || 0), 0) / completedTrades.length).toFixed(2)
      : 0;
    
    // Get last scan time (most recent signal)
    const lastSignal = database.prepare('SELECT created_at FROM signals ORDER BY created_at DESC LIMIT 1').get();
    const lastScan = lastSignal ? new Date(lastSignal.created_at).toLocaleString() : 'Never';
    
    // Format open trades
    let openTradesText = '';
    if (openTrades.length === 0) {
      openTradesText = '✅ No open trades';
    } else {
      openTradesText = openTrades.map(t => 
        `#${t.id} ${t.symbol} ${t.direction.toUpperCase()} @ ${t.entry.toFixed(2)}`
      ).join('\n');
    }
    
    // Build status message
    const message = 
      `🤖 *Bot Status*\n\n` +
      `📊 *Performance*\n` +
      `├ Total Signals: ${totalSignals}\n` +
      `├ Completed: ${totalCompleted}\n` +
      `├ Win Rate: ${winRate}%\n` +
      `└ Avg PnL: ${avgPnl}%\n\n` +
      `📈 *Open Trades (${openTrades.length})*\n` +
      `${openTradesText}\n\n` +
      `⏰ Last Scan: ${lastScan}\n\n` +
      `💡 Use /log to record outcomes`;
    
    ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('❌ Error getting status:', error.message);
    ctx.reply('❌ Error retrieving status. Check logs.');
  }
}

// ============================================================================
// BOT INITIALIZATION
// ============================================================================

/**
 * Initialize Telegram bot with handlers
 */
export function initTelegram() {
  const telegramBot = getBot();
  if (!telegramBot) {
    console.log('⚠️  Telegram bot not initialized (token missing)');
    return null;
  }
  
  // Initialize database
  initDatabase();
  
  // Register button handlers
  telegramBot.action(/^take_(.+)$/, (ctx) => {
    const signalId = ctx.match[1];
    handleTakeTrade(ctx, signalId);
  });
  
  telegramBot.action(/^skip_(.+)$/, (ctx) => {
    const signalId = ctx.match[1];
    handleSkip(ctx, signalId);
  });
  
  // /log command - Manually log trade outcome
  telegramBot.command('log', (ctx) => {
    handleLogCommand(ctx);
  });
  
  // /status command - Show bot health and open trades
  telegramBot.command('status', (ctx) => {
    handleStatusCommand(ctx);
  });
  
  // /reset command - Manually reset daily lock
  telegramBot.command('reset', async (ctx) => {
    try {
      // Import manualResetLock dynamically to avoid circular dependency
      const { manualResetLock } = await import('./bot.js');
      const message = manualResetLock();
      ctx.reply(message);
    } catch (error) {
      console.error('❌ Error resetting lock:', error.message);
      ctx.reply('❌ Error resetting lock. Check logs.');
    }
  });
  
  // Start command
  telegramBot.command('start', (ctx) => {
    ctx.reply('🤖 Crypto Signal Bot is active!\n\nCommands:\n/status - View bot health\n/log <id> <win|loss> <pnl%> - Log trade outcome\n/reset - Clear daily signal lock');
  });
  
  // Launch bot
  telegramBot.launch().then(() => {
    console.log('✅ Telegram bot started');
  }).catch(err => {
    console.error('❌ Failed to start Telegram bot:', err.message);
  });
  
  // Enable graceful stop
  process.once('SIGINT', () => telegramBot.stop('SIGINT'));
  process.once('SIGTERM', () => telegramBot.stop('SIGTERM'));
  
  return telegramBot;
}

// ============================================================================
// TESTING
// ============================================================================

/**
 * Test function to send a sample signal
 */
export async function testSend() {
  console.log('🧪 Testing Telegram signal delivery...\n');
  
  // Create a mock signal
  const testSignal = {
    symbol: 'BTC/USDT',
    direction: 'LONG',
    entry: 28500,
    tp: 29213,
    sl: 28088,
    score: 7.0,
    maxScore: 8.0,
    reasons: [
      'RSI oversold (<30)',
      'MACD bullish momentum',
      'Funding rate negative (shorts pay longs)',
      'Volume spike >1.5x avg'
    ],
    timestamp: new Date().toISOString()
  };
  
  console.log('📤 Sending test signal...');
  const success = await sendSignal(testSignal);
  
  if (success) {
    console.log('\n✅ Test signal sent successfully!');
    console.log('📱 Check your Telegram for the message');
    console.log('🔘 Try clicking the buttons to test interactions');
    console.log('\n💡 The bot needs to stay running to handle button clicks.');
    console.log('   Starting bot listener...\n');
    
    // Keep bot running to handle button clicks
    initTelegram();
  } else {
    console.log('\n⚠️  Test signal not sent (check your .env configuration)');
    process.exit(1);
  }
}

// Run test if executed directly
if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  testSend().catch(console.error);
}
