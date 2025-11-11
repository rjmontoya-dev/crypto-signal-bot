import dotenv from 'dotenv';
import cron from 'node-cron';
import { fetchOHLCV, getFundingRate, calculateIndicators, generateSignal } from './analyzer.js';
import { sendSignal, sendMessage, initTelegram, getOpenTradesCount } from './messenger.js';

// Load environment variables
dotenv.config();

console.log('🤖 Crypto Signal Bot Starting...');
console.log('═'.repeat(70));
console.log('📊 Exchange:', process.env.EXCHANGE);
console.log('🪙 Tokens:', process.env.TOKENS);
console.log('⏰ Timeframe:', process.env.TIMEFRAME);
console.log('🧪 Paper Trading:', process.env.PAPER_TRADING);
console.log('🚦 Max Open Trades:', process.env.MAX_OPEN_TRADES || 1);
console.log('═'.repeat(70));
console.log('');

// ============================================================================
// DAILY SCAN FUNCTION
// ============================================================================

/**
 * Daily market scan - checks all tokens for trading signals
 */
async function dailyScan() {
  const startTime = new Date();
  console.log('\n🔍 Starting daily market scan...');
  console.log(`⏰ Scan time: ${startTime.toLocaleString()} (${startTime.toISOString()})`);
  console.log('═'.repeat(70));
  
  // Check max open trades
  const maxOpenTrades = parseInt(process.env.MAX_OPEN_TRADES || '1');
  const openTradesCount = getOpenTradesCount();
  
  console.log(`📊 Open Trades: ${openTradesCount}/${maxOpenTrades}`);
  
  if (openTradesCount >= maxOpenTrades) {
    console.log('⚠️  Max open trades reached. No new signals will be generated.');
    console.log('💡 Use /log command to close existing trades\n');
    
    // Send alert to Telegram if not in paper trading mode
    if (process.env.PAPER_TRADING !== 'true') {
      await sendMessage('⚠️ Max open trades reached. No new signals until current trades are closed.');
    }
    
    return;
  }
  
  const tokens = process.env.TOKENS.split(',').map(t => t.trim());
  const timeframe = process.env.TIMEFRAME || '4h';
  
  let scannedCount = 0;
  let signalsGenerated = 0;
  let errorCount = 0;
  const generatedSignals = [];
  
  // Scan each token sequentially to avoid rate limits
  for (const token of tokens) {
    console.log(`\n📊 Analyzing ${token}...`);
    
    try {
      // Fetch market data
      console.log(`   🔄 Fetching ${timeframe} candles...`);
      const candles = await fetchOHLCV(token, timeframe, 100);
      
      if (candles.length === 0) {
        console.log(`   ⚠️  No data available for ${token}`);
        errorCount++;
        continue;
      }
      
      const currentPrice = candles[candles.length - 1].close;
      console.log(`   ✅ Data fetched (Price: $${currentPrice.toLocaleString()})`);
      
      // Get funding rate
      const fundingRate = await getFundingRate(token);
      
      // Calculate indicators
      console.log(`   📈 Calculating indicators...`);
      const indicators = calculateIndicators(candles);
      
      if (!indicators) {
        console.log(`   ⚠️  Insufficient candles for ${token}`);
        errorCount++;
        continue;
      }
      
      console.log(`   ✅ Indicators calculated`);
      
      // Generate signal (now async - includes disqualifier checks)
      console.log(`   🎯 Evaluating signal criteria...`);
      const signal = await generateSignal(token, indicators, candles, currentPrice, fundingRate);
      
      scannedCount++;
      
      // Check if disqualified
      if (signal && signal.disqualified) {
        console.log(`   ⛔ Signal disqualified`);
        signal.reasons.forEach(reason => console.log(`      • ${reason}`));
        continue; // Skip to next token
      }
      
      if (signal) {
        console.log(`   ✅ SIGNAL GENERATED: ${signal.direction}`);
        console.log(`      Entry: $${signal.entry.toLocaleString()}, TP: $${signal.tp.toLocaleString()}, SL: $${signal.sl.toLocaleString()}`);
        console.log(`      Score: ${signal.score}/${signal.maxScore}`);
        
        // Check PAPER_TRADING mode
        const paperTrading = process.env.PAPER_TRADING === 'true';
        
        if (paperTrading) {
          console.log(`   📝 PAPER TRADING MODE - Signal logged (no Telegram alert)`);
          // Still log to database via sendSignal, but it won't send to Telegram
          await sendSignal(signal);
          signalsGenerated++;
          generatedSignals.push(signal);
        } else {
          // Live mode - send to Telegram
          console.log(`   📱 Sending to Telegram...`);
          const sent = await sendSignal(signal);
          
          if (sent) {
            console.log(`   ✅ Alert sent successfully`);
            signalsGenerated++;
            generatedSignals.push(signal);
          } else {
            console.log(`   ⚠️  Failed to send alert`);
          }
        }
        
      } else {
        console.log(`   ⏸️  No signal - score below threshold`);
      }
      
      // Small delay between tokens to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`   ❌ Error processing ${token}:`, error.message);
      errorCount++;
      // Continue with next token
    }
  }
  
  // Summary
  const endTime = new Date();
  const duration = ((endTime - startTime) / 1000).toFixed(1);
  
  console.log('\n' + '═'.repeat(70));
  console.log('📊 SCAN SUMMARY');
  console.log('═'.repeat(70));
  console.log(`✅ Tokens scanned: ${scannedCount}/${tokens.length}`);
  console.log(`🚨 Signals generated: ${signalsGenerated}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`⏱️  Duration: ${duration}s`);
  
  if (generatedSignals.length > 0) {
    console.log('\n🎯 Active Signals:');
    generatedSignals.forEach((sig, idx) => {
      console.log(`   ${idx + 1}. ${sig.symbol} ${sig.direction} - Score: ${sig.score}/${sig.maxScore}`);
    });
  }
  
  console.log('═'.repeat(70));
  console.log(`✅ Scan complete at ${endTime.toLocaleString()}\n`);
  
  // Send summary to Telegram if there were signals
  if (signalsGenerated > 0) {
    const summaryMsg = `📊 Daily Scan Complete\n\n✅ Scanned: ${scannedCount} tokens\n🚨 Signals: ${signalsGenerated}\n⏱️ Duration: ${duration}s`;
    await sendMessage(summaryMsg);
  }
}

// ============================================================================
// SCHEDULER & STARTUP
// ============================================================================

/**
 * Initialize and start the bot
 */
async function startBot() {
  console.log('🚀 Initializing bot components...\n');
  
  // Initialize Telegram bot
  console.log('📱 Starting Telegram bot...');
  initTelegram();
  console.log('✅ Telegram bot ready\n');
  
  // Schedule daily scan at 08:00 UTC
  console.log('⏰ Setting up daily schedule...');
  cron.schedule('0 8 * * *', async () => {
    console.log('\n⏰ Scheduled scan triggered (08:00 UTC)');
    await dailyScan();
  }, {
    timezone: 'UTC'
  });
  
  console.log('✅ Daily scan scheduled for 08:00 UTC\n');
  
  // Calculate next scan time
  const now = new Date();
  const next = new Date();
  next.setUTCHours(8, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  
  console.log(`📅 Next scheduled scan: ${next.toLocaleString()} UTC`);
  console.log('═'.repeat(70));
  
  // Run immediate scan for testing
  console.log('\n🧪 Running immediate scan for testing...');
  await dailyScan();
  
  console.log('\n✅ Bot is now running. Waiting for scheduled scans...');
  console.log('💡 Press Ctrl+C to stop the bot\n');
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

/**
 * Handle graceful shutdown
 */
function setupShutdownHandlers() {
  const shutdown = (signal) => {
    console.log(`\n\n⚠️  Received ${signal}. Shutting down gracefully...`);
    
    // Give pending operations time to complete
    setTimeout(() => {
      console.log('✅ Bot stopped.');
      process.exit(0);
    }, 1000);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

// Set up shutdown handlers
setupShutdownHandlers();

// Start the bot
startBot().catch(error => {
  console.error('❌ Fatal error starting bot:', error);
  process.exit(1);
});
