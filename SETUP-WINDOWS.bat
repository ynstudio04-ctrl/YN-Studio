@echo off
setlocal
cd /d "%~dp0"
node -e "const v=process.versions.node.split('.')[0]; if(v!=='22'){console.error('ERROR: YN Studio requires Node.js 22 LTS. You are using Node '+process.version); process.exit(1)}"
if errorlevel 1 pause & exit /b 1
if not exist "%~dp0server\.env" copy /y "%~dp0server\.env.example" "%~dp0server\.env" >nul
for %%D in (server client customer) do (
  echo.
  echo Installing %%D dependencies...
  cd /d "%~dp0%%D"
  if exist node_modules rmdir /s /q node_modules
  call npm ci
  if errorlevel 1 (
    echo Failed installing %%D dependencies.
    pause
    exit /b 1
  )
)
cd /d "%~dp0"
echo.
echo Setup complete. Configure server\.env, then run RUN-WINDOWS.bat.
pause
