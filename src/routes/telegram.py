"""
Telegram Mini App backend endpoints.

This blueprint exposes two routes used by the frontend when the app is
running inside a Telegram Mini App:

    POST /api/telegram/send_photo
        Headers:
            X-Telegram-Init-Data: raw initData string from Telegram.WebApp
        Body (multipart/form-data):
            image: the processed image file (jpg/png/webp)
            caption (optional): a short caption for the photo
        Response:
            {"ok": true, "message_id": <int>} on success
            {"ok": false, "error": "..."} on failure

The endpoint verifies the X-Telegram-Init-Data using the HMAC-SHA256
algorithm documented at https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
so that only requests originating from a real Telegram client with a
valid initData are accepted. Without this check, anyone could post to
the endpoint and abuse the bot.

The bot token is loaded from the TELEGRAM_BOT_TOKEN environment variable
and is never exposed to the browser.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
import urllib.parse
from typing import Any

import requests
from flask import Blueprint, current_app, jsonify, request

logger = logging.getLogger(__name__)

telegram_bp = Blueprint("telegram", __name__, url_prefix="/api/telegram")

# How old an initData may be (seconds). Telegram initData is short-lived;
# rejecting anything older than this is a defense in depth measure.
_INITDATA_MAX_AGE_SECONDS = 60 * 10  # 10 minutes


class TelegramAuthError(Exception):
    """Raised when an incoming request fails Telegram initData validation."""


def _load_bot_token() -> str:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token or token.startswith("PASTE_") or token.startswith("your_"):
        raise RuntimeError(
            "TELEGRAM_BOT_TOKEN is not configured. "
            "Set it in your .env file or environment."
        )
    return token


def _parse_init_data(raw: str) -> dict[str, str]:
    """
    Parse a raw initData query string into a dict. Repeated keys keep the
    last value, which matches how the rest of the app reads initData.
    """
    parsed: dict[str, str] = {}
    for chunk in raw.split("&"):
        if not chunk:
            continue
        if "=" not in chunk:
            continue
        key, value = chunk.split("=", 1)
        parsed[urllib.parse.unquote(key)] = urllib.parse.unquote(value)
    return parsed


def verify_telegram_init_data(raw_init_data: str, bot_token: str) -> dict[str, Any]:
    """
    Verify a Telegram Mini App initData string.

    Returns the parsed initData dict (with 'user' JSON-decoded if present)
    on success. Raises TelegramAuthError on any failure.

    Algorithm reference:
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    if not raw_init_data:
        raise TelegramAuthError("Missing initData")

    try:
        data = _parse_init_data(raw_init_data)
    except Exception as exc:  # pragma: no cover - defensive
        raise TelegramAuthError(f"Could not parse initData: {exc}") from exc

    received_hash = data.pop("hash", None)
    if not received_hash:
        raise TelegramAuthError("initData is missing the 'hash' field")

    # Build the data-check-string from the remaining fields, sorted by key.
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(data.items())
    )

    # The secret key is HMAC-SHA256(key="WebAppData", message=bot_token).
    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()

    computed_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise TelegramAuthError("initData signature is invalid")

    # Defense in depth: reject obviously stale initData.
    auth_date_raw = data.get("auth_date")
    if auth_date_raw:
        try:
            auth_date = int(auth_date_raw)
            if abs(int(time.time()) - auth_date) > _INITDATA_MAX_AGE_SECONDS:
                raise TelegramAuthError("initData is too old; please reload the app")
        except ValueError:
            raise TelegramAuthError("initData has an invalid auth_date")

    # Decode the nested user object if present so callers can use it.
    if "user" in data:
        try:
            data["user"] = json.loads(data["user"])
        except json.JSONDecodeError:
            # Not fatal; just leave it as the raw string.
            pass

    return data


def _extract_chat_id(init_data: dict[str, Any]) -> int:
    """
    Pull the chat_id (== user_id for private chats with the bot) out of a
    verified initData dict. The user object always carries the id when the
    mini app was opened from a private chat.
    """
    user = init_data.get("user")
    if isinstance(user, dict) and "id" in user:
        return int(user["id"])
    raise TelegramAuthError("initData does not contain a user id; cannot send photo")


@telegram_bp.post("/send_photo")
def send_photo():
    """
    Receive a processed image and forward it to the originating Telegram
    chat via the bot.
    """
    try:
        bot_token = _load_bot_token()
    except RuntimeError as exc:
        # Bot token not configured. Treat as a server config problem.
        logger.error("Bot token not configured: %s", exc)
        return jsonify({"ok": False, "error": "Server is missing bot token"}), 503

    init_data_raw = request.headers.get("X-Telegram-Init-Data", "").strip()
    try:
        init_data = verify_telegram_init_data(init_data_raw, bot_token)
        chat_id = _extract_chat_id(init_data)
    except TelegramAuthError as exc:
        logger.info("Rejected /api/telegram/send_photo: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 401

    if "image" not in request.files:
        return jsonify({"ok": False, "error": "No image file provided"}), 400

    image_file = request.files["image"]
    if not image_file or not image_file.filename:
        return jsonify({"ok": False, "error": "Empty image upload"}), 400

    # Cap the upload at 10 MB to match the frontend limit and stay under
    # Telegram's 10 MB photo upload ceiling.
    image_file.stream.seek(0, os.SEEK_END)
    size = image_file.stream.tell()
    image_file.stream.seek(0)
    max_bytes = 10 * 1024 * 1024
    if size <= 0:
        return jsonify({"ok": False, "error": "Empty image upload"}), 400
    if size > max_bytes:
        return jsonify({"ok": False, "error": "Image too large (max 10 MB)"}), 413

    caption = (request.form.get("caption") or "Your enhanced image ✨").strip()
    if len(caption) > 1024:
        caption = caption[:1021] + "..."

    api_url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"

    try:
        resp = requests.post(
            api_url,
            data={"chat_id": str(chat_id), "caption": caption},
            files={"photo": (image_file.filename, image_file.stream, image_file.mimetype or "image/jpeg")},
            timeout=60,
        )
    except requests.RequestException as exc:
        logger.exception("Telegram API call failed")
        return jsonify({"ok": False, "error": f"Could not reach Telegram: {exc}"}), 502

    try:
        payload = resp.json()
    except ValueError:
        logger.error("Telegram returned non-JSON: status=%s body=%r", resp.status_code, resp.text[:200])
        return jsonify({"ok": False, "error": "Telegram returned an invalid response"}), 502

    if not resp.ok or not payload.get("ok"):
        description = payload.get("description") or f"Telegram returned status {resp.status_code}"
        logger.warning("Telegram sendPhoto error: %s", description)
        return jsonify({"ok": False, "error": description}), 502

    result = payload.get("result") or {}
    return jsonify({
        "ok": True,
        "message_id": result.get("message_id"),
        "chat_id": chat_id,
    })
