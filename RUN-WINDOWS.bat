@echo off
setlocal
cd /d "%~dp0"
node -e "const v=process.versions.node.split('.')[0]; if(v!=='22'){console.error('ERROR: YN Studio requires Node.js 22 LTS. You are using Node '+process.version); process.exit(1)}"
if errorlevel 1 pause & exit /b 1
start "YN Studio API" cmd /k "cd /d "%~dp0server" && npm start"
timeout /t 2 /nobreak >nul
start "YN Studio Admin" cmd /k "cd /d "%~dp0client" && npm run dev"
start "YN Studio Customer" cmd /k "cd /d "%~dp0customer" && npm run dev -- --port 5174"
echo.
echo API:      http://localhost:5000
echo Admin:    http://localhost:5173
echo Customer: http://localhost:5174
echo.
pause
