import ccxt from 'ccxt';
import dotenv from 'dotenv';
import { RSI, MACD, EMA, SMA, ATR } from 'technicalindicators';
import axios from 'axios';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Exchange instance (lazy-loaded)
let exchange = null;

// News cache (1 hour TTL)
let newsCache = {
  data: null,
  timestamp: null,
  ttl: 3600000 // 1 hour in ms
};

// ============================================================================
// TRADING RULES - Scoring Checklist
// ============================================================================

/**
 * LONG signal rules with weights and reasons
 */
const LONG_RULES = [
  // RSI Rules
  {
    id: 'rsi_oversold',
    check: (i) => i.rsi < 30,
    weight: 2,
    reason: 'RSI oversold (<30)'
  },
  {
    id: 'rsi_recovering',
    check: (i) => i.rsi >= 30 && i.rsi < 40,
    weight: 1.5,
    reason: 'RSI recovering from oversold (30-40)'
  },
  
  // MACD Rules
  {
    id: 'macd_bullish',
    check: (i) => i.macd.histogram > 0 && i.macd.line > i.macd.signal,
    weight: 2,
    reason: 'MACD bullish crossover confirmed'
  },
  {
    id: 'macd_momentum_increasing',
    check: (i) => i.macd.histogram > 0,
    weight: 1.5,
    reason: 'MACD histogram positive (bullish momentum)'
  },
  
  // EMA Rules
  {
    id: 'price_above_ema',
    check: (i, price) => price > i.ema50,
    weight: 1.5,
    reason: 'Price above EMA50 (uptrend)'
  },
  {
    id: 'price_near_ema_support',
    check: (i, price) => price < i.ema50 && (i.ema50 - price) / price < 0.02,
    weight: 2,
    reason: 'Price near EMA50 support (within 2%)'
  },
  
  // Volume Rules
  {
    id: 'volume_spike',
    check: (i) => i.volumeRatio > 1.5,
    weight: 1.5,
    reason: 'Volume spike >1.5x average'
  },
  {
    id: 'volume_strong',
    check: (i) => i.volumeRatio > 1.2,
    weight: 1,
    reason: 'Above average volume >1.2x'
  },
  
  // Funding Rate Rules (Futures)
  {
    id: 'funding_negative_strong',
    check: (funding) => funding < -0.02,
    weight: 2,
    reason: 'Funding rate strongly negative (<-0.02%) - shorts pay longs'
  },
  {
    id: 'funding_negative',
    check: (funding) => funding < -0.005 && funding >= -0.02,
    weight: 1,
    reason: 'Funding rate negative - short bias in market'
  }
];

/**
 * SHORT signal rules with weights and reasons
 */
const SHORT_RULES = [
  // RSI Rules
  {
    id: 'rsi_overbought',
    check: (i) => i.rsi > 70,
    weight: 2,
    reason: 'RSI overbought (>70)'
  },
  {
    id: 'rsi_weakening',
    check: (i) => i.rsi >= 60 && i.rsi <= 70,
    weight: 1.5,
    reason: 'RSI weakening from overbought (60-70)'
  },
  
  // MACD Rules
  {
    id: 'macd_bearish',
    check: (i) => i.macd.histogram < 0 && i.macd.line < i.macd.signal,
    weight: 2,
    reason: 'MACD bearish crossover confirmed'
  },
  {
    id: 'macd_momentum_decreasing',
    check: (i) => i.macd.histogram < 0,
    weight: 1.5,
    reason: 'MACD histogram negative (bearish momentum)'
  },
  
  // EMA Rules
  {
    id: 'price_below_ema',
    check: (i, price) => price < i.ema50,
    weight: 1.5,
    reason: 'Price below EMA50 (downtrend)'
  },
  {
    id: 'price_near_ema_resistance',
    check: (i, price) => price > i.ema50 && (price - i.ema50) / price < 0.02,
    weight: 2,
    reason: 'Price near EMA50 resistance (within 2%)'
  },
  
  // Volume Rules
  {
    id: 'volume_spike',
    check: (i) => i.volumeRatio > 1.5,
    weight: 1.5,
    reason: 'Volume spike >1.5x average'
  },
  {
    id: 'volume_strong',
    check: (i) => i.volumeRatio > 1.2,
    weight: 1,
    reason: 'Above average volume >1.2x'
  },
  
  // Funding Rate Rules (Futures)
  {
    id: 'funding_positive_strong',
    check: (funding) => funding > 0.02,
    weight: 2,
    reason: 'Funding rate strongly positive (>0.02%) - longs pay shorts'
  },
  {
    id: 'funding_positive',
    check: (funding) => funding > 0.005 && funding <= 0.02,
    weight: 1,
    reason: 'Funding rate positive - long bias in market'
  }
];

/**
 * Get or create exchange instance
 */
function getExchange() {
  if (!exchange) {
    const exchangeName = process.env.EXCHANGE || 'binance';
    exchange = new ccxt[exchangeName]({
      enableRateLimit: true,
    });
  }
  return exchange;
}

/**
 * Fetch OHLCV candlestick data for a symbol
 * @param {string} symbol - Trading pair (e.g., 'BTC/USDT')
 * @param {string} timeframe - Candle timeframe (e.g., '4h')
 * @param {number} limit - Number of candles to fetch
 * @returns {Array} Array of candle objects [{timestamp, open, high, low, close, volume}, ...]
 */
export async function fetchOHLCV(symbol, timeframe, limit = 100) {
  // Default to configured timeframe if not provided
  if (!timeframe) {
    timeframe = process.env.TIMEFRAME || '4h';
  }
  try {
    const ex = getExchange();
    const ohlcv = await ex.fetchOHLCV(symbol, timeframe, undefined, limit);
    
    // Convert CCXT format [timestamp, open, high, low, close, volume] to objects
    return ohlcv.map(candle => ({
      timestamp: candle[0],
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5]
    }));
  } catch (error) {
    console.warn(`⚠️  Failed to fetch OHLCV for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Get current funding rate for a futures symbol
 * @param {string} symbol - Trading pair (e.g., 'BTC/USDT' or 'BTCUSDT')
 * @returns {number} Funding rate as decimal (e.g., 0.0003 for 0.03%)
 */
export async function getFundingRate(symbol) {
  try {
    const ex = getExchange();
    
    // Try to fetch funding rate - will only work for futures contracts
    // Binance futures symbols are typically without slash: BTCUSDT not BTC/USDT
    const fundingRate = await ex.fetchFundingRate(symbol);
    return fundingRate.fundingRate || 0;
  } catch (error) {
    // Spot pairs don't have funding rates - this is expected
    if (error.message.includes('contracts only') || 
        error.message.includes('spot') || 
        error.message.includes('not found') ||
        error.message.includes('does not have')) {
      return 0; // Return 0 for spot markets (no funding rate)
    }
    // Only warn on unexpected errors
    console.warn(`⚠️  Unexpected error fetching funding rate for ${symbol}:`, error.message);
    return 0;
  }
}

// ============================================================================
// RISK FILTERS & DISQUALIFIERS
// ============================================================================

/**
 * Check 24h volume liquidity
 * @param {string} symbol - Trading pair
 * @returns {Object} { pass: boolean, volume: number, reason: string }
 */
export async function checkLiquidity(symbol) {
  try {
    const ex = getExchange();
    const ticker = await ex.fetchTicker(symbol);
    const volume24h = ticker.quoteVolume || 0; // 24h volume in USDT
    
    const MIN_VOLUME = 100000000; // $100M
    const pass = volume24h >= MIN_VOLUME;
    
    return {
      pass,
      volume: volume24h,
      reason: pass ? null : `Low liquidity: $${(volume24h / 1000000).toFixed(1)}M (min: $100M)`
    };
  } catch (error) {
    console.warn(`⚠️  Failed to check liquidity for ${symbol}:`, error.message);
    // On error, allow signal (don't block on API failure)
    return { pass: true, volume: null, reason: null };
  }
}

/**
 * Check volatility using ATR
 * @param {Array} candles - OHLCV candles
 * @param {number} currentPrice - Current price
 * @returns {Object} { pass: boolean, atr: number, atrPercent: number, reason: string }
 */
export function checkVolatility(candles, currentPrice) {
  try {
    if (!candles || candles.length < 14) {
      return { pass: true, atr: null, atrPercent: null, reason: null };
    }
    
    // Calculate ATR(14)
    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    const close = candles.map(c => c.close);
    
    const atrValues = ATR.calculate({
      high,
      low,
      close,
      period: 14
    });
    
    if (atrValues.length === 0) {
      return { pass: true, atr: null, atrPercent: null, reason: null };
    }
    
    const latestATR = atrValues[atrValues.length - 1];
    const atrPercent = (latestATR / currentPrice) * 100;
    
    const MAX_ATR_PERCENT = 3; // 3%
    const pass = atrPercent <= MAX_ATR_PERCENT;
    
    return {
      pass,
      atr: latestATR,
      atrPercent: parseFloat(atrPercent.toFixed(2)),
      reason: pass ? null : `High volatility: ATR ${atrPercent.toFixed(2)}% (max: ${MAX_ATR_PERCENT}%)`
    };
  } catch (error) {
    console.warn(`⚠️  Failed to calculate ATR:`, error.message);
    return { pass: true, atr: null, atrPercent: null, reason: null };
  }
}

/**
 * Check for hot news events
 * @param {string} symbol - Trading pair (e.g., 'BTC/USDT')
 * @returns {Object} { pass: boolean, hotPostCount: number, reason: string }
 */
export async function checkNews(symbol) {
  try {
    // Extract currency code (BTC from BTC/USDT)
    const currency = symbol.split('/')[0];
    
    // Check cache first
    const now = Date.now();
    if (newsCache.data && newsCache.timestamp && (now - newsCache.timestamp) < newsCache.ttl) {
      const cachedResult = newsCache.data[currency];
      if (cachedResult) {
        return cachedResult;
      }
    }
    
    // Get API token from env (optional)
    const apiToken = process.env.CRYPTOPANIC_API_TOKEN;
    if (!apiToken || apiToken === 'your_cryptopanic_api_token') {
      // No API token, skip news check
      return { pass: true, hotPostCount: 0, reason: null };
    }
    
    // Fetch hot news from CryptoPanic
    const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${apiToken}&currencies=${currency}&filter=hot`;
    const response = await axios.get(url, { timeout: 5000 });
    
    const posts = response.data.results || [];
    
    // Count posts in last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentHotPosts = posts.filter(post => {
      const postTime = new Date(post.published_at);
      return postTime > twoHoursAgo;
    });
    
    const hotPostCount = recentHotPosts.length;
    const MAX_HOT_POSTS = 2;
    const pass = hotPostCount < MAX_HOT_POSTS;
    
    const result = {
      pass,
      hotPostCount,
      reason: pass ? null : `High news activity: ${hotPostCount} hot posts in 2h (max: ${MAX_HOT_POSTS - 1})`
    };
    
    // Cache result
    if (!newsCache.data) newsCache.data = {};
    newsCache.data[currency] = result;
    newsCache.timestamp = now;
    
    return result;
    
  } catch (error) {
    // On API error, don't block signals
    console.warn(`⚠️  Failed to check news for ${symbol}:`, error.message);
    return { pass: true, hotPostCount: 0, reason: null };
  }
}

/**
 * Run all disqualifier checks
 * @param {string} symbol - Trading pair
 * @param {Array} candles - OHLCV candles
 * @param {number} currentPrice - Current price
 * @returns {Object} { pass: boolean, reasons: Array }
 */
export async function runDisqualifiers(symbol, candles, currentPrice) {
  const checks = [];
  
  // Liquidity check
  const liquidityResult = await checkLiquidity(symbol);
  checks.push({ name: 'Liquidity', ...liquidityResult });
  
  // Volatility check
  const volatilityResult = checkVolatility(candles, currentPrice);
  checks.push({ name: 'Volatility', ...volatilityResult });
  
  // News check
  const newsResult = await checkNews(symbol);
  checks.push({ name: 'News', ...newsResult });
  
  // Collect all failed checks
  const failedChecks = checks.filter(c => !c.pass);
  const pass = failedChecks.length === 0;
  
  return {
    pass,
    checks,
    reasons: failedChecks.map(c => c.reason).filter(Boolean)
  };
}

/**
 * Calculate technical indicators from OHLCV candle data
 * @param {Array} candles - Array of OHLCV objects from fetchOHLCV()
 * @returns {Object|null} Latest indicator values or null if insufficient data
 */
export function calculateIndicators(candles) {
  // Need at least 50 candles for EMA50
  if (!candles || candles.length < 50) {
    console.warn('⚠️  Insufficient data for indicators (need at least 50 candles)');
    return null;
  }

  // Extract close prices and volumes
  const closePrices = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const highPrices = candles.map(c => c.high);
  const lowPrices = candles.map(c => c.low);

  // Calculate RSI (period 14)
  const rsiValues = RSI.calculate({
    values: closePrices,
    period: 14
  });
  const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

  // Calculate MACD (fast 12, slow 26, signal 9)
  const macdValues = MACD.calculate({
    values: closePrices,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  const latestMacd = macdValues.length > 0 ? macdValues[macdValues.length - 1] : null;

  // Calculate EMA50
  const ema50Values = EMA.calculate({
    values: closePrices,
    period: 50
  });
  const ema50 = ema50Values.length > 0 ? ema50Values[ema50Values.length - 1] : null;

  // Calculate volume average (20-period SMA)
  const volumeAvgValues = SMA.calculate({
    values: volumes,
    period: 20
  });
  const volumeAvg = volumeAvgValues.length > 0 ? volumeAvgValues[volumeAvgValues.length - 1] : null;

  // Calculate volume ratio (latest volume / average volume)
  const latestVolume = volumes[volumes.length - 1];
  const volumeRatio = volumeAvg ? latestVolume / volumeAvg : null;

  // Round all values to 2 decimal places
  return {
    rsi: rsi ? parseFloat(rsi.toFixed(2)) : null,
    macd: latestMacd ? {
      histogram: parseFloat(latestMacd.histogram.toFixed(2)),
      signal: parseFloat(latestMacd.signal.toFixed(2)),
      line: parseFloat(latestMacd.MACD.toFixed(2))
    } : null,
    ema50: ema50 ? parseFloat(ema50.toFixed(2)) : null,
    volumeAvg: volumeAvg ? parseFloat(volumeAvg.toFixed(2)) : null,
    volumeRatio: volumeRatio ? parseFloat(volumeRatio.toFixed(2)) : null
  };
}

// ============================================================================
// SIGNAL SCORING ENGINE
// ============================================================================

/**
 * Score a potential signal based on trading rules
 * @param {Object} indicators - Indicator values from calculateIndicators()
 * @param {number} currentPrice - Current price of the asset
 * @param {number} fundingRate - Funding rate (for futures)
 * @param {string} direction - 'LONG' or 'SHORT'
 * @returns {Object} { score, maxScore, passedRules, reasoning }
 */
export function scoreSignal(indicators, currentPrice, fundingRate, direction) {
  if (!indicators) {
    return { score: 0, maxScore: 0, passedRules: [], reasoning: [] };
  }

  const rules = direction === 'LONG' ? LONG_RULES : SHORT_RULES;
  let score = 0;
  let maxScore = 0;
  const passedRules = [];
  const reasoning = [];

  for (const rule of rules) {
    maxScore += rule.weight;
    
    // Check if rule passes (handle both indicator and funding rate checks)
    let passes = false;
    try {
      if (rule.id.includes('funding')) {
        passes = rule.check(fundingRate);
      } else if (rule.id.includes('price')) {
        passes = rule.check(indicators, currentPrice);
      } else {
        passes = rule.check(indicators);
      }
    } catch (error) {
      // Rule check failed, skip it
      continue;
    }

    if (passes) {
      score += rule.weight;
      passedRules.push(rule.id);
      reasoning.push(`✓ ${rule.reason} [+${rule.weight}]`);
    }
  }

  return {
    score: parseFloat(score.toFixed(2)),
    maxScore: parseFloat(maxScore.toFixed(2)),
    passedRules,
    reasoning
  };
}

/**
 * Generate a complete trading signal with entry/TP/SL levels
 * @param {string} symbol - Trading pair
 * @param {Object} indicators - Indicator values from calculateIndicators()
 * @param {Array} candles - OHLCV candles (for disqualifier checks)
 * @param {number} currentPrice - Current price (latest candle close)
 * @param {number} fundingRate - Funding rate (0 for spot markets)
 * @returns {Object|null} Signal object, or { disqualified: true, reasons: [] } if failed checks
 */
export async function generateSignal(symbol, indicators, candles, currentPrice, fundingRate) {
  if (!indicators) {
    return null;
  }

  // Run disqualifier checks BEFORE scoring
  const disqualifierResult = await runDisqualifiers(symbol, candles, currentPrice);
  
  if (!disqualifierResult.pass) {
    console.log(`   ⛔ DISQUALIFIED: ${disqualifierResult.reasons.join(', ')}`);
    return {
      disqualified: true,
      symbol,
      reasons: disqualifierResult.reasons,
      checks: disqualifierResult.checks
    };
  }

  // Score both directions
  const longScore = scoreSignal(indicators, currentPrice, fundingRate, 'LONG');
  const shortScore = scoreSignal(indicators, currentPrice, fundingRate, 'SHORT');

  // Determine best direction (must have score >= 7)
  const THRESHOLD = 7;
  let signal = null;

  if (longScore.score >= THRESHOLD && longScore.score > shortScore.score) {
    // LONG signal
    const entry = Math.round(currentPrice); // Round to nearest dollar
    const tp = Math.round(entry * 1.025); // 2.5% take profit
    const sl = Math.round(entry * 0.985); // 1.5% stop loss
    
    signal = {
      symbol,
      direction: 'LONG',
      entry,
      tp,
      sl,
      score: longScore.score,
      maxScore: longScore.maxScore,
      reasons: longScore.reasoning.map(r => r.replace(/✓\s*/, '').replace(/\s*\[.*?\]/, '')),
      timestamp: new Date().toISOString()
    };

  } else if (shortScore.score >= THRESHOLD && shortScore.score > longScore.score) {
    // SHORT signal
    const entry = Math.round(currentPrice); // Round to nearest dollar
    const tp = Math.round(entry * 0.975); // 2.5% take profit (inverted)
    const sl = Math.round(entry * 1.015); // 1.5% stop loss (inverted)
    
    signal = {
      symbol,
      direction: 'SHORT',
      entry,
      tp,
      sl,
      score: shortScore.score,
      maxScore: shortScore.maxScore,
      reasons: shortScore.reasoning.map(r => r.replace(/✓\s*/, '').replace(/\s*\[.*?\]/, '')),
      timestamp: new Date().toISOString()
    };
  }

  return signal; // Returns null if score < 7
}

// ============================================================================
// PERFORMANCE ANALYSIS
// ============================================================================

/**
 * Weekly review - Calculate per-rule win rates from completed trades
 * Prints table to console (not sent to Telegram)
 */
export function weeklyReview() {
  console.log('\n📊 Weekly Performance Review');
  console.log('═'.repeat(80));
  
  try {
    // Open database
    const dbPath = path.join(__dirname, '..', 'data', 'signals.db');
    const db = new Database(dbPath, { readonly: true });
    
    // Get all completed trades with outcomes
    const completedTrades = db.prepare(`
      SELECT symbol, direction, reasons, outcome, pnl_percent 
      FROM signals 
      WHERE outcome IS NOT NULL
    `).all();
    
    if (completedTrades.length === 0) {
      console.log('⚠️  No completed trades found. Use /log command to record outcomes.\n');
      db.close();
      return;
    }
    
    console.log(`\n📈 Total Completed Trades: ${completedTrades.length}`);
    
    // Calculate overall stats
    const wins = completedTrades.filter(t => t.outcome === 'win').length;
    const losses = completedTrades.filter(t => t.outcome === 'loss').length;
    const winRate = ((wins / completedTrades.length) * 100).toFixed(1);
    const avgPnl = (completedTrades.reduce((sum, t) => sum + t.pnl_percent, 0) / completedTrades.length).toFixed(2);
    
    console.log(`✅ Wins: ${wins} | ❌ Losses: ${losses} | Win Rate: ${winRate}%`);
    console.log(`💰 Avg PnL: ${avgPnl}%\n`);
    
    // Parse reasons and count rule occurrences
    const ruleStats = {};
    
    completedTrades.forEach(trade => {
      let reasons;
      try {
        reasons = JSON.parse(trade.reasons);
      } catch {
        reasons = trade.reasons.split(',').map(r => r.trim());
      }
      
      reasons.forEach(reason => {
        // Clean up reason text
        const cleanReason = reason
          .replace(/✓\s*/, '')
          .replace(/\s*\[.*?\]/, '')
          .trim();
        
        if (!ruleStats[cleanReason]) {
          ruleStats[cleanReason] = {
            total: 0,
            wins: 0,
            losses: 0,
            pnl: []
          };
        }
        
        ruleStats[cleanReason].total++;
        if (trade.outcome === 'win') {
          ruleStats[cleanReason].wins++;
        } else {
          ruleStats[cleanReason].losses++;
        }
        ruleStats[cleanReason].pnl.push(trade.pnl_percent);
      });
    });
    
    // Sort by total occurrences
    const sortedRules = Object.entries(ruleStats)
      .sort((a, b) => b[1].total - a[1].total);
    
    // Print rule performance table
    console.log('📋 Per-Rule Win Rates:\n');
    console.log('┌─' + '─'.repeat(50) + '┬─' + '─'.repeat(8) + '┬─' + '─'.repeat(10) + '┬─' + '─'.repeat(10) + '┐');
    console.log('│ ' + 'Rule'.padEnd(50) + '│ ' + 'Count'.padEnd(8) + '│ ' + 'Win Rate'.padEnd(10) + '│ ' + 'Avg PnL'.padEnd(10) + '│');
    console.log('├─' + '─'.repeat(50) + '┼─' + '─'.repeat(8) + '┼─' + '─'.repeat(10) + '┼─' + '─'.repeat(10) + '┤');
    
    sortedRules.forEach(([rule, stats]) => {
      const ruleWinRate = ((stats.wins / stats.total) * 100).toFixed(1);
      const ruleAvgPnl = (stats.pnl.reduce((a, b) => a + b, 0) / stats.pnl.length).toFixed(2);
      const truncatedRule = rule.length > 50 ? rule.substring(0, 47) + '...' : rule;
      
      console.log(
        '│ ' + truncatedRule.padEnd(50) + 
        '│ ' + stats.total.toString().padEnd(8) + 
        '│ ' + `${ruleWinRate}%`.padEnd(10) + 
        '│ ' + `${ruleAvgPnl}%`.padEnd(10) + '│'
      );
    });
    
    console.log('└─' + '─'.repeat(50) + '┴─' + '─'.repeat(8) + '┴─' + '─'.repeat(10) + '┴─' + '─'.repeat(10) + '┘');
    
    // Direction performance
    console.log('\n📊 Direction Performance:\n');
    const longTrades = completedTrades.filter(t => t.direction === 'LONG');
    const shortTrades = completedTrades.filter(t => t.direction === 'SHORT');
    
    if (longTrades.length > 0) {
      const longWins = longTrades.filter(t => t.outcome === 'win').length;
      const longWinRate = ((longWins / longTrades.length) * 100).toFixed(1);
      const longAvgPnl = (longTrades.reduce((sum, t) => sum + t.pnl_percent, 0) / longTrades.length).toFixed(2);
      console.log(`📈 LONG:  ${longTrades.length} trades | Win Rate: ${longWinRate}% | Avg PnL: ${longAvgPnl}%`);
    }
    
    if (shortTrades.length > 0) {
      const shortWins = shortTrades.filter(t => t.outcome === 'win').length;
      const shortWinRate = ((shortWins / shortTrades.length) * 100).toFixed(1);
      const shortAvgPnl = (shortTrades.reduce((sum, t) => sum + t.pnl_percent, 0) / shortTrades.length).toFixed(2);
      console.log(`📉 SHORT: ${shortTrades.length} trades | Win Rate: ${shortWinRate}% | Avg PnL: ${shortAvgPnl}%`);
    }
    
    console.log('\n═'.repeat(80) + '\n');
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error generating weekly review:', error.message);
  }
}

// ============================================================================
// TESTING
// ============================================================================

/**
 * Test signal generation for a single token (BTC/USDT)
 */
export async function testSignal() {
  console.log('🎯 Testing signal generation for BTC/USDT...\n');
  
  const symbol = 'BTC/USDT';
  const timeframe = process.env.TIMEFRAME || '4h';
  
  try {
    // Fetch market data
    console.log('🔍 Fetching data...');
    const candles = await fetchOHLCV(symbol, timeframe, 100);
    
    if (candles.length === 0) {
      console.log('❌ No data available\n');
      process.exit(1);
    }
    
    const currentPrice = candles[candles.length - 1].close;
    const fundingRate = await getFundingRate(symbol);
    
    console.log(`✅ Data fetched (Price: $${currentPrice.toLocaleString()})\n`);
    
    // Calculate indicators
    const indicators = calculateIndicators(candles);
    
    if (!indicators) {
      console.log('❌ Insufficient candles for indicator calculation\n');
      process.exit(1);
    }
    
    // Generate signal (now includes disqualifier checks)
    const signal = await generateSignal(symbol, indicators, candles, currentPrice, fundingRate);
    
    if (signal && signal.disqualified) {
      console.log('⛔ SIGNAL DISQUALIFIED\n');
      console.log('Reasons:');
      signal.reasons.forEach(reason => console.log(`  • ${reason}`));
      console.log('');
      process.exit(0);
    }
    
    if (signal) {
      console.log('✅ SIGNAL GENERATED\n');
      console.log('═'.repeat(60));
      console.log(JSON.stringify(signal, null, 2));
      console.log('═'.repeat(60));
      console.log('\n📋 Readable Format:');
      console.log(`   Symbol: ${signal.symbol}`);
      console.log(`   Direction: ${signal.direction}`);
      console.log(`   Entry: $${signal.entry.toLocaleString()}`);
      console.log(`   Take Profit: $${signal.tp.toLocaleString()}`);
      console.log(`   Stop Loss: $${signal.sl.toLocaleString()}`);
      console.log(`   Score: ${signal.score}/${signal.maxScore}`);
      console.log(`   Timestamp: ${signal.timestamp}`);
      console.log(`\n   Reasons (${signal.reasons.length}):`);
      signal.reasons.forEach((reason, i) => {
        console.log(`      ${i + 1}. ${reason}`);
      });
      console.log('');
    } else {
      console.log('⏸️  No signal generated (score < 7)\n');
      
      // Show scores for transparency
      const longScore = scoreSignal(indicators, currentPrice, fundingRate, 'LONG');
      const shortScore = scoreSignal(indicators, currentPrice, fundingRate, 'SHORT');
      console.log(`   LONG Score:  ${longScore.score}/${longScore.maxScore}`);
      console.log(`   SHORT Score: ${shortScore.score}/${shortScore.maxScore}`);
      console.log(`   Threshold: 7.0`);
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
  
  process.exit(0);
}

/**
 * Test function to verify indicator calculations
 */
export async function testIndicators() {
  console.log('📊 Testing indicator calculations...\n');
  
  const symbol = 'BTC/USDT';
  const timeframe = process.env.TIMEFRAME || '4h';
  
  try {
    // Fetch candle data
    console.log(`🔍 Fetching ${timeframe} candles for ${symbol}...`);
    const candles = await fetchOHLCV(symbol, timeframe, 100);
    
    if (candles.length === 0) {
      console.log('❌ No data returned');
      process.exit(1);
    }
    
    console.log(`✅ Fetched ${candles.length} candles\n`);
    
    // Calculate indicators
    const indicators = calculateIndicators(candles);
    
    if (!indicators) {
      console.log('❌ Failed to calculate indicators');
      process.exit(1);
    }
    
    // Format and display results
    console.log(`📈 ${symbol} Indicators:`);
    console.log('─'.repeat(50));
    
    // RSI with status
    let rsiStatus = 'Neutral';
    if (indicators.rsi < 30) rsiStatus = 'Oversold';
    else if (indicators.rsi > 70) rsiStatus = 'Overbought';
    console.log(`RSI: ${indicators.rsi} (${rsiStatus})`);
    
    // MACD with momentum
    const macdMomentum = indicators.macd.histogram > 0 ? 'Bullish momentum' : 'Bearish momentum';
    console.log(`MACD Histogram: ${indicators.macd.histogram} (${macdMomentum})`);
    console.log(`MACD Signal: ${indicators.macd.signal}`);
    console.log(`MACD Line: ${indicators.macd.line}`);
    
    // EMA50 with price formatting
    const latestPrice = candles[candles.length - 1].close;
    const priceVsEma = latestPrice > indicators.ema50 ? 'Above EMA' : 'Below EMA';
    console.log(`EMA50: $${indicators.ema50.toLocaleString()} (Price ${priceVsEma})`);
    console.log(`Current Price: $${latestPrice.toLocaleString()}`);
    
    // Volume ratio
    const volumeStatus = indicators.volumeRatio > 1.5 ? 'High volume' : 
                        indicators.volumeRatio < 0.7 ? 'Low volume' : 'Average volume';
    console.log(`Volume Ratio: ${indicators.volumeRatio}x avg (${volumeStatus})`);
    
    console.log('─'.repeat(50));
    console.log('\n✅ Indicator calculation test complete.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

/**
 * Test signal generation for all configured tokens
 */
export async function testSignals() {
  console.log('🎯 Testing signal generation for all tokens...\n');
  console.log('Threshold: Score ≥ 7 required for signal\n');
  console.log('═'.repeat(80));
  
  const tokens = process.env.TOKENS.split(',').map(t => t.trim());
  const timeframe = process.env.TIMEFRAME || '4h';
  
  const signals = [];
  
  for (const token of tokens) {
    console.log(`\n🔍 Analyzing ${token}...`);
    
    try {
      // Fetch data
      const candles = await fetchOHLCV(token, timeframe, 100);
      if (candles.length === 0) {
        console.log(`   ❌ No data available`);
        continue;
      }
      
      const currentPrice = candles[candles.length - 1].close;
      const fundingRate = await getFundingRate(token);
      
      // Calculate indicators
      const indicators = calculateIndicators(candles);
      if (!indicators) {
        console.log(`   ❌ Insufficient candles for indicators`);
        continue;
      }
      
      // Generate signal (now includes disqualifier checks)
      const signal = await generateSignal(token, indicators, candles, currentPrice, fundingRate);
      
      // Check if disqualified
      if (signal && signal.disqualified) {
        console.log(`   ⛔ DISQUALIFIED`);
        signal.reasons.forEach(reason => console.log(`      • ${reason}`));
        continue;
      }
      
      // Score both directions for display
      const longScore = scoreSignal(indicators, currentPrice, fundingRate, 'LONG');
      const shortScore = scoreSignal(indicators, currentPrice, fundingRate, 'SHORT');
      
      console.log(`   📊 LONG Score:  ${longScore.score}/${longScore.maxScore} (${((longScore.score/longScore.maxScore)*100).toFixed(0)}%)`);
      console.log(`   📊 SHORT Score: ${shortScore.score}/${shortScore.maxScore} (${((shortScore.score/shortScore.maxScore)*100).toFixed(0)}%)`);
      
      if (signal) {
        console.log(`   ✅ SIGNAL GENERATED: ${signal.direction}`);
        console.log(`   💰 Entry: $${signal.entry.toLocaleString()}`);
        console.log(`   🎯 Take Profit: $${signal.tp.toLocaleString()}`);
        console.log(`   🛡️ Stop Loss: $${signal.sl.toLocaleString()}`);
        console.log(`   📈 Score: ${signal.score}/${signal.maxScore}`);
        console.log(`   📋 Confluences (${signal.reasons.length}):`);
        signal.reasons.forEach(reason => console.log(`      • ${reason}`));
        
        signals.push(signal);
      } else {
        console.log(`   ⏸️  No signal (scores below threshold)`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log(`\n📊 SUMMARY:`);
  console.log(`   Tokens scanned: ${tokens.length}`);
  console.log(`   Signals generated: ${signals.length}`);
  
  if (signals.length > 0) {
    console.log(`\n🚨 ACTIVE SIGNALS:\n`);
    signals.forEach((sig, idx) => {
      console.log(`${idx + 1}. ${sig.symbol} ${sig.direction} - Score: ${sig.score}/${sig.maxScore}`);
      console.log(`   Entry: $${sig.entry.toLocaleString()} | TP: $${sig.tp.toLocaleString()} | SL: $${sig.sl.toLocaleString()}`);
      console.log('');
    });
  } else {
    console.log('\n⏸️  No tokens meet signal threshold at this time.');
  }
  
  console.log('✅ Signal test complete.\n');
  process.exit(0);
}

/**
 * Test function to verify data fetching works
 */
export async function testDataFetch() {
  console.log('🔍 Testing market data fetch...\n');
  
  const tokens = process.env.TOKENS.split(',').map(t => t.trim());
  const timeframe = process.env.TIMEFRAME || '4h';
  
  for (const token of tokens) {
    try {
      // Fetch candles
      const candles = await fetchOHLCV(token, timeframe, 100);
      
      // Fetch funding rate
      const funding = await getFundingRate(token);
      const fundingPercent = (funding * 100).toFixed(4);
      
      if (candles.length > 0) {
        console.log(`✅ ${token}: ${candles.length} candles fetched, Funding: ${fundingPercent}%`);
      } else {
        console.log(`❌ ${token}: Fetch failed - no data returned`);
      }
    } catch (error) {
      console.log(`❌ ${token}: Fetch failed: ${error.message}`);
    }
  }
  
  console.log('\n✅ Data fetch test complete.');
  process.exit(0);
}

// Run test if this file is executed directly
if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--review') || args.includes('-r')) {
    weeklyReview();
  } else if (args.includes('--signal') || args.includes('--test-signal')) {
    testSignal();
  } else if (args.includes('--signals') || args.includes('-s')) {
    testSignals();
  } else if (args.includes('--indicators') || args.includes('-i')) {
    testIndicators();
  } else {
    testDataFetch();
  }
}
