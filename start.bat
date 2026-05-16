@echo off
echo ================================================
echo  ConstructAdmin — Backend Setup
echo ================================================
echo.

cd /d "%~dp0"

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python is not installed or not in PATH.
  pause
  exit /b 1
)

:: Create virtual environment if not exists
if not exist "venv" (
  echo Creating virtual environment...
  python -m venv venv
)

:: Activate and install
echo Installing dependencies...
call venv\Scripts\activate.bat
pip install -r requirements.txt --quiet

echo.
echo Creating admin user (if not exists)...
python seed.py

echo.
echo ================================================
echo  Starting Flask server on http://127.0.0.1:5000
echo ================================================
python app.py
pause
