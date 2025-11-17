/**
 * Detailed signal analysis test - Shows all rule evaluations
 */
import dotenv from 'dotenv';
import { fetchOHLCV, getFundingRate, calculateIndicators, scoreSignal } from '../src/signals/analyzer.js';

dotenv.config();

async function detailedTest() {
  console.log('🔬 DETAILED SIGNAL ANALYSIS\n');
  console.log('This test shows which rules pass/fail for each token\n');
  console.log('═'.repeat(80));
  
  const tokens = ['BTC/USDT']; // Test with BTC first
  const timeframe = process.env.TIMEFRAME || '4h';
  
  for (const token of tokens) {
    console.log(`\n📊 ${token} Analysis`);
    console.log('─'.repeat(80));
    
    // Fetch data
    const candles = await fetchOHLCV(token, timeframe, 100);
    const currentPrice = candles[candles.length - 1].close;
    const fundingRate = await getFundingRate(token);
    const indicators = calculateIndicators(candles);
    
    if (!indicators) {
      console.log('❌ Insufficient data');
      continue;
    }
    
    // Display market data
    console.log('\n📈 Market Data:');
    console.log(`   Price: $${currentPrice.toLocaleString()}`);
    console.log(`   RSI: ${indicators.rsi}`);
    console.log(`   MACD Histogram: ${indicators.macd.histogram}`);
    console.log(`   MACD Line: ${indicators.macd.line}`);
    console.log(`   MACD Signal: ${indicators.macd.signal}`);
    console.log(`   EMA50: $${indicators.ema50.toLocaleString()}`);
    console.log(`   Volume Ratio: ${indicators.volumeRatio}x`);
    console.log(`   Funding Rate: ${(fundingRate * 100).toFixed(4)}%`);
    
    // Test LONG rules
    console.log('\n🟢 LONG RULES EVALUATION:');
    const longScore = scoreSignal(indicators, currentPrice, fundingRate, 'LONG');
    console.log(`   Total Score: ${longScore.score}/${longScore.maxScore} (${((longScore.score/longScore.maxScore)*100).toFixed(0)}%)`);
    console.log('   Rules:');
    longScore.reasoning.forEach(r => console.log(`      ${r}`));
    
    // Test SHORT rules
    console.log('\n🔴 SHORT RULES EVALUATION:');
    const shortScore = scoreSignal(indicators, currentPrice, fundingRate, 'SHORT');
    console.log(`   Total Score: ${shortScore.score}/${shortScore.maxScore} (${((shortScore.score/shortScore.maxScore)*100).toFixed(0)}%)`);
    console.log('   Rules:');
    shortScore.reasoning.forEach(r => console.log(`      ${r}`));
    
    // Verdict
    console.log('\n⚖️  VERDICT:');
    if (longScore.score >= 7) {
      console.log(`   ✅ LONG signal would trigger (score: ${longScore.score})`);
    } else if (shortScore.score >= 7) {
      console.log(`   ✅ SHORT signal would trigger (score: ${shortScore.score})`);
    } else {
      console.log(`   ⏸️  No signal (both scores below 7 threshold)`);
      console.log(`   💡 LONG needs ${(7 - longScore.score).toFixed(1)} more points`);
      console.log(`   💡 SHORT needs ${(7 - shortScore.score).toFixed(1)} more points`);
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log('✅ Detailed analysis complete.\n');
}

detailedTest().catch(console.error);
