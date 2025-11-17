import dotenv from 'dotenv';
import cron from 'node-cron';
import { fetchOHLCV, getFundingRate, calculateIndicators, generateSignal } from '../signals/analyzer.js';
import { sendSignal, sendMessage, initTelegram, getOpenTradesCount } from '../telegram/messenger.js';
import { startWebServer } from '../server/index.js';

// Load environment variables
dotenv.config();

console.log('🤖 Crypto Signal Bot Starting...');
console.log('═'.repeat(70));
console.log('📊 Exchange:', process.env.EXCHANGE);
console.log('🪙 Tokens:', process.env.TOKENS);
console.log('⏰ Timeframe:', process.env.TIMEFRAME);
console.log('🧪 Paper Trading:', process.env.PAPER_TRADING);
console.log('🚦 Max Open Trades:', process.env.MAX_OPEN_TRADES || 1);
console.log('🔒 Hourly scanning enabled with daily lockout');
console.log('═'.repeat(70));
console.log('');

// ============================================================================
// DAILY LOCKOUT SYSTEM
// ============================================================================

// Track if signal was sent today (resets at 00:00 UTC)
let signalSentToday = false;

// Track daily trade count (independent of whether trades are closed)
let dailyTradeCount = 0;

/**
 * Reset the daily lock at 00:00 UTC
 */
function resetDailyLock() {
  signalSentToday = false;
  dailyTradeCount = 0;
  console.log('🔓 Daily lock reset at 00:00 UTC - scanning resumes');
  console.log('🔢 Daily trade counter reset to 0');
}

/**
 * Manually reset the lock (for /reset command)
 */
export function manualResetLock() {
  signalSentToday = false;
  dailyTradeCount = 0;
  console.log('🔓 Manual lock reset via /reset command');
  console.log('🔢 Daily trade counter reset to 0');
  return '✅ Daily lock cleared and trade counter reset. Scanning will resume on next hourly check.';
}

// ============================================================================
// DAILY SCAN FUNCTION
// ============================================================================

/**
 * Daily market scan - checks all tokens for trading signals
 */
async function dailyScan() {
  const startTime = new Date();
  console.log('\n🔍 Starting hourly market scan...');
  console.log(`⏰ Scan time: ${startTime.toLocaleString()} (${startTime.toISOString()})`);
  console.log('═'.repeat(70));
  
  // Check if signal already sent today
  if (signalSentToday) {
    console.log('🔒 Signal already sent today. Skipping.');
    console.log('💡 Next scan will occur at 00:00 UTC or use /reset command\n');
    return;
  }
  
  // Check max daily trades
  const maxDailyTrades = parseInt(process.env.MAX_OPEN_TRADES || '1');
  const openTradesCount = getOpenTradesCount();
  
  console.log(`📊 Daily Trades: ${dailyTradeCount}/${maxDailyTrades} | Open Trades: ${openTradesCount}`);
  
  if (dailyTradeCount >= maxDailyTrades) {
    console.log('⚠️  Max daily trades reached. No new signals will be generated today.');
    console.log('💡 Counter resets at 00:00 UTC or use /reset command\n');
    
    // Send alert to Telegram if not in paper trading mode
    if (process.env.PAPER_TRADING !== 'true') {
      await sendMessage('⚠️ Max daily trades reached. No new signals until tomorrow or /reset.');
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
          
          // Increment daily trade counter
          dailyTradeCount++;
          
          // Set lock - first qualifying signal stops further alerts for the day
          signalSentToday = true;
          console.log(`   🔒 Daily lock activated - no more signals until 00:00 UTC`);
          console.log(`   🔢 Daily trade count: ${dailyTradeCount}/${maxDailyTrades}`);
        } else {
          // Live mode - send to Telegram
          console.log(`   📱 Sending to Telegram...`);
          const sent = await sendSignal(signal);
          
          if (sent) {
            console.log(`   ✅ Alert sent successfully`);
            signalsGenerated++;
            generatedSignals.push(signal);
            
            // Increment daily trade counter
            dailyTradeCount++;
            
            // Set lock - first qualifying signal stops further alerts for the day
            signalSentToday = true;
            console.log(`   🔒 Daily lock activated - no more signals until 00:00 UTC`);
            console.log(`   🔢 Daily trade count: ${dailyTradeCount}/${maxDailyTrades}`);
          } else {
            console.log(`   ⚠️  Failed to send alert`);
          }
        }
        
        // Break loop after first signal is sent
        break;
        
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

/**
 * Trigger manual scan from UI (exported for API)
 */
export function triggerManualScan() {
  console.log('🎯 Manual scan triggered from UI');
  dailyScan().catch(error => {
    console.error('❌ Manual scan failed:', error);
  });
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
  
  // Start web dashboard
  console.log('🌐 Starting web dashboard...');
  startWebServer();
  console.log('');
  
  // Schedule hourly scan
  console.log('⏰ Setting up hourly scan schedule...');
  cron.schedule('0 * * * *', async () => {
    console.log('\n⏰ Hourly scan triggered');
    await dailyScan();
  }, {
    timezone: 'UTC'
  });
  
  console.log('✅ Hourly scan scheduled (top of every hour)\n');
  
  // Schedule daily lock reset at 00:00 UTC
  console.log('🔒 Setting up daily lock reset...');
  cron.schedule('0 0 * * *', () => {
    resetDailyLock();
  }, {
    timezone: 'UTC'
  });
  
  console.log('✅ Daily lock reset scheduled for 00:00 UTC\n');
  
  // Calculate next scan time
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  
  console.log(`📅 Next hourly scan: ${nextHour.toLocaleString()} UTC`);
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
