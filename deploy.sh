#!/bin/bash

# Deployment Script for Crypto Signal Bot
# Usage: ./deploy.sh

echo "🚀 Deploying Crypto Signal Bot..."
echo "═════════════════════════════════════════════════════════════════"

# Pull latest code
echo "📥 Pulling latest code from git..."
git pull origin main

if [ $? -ne 0 ]; then
  echo "❌ Git pull failed. Aborting deployment."
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

if [ $? -ne 0 ]; then
  echo "❌ npm install failed. Aborting deployment."
  exit 1
fi

# Restart PM2 process
echo "🔄 Restarting PM2 process..."
pm2 restart crypto-signals

if [ $? -ne 0 ]; then
  echo "⚠️  Process not running. Starting fresh..."
  pm2 start ecosystem.config.cjs
fi

# Save PM2 process list
echo "💾 Saving PM2 process list..."
pm2 save

# Show status
echo ""
echo "✅ Deployment complete!"
echo "═════════════════════════════════════════════════════════════════"
echo ""
echo "📊 Process Status:"
pm2 status

echo ""
echo "💡 Useful commands:"
echo "   pm2 logs crypto-signals  - View logs"
echo "   pm2 monit               - Monitor resources"
echo "   pm2 restart crypto-signals - Restart bot"
echo ""
