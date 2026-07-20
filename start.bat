@echo off
echo.
echo =============================================
echo  Patel AutoPrint - Starting All Services
echo =============================================
echo.

:: 1. Start PostgreSQL (if not running)
echo [1/4] Checking PostgreSQL...
sc query postgresql-x64-17 >nul 2>&1
if %errorlevel% neq 0 (
    echo Starting PostgreSQL service...
    net start postgresql-x64-17 >nul 2>&1
    if %errorlevel% neq 0 (
        echo WARNING: Could not start PostgreSQL automatically.
        echo Please start it manually or install PostgreSQL.
        echo.
    ) else (
        echo PostgreSQL started.
    )
) else (
    echo PostgreSQL is already running.
)
echo.

:: 2. Start Node Server
echo [2/4] Starting Node server on port 5000...
cd /d "C:\Users\mayank\Documents\New OpenCode Project\patel-autoprint\backend"
set NODE_ENV=development
set DATABASE_URL=postgresql://postgres:123@localhost:5432/patel_autoprint?schema=public
set JWT_SECRET=your-secret-key
start "Patel Server" cmd /k "node src\server.js"
echo Server starting in new window...
timeout /t 5 /nobreak >nul
echo.

:: 3. Start Cloudflare Tunnel
echo [3/4] Starting Cloudflare Tunnel...
cd /d "C:\Users\mayank\Documents\New OpenCode Project\patel-autoprint"
start "Cloudflare Tunnel" cmd /k "cloudflared.exe tunnel --url http://localhost:5000"
echo Tunnel starting in new window...
timeout /t 5 /nobreak >nul
echo.

:: 4. Start Agent (optional)
echo [4/4] Starting Print Agent...
cd /d "C:\Users\mayank\Documents\New OpenCode Project\patel-autoprint\agent"
if exist "config.json" (
    start "Print Agent" cmd /k "node index.js"
    echo Agent starting in new window...
) else (
    echo No agent config.json found. Run: node index.js --setup
)
echo.

echo =============================================
echo  All services started!
echo =============================================
echo.
echo  Server:     http://localhost:5000
echo  Agent:      Check the Print Agent window
echo  Tunnel:     Check the Cloudflare Tunnel window for public URL
echo  Admin Login: admin@patelautoprint.com / admin123
echo.
echo  Share the Cloudflare URL with customers.
echo.
pause
