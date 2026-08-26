@echo off
setlocal enabledelayedexpansion
title Git Push - PDF Form

echo ===================================================
echo           Git Push / Upload Utility (PDF Form)
echo ===================================================
echo.

set /p MSG="Enter commit message (Leave empty for default timestamp): "
if "%MSG%"=="" (
    set MSG=Update PDF Form - %date% %time%
)

echo.
echo ---> Pushing PDF Form...
cd /d "%~dp0"
git add .
git commit -m "%MSG%"
git push origin main

echo.
echo ===================================================
echo Git Push completed!
echo ===================================================
pause
