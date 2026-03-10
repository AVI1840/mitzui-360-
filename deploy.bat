@echo off
chcp 65001 >nul
echo ============================================
echo    מיצוי 360 — Build + Deploy to GitHub
echo ============================================
echo.

echo [1/3] Building...
call npx vite build
if %ERRORLEVEL% NEQ 0 (
    echo BUILD FAILED
    pause
    exit /b 1
)
echo Build OK!
echo.

echo [2/3] Committing...
git add -A
git commit -m "deploy: build %date% %time%"
echo.

echo [3/3] Pushing to GitHub...
git push origin main
echo.

echo ============================================
echo    Done! GitHub Actions will deploy automatically.
echo    Check: Settings → Pages for your URL.
echo ============================================
pause
