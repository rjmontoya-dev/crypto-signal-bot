import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.UI_PORT || 3000;

// Database connection
let db = null;

function getDatabase() {
  if (!db) {
    const dbDir = path.join(__dirname, '..', '..', 'data');
    const dbPath = path.join(dbDir, 'signals.db');
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    db = new Database(dbPath);
  }
  return db;
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'public')));

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * GET /api/signals - Get all signals with optional filters
 */
app.get('/api/signals', (req, res) => {
  try {
    const database = getDatabase();
    const { status, outcome, symbol, sort = 'created_at', order = 'DESC', page = 1, pageSize = 10 } = req.query;
    
    let query = 'SELECT * FROM signals WHERE status != ?';
    const params = ['skipped'];
    
    // Apply filters
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    if (outcome && outcome !== 'all') {
      if (outcome === 'pending') {
        query += ' AND outcome IS NULL';
      } else {
        query += ' AND outcome = ?';
        params.push(outcome);
      }
    }
    
    if (symbol) {
      query += ' AND symbol LIKE ?';
      params.push(`%${symbol}%`);
    }
    
    // Get total count for pagination
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalRecords = database.prepare(countQuery).get(...params).count;
    
    // Add sorting
    const validSorts = ['created_at', 'score', 'symbol', 'direction'];
    const sortColumn = validSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortColumn} ${sortOrder}`;
    
    // Add pagination
    const currentPage = parseInt(page) || 1;
    const limit = parseInt(pageSize) || 10;
    const offset = (currentPage - 1) * limit;
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const signals = database.prepare(query).all(...params);
    
    // Parse reasons from JSON string
    const processedSignals = signals.map(signal => ({
      ...signal,
      reasons: JSON.parse(signal.reasons || '[]')
    }));
    
    const totalPages = Math.ceil(totalRecords / limit);
    
    res.json({
      success: true,
      data: processedSignals,
      pagination: {
        currentPage,
        pageSize: limit,
        totalRecords,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching signals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/stats - Get performance statistics
 */
app.get('/api/stats', (req, res) => {
  try {
    const database = getDatabase();
    
    // Total signals (excluding skipped)
    const totalSignals = database.prepare('SELECT COUNT(*) as count FROM signals WHERE status != ?').get('skipped').count;
    
    // Completed trades (with outcomes, excluding skipped)
    const completedTrades = database.prepare(`
      SELECT COUNT(*) as count FROM signals WHERE outcome IS NOT NULL AND status != ?
    `).get('skipped').count;
    
    // Open trades (excluding skipped)
    const openTrades = database.prepare(`
      SELECT COUNT(*) as count FROM signals WHERE outcome IS NULL AND status != ?
    `).get('skipped').count;
    
    // Win/Loss stats (excluding skipped)
    const wins = database.prepare(`
      SELECT COUNT(*) as count FROM signals WHERE outcome = 'win' AND status != ?
    `).get('skipped').count;
    
    const losses = database.prepare(`
      SELECT COUNT(*) as count FROM signals WHERE outcome = 'loss' AND status != ?
    `).get('skipped').count;
    
    const winRate = completedTrades > 0 ? ((wins / completedTrades) * 100).toFixed(1) : 0;
    
    // Average PnL (excluding skipped)
    const avgPnlResult = database.prepare(`
      SELECT AVG(pnl_percent) as avg FROM signals WHERE pnl_percent IS NOT NULL AND status != ?
    `).get('skipped');
    const avgPnl = avgPnlResult.avg ? parseFloat(avgPnlResult.avg.toFixed(2)) : 0;
    
    // Per-token stats (excluding skipped)
    const tokenStats = database.prepare(`
      SELECT 
        symbol,
        COUNT(*) as total,
        SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN outcome = 'loss' THEN 1 ELSE 0 END) as losses,
        AVG(pnl_percent) as avg_pnl
      FROM signals
      WHERE outcome IS NOT NULL AND status != ?
      GROUP BY symbol
      ORDER BY total DESC
    `).all('skipped');
    
    // Direction stats (excluding skipped)
    const longStats = database.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) as wins
      FROM signals
      WHERE direction = 'LONG' AND outcome IS NOT NULL AND status != ?
    `).get('skipped');
    
    const shortStats = database.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) as wins
      FROM signals
      WHERE direction = 'SHORT' AND outcome IS NOT NULL AND status != ?
    `).get('skipped');
    
    // Rule effectiveness (top performing confluences on wins, excluding skipped)
    const allWins = database.prepare(`
      SELECT reasons FROM signals WHERE outcome = 'win' AND status != ?
    `).all('skipped');
    
    const ruleCount = {};
    allWins.forEach(trade => {
      try {
        const reasons = JSON.parse(trade.reasons);
        reasons.forEach(reason => {
          ruleCount[reason] = (ruleCount[reason] || 0) + 1;
        });
      } catch (e) {
        // Skip if JSON parse fails
      }
    });
    
    const topRules = Object.entries(ruleCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([rule, count]) => ({ rule, count }));
    
    res.json({
      success: true,
      data: {
        overview: {
          totalSignals,
          completedTrades,
          openTrades,
          wins,
          losses,
          winRate: parseFloat(winRate),
          avgPnl
        },
        tokenStats: tokenStats.map(t => ({
          ...t,
          winRate: t.total > 0 ? ((t.wins / (t.wins + t.losses)) * 100).toFixed(1) : 0,
          avg_pnl: t.avg_pnl ? parseFloat(t.avg_pnl.toFixed(2)) : 0
        })),
        directionStats: {
          long: {
            total: longStats.total,
            wins: longStats.wins,
            winRate: longStats.total > 0 ? ((longStats.wins / longStats.total) * 100).toFixed(1) : 0
          },
          short: {
            total: shortStats.total,
            wins: shortStats.wins,
            winRate: shortStats.total > 0 ? ((shortStats.wins / shortStats.total) * 100).toFixed(1) : 0
          }
        },
        topRules
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/scan - Trigger manual scan
 */
app.post('/api/scan', async (req, res) => {
  try {
    // Import dailyScan dynamically to avoid circular dependencies
    const botModule = await import('../bot/index.js');
    
    if (botModule.triggerManualScan) {
      // Trigger scan asynchronously
      botModule.triggerManualScan();
      res.json({ success: true, message: 'Manual scan triggered. Check logs for progress.' });
    } else {
      res.status(501).json({ success: false, error: 'Manual scan not implemented in bot module' });
    }
  } catch (error) {
    console.error('Error triggering scan:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cron-status - Get cron job status
 */
app.get('/api/cron-status', async (req, res) => {
  try {
    const botModule = await import('../bot/index.js');
    
    if (botModule.getCronStatus) {
      const status = botModule.getCronStatus();
      res.json({ success: true, ...status });
    } else {
      res.status(501).json({ success: false, error: 'Cron status not available' });
    }
  } catch (error) {
    console.error('Error getting cron status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cron-toggle - Enable/disable automated scans
 * Body: { enabled: boolean }
 */
app.post('/api/cron-toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    const botModule = await import('../bot/index.js');
    
    if (enabled === undefined || enabled === null) {
      return res.status(400).json({ success: false, error: 'Missing required field: enabled' });
    }
    
    if (botModule.enableCron && botModule.disableCron) {
      const result = enabled ? botModule.enableCron() : botModule.disableCron();
      res.json(result);
    } else {
      res.status(501).json({ success: false, error: 'Cron toggle not available' });
    }
  } catch (error) {
    console.error('Error toggling cron:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/telegram-status - Get Telegram notification status
 */
app.get('/api/telegram-status', async (req, res) => {
  try {
    const messengerModule = await import('../telegram/messenger.js');
    
    if (messengerModule.getTelegramStatus) {
      const status = messengerModule.getTelegramStatus();
      res.json({ success: true, ...status });
    } else {
      res.status(501).json({ success: false, error: 'Telegram status not available' });
    }
  } catch (error) {
    console.error('Error getting Telegram status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/telegram-toggle - Enable/disable Telegram notifications
 * Body: { enabled: boolean }
 */
app.post('/api/telegram-toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    const messengerModule = await import('../telegram/messenger.js');
    
    if (enabled === undefined || enabled === null) {
      return res.status(400).json({ success: false, error: 'Missing required field: enabled' });
    }
    
    if (messengerModule.enableTelegram && messengerModule.disableTelegram) {
      const result = enabled ? messengerModule.enableTelegram() : messengerModule.disableTelegram();
      res.json(result);
    } else {
      res.status(501).json({ success: false, error: 'Telegram toggle not available' });
    }
  } catch (error) {
    console.error('Error toggling Telegram:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/telegram-status - Get Telegram notification status
 */
app.get('/api/telegram-status', async (req, res) => {
  try {
    const botModule = await import('../bot/index.js');
    
    if (botModule.getTelegramStatus) {
      const status = botModule.getTelegramStatus();
      res.json({ success: true, ...status });
    } else {
      res.status(501).json({ success: false, error: 'Telegram status not available' });
    }
  } catch (error) {
    console.error('Error getting telegram status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/telegram-toggle - Enable/disable Telegram notifications
 * Body: { enabled: boolean }
 */
app.post('/api/telegram-toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    const botModule = await import('../bot/index.js');
    
    if (enabled === undefined || enabled === null) {
      return res.status(400).json({ success: false, error: 'Missing required field: enabled' });
    }
    
    if (botModule.enableTelegram && botModule.disableTelegram) {
      const result = enabled ? botModule.enableTelegram() : botModule.disableTelegram();
      res.json(result);
    } else {
      res.status(501).json({ success: false, error: 'Telegram toggle not available' });
    }
  } catch (error) {
    console.error('Error toggling telegram:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/signals/:id/toggle-status - Toggle signal status between 'taken' and 'not_taken'
 * Body: { status: 'taken' | 'not_taken' }
 */
app.post('/api/signals/:id/toggle-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['taken', 'not_taken'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be "taken" or "not_taken"'
      });
    }

    const database = getDatabase();
    
    const result = database.prepare(`
      UPDATE signals 
      SET status = ? 
      WHERE id = ?
    `).run(status, id);

    if (result.changes > 0) {
      res.json({
        success: true,
        message: `Signal marked as ${status}`,
        status
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Signal not found'
      });
    }
  } catch (error) {
    console.error('Error toggling signal status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/close-trade - Manually close a trade
 * Body: { signalId: number, outcome: 'win' | 'loss' | 'skip', pnlPercent: number (optional for skip) }
 */
app.post('/api/close-trade', async (req, res) => {
  try {
    const { signalId, outcome, pnlPercent } = req.body;
    
    // Validate input
    if (!signalId || !outcome) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: signalId, outcome'
      });
    }
    
    if (!['win', 'loss', 'skip'].includes(outcome)) {
      return res.status(400).json({
        success: false,
        error: 'Outcome must be "win", "loss", or "skip"'
      });
    }
    
    // For skip, pnlPercent is optional (default to 0)
    const finalPnl = outcome === 'skip' ? 0 : parseFloat(pnlPercent);
    
    if (outcome !== 'skip' && pnlPercent === undefined) {
      return res.status(400).json({
        success: false,
        error: 'pnlPercent is required for win/loss outcomes'
      });
    }
    
    // If outcome is 'skip', delete the signal from database
    if (outcome === 'skip') {
      const database = getDatabase();
      const deleteResult = database.prepare('DELETE FROM signals WHERE id = ?').run(signalId);
      
      if (deleteResult.changes > 0) {
        res.json({ 
          success: true, 
          message: 'Signal deleted successfully' 
        });
      } else {
        res.status(404).json({ 
          success: false, 
          error: 'Signal not found' 
        });
      }
    } else {
      // Import closeTradeManually from messenger for win/loss outcomes
      const { closeTradeManually } = await import('../telegram/messenger.js');
      const result = closeTradeManually(signalId, outcome, finalPnl);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    }
  } catch (error) {
    console.error('Error closing trade:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/reset-lock - Reset daily lock
 */
app.post('/api/reset-lock', async (req, res) => {
  try {
    // Import manualResetLock from bot
    const botModule = await import('../bot/index.js');
    
    if (botModule.manualResetLock) {
      const message = botModule.manualResetLock();
      res.json({ success: true, message });
    } else {
      res.status(501).json({ success: false, error: 'Reset lock not implemented in bot module' });
    }
  } catch (error) {
    console.error('Error resetting lock:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/timeframe - Update scanning timeframe
 * Body: { timeframe: string }
 */
app.post('/api/config/timeframe', async (req, res) => {
  try {
    const { timeframe } = req.body;
    
    if (!timeframe) {
      return res.status(400).json({ success: false, error: 'Missing required field: timeframe' });
    }
    
    // Validate timeframe
    const validTimeframes = ['30m', '1h', '4h'];
    if (!validTimeframes.includes(timeframe)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid timeframe. Must be one of: ' + validTimeframes.join(', ') 
      });
    }
    
    // Import setTimeframe from bot
    const botModule = await import('../bot/index.js');
    
    if (botModule.setTimeframe) {
      const result = botModule.setTimeframe(timeframe);
      res.json(result);
    } else {
      res.status(501).json({ success: false, error: 'Timeframe update not implemented' });
    }
  } catch (error) {
    console.error('Error updating timeframe:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/logs - Get recent PM2 logs
 */
app.get('/api/logs', (req, res) => {
  try {
    const logsDir = path.join(__dirname, '..', '..', 'logs');
    const logFile = path.join(logsDir, 'combined.log');
    
    if (!fs.existsSync(logFile)) {
      return res.json({ success: true, data: [] });
    }
    
    const logContent = fs.readFileSync(logFile, 'utf-8');
    const lines = logContent.split('\n').filter(line => line.trim());
    const last100 = lines.slice(-100);
    
    res.json({ success: true, data: last100 });
  } catch (error) {
    console.error('Error reading logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/config - Get environment config (read-only)
 */
app.get('/api/config', async (req, res) => {
  try {
    // Import getTimeframe from bot to get current runtime timeframe
    const botModule = await import('../bot/index.js');
    const currentTimeframe = botModule.getTimeframe ? botModule.getTimeframe() : (process.env.TIMEFRAME || '4h');
    
    const config = {
      exchange: process.env.EXCHANGE || 'binance',
      tokens: process.env.TOKENS || '',
      timeframe: currentTimeframe,
      paperTrading: process.env.PAPER_TRADING === 'true',
      maxOpenTrades: parseInt(process.env.MAX_OPEN_TRADES || '1'),
      telegramConnected: !!process.env.TELEGRAM_BOT_TOKEN,
      cryptoPanicEnabled: !!process.env.CRYPTOPANIC_API_TOKEN
    };
    
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/export-csv - Export signals as CSV
 */
app.get('/api/export-csv', (req, res) => {
  try {
    const database = getDatabase();
    const signals = database.prepare('SELECT * FROM signals WHERE status != ? ORDER BY created_at DESC').all('skipped');
    
    // CSV header
    let csv = 'ID,Symbol,Direction,Entry,Take Profit,Stop Loss,Score,Max Score,Status,Outcome,PnL %,Created At\n';
    
    // CSV rows
    signals.forEach(signal => {
      csv += `${signal.id},${signal.symbol},${signal.direction},${signal.entry},${signal.tp},${signal.sl},${signal.score},${signal.max_score},${signal.status || 'pending'},${signal.outcome || 'N/A'},${signal.pnl_percent || 'N/A'},${signal.created_at}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=signals-export.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DASHBOARD HTML
// ============================================================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

// ============================================================================
// START SERVER
// ============================================================================

let server = null;

export function startWebServer() {
  if (server) {
    console.log('⚠️  Web server already running');
    return;
  }
  
  server = app.listen(PORT, () => {
    console.log(`🌐 Web dashboard running at http://localhost:${PORT}`);
  });
}

export function stopWebServer() {
  if (server) {
    server.close();
    console.log('🛑 Web server stopped');
  }
}
