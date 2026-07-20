@echo off
echo Starting server on port 5000...
start "Patel Server" cmd /c "cd /d "C:\Users\mayank\Documents\New OpenCode Project\patel-autoprint\backend" && set NODE_ENV=development && set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/patel_autoprint && node src\server.js"

timeout /t 8 /nobreak >nul

echo Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /c "C:\Users\mayank\Documents\New OpenCode Project\patel-autoprint\cloudflared.exe tunnel --url http://localhost:5000"

echo.
echo Server and tunnel starting...
echo Check the Cloudflare Tunnel window for your public URL.
echo Share that URL with customers to upload files.
