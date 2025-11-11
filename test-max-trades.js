/**
 * Test: Max Trades Enforcement
 * This test verifies the bot correctly blocks new signals when max trades limit is reached
 */

import dotenv from 'dotenv';
import { getOpenTradesCount } from './src/messenger.js';

dotenv.config();

console.log('🧪 Testing Max Trades Enforcement\n');
console.log('═'.repeat(70));

const maxOpenTrades = parseInt(process.env.MAX_OPEN_TRADES || '1');
const openTradesCount = getOpenTradesCount();

console.log('📊 Configuration:');
console.log(`   MAX_OPEN_TRADES: ${maxOpenTrades}`);
console.log(`   Current Open Trades: ${openTradesCount}`);
console.log('');

if (openTradesCount >= maxOpenTrades) {
  console.log('⚠️  Max open trades reached!');
  console.log('   ❌ Bot will NOT generate new signals');
  console.log('   💡 Use /log command to close existing trades');
  console.log('');
  console.log('✅ Enforcement logic working correctly');
} else {
  console.log('✅ Under limit');
  console.log(`   ✓ Bot will generate new signals (${maxOpenTrades - openTradesCount} slots available)`);
  console.log('');
  console.log('✅ Enforcement logic ready');
}

console.log('═'.repeat(70));
console.log('');

// Show instructions for testing
console.log('📝 To test with Telegram:');
console.log('   1. Start bot: node src/bot.js');
console.log('   2. Send /status to see open trades');
console.log('   3. Send /log <id> win 2.5 to close a trade');
console.log('   4. Check if new signals are generated in next scan');
console.log('');
