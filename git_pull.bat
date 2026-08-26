@echo off
setlocal enabledelayedexpansion
title Git Pull - PDF Form

echo ===================================================
echo           Git Pull / Sync Utility (PDF Form)
echo ===================================================
echo.
echo ---> Pulling PDF Form...
cd /d "%~dp0"
git pull origin main

echo.
echo ===================================================
echo Git Pull completed!
echo ===================================================
pause
