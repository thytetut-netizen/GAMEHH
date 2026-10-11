@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE="
where node.exe >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not defined NODE_EXE (
  echo Node.js 20 or newer is required to run the game.
  echo Install Node.js, then double-click this file again.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('"%NODE_EXE%" -p "Number(process.versions.node.split('.')[0])"') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR (
  echo Could not determine the Node.js version.
  pause
  exit /b 1
)
if %NODE_MAJOR% LSS 20 (
  echo Node.js 20 or newer is required. Found major version %NODE_MAJOR%.
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" (
  echo Game dependencies are missing. Open a terminal in this folder and run: npm install
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo The production game files are missing. Open a terminal in this folder and run: npm run build
  pause
  exit /b 1
)

set "NODE_ENV=production"
set "PORT=3001"
start "OPERATION HEBREW server" /min "%NODE_EXE%" "%CD%\server\index.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3001"
