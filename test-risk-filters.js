/**
 * Test risk filters and paper trading mode
 */
import dotenv from 'dotenv';
import { checkLiquidity, checkVolatility, checkNews, runDisqualifiers } from './src/analyzer.js';

dotenv.config();

console.log('🧪 Testing Risk Filters & Disqualifiers\n');
console.log('═'.repeat(70));

// Test 1: Liquidity Check
console.log('\n📊 Test 1: Liquidity Check');
console.log('─'.repeat(70));

const symbol = 'BTC/USDT';
console.log(`Checking ${symbol}...`);

const liquidityResult = await checkLiquidity(symbol);
console.log(`Result: ${liquidityResult.pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Volume: $${(liquidityResult.volume / 1000000).toFixed(1)}M`);
if (liquidityResult.reason) {
  console.log(`Reason: ${liquidityResult.reason}`);
}

// Test 2: Volatility Check (need real candles)
console.log('\n📊 Test 2: Volatility Check');
console.log('─'.repeat(70));

// Import to fetch real data
import { fetchOHLCV } from './src/analyzer.js';
const candles = await fetchOHLCV(symbol, '4h', 100);
const currentPrice = candles[candles.length - 1].close;

console.log(`Fetched ${candles.length} candles`);
console.log(`Current price: $${currentPrice.toLocaleString()}`);

const volatilityResult = checkVolatility(candles, currentPrice);
console.log(`Result: ${volatilityResult.pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`ATR: ${volatilityResult.atr?.toFixed(2) || 'N/A'}`);
console.log(`ATR %: ${volatilityResult.atrPercent || 'N/A'}%`);
if (volatilityResult.reason) {
  console.log(`Reason: ${volatilityResult.reason}`);
}

// Test 3: News Check
console.log('\n📊 Test 3: News Check');
console.log('─'.repeat(70));

const newsResult = await checkNews(symbol);
console.log(`Result: ${newsResult.pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Hot posts (2h): ${newsResult.hotPostCount}`);
if (newsResult.reason) {
  console.log(`Reason: ${newsResult.reason}`);
}

// Test 4: Combined Disqualifiers
console.log('\n📊 Test 4: All Disqualifiers Combined');
console.log('─'.repeat(70));

const disqualifierResult = await runDisqualifiers(symbol, candles, currentPrice);
console.log(`Overall: ${disqualifierResult.pass ? '✅ PASS - Signal allowed' : '❌ FAIL - Signal blocked'}`);

if (!disqualifierResult.pass) {
  console.log('\nFailed checks:');
  disqualifierResult.reasons.forEach(reason => {
    console.log(`  ⛔ ${reason}`);
  });
}

console.log('\n✅ All checks:');
disqualifierResult.checks.forEach(check => {
  const status = check.pass ? '✅' : '❌';
  console.log(`  ${status} ${check.name}`);
});

// Test 5: Paper Trading Mode
console.log('\n📊 Test 5: Paper Trading Mode');
console.log('─'.repeat(70));
console.log(`PAPER_TRADING env: ${process.env.PAPER_TRADING}`);
console.log(`Mode: ${process.env.PAPER_TRADING === 'true' ? '📝 Paper Trading' : '🔴 Live Trading'}`);

console.log('\n═'.repeat(70));
console.log('✅ Risk filter tests complete!\n');

process.exit(0);
