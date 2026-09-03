# FREE JARVIS SETUP

This build removes the paid OpenAI Realtime voice dependency.

## What it uses
- Gemini Developer API free tier for JARVIS's text/agent brain.
- Browser Web Speech API for microphone recognition and spoken replies.
- Chrome or Edge is recommended.

## Render server environment
Set these variables on the API service:

GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-2.5-flash-lite

Do NOT put GEMINI_API_KEY in the client environment.

## Voice
Open the admin dashboard, open JARVIS, and press the microphone button. JARVIS will listen, send your words to the server, speak the answer through the browser, and listen again automatically.

Speech recognition availability varies by browser. Chrome/Edge are recommended.
