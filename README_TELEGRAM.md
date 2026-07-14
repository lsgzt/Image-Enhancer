# Telegram Mini App support

This fork ships a small backend endpoint that lets the AI Image Enhancer
send the processed photo **directly to the user's Telegram chat** instead
of triggering a normal file download. The endpoint is only used when the
site is opened from a Telegram bot; normal browser visitors still get the
ordinary download button.

## Files added / changed

| Path | Why |
|------|-----|
| `src/routes/telegram.py`        | New Flask blueprint with `POST /api/telegram/send_photo`. Verifies Telegram's `initData` HMAC and forwards the image to the bot. |
| `src/main.py`                   | Registers the new blueprint and loads secrets from `.env`. |
| `requirements.txt`              | Adds `python-dotenv` for `.env` loading. |
| `.env` / `.env.example`         | Placeholder for `TELEGRAM_BOT_TOKEN`. The real value lives only in `.env` and is gitignored. |
| `.gitignore`                    | Ensures `.env` is never committed. |
| `src/static/script.js`          | When running inside a Telegram Mini App, the **Download** button now uploads the image to the backend and shows a toast. |
| `src/static/index.html`         | Loads the Telegram Web App SDK. |

## Security model

The endpoint does **not** accept anonymous requests. Every call must
include an `X-Telegram-Init-Data` header, and the backend recomputes the
HMAC-SHA256 signature using the bot token and compares it to the value
in the initData (constant-time compare). Stale initData (> 10 min old) is
also rejected. The chat id is read from the verified `user` object — so
the user can only send the image to their own chat, and only via a real
Telegram client.

The bot token is loaded from the `TELEGRAM_BOT_TOKEN` environment
variable (populated from `.env` via `python-dotenv`). It never leaves
the server.

## Running locally

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Add your bot token (talk to @BotFather to get one)
cp .env.example .env
$EDITOR .env          # set TELEGRAM_BOT_TOKEN=...

# 3. Start the Flask server
cd src
python main.py

# 4. Open the page in a browser, or open it from your Telegram bot to
#    try the "send to chat" flow.
```

## Wiring it into your Telegram bot

In @BotFather, set the menu button or add an inline button whose URL
points at the deployed Flask app (e.g. `https://your-app.example.com/`).
When the user opens the link from Telegram it loads the page as a Mini
App and `window.Telegram.WebApp.initData` will be available, which the
frontend reads and forwards to the backend.
