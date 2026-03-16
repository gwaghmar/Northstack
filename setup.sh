#!/bin/bash
# Northstack Setup Script
# Sets up both backend and frontend for development

set -e

echo "🚀 Northstack Setup"
echo "========================"

# Backend Setup
echo ""
echo "📦 Setting up Backend..."
cd backend

if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
fi

echo "Activating virtual environment..."
source .venv/bin/activate || . .venv/Scripts/activate

echo "Installing backend dependencies..."
pip install -r requirements.txt

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
# GCP Configuration
GCP_PROJECT_ID=your-gcp-project-id
GOOGLE_API_KEY=your-gemini-api-key

# Firebase Configuration
FIREBASE_CREDENTIALS_PATH=./firebase-credentials.json

# Gemini Configuration
GEMINI_MODEL=gemini-2.5-flash-native-audio-preview-12-2025

# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=false

# Cloud Storage
GCS_BUCKET_NAME=your-gcs-bucket-name
EOF
    echo "✅ Created .env file (fill in GCP credentials)"
fi

cd ..

# Frontend Setup
echo ""
echo "⚛️  Setting up Frontend..."
cd frontend

if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install Node.js"
    exit 1
fi

echo "Installing frontend dependencies..."
npm install

# Create .env.local if it doesn't exist
if [ ! -f ".env.local" ]; then
    echo "Creating .env.local file..."
    cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
EOF
    echo "✅ Created .env.local file"
fi

cd ..

echo ""
echo "✅ Setup Complete!"
echo ""
echo "📝 Next Steps:"
echo "1. Fill in GCP credentials in backend/.env"
echo "2. Run backend: cd backend && python main.py"
echo "3. Run frontend: cd frontend && npm run dev"
echo "4. Open http://localhost:3000 in your browser"
