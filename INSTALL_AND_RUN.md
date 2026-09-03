# YN Studio — Clean Test Build

This is a separate copy of the app. Your original project is not modified.

## Required
- Windows 10/11
- Node.js 22 LTS (64-bit)

Do not use Node 24 for this project because the server uses native `better-sqlite3`.

## Setup
1. Extract this folder anywhere.
2. Install Node.js 22 LTS.
3. Double-click `SETUP-WINDOWS.bat`.
4. After setup completes, double-click `RUN-WINDOWS.bat`.

## URLs
- API: http://localhost:5000
- Admin: http://localhost:5173
- Customer: http://localhost:5174

## Manual commands
Server:
`cd server && npm install && npm start`

Admin:
`cd client && npm install && npm run dev`

Customer:
`cd customer && npm install && npm run dev -- --port 5174`

## Notes
The SQLite database in `server/ynstudio.db` is a copy for testing. Keep this folder separate from your original project until you are satisfied with the changes.
