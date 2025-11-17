# 🚀 PM2 Quick Reference Guide

## Essential Commands

### Starting the Bot
```bash
# First time
pm2 start ecosystem.config.cjs
pm2 save

# Enable auto-start on reboot
pm2 startup
# Run the command it outputs
```

### Monitoring
```bash
# View status
pm2 status

# Real-time logs
pm2 logs crypto-signals

# Last 50 lines
pm2 logs crypto-signals --lines 50

# Live monitoring dashboard
pm2 monit

# Detailed process info
pm2 describe crypto-signals
```

### Managing the Process
```bash
# Restart (after code/config changes)
pm2 restart crypto-signals

# Stop (keep in PM2 list)
pm2 stop crypto-signals

# Start stopped process
pm2 start crypto-signals

# Delete from PM2
pm2 delete crypto-signals

# Restart all processes
pm2 restart all
```

### Deployment
```bash
# Linux/Mac
./deploy.sh

# Windows PowerShell
.\deploy.ps1

# Manual deployment steps
git pull origin main
npm install --production
pm2 restart crypto-signals
pm2 save
```

### Log Management
```bash
# View error logs only
pm2 logs crypto-signals --err

# View output logs only
pm2 logs crypto-signals --out

# Clear all logs
pm2 flush

# Log file locations
# - Combined: ./logs/combined.log
# - Output:   ./logs/out.log
# - Errors:   ./logs/error.log
```

### Process Information
```bash
# List all PM2 processes
pm2 list

# Show environment variables
pm2 env 0

# Process resource usage
pm2 describe crypto-signals

# System info
pm2 info
```

### Troubleshooting
```bash
# Process keeps crashing
pm2 logs crypto-signals --lines 200
pm2 describe crypto-signals  # Check restart count

# Memory leak suspected
pm2 monit  # Watch memory over time
pm2 describe crypto-signals  # Check heap usage

# Process not responding
pm2 restart crypto-signals --update-env

# Nuclear option (clean restart)
pm2 kill
pm2 start ecosystem.config.cjs
pm2 save
```

### Advanced Usage
```bash
# Update environment variables
pm2 restart crypto-signals --update-env

# Scale to multiple instances (not recommended for this bot)
pm2 scale crypto-signals 2

# Reload without downtime (not applicable for this bot)
pm2 reload crypto-signals

# Save current process list
pm2 save

# Resurrect saved processes
pm2 resurrect
```

## Configuration File

**File:** `ecosystem.config.cjs`

**Key Settings:**
- **name**: crypto-signals
- **script**: src/bot.js
- **instances**: 1 (single instance for cron)
- **exec_mode**: fork
- **autorestart**: true
- **max_memory_restart**: 500M
- **log_date_format**: YYYY-MM-DD HH:mm:ss Z
- **env.NODE_ENV**: production
- **env.PAPER_TRADING**: false

## Common Workflows

### Daily Operations
```bash
# Morning check
pm2 status

# Check recent activity
pm2 logs crypto-signals --lines 100

# Verify next scan time
pm2 logs crypto-signals | grep "Next scheduled"
```

### After Code Changes
```bash
# Option 1: Use deployment script
.\deploy.ps1  # or ./deploy.sh

# Option 2: Manual
git pull origin main
npm install --production
pm2 restart crypto-signals
```

### Server Reboot Setup
```bash
# One-time setup
pm2 startup
# Copy and run the generated command

pm2 start ecosystem.config.cjs
pm2 save

# Test by rebooting server
# Bot should auto-start
```

### Debugging Issues
```bash
# Step 1: Check if running
pm2 status

# Step 2: Check recent logs
pm2 logs crypto-signals --lines 200

# Step 3: Check process details
pm2 describe crypto-signals

# Step 4: Restart with clean logs
pm2 flush
pm2 restart crypto-signals
pm2 logs crypto-signals
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Normal exit |
| 1 | Uncaught exception |
| 2 | Configuration error |
| 3 | SIGINT (Ctrl+C) |
| 15 | SIGTERM (graceful shutdown) |

## Log Levels

**Normal Operation:**
```
✅ Database initialized
📊 Open Trades: 0/1
🔍 Starting daily market scan...
✅ Bot is now running. Waiting for scheduled scans...
```

**Warnings:**
```
⚠️ Telegram bot token not configured
⚠️ Max open trades reached
⚠️ No data available for <token>
```

**Errors:**
```
❌ Error fetching data: <details>
❌ Error generating signal: <details>
❌ Database error: <details>
```

## Performance Benchmarks

**Normal Resource Usage:**
- CPU: 0-1% idle, 50-70% during scan
- Memory: 10-50MB typical
- Startup Time: < 1 second
- Scan Duration: 5-10 seconds (4 tokens)

**Alert Thresholds:**
- Memory > 400MB: Investigate potential leak
- CPU > 80% sustained: Check for infinite loops
- Restarts > 5/day: Debug root cause

## PM2 vs Direct Node

| Feature | `node src/bot.js` | `pm2 start` |
|---------|-------------------|-------------|
| Auto-restart on crash | ❌ | ✅ |
| Persist after terminal close | ❌ | ✅ |
| Auto-start on reboot | ❌ | ✅ |
| Log management | Manual | ✅ Automatic |
| Process monitoring | ❌ | ✅ Built-in |
| Resource limits | ❌ | ✅ Configurable |
| Production ready | ❌ | ✅ Yes |

## Security Best Practices

1. **Never commit logs:**
   ```bash
   # Already in .gitignore
   logs/
   *.log
   ```

2. **Secure .env file:**
   ```bash
   chmod 600 .env  # Linux/Mac only
   ```

3. **Use production mode:**
   ```bash
   NODE_ENV=production  # Set in ecosystem.config.cjs
   ```

4. **Limit process permissions:**
   ```bash
   # Run as non-root user on Linux
   useradd -m -s /bin/bash cryptobot
   su - cryptobot
   ```

5. **Monitor logs for errors:**
   ```bash
   pm2 logs crypto-signals --err
   ```

## Getting Help

```bash
# Built-in help
pm2 help
pm2 <command> --help

# Examples
pm2 logs --help
pm2 start --help
pm2 monit --help
```

---

**Remember:** Always test PM2 commands in development before using in production!
