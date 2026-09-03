# JARVIS — YN Studio Administrator AI

JARVIS is available only in the admin application. It can inspect YN Studio data, navigate the admin UI, review pending payments/savings, and perform supported administrator actions. Financial/destructive actions require confirmation.

## Environment
Set these on the Render API/server service only:

- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-5.6-luna`
- `OPENAI_REALTIME_MODEL=gpt-realtime-2.1`
- `OPENAI_REALTIME_VOICE=cedar`

Never put the OpenAI key in the client/customer frontend, source control, or a shared ZIP.

## Voice
The admin JARVIS UI uses OpenAI Realtime over WebRTC. The browser requests microphone access and the server creates the Realtime session, so the API key remains server-side.

The redesigned UI includes:
- a compact JARVIS command-center panel;
- quick admin prompts;
- current admin page context;
- clearer action-confirmation controls;
- a dedicated live voice console;
- voice status/transcript feedback;
- responsive mobile layout.

## If the previous ZIP was shared
Rotate any API keys/secrets that were included in that archive before deploying this cleaned build.
