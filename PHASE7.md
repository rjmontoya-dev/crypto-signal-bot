# Phase 7: Paper Trading & Outcome Tracking

## ✅ Implementation Complete

### Features Added

#### 1. Database Schema (messenger.js)
- Added `outcome` column (TEXT) - stores 'win' or 'loss'
- Added `pnl_percent` column (REAL) - stores PnL percentage

#### 2. Telegram Commands (messenger.js)

**`/log` Command** - Manually log trade outcomes
```
Syntax: /log <signal_id> <win|loss> <pnl_percent>
Example: /log 15 win 2.5
```
- Validates signal_id, outcome, and pnl_percent
- Updates database with outcome data
- Sends confirmation message with trade details

**`/status` Command** - View bot health and open trades
- Shows open trades (signals with no outcome)
- Displays total signals count
- Calculates win rate from completed trades
- Shows average PnL
- Displays last scan time

#### 3. Max Open Trades (bot.js + .env)
- Added `MAX_OPEN_TRADES=1` to .env
- Bot checks open trades count before each daily scan
- If limit reached:
  - Skips new signal generation
  - Logs warning to console
  - Sends Telegram alert (if not in paper trading mode)
- New export: `getOpenTradesCount()` from messenger.js

#### 4. Weekly Review (analyzer.js)
- Function: `weeklyReview()`
- Calculates per-rule win rates
- Shows which confluence rules perform best
- Displays direction performance (LONG vs SHORT)
- Prints formatted table to console
- Run with: `node src/analyzer.js --review`

## Testing

### Run All Tests
```bash
node test-phase7.js
```

### Test Individual Components
```bash
# Test max trades enforcement
node test-max-trades.js

# Test weekly review
node src/analyzer.js --review

# Migrate existing database
node migrate-database.js
```

## Usage Guide

### Daily Workflow

1. **Morning: Bot runs daily scan** (scheduled at 08:00 UTC)
   - Checks open trades count
   - If under limit, scans markets for signals
   - If limit reached, skips and alerts

2. **During Day: Monitor trades**
   - Send `/status` in Telegram to view open trades
   - Track your positions manually

3. **Close Trade: Log outcome**
   ```
   /log 5 win 2.5    (if trade hit TP)
   /log 5 loss -1.2  (if trade hit SL)
   ```

4. **Weekly: Review performance**
   ```bash
   node src/analyzer.js --review
   ```

### Database Queries

**View all open trades:**
```sql
SELECT * FROM signals WHERE outcome IS NULL;
```

**View completed trades:**
```sql
SELECT * FROM signals WHERE outcome IS NOT NULL ORDER BY created_at DESC;
```

**Calculate win rate:**
```sql
SELECT 
  COUNT(CASE WHEN outcome = 'win' THEN 1 END) * 100.0 / COUNT(*) as win_rate,
  AVG(pnl_percent) as avg_pnl
FROM signals 
WHERE outcome IS NOT NULL;
```

## Configuration

### .env Settings
```env
# Safety Mode
PAPER_TRADING=true          # Set to false for live Telegram alerts

# Max Open Trades (enforce trade limit)
MAX_OPEN_TRADES=1           # Only 1 trade at a time
```

## Telegram Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Activate bot | `/start` |
| `/status` | View bot health and open trades | `/status` |
| `/log` | Manually log trade outcome | `/log 5 win 2.5` |

## File Changes

### Modified Files
- `src/messenger.js` - Added /log and /status commands, outcome tracking
- `src/bot.js` - Added max trades enforcement
- `src/analyzer.js` - Added weeklyReview() function
- `.env` - Added MAX_OPEN_TRADES configuration

### New Files
- `migrate-database.js` - Database migration script
- `test-phase7.js` - Comprehensive Phase 7 tests
- `test-max-trades.js` - Max trades enforcement test

## Next Steps (Phase 8)

**Potential Enhancements:**
1. Deploy to cloud (VPS or Heroku)
2. Add automated backups
3. Implement webhook alerts
4. Add position sizing calculator
5. Create web dashboard for performance tracking
6. Add more confluence rules based on weekly review insights
7. Implement trailing stop-loss
8. Add multi-timeframe analysis

## Troubleshooting

**Issue: "no such column: outcome"**
Solution: Run migration script
```bash
node migrate-database.js
```

**Issue: Bot not blocking new signals despite open trades**
Solution: Check MAX_OPEN_TRADES in .env and verify getOpenTradesCount() is working
```bash
node test-max-trades.js
```

**Issue: /log or /status commands not responding**
Solution: Ensure Telegram bot is running with initTelegram() and token is configured

## Architecture Notes

### Data Flow
1. Bot generates signal → Logged to DB with outcome=NULL
2. User takes trade manually
3. Trade closes → User logs outcome via /log
4. Database updated → outcome='win'/'loss', pnl_percent=X.XX
5. Weekly review → Analyzes outcomes to identify best rules

### Paper Trading Mode
- When PAPER_TRADING=true:
  - Signals logged to database only
  - No Telegram messages sent
  - Console logging for development
- When PAPER_TRADING=false:
  - Signals sent to Telegram
  - Interactive buttons enabled
  - Full production mode

## Success Metrics

✅ All Phase 7 tests passing
✅ Database schema updated
✅ /log command validated
✅ /status command operational
✅ Max trades enforcement working
✅ weeklyReview() generating reports
✅ Migration script tested

**Status: Phase 7 Complete and Production Ready**
