/**
 * Demo signal generation with simulated trigger
 * This shows what a signal looks like when score >= 7
 */
import { generateSignal } from './src/analyzer.js';

// Simulated indicators that would trigger a LONG signal
const mockIndicators = {
  rsi: 28, // Oversold
  macd: {
    histogram: 150, // Positive
    line: 100,
    signal: -50
  },
  ema50: 100000,
  volumeAvg: 1000,
  volumeRatio: 1.8 // High volume
};

const mockPrice = 102000; // Above EMA would give more points
const mockFundingRate = -0.025; // Strongly negative

// Mock candles for disqualifier checks
const mockCandles = [
  { close: 100000, high: 101000, low: 99000, volume: 1000 },
  { close: 101000, high: 102000, low: 100000, volume: 1200 },
  { close: 102000, high: 103000, low: 101000, volume: 1800 }
];

console.log('🎬 DEMO: Signal Generation with Mock Data\n');
console.log('Creating conditions that trigger a signal...\n');

console.log('Mock Market Conditions:');
console.log(`  Price: $${mockPrice.toLocaleString()}`);
console.log(`  RSI: ${mockIndicators.rsi} (oversold)`);
console.log(`  MACD Histogram: ${mockIndicators.macd.histogram} (bullish)`);
console.log(`  Volume Ratio: ${mockIndicators.volumeRatio}x (high)`);
console.log(`  Funding Rate: ${(mockFundingRate * 100).toFixed(3)}% (shorts pay longs)`);
console.log('');

const signal = await generateSignal('BTC/USDT', mockIndicators, mockCandles, mockPrice, mockFundingRate);

if (signal && !signal.disqualified) {
  console.log('✅ SIGNAL GENERATED!\n');
  console.log('═'.repeat(70));
  console.log(JSON.stringify(signal, null, 2));
  console.log('═'.repeat(70));
  
  console.log('\n📊 Risk/Reward Calculation:');
  const riskAmount = signal.entry - signal.sl;
  const rewardAmount = signal.tp - signal.entry;
  const rrRatio = (rewardAmount / riskAmount).toFixed(2);
  
  console.log(`  Entry:  $${signal.entry.toLocaleString()}`);
  console.log(`  TP:     $${signal.tp.toLocaleString()} (+$${rewardAmount.toLocaleString()})`);
  console.log(`  SL:     $${signal.sl.toLocaleString()} (-$${riskAmount.toLocaleString()})`);
  console.log(`  R:R:    ${rrRatio}:1`);
  console.log('');
} else if (signal && signal.disqualified) {
  console.log('⚠️  Signal disqualified by risk filters:');
  signal.reasons.forEach(reason => console.log(`   - ${reason}`));
  console.log('');
} else {
  console.log('⚠️  No signal generated (score < 7)');
}
