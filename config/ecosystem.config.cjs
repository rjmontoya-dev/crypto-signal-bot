/**
 * PM2 Ecosystem Configuration
 * Production-ready process management for 24/7 uptime
 * 
 * Usage:
 *   pm2 start ecosystem.config.js       - Start the bot
 *   pm2 logs crypto-signals             - View logs
 *   pm2 monit                            - Monitor resources
 *   pm2 restart crypto-signals           - Restart bot
 *   pm2 stop crypto-signals              - Stop bot
 *   pm2 save                             - Save process list
 *   pm2 startup                          - Enable auto-start on reboot
 */

module.exports = {
  apps: [{
    name: 'crypto-signals',
    script: 'src/bot/index.js',
    
    // Environment variables
    env: {
      NODE_ENV: 'production',
      PAPER_TRADING: 'false',  // Override to false in production
      UI_PORT: '3000'  // Web dashboard port
    },
    
    // Logging configuration
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    time: true,
    
    // Auto-restart configuration
    autorestart: true,
    watch: false,  // Set to true if you want auto-restart on file changes
    max_restarts: 10,  // Maximum consecutive restarts
    min_uptime: '10s',  // Minimum uptime before considered stable
    
    // Resource limits
    max_memory_restart: '500M',  // Restart if memory exceeds 500MB
    
    // Advanced options
    instances: 1,  // Single instance (cron scheduled)
    exec_mode: 'fork',  // Fork mode (not cluster)
    
    // Graceful shutdown
    kill_timeout: 5000,  // 5 seconds to gracefully shutdown
    listen_timeout: 3000,
    
    // Cron restart (optional - restart daily at 3 AM)
    // cron_restart: '0 3 * * *',
    
    // Merge logs
    merge_logs: true,
    
    // Error handling
    exp_backoff_restart_delay: 100,  // Exponential backoff on restart
  }]
};
