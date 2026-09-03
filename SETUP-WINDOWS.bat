@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0server\.env" copy /y "%~dp0server\.env.example" "%~dp0server\.env" >nul
echo ==============================================
echo YN STUDIO - FIRST TIME SETUP
 echo ==============================================
node -e "const v=process.versions.node.split('.')[0]; if(v!=='22'){console.error('ERROR: YN Studio requires Node.js 22 LTS. You are using Node '+process.version); process.exit(1)}"
if errorlevel 1 pause & exit /b 1
for %%D in (server client customer) do (
  echo.
  echo Installing %%D dependencies...
  cd /d "%~dp0%%D"
  if exist node_modules rmdir /s /q node_modules
  call npm install
  if errorlevel 1 (
    echo Failed installing %%D
    pause
    exit /b 1
  )
)
cd /d "%~dp0"
echo.
echo Setup complete. Run RUN-WINDOWS.bat next.
pause
