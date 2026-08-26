@echo off
title Run PDF Form Locally - Port 8001/3000

echo ===================================================
echo   Starting PDF Form Portal Locally (Non-Docker)
echo ===================================================
echo.

cd /d "%~dp0"

if not exist "backend\.env" (
    if exist "backend\.env.example" copy "backend\.env.example" "backend\.env"
)
if not exist "frontend\.env" (
    if exist "frontend\.env.example" copy "frontend\.env.example" "frontend\.env"
)

start "PDF Form Backend (Port 8001)" cmd /k "cd /d "%~dp0backend" && python -m uvicorn server:app --port 8001 --reload"
start "PDF Form Frontend (Port 3000)" cmd /k "cd /d "%~dp0frontend" && npm start"

echo.
echo PDF Form launched:
echo - Backend:  http://localhost:8001
echo - Frontend: http://localhost:3000
pause
