@echo off
echo ========================================
echo   WoBePlaner - Automatisches Setup
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [FEHLER] Node.js ist nicht installiert!
    echo Bitte installieren Sie Node.js v18+ von https://nodejs.org
    pause
    exit /b 1
)

echo [1/2] Installiere Abhangigkeiten...
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo [FEHLER] npm install fehlgeschlagen!
    pause
    exit /b 1
)

echo.
echo [2/2] Setup abgeschlossen!
echo.
echo ========================================
echo   Naechste Schritte:
echo ========================================
echo   1. Starten Sie die App mit: npm run dev
echo   2. Oeffnen Sie: http://localhost:5173
echo   3. Tests ausfuehren mit: npm test
echo ========================================
echo.
pause
