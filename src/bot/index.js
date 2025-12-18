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
console.log('🚦 Max Signals Per Day:', process.env.MAX_OPEN_TRADES || 1);
console.log('⏰ Hourly scanning enabled with daily limit');
console.log('═'.repeat(70));
console.log('');

// ============================================================================
// DAILY LOCKOUT SYSTEM
// ============================================================================

// Track daily trade count (independent of whether trades are closed)
let dailyTradeCount = 0;

// Track cron job state
let cronEnabled = true;
let hourlyScanTask = null;
let dailyResetTask = null;

// Track Telegram notification state
let telegramEnabled = true;

// Track current timeframe (default from env)
let currentTimeframe = process.env.TIMEFRAME || '4h';

/**
 * Set timeframe for scanning
 */
export function setTimeframe(timeframe) {
  const validTimeframes = ['15m', '30m', '1h', '4h', '1d'];
  if (!validTimeframes.includes(timeframe)) {
    return { 
      success: false, 
      error: 'Invalid timeframe. Must be one of: ' + validTimeframes.join(', ') 
    };
  }
  
  currentTimeframe = timeframe;
  console.log(`⏰ Timeframe updated to: ${timeframe}`);
  return { 
    success: true, 
    timeframe: currentTimeframe,
    message: `Timeframe updated to ${timeframe}` 
  };
}

/**
 * Get current timeframe
 */
export function getTimeframe() {
  return currentTimeframe;
}

/**
 * Get Telegram status
 */
export function getTelegramStatus() {
  return { enabled: telegramEnabled };
}

/**
 * Enable Telegram notifications
 */
export function enableTelegram() {
  telegramEnabled = true;
  console.log('✅ Telegram notifications enabled');
  return { 
    success: true, 
    enabled: true,
    message: 'Telegram notifications enabled. Signals will be sent to Telegram.' 
  };
}

/**
 * Disable Telegram notifications
 */
export function disableTelegram() {
  telegramEnabled = false;
  console.log('⏸️  Telegram notifications disabled');
  return { 
    success: true, 
    enabled: false,
    message: 'Telegram notifications disabled. Signals will only be logged to database.' 
  };
}

/**
 * Get cron status
 */
export function getCronStatus() {
  return { enabled: cronEnabled };
}

/**
 * Enable cron jobs
 */
export function enableCron() {
  cronEnabled = true;
  console.log('✅ Automated scans ENABLED');
  return { success: true, enabled: true, message: 'Automated scans enabled' };
}

/**
 * Disable cron jobs
 */
export function disableCron() {
  cronEnabled = false;
  console.log('⏸️  Automated scans DISABLED (manual scans still available)');
  return { success: true, enabled: false, message: 'Automated scans disabled. Use manual scan button.' };
}

/**
 * Reset the daily lock at 00:00 UTC
 */
function resetDailyLock() {
  dailyTradeCount = 0;
  console.log('🔓 Daily trade counter reset at 00:00 UTC');
}

/**
 * Manually reset the lock (for /reset command)
 */
export function manualResetLock() {
  dailyTradeCount = 0;
  console.log('🔓 Manual trade counter reset via /reset command');
  return '✅ Daily trade counter reset. Scanning will resume on next hourly check.';
}

// ============================================================================
// DAILY SCAN FUNCTION
// ============================================================================

/**
 * Daily market scan - checks all tokens for trading signals
 */
async function dailyScan(isManual = false) {
  const startTime = new Date();
  
  // Check if cron is enabled (only for automated scans)
  if (!isManual && !cronEnabled) {
    console.log('⏸️  Automated scan skipped (cron disabled). Use manual scan or enable cron.');
    return;
  }
  
  console.log(isManual ? '\n🎯 Starting MANUAL market scan...' : '\n🔍 Starting hourly market scan...');
  console.log(`⏰ Scan time: ${startTime.toLocaleString()} (${startTime.toISOString()})`);
  console.log(`📊 Timeframe: ${currentTimeframe}`);
  console.log('═'.repeat(70));
  
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
  const timeframe = currentTimeframe; // Use dynamic timeframe
  
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
      const candles = await fetchOHLCV(token, timeframe, 200);
      
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
      const signal = await generateSignal(token, indicators, candles, currentPrice, fundingRate, timeframe);
      
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
        
        // Check PAPER_TRADING mode and Telegram status
        const paperTrading = process.env.PAPER_TRADING === 'true';
        const shouldSendToTelegram = !paperTrading && telegramEnabled;
        
        if (!shouldSendToTelegram) {
          const reason = paperTrading ? 'PAPER TRADING MODE' : 'Telegram disabled';
          console.log(`   📝 ${reason} - Signal logged (no Telegram alert)`);
        } else {
          console.log(`   📱 Sending to Telegram...`);
        }
        
        // Send signal (logs to DB, sends to Telegram if enabled)
        const sent = await sendSignal(signal, shouldSendToTelegram);
        
        if (sent) {
          if (shouldSendToTelegram) {
            console.log(`   ✅ Alert sent successfully`);
          } else {
            console.log(`   ✅ Signal logged to database`);
          }
          
          signalsGenerated++;
          generatedSignals.push(signal);
          
          // Increment daily trade counter
          dailyTradeCount++;
          
          console.log(`   🔢 Daily trade count: ${dailyTradeCount}/${maxDailyTrades}`);
          
          // Break loop after first signal is successfully sent
          break;
        } else {
          console.log(`   ⚠️  Failed to send alert - continuing to next token`);
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

/**
 * Trigger manual scan from UI (exported for API)
 */
export function triggerManualScan() {
  console.log('🎯 Manual scan triggered from UI');
  dailyScan(true).catch(error => {
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
  hourlyScanTask = cron.schedule('0 * * * *', async () => {
    console.log('\n⏰ Hourly scan triggered');
    await dailyScan(false);
  }, {
    timezone: 'UTC'
  });
  
  console.log('✅ Hourly scan scheduled (top of every hour)\n');
  
  // Schedule daily lock reset at 00:00 UTC
  console.log('🔒 Setting up daily lock reset...');
  dailyResetTask = cron.schedule('0 0 * * *', () => {
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
  await dailyScan(true);
  
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
