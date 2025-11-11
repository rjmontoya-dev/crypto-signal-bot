/**
 * Test messenger functions without actual Telegram API calls
 */
import { sendSignal, sendMessage } from './src/messenger.js';

console.log('🧪 Testing messenger module (dry run)...\n');

// Create test signal
const testSignal = {
  symbol: 'BTC/USDT',
  direction: 'LONG',
  entry: 28500,
  tp: 29213,
  sl: 28088,
  score: 7.5,
  maxScore: 10.0,
  reasons: [
    'RSI oversold (<30)',
    'MACD bullish momentum',
    'Funding rate negative (shorts pay longs)',
    'Volume spike >1.5x avg'
  ],
  timestamp: new Date().toISOString()
};

console.log('📊 Test Signal:');
console.log(JSON.stringify(testSignal, null, 2));
console.log('\n');

// Test formatting
console.log('📤 Attempting to send signal...');
await sendSignal(testSignal);

console.log('\n📤 Attempting to send plain message...');
await sendMessage('🤖 Bot status: Testing messenger module');

console.log('\n✅ Messenger module loaded successfully!');
console.log('\n💡 To send real messages:');
console.log('   1. Configure TELEGRAM_BOT_TOKEN and TELEGRAM_USER_ID in .env');
console.log('   2. Run: node src/messenger.js');
console.log('   3. Check your Telegram for the test signal');

process.exit(0);
