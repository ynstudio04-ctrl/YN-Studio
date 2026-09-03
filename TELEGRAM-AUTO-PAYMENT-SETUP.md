# YN Studio — Telegram Wallet Auto-Verification

This build changes customer wallet top-ups so a receipt upload is not required.

## Flow

1. Customer enters an amount and creates a wallet payment request.
2. The app keeps that payment `pending`.
3. Customer pays the exact amount through the displayed payment method.
4. Telegram sends the configured bank-notification message to the YN Studio webhook.
5. The server checks the configured Telegram chat, extracts the incoming amount, and looks for exactly one pending wallet request with the same amount inside the configured time window.
6. Only an unambiguous match is auto-approved. The wallet balance and wallet transaction are updated in one database transaction.
7. The customer receives an in-app notification.

If there are zero matches or multiple matches, the server deliberately leaves the payment pending for admin review. Amount-only matching is not safe when two customers can request the same amount at the same time.

## Environment variables

Set these on the server/Render service only:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_WEBHOOK_URL` — public API origin, such as `https://your-api.onrender.com`
- `TELEGRAM_WEBHOOK_SECRET` — optional secret
- `TELEGRAM_PAYMENT_CURRENCIES=KHR,USD`
- `TELEGRAM_AUTO_APPROVE_WINDOW_MINUTES=20`

Never put the bot token in the customer or admin frontend.

## Telegram group requirements

Add the bot to the group that receives the bank notifications and configure the exact chat ID. Telegram bots normally have Privacy Mode enabled; a bot added as an administrator receives all group messages. If the bank notification is sent by another bot, Telegram has additional bot-to-bot restrictions, so the notification source must actually be visible to the receiving bot. If it is not, use a supported direct bank/API integration instead of trying to scrape a personal Telegram account.

The server registers the webhook automatically at startup when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_URL` are configured.

## Important matching rule

The implementation intentionally does **not** auto-approve from amount alone if multiple pending requests have the same amount. For stronger matching, add a unique payment reference/order ID that the bank notification also contains.

## UI

The customer wallet no longer asks for a receipt. The old upload controls are hidden and the payment instructions explain automatic verification.

The admin and customer apps share a new V4 visual system so all existing pages use the same spacing, cards, buttons, forms, navigation, status pills, and responsive behavior without changing the existing business routes.


## Payment types
Telegram auto-verification supports Wallet deposits, Savings payments, and Order payments. The ABA message amount is read from the beginning of the message. The payer name is matched to exactly one customer. If an order and saving payment are both equally possible, the system does not guess and leaves the payment for admin review.
