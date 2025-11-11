/**
 * Phase 7 Demo: Complete Workflow
 * Demonstrates all outcome tracking features
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOpenTradesCount } from './src/messenger.js';
import { weeklyReview } from './src/analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🎯 Phase 7 Demo: Paper Trading & Outcome Tracking\n');
console.log('═'.repeat(70));

// ============================================================================
// Step 1: Show Current Database State
// ============================================================================

console.log('\n📊 Step 1: Current Database State');
console.log('─'.repeat(70));

const dbPath = path.join(__dirname, 'data', 'signals.db');
const db = new Database(dbPath);

const allSignals = db.prepare('SELECT * FROM signals ORDER BY id').all();
console.log(`Total Signals in Database: ${allSignals.length}\n`);

console.log('Recent Signals:');
allSignals.slice(-5).forEach(signal => {
  const status = signal.outcome 
    ? `${signal.outcome.toUpperCase()} (${signal.pnl_percent}%)`
    : 'OPEN';
  console.log(`  #${signal.id} | ${signal.symbol} ${signal.direction} | ${status}`);
});

// ============================================================================
// Step 2: Check Open Trades Count
// ============================================================================

console.log('\n📈 Step 2: Max Trades Enforcement Check');
console.log('─'.repeat(70));

const openCount = getOpenTradesCount();
const maxTrades = parseInt(process.env.MAX_OPEN_TRADES || '1');

console.log(`Open Trades: ${openCount}`);
console.log(`Max Allowed: ${maxTrades}`);

if (openCount >= maxTrades) {
  console.log('⚠️  Status: MAX TRADES REACHED - Bot will block new signals');
} else {
  console.log(`✅ Status: OK - ${maxTrades - openCount} trade slots available`);
}

// ============================================================================
// Step 3: Demonstrate /log Command Logic
// ============================================================================

console.log('\n💾 Step 3: Simulate /log Command');
console.log('─'.repeat(70));

const openTrade = db.prepare('SELECT * FROM signals WHERE outcome IS NULL LIMIT 1').get();

if (openTrade) {
  console.log(`Found open trade: #${openTrade.id} (${openTrade.symbol} ${openTrade.direction})`);
  console.log('');
  console.log('Simulating: /log ' + openTrade.id + ' win 2.3');
  
  // Update (this is what /log command does)
  db.prepare(`
    UPDATE signals 
    SET outcome = ?, pnl_percent = ?, action_timestamp = ? 
    WHERE id = ?
  `).run('win', 2.3, new Date().toISOString(), openTrade.id);
  
  console.log('✅ Trade outcome logged successfully');
  console.log(`   Signal #${openTrade.id} → WIN (+2.3%)`);
} else {
  console.log('ℹ️  No open trades to log');
}

// ============================================================================
// Step 4: Show /status Command Output
// ============================================================================

console.log('\n📊 Step 4: /status Command Output');
console.log('─'.repeat(70));

const openTrades = db.prepare(`
  SELECT id, symbol, direction, entry, timestamp 
  FROM signals 
  WHERE outcome IS NULL
`).all();

const totalSignals = db.prepare('SELECT COUNT(*) as count FROM signals').get().count;
const completedTrades = db.prepare('SELECT * FROM signals WHERE outcome IS NOT NULL').all();
const wins = completedTrades.filter(t => t.outcome === 'win').length;
const losses = completedTrades.filter(t => t.outcome === 'loss').length;
const winRate = completedTrades.length > 0 ? ((wins / completedTrades.length) * 100).toFixed(1) : 0;
const avgPnl = completedTrades.length > 0 
  ? (completedTrades.reduce((sum, t) => sum + t.pnl_percent, 0) / completedTrades.length).toFixed(2)
  : 0;

console.log('🤖 Bot Status\n');
console.log('📊 Performance');
console.log(`├ Total Signals: ${totalSignals}`);
console.log(`├ Completed: ${completedTrades.length}`);
console.log(`├ Win Rate: ${winRate}%`);
console.log(`└ Avg PnL: ${avgPnl}%\n`);

console.log(`📈 Open Trades (${openTrades.length})`);
if (openTrades.length === 0) {
  console.log('✅ No open trades');
} else {
  openTrades.forEach(t => {
    console.log(`#${t.id} ${t.symbol} ${t.direction.toUpperCase()} @ ${t.entry.toFixed(2)}`);
  });
}

// ============================================================================
// Step 5: Run Weekly Review
// ============================================================================

console.log('\n📊 Step 5: Weekly Performance Review');
console.log('─'.repeat(70));

weeklyReview();

// ============================================================================
// Step 6: Show Next Steps
// ============================================================================

console.log('\n📝 Step 6: Usage Instructions');
console.log('─'.repeat(70));
console.log('\n1️⃣  Start the bot:');
console.log('   node src/bot.js');
console.log('');
console.log('2️⃣  In Telegram, send:');
console.log('   /status          → View open trades and performance');
console.log('   /log 5 win 2.5   → Log trade outcome (signal #5, won, +2.5%)');
console.log('   /log 6 loss -1.2 → Log trade outcome (signal #6, lost, -1.2%)');
console.log('');
console.log('3️⃣  Weekly review:');
console.log('   node src/analyzer.js --review');
console.log('');
console.log('4️⃣  Configure trading:');
console.log('   Edit .env:');
console.log('   - Set TELEGRAM_BOT_TOKEN (get from @BotFather)');
console.log('   - Set TELEGRAM_USER_ID (get from @userinfobot)');
console.log('   - Set PAPER_TRADING=false for live alerts');
console.log('   - Set MAX_OPEN_TRADES=3 to allow more concurrent trades');
console.log('');

// ============================================================================
// Summary
// ============================================================================

console.log('═'.repeat(70));
console.log('✅ Phase 7 Complete!');
console.log('═'.repeat(70));
console.log('\nKey Features:');
console.log('  ✅ Outcome tracking (win/loss + PnL%)');
console.log('  ✅ /log command for manual trade logging');
console.log('  ✅ /status command for bot health');
console.log('  ✅ Max trades enforcement (limit concurrent positions)');
console.log('  ✅ Weekly review with per-rule win rates');
console.log('  ✅ Paper trading mode for safe testing');
console.log('');
console.log('🚀 Ready for deployment!\n');

db.close();
