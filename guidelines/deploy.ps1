# Deployment Script for Crypto Signal Bot (Windows PowerShell)
# Usage: .\deploy.ps1

Write-Host "Deploying Crypto Signal Bot..." -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Gray

# Pull latest code
Write-Host "Pulling latest code from git..." -ForegroundColor Yellow
git pull origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "Git pull failed. Aborting deployment." -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install --production

if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed. Aborting deployment." -ForegroundColor Red
    exit 1
}

# Restart PM2 process
Write-Host "Restarting PM2 process..." -ForegroundColor Yellow
pm2 restart crypto-signals

if ($LASTEXITCODE -ne 0) {
    Write-Host "Process not running. Starting fresh..." -ForegroundColor Yellow
    pm2 start ecosystem.config.cjs
}

# Save PM2 process list
Write-Host "Saving PM2 process list..." -ForegroundColor Yellow
pm2 save

# Show status
Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Gray
Write-Host ""
Write-Host "Process Status:" -ForegroundColor Cyan
pm2 status

Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "   pm2 logs crypto-signals  - View logs"
Write-Host "   pm2 monit               - Monitor resources"
Write-Host "   pm2 restart crypto-signals - Restart bot"
Write-Host ""
