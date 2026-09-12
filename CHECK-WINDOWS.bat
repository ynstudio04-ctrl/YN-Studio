@echo off
setlocal
cd /d "%~dp0"
node -e "const v=process.versions.node.split('.')[0]; if(v!=='22'){console.error('ERROR: Use Node.js 22 LTS. Current: '+process.version); process.exit(1)}"
if errorlevel 1 pause & exit /b 1
for %%D in (server client customer) do (
  echo.
  echo ===== %%D =====
  cd /d "%~dp0%%D"
  call npm ci
  if errorlevel 1 goto :fail
  if "%%D"=="server" (node --check server.js) else (call npm run build)
  if errorlevel 1 goto :fail
  call npm run lint
  if errorlevel 1 goto :fail
)
cd /d "%~dp0"
echo.
echo ALL CHECKS PASSED.
pause
exit /b 0
:fail
cd /d "%~dp0"
echo.
echo CHECK FAILED. Read the error above.
pause
exit /b 1
