# 🌐 Web Dashboard - User Guide

## Overview

Your crypto signal bot now includes a **lightweight web dashboard** for monitoring signals, viewing statistics, and manually triggering actions. The UI runs on **port 3000** alongside the bot.

---

## ✅ Features

### 📊 Signals Tab
- View all trading signals in a sortable table
- Filter by outcome (pending/wins/losses), status, symbol
- Sort by date, score, or symbol
- View detailed confluence reasons for each signal
- Real-time updates every 30 seconds

### 📈 Statistics Tab
- **Overview stats**: Total signals, win rate, avg PnL
- **Per-token performance**: Win rate and PnL for each trading pair
- **Direction stats**: Compare LONG vs SHORT performance
- **Top confluences**: See which rules appear most on winning trades

### ⚙️ Config Tab
- View current bot configuration
- Check which tokens are being scanned
- See if Telegram and CryptoPanic are connected
- Monitor paper trading mode status

### 📝 Logs Tab
- View last 50 lines from bot logs
- Monitor recent scans and signals
- Debug errors in real-time

### 🎛️ Manual Controls
- **Force Scan Now**: Trigger immediate market scan (bypasses hourly schedule)
- **Reset Daily Lock**: Clear the daily signal lock manually
- **Export CSV**: Download all signals as CSV file
- **Refresh**: Manually refresh all data

---

## 🚀 Getting Started

### 1. Add UI_PORT to .env

```bash
# Web Dashboard Port
UI_PORT=3000
```

### 2. Start the Bot

The web server starts automatically with the bot:

```bash
# Development
npm start

# Production with PM2
pm2 start config/ecosystem.config.cjs
```

### 3. Access the Dashboard

Open your browser and navigate to:

```
http://localhost:3000
```

Or if deployed on a VPS:

```
http://YOUR_VPS_IP:3000
```

---

## 📡 API Endpoints

The dashboard uses these REST API endpoints (you can also use them programmatically):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/signals` | Get all signals with optional filters |
| GET | `/api/stats` | Get performance statistics |
| GET | `/api/config` | Get bot configuration |
| GET | `/api/logs` | Get recent log lines |
| POST | `/api/scan` | Trigger manual scan |
| POST | `/api/reset-lock` | Reset daily lock |
| GET | `/api/export-csv` | Export signals as CSV |

### Example: Fetch Signals Programmatically

```bash
curl http://localhost:3000/api/signals?outcome=win&sort=score
```

### Example: Trigger Manual Scan

```bash
curl -X POST http://localhost:3000/api/scan
```

---

## 🔧 Configuration

### Change UI Port

Update `.env`:

```bash
UI_PORT=8080  # Use any available port
```

### Disable Auto-Refresh

The dashboard auto-refreshes every 30 seconds. To disable, edit `public/js/dashboard.js`:

```javascript
async init() {
  await this.refreshData();
  // Comment out this line to disable auto-refresh:
  // setInterval(() => this.refreshData(), 30000);
}
```

---

## 🛡️ Security Notes

**⚠️ IMPORTANT**: This dashboard has **NO AUTHENTICATION** by design (personal use only).

### Recommended Setup for Production:

1. **Firewall Rules**: Block port 3000 from external access
   ```bash
   # Allow only localhost
   sudo ufw deny 3000
   ```

2. **SSH Tunnel**: Access dashboard securely via SSH tunnel
   ```bash
   ssh -L 3000:localhost:3000 user@your-vps
   # Then access: http://localhost:3000
   ```

3. **Nginx Reverse Proxy** (Advanced): Add basic auth + SSL
   ```nginx
   location / {
     proxy_pass http://localhost:3000;
     auth_basic "Restricted";
     auth_basic_user_file /etc/nginx/.htpasswd;
   }
   ```

---

## 📊 PM2 Management

When running with PM2, the web server starts automatically:

```bash
# Start bot + web server
pm2 start config/ecosystem.config.cjs

# View logs (includes web server logs)
pm2 logs crypto-signals

# Monitor resources
pm2 monit

# Restart (restarts both bot and web server)
pm2 restart crypto-signals
```

---

## 🐛 Troubleshooting

### Dashboard not loading

1. **Check if server is running:**
   ```bash
   pm2 logs crypto-signals | grep "Web dashboard"
   ```
   Should show: `🌐 Web dashboard running at http://localhost:3000`

2. **Check port is not in use:**
   ```bash
   netstat -an | findstr :3000  # Windows
   lsof -i :3000                # Linux/Mac
   ```

3. **Check firewall:**
   ```bash
   # Allow port 3000 (if accessing remotely)
   sudo ufw allow 3000
   ```

### "Failed to fetch signals" error

- Check that database file exists: `data/signals.db`
- Check file permissions
- Check PM2 logs for database errors

### Manual scan not working

- Check bot logs: `pm2 logs crypto-signals`
- Ensure bot is running (not just web server)
- Check if daily lock is active (use Reset Lock button)

---

## 🎨 Customization

### Change Theme Colors

Edit `public/css/styles.css`:

```css
/* Header gradient */
.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* Change to your preferred colors */
.header {
  background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%);
}
```

### Add Custom Stats

Edit `src/server/index.js` in the `/api/stats` endpoint to calculate custom metrics.

---

## 📦 File Structure

```
crypto_bot/
├── src/
│   ├── bot/
│   │   └── index.js          # Main bot + web server starter
│   ├── server/
│   │   └── index.js          # Express API routes
│   ├── signals/
│   │   └── analyzer.js       # Signal generation
│   └── telegram/
│       └── messenger.js      # Telegram integration
├── public/
│   ├── index.html            # Dashboard HTML
│   ├── css/
│   │   └── styles.css        # Dashboard styling
│   └── js/
│       └── dashboard.js      # Dashboard logic (Alpine.js)
└── data/
    └── signals.db            # SQLite database
```

---

## 🚀 Next Steps

### Recommended Improvements:

1. **Add Nginx Reverse Proxy**
   - Serve on port 80/443 with SSL
   - Add basic authentication
   - Enable HTTPS with Let's Encrypt

2. **Add More Metrics**
   - Daily/weekly PnL charts
   - Signal heatmap by time of day
   - Correlation analysis between tokens

3. **Mobile Optimization**
   - Dashboard is responsive but can be improved
   - Consider adding touch-friendly controls

4. **Real-Time Updates**
   - Add WebSocket support for live updates
   - Push notifications when new signals arrive

---

## 💡 Tips

- **Use filters**: Quickly find wins/losses to analyze what worked
- **Export CSV**: Use for offline analysis in Excel/Google Sheets
- **Monitor logs**: Check logs tab after manual scan to verify execution
- **Reset lock carefully**: Only use when you want to force a new signal today
- **Auto-refresh**: Dashboard updates every 30s, no need to manually refresh

---

## 🆘 Support

If you encounter issues:

1. Check `pm2 logs crypto-signals` for errors
2. Verify `.env` has `UI_PORT=3000`
3. Ensure Express is installed: `npm list express`
4. Check that database exists and is readable
5. Test API directly: `curl http://localhost:3000/api/stats`

---

**Enjoy your new dashboard! 🎉**
