@echo off
REM Northstack Setup Script for Windows
REM Sets up both backend and frontend for development

setlocal enabledelayedexpansion

echo.
echo 🚀 Northstack Setup
echo ========================
echo.

REM Backend Setup
echo 📦 Setting up Backend...
cd backend

if not exist ".venv" (
    echo Creating Python virtual environment...
    python -m venv .venv
)

echo Activating virtual environment...
call .venv\Scripts\activate.bat

echo Installing backend dependencies...
python -m pip install -r requirements.txt

REM Create .env file if it doesn't exist
if not exist ".env" (
    echo Creating .env file...
    (
        echo # GCP Configuration
        echo GCP_PROJECT_ID=your-gcp-project-id
        echo GOOGLE_API_KEY=your-gemini-api-key
        echo.
        echo # Firebase Configuration
        echo FIREBASE_CREDENTIALS_PATH=./firebase-credentials.json
        echo.
        echo # Gemini Configuration
        echo GEMINI_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
        echo.
        echo # Server Configuration
        echo HOST=0.0.0.0
        echo PORT=8000
        echo DEBUG=false
        echo.
        echo # Cloud Storage
        echo GCS_BUCKET_NAME=your-gcs-bucket-name
    ) > .env
    echo ✅ Created .env file (fill in GCP credentials^)
)

cd ..

REM Frontend Setup
echo.
echo ⚛️  Setting up Frontend...
cd frontend

where npm >nul 2>nul
if errorlevel 1 (
    echo ❌ npm not found. Please install Node.js
    exit /b 1
)

echo Installing frontend dependencies...
call npm install

REM Create .env.local if it doesn't exist
if not exist ".env.local" (
    echo Creating .env.local file...
    (
        echo NEXT_PUBLIC_API_URL=http://localhost:8000
        echo NEXT_PUBLIC_WS_URL=ws://localhost:8000
    ) > .env.local
    echo ✅ Created .env.local file
)

cd ..

echo.
echo ✅ Setup Complete!
echo.
echo 📝 Next Steps:
echo 1. Fill in GCP credentials in backend\.env
echo 2. Run backend: cd backend ^&^& python main.py
echo 3. Run frontend: cd frontend ^&^& npm run dev
echo 4. Open http://localhost:3000 in your browser
echo.
pause
