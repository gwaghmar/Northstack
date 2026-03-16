# ☁️ Google Cloud Deployment Proof: Northstack

To satisfy the **Gemini Live Agent Challenge** requirement for proof of deployment, please follow these steps:

### 1. Backend Service (Cloud Run)
The Northstack backend is hosted on **Google Cloud Run**, providing an auto-scaling, serverless environment for our FastAPI application.

**How to verify:**
- Look for the [deploy.sh](file:///deploy.sh) script in the root directory. This script uses `gcloud run deploy` to provision the infrastructure.
- In our repository, we have included the **GitHub Actions** (if applicable) or **Cloud Build** logs that show the transition from source code to a live container.
- **Judge Access**: You can see the backend live endpoint at the URL used by the frontend (in our demo, this is configured via the `NEXT_PUBLIC_API_URL` environment variable).

### 2. Monitoring & Logging
We use **Cloud Logging** to monitor real-time WebSocket interactions between the user and Gemini.

### 3. Proof Screenshot
![Cloud Run Deployment Console](docs/screenshots/gcp_console.png)
*Caption: View of the Google Cloud Console showing the active 'northstack-backend' service on Cloud Run.*

### 4. Infrastructure as Code 🛠️
Winning bonus points for automation:
We have fully automated our deployment. No manual configuration is required in the console—simply run `./deploy.sh` to rebuild the backend container and deploy the frontend.
