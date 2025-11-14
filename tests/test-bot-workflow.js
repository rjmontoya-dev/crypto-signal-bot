/**
 * Test bot with simulated high-score signal
 * This forces a signal to be generated and logged
 */
import Database from 'better-sqlite3';
import { sendSignal, initTelegram } from '../src/telegram/messenger.js';

console.log('🧪 Testing bot workflow with mock signal...\n');

// Initialize Telegram (won't send if not configured)
console.log('📱 Initializing Telegram...');
initTelegram();
console.log('✅ Ready\n');

// Create a high-scoring mock signal
const mockSignal = {
  symbol: 'BTC/USDT',
  direction: 'LONG',
  entry: 103000,
  tp: 105575,  // entry * 1.025
  sl: 101455,  // entry * 0.985
  score: 9.5,
  maxScore: 16.0,
  reasons: [
    'RSI oversold (<30)',
    'MACD bullish crossover confirmed',
    'MACD histogram positive (bullish momentum)',
    'Price above EMA50 (uptrend)',
    'Volume spike >1.5x average',
    'Above average volume >1.2x',
    'Funding rate strongly negative (<-0.02%) - shorts pay longs'
  ],
  timestamp: new Date().toISOString()
};

console.log('📊 Mock Signal Details:');
console.log(`   Symbol: ${mockSignal.symbol}`);
console.log(`   Direction: ${mockSignal.direction}`);
console.log(`   Entry: $${mockSignal.entry.toLocaleString()}`);
console.log(`   TP: $${mockSignal.tp.toLocaleString()}`);
console.log(`   SL: $${mockSignal.sl.toLocaleString()}`);
console.log(`   Score: ${mockSignal.score}/${mockSignal.maxScore}`);
console.log(`   Confluences: ${mockSignal.reasons.length}`);
console.log('');

console.log('📤 Sending signal...');
const sent = await sendSignal(mockSignal);

if (sent) {
  console.log('✅ Signal sent and logged to database!\n');
  console.log('💡 Check:');
  console.log('   1. Telegram for the alert (if configured)');
  console.log('   2. Database: data/signals.db');
  console.log('\n🔘 Bot will stay running to handle button clicks...');
  console.log('   Press Ctrl+C to stop\n');
} else {
  console.log('⚠️  Signal not sent (Telegram not configured)');
  console.log('   But it was logged to the database!\n');
  
  // Verify database entry
  const db = new Database('./data/signals.db');
  const records = db.prepare('SELECT * FROM signals ORDER BY id DESC LIMIT 1').get();
  console.log('📊 Latest database entry:');
  console.log(records);
  db.close();
  
  console.log('\n✅ Test complete');
  process.exit(0);
}
