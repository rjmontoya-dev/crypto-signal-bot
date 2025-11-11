# Telegram Bot Setup Instructions

## Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` command
3. Follow prompts to name your bot
4. Copy the **bot token** (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

## Step 2: Get Your User ID

1. Search for **@userinfobot** on Telegram
2. Send `/start` command
3. Copy your **user ID** (a number like: `123456789`)

## Step 3: Update .env File

Edit `.env` and replace placeholder values:

```env
TELEGRAM_BOT_TOKEN=paste_your_bot_token_here
TELEGRAM_USER_ID=paste_your_user_id_here
```

## Step 4: Test the Bot

```powershell
# Test with direct execution
node src/messenger.js

# Or test with import
node -e "import('./src/messenger.js').then(m => m.testSend())"
```

## Expected Result

You should receive a test signal message in Telegram with:
- Formatted trading signal
- Two interactive buttons: "✅ I Took This Trade" and "❌ Skip"

## Troubleshooting

- **"Telegram bot token not configured"**: Check your .env file
- **"401 Unauthorized"**: Bot token is incorrect
- **"400 Bad Request"**: User ID is incorrect or you haven't started the bot yet
  - Solution: Open your bot in Telegram and send `/start` first
- **No message received**: Make sure bot and user ID are correct

## Note

The bot will stay running after sending the test message to handle button clicks.
Press `Ctrl+C` to stop it.
