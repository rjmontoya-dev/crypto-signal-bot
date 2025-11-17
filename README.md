# 🤖 Crypto Signal Bot - Complete Setup Guide

## 📦 Project Overview

A personal crypto futures signal bot that scans markets hourly, calculates technical confluences, and sends entry/TP/SL alerts to Telegram. **This is a decision-support tool, NOT an auto-trader.**

**NEW:** 🌐 **Web Dashboard** - Monitor signals, view stats, and control the bot from your browser!

## ✅ Completed Features

### Phase 0-5: Core Functionality
- ✅ **Market Data Fetching** - OHLCV candles + funding rates from Binance
- ✅ **Technical Indicators** - RSI (14), MACD (12/26/9), EMA (50), Volume analysis
- ✅ **Rule-Based Scoring** - 10 LONG rules + 10 SHORT rules with weights
- ✅ **Signal Generation** - Only triggers when score ≥ 7 (threshold)
- ✅ **Telegram Alerts** - Formatted messages with interactive buttons
- ✅ **SQLite Logging** - Persistent storage of all signals and decisions
- ✅ **Hourly Scheduling** - Automated scans every hour with daily lockout
- ✅ **Button Interactions** - Log "taken" or "skipped" trades

### Phase 9: Hourly Scanning + Daily Lockout
- ✅ **Hourly Cron** - Scans market every hour (top of the hour)
- ✅ **Daily Lockout** - Sends only ONE signal per day to prevent spam
- ✅ **Auto Reset** - Lock clears at 00:00 UTC automatically
- ✅ **Manual Reset** - `/reset` command to clear lock early

### NEW: Web Dashboard 🌐
- ✅ **Real-time monitoring** - View all signals, stats, and logs
- ✅ **Manual controls** - Force scan, reset lock, export CSV
- ✅ **Performance metrics** - Win rate, PnL, per-token stats
- ✅ **Lightweight UI** - Alpine.js + vanilla HTML/CSS
- ✅ **No authentication** - Simple, personal use
- ✅ **Runs on port 3000** - Access at http://localhost:3000

## 📁 Project Structure

```
crypto_bot/
├── src/
│   ├── bot/
│   │   └── index.js        # Main orchestrator & scheduler
│   ├── signals/
│   │   └── analyzer.js     # Data fetching, indicators, signals
│   ├── telegram/
│   │   └── messenger.js    # Telegram delivery & SQLite logging
│   └── server/
│       └── index.js        # Express web server & API
├── public/                 # Web dashboard files
│   ├── index.html
│   ├── css/styles.css
│   └── js/dashboard.js
├── data/
│   └── signals.db          # SQLite database (auto-created)
├── config/
│   └── ecosystem.config.cjs # PM2 configuration
├── .env                    # Configuration
├── package.json            # Dependencies
└── tests/                  # Test scripts
```

## ⚙️ Configuration

### Required `.env` Variables

```env
# Telegram (get from @BotFather and @userinfobot)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_USER_ID=your_user_id_here

# Trading
EXCHANGE=binance
TOKENS=BTC/USDT,ETH/USDT,SOL/USDT,ADA/USDT
TIMEFRAME=4h
PAPER_TRADING=true

# Web Dashboard
UI_PORT=3000
```

### Telegram Setup Steps
1. Open Telegram, search for **@BotFather**
2. Send `/newbot` and follow prompts
3. Copy your bot token
4. Search for **@userinfobot**, send `/start`
5. Copy your user ID
6. Update `.env` with both values
7. Start your bot in Telegram (`/start`)

## 🚀 Running the Bot

### Development Mode (Local Testing)
```powershell
node src/bot.js
```
This will:
- Run an immediate scan for testing
- Schedule daily scans at 08:00 UTC
- Keep running to handle button clicks
- Log everything to SQLite

### Production Mode (24/7 with PM2)

**Initial Setup:**
```bash
# 1. Install PM2 globally (one-time)
npm install -g pm2

# 2. Start the bot with PM2
pm2 start ecosystem.config.cjs

# 3. Save process list (persists across reboots)
pm2 save

# 4. Enable auto-start on system reboot (optional)
pm2 startup
# Follow the command it outputs
```

**Daily Operations:**
```bash
# View logs in real-time
pm2 logs crypto-signals

# Check status and resource usage
pm2 status
pm2 monit

# Restart bot (after config changes)
pm2 restart crypto-signals

# Stop bot
pm2 stop crypto-signals

# Delete from PM2
pm2 delete crypto-signals
```

**Deployment (VPS/Server):**
```bash
# Linux/Mac
./deploy.sh

# Windows PowerShell
.\deploy.ps1
```

The deployment script will:
1. Pull latest code from git
2. Install dependencies
The deployment script will:
1. Pull latest code from git
2. Install dependencies
3. Restart PM2 process
4. Save process list
5. Show current status

**Benefits of PM2:**
- ✅ Auto-restart on crashes
- ✅ Process monitoring
- ✅ Log management with rotation
- ✅ Persist across terminal close
- ✅ Auto-start on server reboot
- ✅ Resource usage tracking

---

## 🌐 Web Dashboard

### Quick Start

Once the bot is running, access the dashboard at:

```
http://localhost:3000
```

### Features

**📊 Signals Tab**
- View all trading signals in sortable table
- Filter by outcome (wins/losses), status, symbol
- Click signal to view detailed confluence reasons

**📈 Statistics Tab**
- Overall win rate and average PnL
- Per-token performance breakdown
- LONG vs SHORT direction comparison
- Top 10 performing confluences

**⚙️ Config Tab**
- View bot configuration
- Check connection status
- See which tokens are being scanned

**📝 Logs Tab**
- View last 50 lines from bot logs
- Monitor scan progress in real-time

**🎛️ Manual Controls**
- **Force Scan Now** - Trigger immediate market scan
- **Reset Daily Lock** - Clear hourly lockout
- **Export CSV** - Download all signals
- **Refresh** - Update dashboard data

### Documentation

- 📄 **[QUICK-START-UI.md](./QUICK-START-UI.md)** - Fast setup guide
- 📄 **[WEB-DASHBOARD.md](./WEB-DASHBOARD.md)** - Complete documentation
- 📄 **[SUMMARY-UI.md](./SUMMARY-UI.md)** - Implementation details

---

### Test Commands

```powershell
# View all signals in database
node view-signals.js

# Test data fetching only
node src/signals/analyzer.js

# Test indicator calculations
node src/signals/analyzer.js --indicators

# Test signal generation
node src/signals/analyzer.js --signal

# Scan all tokens for signals
node src/signals/analyzer.js --signals

# Test Telegram messenger (with mock signal)
node src/telegram/messenger.js

# Test complete workflow
node tests/test-bot-workflow.js

# Test database operations
node tests/test-database.js
```

## 📊 Signal Criteria

### LONG Signal Rules (Max 16 points)
| Rule | Weight | Condition |
|------|--------|-----------|
| RSI Oversold | 2.0 | RSI < 30 |
| RSI Recovering | 1.5 | RSI 30-40 |
| MACD Bullish Crossover | 2.0 | Histogram > 0 & Line > Signal |
| MACD Momentum | 1.5 | Histogram > 0 |
| Price Above EMA50 | 1.5 | Price > EMA50 |
| Price Near EMA Support | 2.0 | Price < EMA50 & within 2% |
| Volume Spike | 1.5 | Volume > 1.5x avg |
| Strong Volume | 1.0 | Volume > 1.2x avg |
| Funding Strongly Negative | 2.0 | Funding < -0.02% |
| Funding Negative | 1.0 | Funding < -0.005% |

### SHORT Signal Rules (Max 16 points)
Similar structure but inverted (RSI overbought, MACD bearish, price below EMA, etc.)

### Threshold
- **Minimum score required**: 7.0 points
- **Confidence**: (score / maxScore) × 100%

## 📈 Signal Format

### Telegram Message
```
🟢 LONG BTC/USDT

📊 Entry: $103,000 | TP: $105,575 | SL: $101,455
📈 Score: 9.5/16.0
💰 Risk/Reward: -1.50% / +2.50%

Confluences:
• RSI oversold (<30)
• MACD bullish crossover confirmed
• MACD histogram positive (bullish momentum)
• Price above EMA50 (uptrend)
• Volume spike >1.5x average

🕐 11/8/2025, 3:01:43 AM

[✅ I Took This Trade] [❌ Skip]
```

### Database Schema
```sql
CREATE TABLE signals (
  id INTEGER PRIMARY KEY,
  signal_id TEXT UNIQUE,
  symbol TEXT,
  direction TEXT,
  entry REAL,
  tp REAL,
  sl REAL,
  score REAL,
  max_score REAL,
  reasons TEXT,  -- JSON array
  status TEXT DEFAULT 'pending',  -- pending/taken/skipped
  timestamp TEXT,
  action_timestamp TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🎯 Risk Management

- **LONG**: TP = Entry × 1.025 (+2.5%), SL = Entry × 0.985 (-1.5%)
- **SHORT**: TP = Entry × 0.975 (-2.5%), SL = Entry × 1.015 (+1.5%)
- **Risk:Reward Ratio**: ~1.67:1
- All prices rounded to nearest dollar

## 🔧 Troubleshooting

### Bot Not Starting
- Check `.env` file exists and has correct format
- Verify all dependencies installed: `npm install`
- If using PM2, check logs: `pm2 logs crypto-signals`

### PM2 Process Issues
```bash
# Process keeps restarting
pm2 logs crypto-signals --lines 100  # Check error logs
pm2 describe crypto-signals           # See restart count

# High memory usage
pm2 monit                             # Monitor in real-time
# Adjust max_memory_restart in ecosystem.config.js

# Process not starting after reboot
pm2 startup                           # Re-run startup command
pm2 save                              # Save process list

# Clear all PM2 processes
pm2 kill                              # Nuclear option
pm2 start ecosystem.config.js        # Start fresh
```

### No Telegram Messages
- Ensure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_USER_ID` are set
- Start your bot in Telegram first (`/start`)
- Check console for error messages

### No Signals Generated
- This is normal! Current market may not meet criteria
- Lower threshold temporarily for testing (edit `THRESHOLD` in analyzer.js)
- Use `node test-bot-workflow.js` to see a mock signal

### Database Errors
- Delete `data/signals.db` and restart bot (will recreate)
- Check write permissions on `data/` directory

## 📝 Daily Workflow

1. **08:00 UTC**: Bot automatically scans all tokens
2. **High-score signals**: Sent to Telegram with buttons
3. **User reviews**: Click "✅ Took Trade" or "❌ Skip"
4. **Database logs**: All decisions recorded for analysis
5. **Next day**: Repeat

## 🛑 Stopping the Bot

### Development Mode
Press `Ctrl+C` - The bot will:
- Complete current operation
- Close database connections
- Stop Telegram bot cleanly
- Exit gracefully

### Production Mode (PM2)
```bash
pm2 stop crypto-signals    # Stop without removing from list
pm2 delete crypto-signals  # Stop and remove completely
```

## 📚 Next Steps (Future Enhancements)

- [ ] Backtest signal performance
- [ ] Add more tokens (check exchange support)
- [ ] Customize signal rules and weights
- [ ] Add position sizing calculator
- [ ] Track win/loss outcomes
- [ ] Generate performance reports
- [ ] Add webhook support for external triggers

## 🆘 Support

For issues or questions:
1. Check `view-signals.js` to see logged data
2. Review console output for errors
3. Verify `.env` configuration
4. Test components individually with test scripts

---

**Remember**: This is a decision-support tool. Always do your own analysis before taking any trade!
