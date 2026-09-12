# YN Studio — v11 cleanup

### JARVIS
- Rebuilt the admin AI interface instead of the previous basic chat drawer.
- Added quick prompts, clearer conversation hierarchy, admin page context, confirmation UI, and a dedicated voice console.
- Added realtime speech/transcript status handling.
- Improved voice connection error handling.
- Kept JARVIS admin-only.

### Security
- Removed the real `server/.env` from the distribution.
- Removed the repository `.git/` directory from the distribution.
- Added/kept `server/.env.example` with placeholders only.
- The API key remains server-side.

### Validation
- `server/server.js` passes Node's syntax check.
- Frontend production build could not be completed in the isolated inspection environment because the dependency install did not finish; the source changes were made without modifying the application's dependency versions.
