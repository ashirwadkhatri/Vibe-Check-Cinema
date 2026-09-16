@echo off
cd /d "%~dp0"

rem Check if pnpm is available
where pnpm >nul 2>&1
if not errorlevel 1 (
    set "PM_CMD=pnpm dev"
) else (
    where npm >nul 2>&1
    if not errorlevel 1 (
        set "PM_CMD=npm run dev"
    ) else (
        echo [ERROR] Neither pnpm nor npm found. Please install Node.js and pnpm/npm.
        pause
        exit /b 1
    )
)

rem Start Node.js server in a new window
start "" "Node.js Server" cmd /k "set NODE_ENV=development && %PM_CMD%"

rem Start Python cache service in a new window
start "" "Python Cache Service" cmd /k "cd python-cache-service && run.bat"

echo.
echo Both services have been launched in separate windows.
echo.
echo Node.js Server (Frontend + API): http://localhost:3000
echo Python Cache Service (Backend):   http://localhost:8000
echo.
echo To stop a service, close its respective window.
echo.