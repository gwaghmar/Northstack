#!/bin/bash
# Unified Deployment Script for Northstack
# Deploys Backend to Google Cloud Run and Frontend to Firebase Hosting

set -e

# Configuration
PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "voice-fit-ai-aa060")
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" == "(unset)" ]; then
  PROJECT_ID="voice-fit-ai-aa060"
fi
REGION="us-central1"
BACKEND_SERVICE="northstack-backend"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${BACKEND_SERVICE}:latest"

echo "--------------------------------------------------------"
echo "🚀 Starting Unified Deployment for Northstack"
echo "Project ID: ${PROJECT_ID}"
echo "Region:     ${REGION}"
echo "--------------------------------------------------------"

# 1. Build and Deploy Backend
echo "📦 Step 1: Building and Deploying Backend to Cloud Run..."
gcloud builds submit --project ${PROJECT_ID} --tag ${IMAGE_NAME} ./backend

gcloud run deploy ${BACKEND_SERVICE} \
  --project ${PROJECT_ID} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --set-env-vars GCP_PROJECT_ID=${PROJECT_ID} \
  --memory 2Gi \
  --timeout 3600 \
  --max-instances 10

# Get Backend URL
BACKEND_URL=$(gcloud run services describe ${BACKEND_SERVICE} --project ${PROJECT_ID} --platform managed --region ${REGION} --format 'value(status.url)')
echo "✅ Backend deployed at: ${BACKEND_URL}"

# 2. Build and Deploy Frontend
echo ""
echo "📦 Step 2: Building and Deploying Frontend to Firebase Hosting..."
cd frontend

# Update .env.production with the new backend URL
echo "NEXT_PUBLIC_API_URL=${BACKEND_URL}" > .env.production

npm install
npm run build

firebase deploy --only hosting

echo ""
echo "--------------------------------------------------------"
echo "🎉 Northstack Deployment Complete!"
echo "Backend:  ${BACKEND_URL}"
echo "Frontend: https://${PROJECT_ID}.web.app"
echo "--------------------------------------------------------"
