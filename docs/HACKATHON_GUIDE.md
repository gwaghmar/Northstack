# 🏆 Gemini Live Agent Challenge: Northstack Submission Guide

Northstack is a next-generation "Live Agent" that redefines language learning through real-time multimodal interaction.

## 🚀 Category Alignment

### 1. Live Agents 🗣️ (Primary)
- **Tech Stack**: Built with the **Gemini 2.5 Flash** model via the **Agent Development Kit (ADK)**.
- **Real-time Flow**: Seamlessly handles kHz 16-bit PCM audio and 10fps webcam vision streams over WebSockets.
- **Graceful Interruptions**: Leveraging the native Gemini Live audio capabilities to allow users to ask questions mid-coaching.

### 2. Creative Storyteller ✍️ (Secondary)
- **Interleaved Output**: Northstack (the coach) uses the `generate_visual_aid` tool to trigger **Vertex AI Imagen 3** during "Story Mode."
- **Multimodal Scenes**: Audio narration is woven with real-time generated storyboard images to create immersive linguistic environments.

## ☁️ Google Cloud Proof
- **Backend**: Hosted on **Google Cloud Run** for serverless scalability.
- **Storage**: **Cloud Storage** caches audio snippets and coaching assets.
- **Database**: **Firestore** tracks user progress, pronunciation scores, and session history over time.
- **AI Services**: Utilizes **Vertex AI (Imagen 3)** for visual aid generation and **Gemini 2.5 Flash** for core reasoning.

## 🛠️ Reproducibility (README Snippet)
1. **Clone**: `git clone [repo_url]`
2. **Setup**: Run `./setup.sh` to install python and node dependencies.
3. **Configure**: Add `GOOGLE_API_KEY` and `GCP_PROJECT_ID` to `backend/.env`.
4. **Launch**:
   - Backend: `cd backend && python main.py`
   - Frontend: `cd frontend && npm run dev`
5. **Visit**: `http://localhost:3000`

## 💎 Bonus Points
- ✅ **Automated Deployment**: `deploy.sh` handles Docker builds and Cloud Run deployments.
- ✅ **Advanced ADK Usage**: Extends the `LlmAgent` with specialized coaching tools.
- ✅ **Premium UX**: Glassmorphic UI with Three.js avatar synchronization.
