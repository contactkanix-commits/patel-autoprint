@echo off
echo ========================================
echo  Patel AutoPrint Admin - Build EXE
echo ========================================
echo.

cd /d "%~dp0"

echo Installing dependencies...
npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo Building desktop app...
npm run package
if errorlevel 1 (
    echo ERROR: npm run package failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo  BUILD COMPLETE
echo  Installer location: desktop\dist-electron\
echo ========================================
pause
