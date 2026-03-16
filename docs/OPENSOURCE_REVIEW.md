# LiveAccentCoach — Open Source Review & Integration Guide

**Date:** March 13, 2026  
**Status:** Comprehensive technical review with recommended projects  
**Deadline:** March 16, 2026 (3 days)

---

## Executive Summary

**Northstack** has been thoroughly reviewed and **is technically feasible within the 5-day sprint**. Three key open-source projects are recommended for integration, covering core features:

| Feature Area | Recommended Project | Integration Priority | Reason |
|---|---|---|---|
| **Speech Recognition & Transcription** | **Whisper (OpenAI)** | 🔴 CRITICAL | Multilingual, real-time capable, state-of-the-art accuracy |
| **Mouth Tracking & Avatar Sync** | **MediaPipe** | 🔴 CRITICAL | Already committed; 478 landmarks + 52 blendshapes available |
| **3D Avatar Rendering** | **three.js** or **Babylon.js** | 🔴 CRITICAL | WebGL-based; battle-tested for real-time 3D in browsers |
| **WebSocket Audio Infrastructure** | **ADK** (already planned) + optional **Jitsi** | 🟡 OPTIONAL | ADK sufficient; Jitsi useful if session resilience needed |

---

## Part 1: LiveAccentCoach Project Review

### Project Strengths ✅

#### 1. **Clear Problem & Novel Differentiation**
- **Problem:** Existing accent coaches (ELSA, BoldVoice, Duolingo) lack real-time, camera-based, mouth-position coaching
- **Novelty:** Combining MediaPipe mouth tracking + Gemini Live voice + 3D avatar = **ZERO existing competitors do this**
- **Judge Appeal:** Satisfies "Innovation & Multimodal UX" criteria (40% of score)

#### 2. **Technically Grounded Architecture**
- **Frontend:** Next.js + MediaPipe (standard React ML stack)
- **Backend:** Python FastAPI + ADK (Google-approved, with examples)
- **Cloud:** GCP Cloud Run (meets hackathon requirement)
- **Live API:** Gemini 2.5 Flash Native Audio (correct model for low latency)

#### 3. **Realistic 5-Day Sprint Plan**
- Day-by-day breakdown provided in `SPRINT_TODO.md`
- Leverages proven scaffolding (ADK bidi-demo fork)
- Phased delivery: Day 1-3 core features, Day 4-5 polish + demo

#### 4. **Competitive Analysis Well-Done**
- Benchmarked against 8+ competitors
- Identified unique selling points (mouth position visualization + live coaching)
- Honest about feature gaps (will catch up later)

---

### Project Gaps / Risks ⚠️

| Risk | Severity | Mitigation |
|---|---|---|
| **Session Duration Limit** (2 min for audio+video) | 🔴 HIGH | ADK config includes context window compression (REQUIRED in code) |
| **Avatar 3D Model** (not designed yet) | 🔴 HIGH | Use pre-built parametric face avatar or import GLTF model; libraries exist |
| **Pronunciation Scoring Logic** (not defined) | 🔴 HIGH | Use Gemini's output + phoneme-level feedback from Whisper + manual scoring thresholds |
| **Frontend WebSocket Streaming** (complex) | 🟡 MEDIUM | Reference code exists in ADK samples; Copy/paste pattern from bidi-demo |
| **MediaPipe Blendshape Extraction** (new tech) | 🟡 MEDIUM | Use official examples; library is well-documented with demos |
| **GCP Deployment Script** (not in repo) | 🟡 MEDIUM | Generate via `gcloud run deploy` CLI; optional for MVP |
| **Demo Video** (production quality needed) | 🟡 MEDIUM | Record real-time interaction; OBS studio; edit with Premiere/DaVinci |

---

### Key Compliance Checklist ✅

| Requirement | Status | Notes |
|---|---|---|
| **Leverage Gemini model** | ✅ YES | Using Gemini 2.5 Flash |
| **Use GenAI SDK OR ADK** | ✅ YES | ADK Python + Gemini Live API Toolkit |
| **Use ≥1 GCP service** | ✅ YES | Cloud Run, Firestore, Cloud Storage (3 services) |
| **Use Gemini Live API** | ✅ YES | Core to backend architecture |
| **Backend on Google Cloud** | ✅ YES | Cloud Run (serverless FastAPI) |
| **Public GitHub repo** | ✅ PLANNED | Must have README with spin-up instructions |
| **Proof of Deployment** | ✅ PLANNED | Screenshot/code file link to Cloud Run |
| **Architecture Diagram** | ✅ PLANNED | Create before demo video |
| **< 4-minute Demo Video** | ✅ PLANNED | Show real-time features (Gemini Live + MediaPipe + 3D avatar) |

---

## Part 2: Recommended Open-Source Projects for Integration

### 🔴 TIER 1: CRITICAL FOR MVP (Integrate within 2 days)

---

#### **1. MediaPipe (34.1K ⭐)**

**Repository:** [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe)

**What it is:**  
Cross-platform ML framework for on-device perception pipelines. Provides **Face Landmarker** task with 478 facial landmarks and 52 blend shapes (including jaw, mouth, tongue).

**Why Essential:**
- Already planned in your project spec ✅
- Production-ready: Used by Google Meet, TikTok, Snapchat
- Web implementation via `@mediapipe/tasks-vision` npm package
- **Key capability:** `mouthOpen`, `jawOpen`, `mouthPucker`, `tongueOut` blend shapes drive your 3D avatar

**Quick Integration:**

```bash
# Frontend dependency
npm install @mediapipe/tasks-vision

# Python backend (if overlay visualization needed)
pip install mediapipe
```

**Example Code (React Hook):**

```typescript
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const useFaceLandmarks = () => {
  const [faceLandmarker, setFaceLandmarker] = useState(null);

  useEffect(() => {
    const initalize = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const landmarker = await FaceLandmarker.createFromOptions(
        vision,
        { runningMode: "VIDEO" }
      );
      setFaceLandmarker(landmarker);
    };
    initalize();
  }, []);

  const detect = (videoElement) => {
    if (!faceLandmarker) return null;
    const results = faceLandmarker.detectForVideo(videoElement, Date.now());
    return results.faceBlendshapes?.[0]?.categories; // Array of {categoryName, score}
  };

  return { detect };
};
```

**Key Blendshapes for Mouth Coaching:**
- `mouthOpen` (0-1) → Jaw height
- `jawOpen` (0-1) → Jaw depth
- `mouthPucker` (0-1) → Lip rounding
- `tongueOut` (0-1) → Tongue protrusion
- `mouthFunnel` (0-1) → Mouth funnel shape

**Recommendation:**  
✅ **Keep using as planned.** No changes needed. Reference [FaceLandmarker web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web).

---

#### **2. Whisper (70K+ ⭐) — Optional but Recommended**

**Repository:** [openai/whisper](https://github.com/openai/whisper)

**What it is:**  
State-of-the-art speech-to-text model supporting 70+ languages. Robust to accents, background noise, and technical speech.

**Why Consider Adding:**
- **Gemini Live API limitation:** While Gemini transcribes, adding Whisper gives you **independent phoneme-level scoring**
- **Accent detection:** Whisper trained on diverse accents; can identify "non-target accent features"
- **Offline capability:** Run locally if needed for privacy
- **Multilingual:** Perfect for "coaching in 70 languages" goal
- **Open source:** Can fine-tune on custom accent dataset later

**Current Plan Issues:**
- You're relying on **Gemini Live API's internal transcription + Gemini's coaching feedback**
- **Gap:** Gemini won't give you structured phoneme-level error loc ations
- **Solution:** Run Whisper on the backend in parallel:
  1. User speaks → streamed to backend
  2. Backend passes to both **Gemini Live API** (for coaching) + **Whisper** (for transcription)
  3. Compare transcriptions + extract phoneme mismatches
  4. Send structured data to frontend for visualization

**Integration (Backend):**

```python
# FastAPI backend addition
import whisper
from adk.streaming import LiveRequestQueue

# Load model once (at startup — slow)
model = whisper.load_model("base")  # Other: "tiny", "small", "medium", "large"

# In your live session handler:
async def handle_audio_chunk(audio_bytes):
    # 1. Send to Gemini Live API (existing)
    await send_to_gemini_live(audio_bytes)
    
    # 2. Also transcribe with Whisper for detailed feedback
    transcription = model.transcribe(audio_bytes, language="en")
    phoneme_details = extract_phonemes(transcription)
    
    # 3. Combine both signals
    feedback = {
        "gemini_coaching": await get_gemini_response(),
        "phoneme_accuracy": phoneme_details,
        "target_pronunciation": get_target(phoneme_details)
    }
    return feedback
```

**Trade-off Analysis:**

| Aspect | Gemini Only | Gemini + Whisper |
|---|---|---|
| **Latency** | ~400ms | ~800-1200ms (Whisper slower) |
| **Phoneme Detail** | Verbal feedback only | Structured JSON scoring |
| **Languages** | 70 (Gemini) | 70+ (Whisper) |
| **Cost** | Lower (Gemini API calls) | +Whisper inference cost |
| **Accuracy** | Good | Better (dual confirmation) |

**Recommendation:**  
🟡 **OPTIONAL for MVP.** If you have time on Day 3, add it. Otherwise, rely on Gemini's coaching output for Day 1-2 deadline.

**If you skip Whisper:** Gemini is likely sufficient for a hackathon demo. The judges prioritize "innovation + working demo" over precision metrics.

---

#### **3. three.js (100K+ ⭐) or Babylon.js (25K+ ⭐)**

**Repository:** [mrdoob/three.js](https://github.com/mrdoob/three.js)

**What it is:**  
JavaScript 3D graphics library using WebGL. Industry standard for web-based 3D rendering.

**Why Essential:**
- **Avatar Rendering:** Display a 3D face model that mirrors user's mouth position in real-time
- **Blend Shapes:** Support for facial rig blend shapes (mouth open, jaw move, etc.)
- **Low Latency:** Can update 60+ FPS to sync with MediaPipe landmarks
- **Asset Format:** Import pre-made avatars in glTF/FBX format

**Your Use Case — Real-Time Mouth Sync:**

```typescript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Load avatar model (pre-rigged with blend shapes)
const loader = new GLTFLoader();
loader.load('avatar.glb', (gltf) => {
  const avatar = gltf.scene;
  scene.add(avatar);
  
  // Hook MediaPipe blendshape output to avatar morphs
  const updateAvatarMouth = (faceLandmarks) => {
    const blendshapes = faceLandmarks[0].categories;
    
    // Map MediaPipe → Three.js morph targets
    avatar.traverse((node) => {
      if (node.morphTargetInfluences) {
        blendshapes.forEach(({ categoryName, score }) => {
          // Find matching morph target
          const idx = node.morphTargetDictionary?.[categoryName];
          if (idx !== undefined) {
            node.morphTargetInfluences[idx] = score;
          }
        });
      }
    });
  };
  
  // In animation loop:
  function animate() {
    const landmarks = detect(videoElement); // From MediaPipe
    if (landmarks) updateAvatarMouth(landmarks);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
});
```

**Where to Get Avatar Models:**
- **Free:** [Sketchfab](https://sketchfab.com) (filter: Creative Commons, glTF format)
- **Free & Rigged:** [Mixamo](https://www.mixamo.com) (rigged humanoid models)
- **OpenSource:** [Blender](https://www.blender.org) (model + rig yourself)
- **Ready-to-use:** [Babylon.js has default avatar](https://doc.babylonjs.com/features/featuresDeepDive/Babylonjs_and_Web_Tokens_Security)

**Recommendation:**  
✅ **REQUIRED.** Use three.js (lighter weight than Babylon for this use case).

**Timeline:** Integrate on **Day 2 afternoon** (after frontend scaffold).

---

### 🟡 TIER 2: INFRASTRUCTURE & OPTIONAL ENHANCEMENTS (Nice-to-have)

---

#### **4. Jitsi (22K+ ⭐) — Optional WebRTC Infrastructure**

**Repository:** [jitsi/jitsi-meet](https://github.com/jitsi/jitsi-meet)

**What it is:**  
Open-source video conferencing platform with battle-tested WebRTC media streaming.

**Why Consider:**
- **Your current plan:** ADK handles WebSocket audio streaming
- **Jitsi advantage:** If you need peer-to-peer audio stability or multi-user coaching sessions
- **Use case:** Let coach & student both join a session with real-time video/audio

**Recommendation:**  
❌ **SKIP FOR MVP.** Your ADK + FastAPI backend sufficient for single user → AI coach session. Layer in Jitsi after hackathon if needed.

---

#### **5. Pipecat (by Daily) — LLM Agent Framework**

**Repository:** [pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat)

**What it is:**  
Python framework for building real-time voice AI apps. Manages audio pipelines + LLM + TTS/STT orchestration.

**Pros:**
- Built-in support for Gemini Live API
- Handles audio encoding/decoding for you
- Stateful session management

**Cons:**
- You're already using ADK (which does most of this)
- Extra abstraction layer might slow you down in a 5-day sprint
- Would require refactoring existing ADK bidi-demo code

**Recommendation:**  
❌ **SKIP FOR MVP.** Stick with ADK. Pipecat is great for post-hackathon production hardening.

---

#### **6. EasyRTC (1K+ ⭐) — WebSocket Helper**

**Repository:** [priologic/easyrtc](https://github.com/priologic/easyrtc)

**What it is:**  
Node.js + Socket.io WebRTC wrapper for audio/video peer connections.

**Edge Case Use:**
If frontend ↔ backend WebSocket setup in ADK bidi-demo feels unclear, EasyRTC has cleaner examples.

**Recommendation:**  
❌ **SKIP.** ADK examples are sufficient. Reference [bidi-demo/main.py](https://github.com/google/adk-samples/blob/main/python/agents/bidi-demo/main.py) for WebSocket patterns.

---

### ⚫ NOT RECOMMENDED

| Project | Why Skip |
|---|---|
| **Vosk** | Offline speech recognition; doesn't match Gemini Live API real-time nature |
| **Rhasspy** | Full voice assistant; overkill for single-purpose coaching |
| **CMU Sphinx** | Older tech; Whisper supersedes |
| **A-Frame** | VR focus; unnecessary overhead for browser 3D avatar |

---

## Part 3: Integration Strategy (Updated Roadmap)

### Modified 5-Day Sprint with Open Source

#### **DAY 1 (March 11) — Backend Scaffold + MediaPipe Setup** ✅

**Morning:**
- [ ] Fork ADK bidi-demo
- [ ] Set up GCP (Cloud Run, Firestore, Storage)
- Add credentials & config

**Afternoon:**
- [ ] Customize backend with Gemini Live config
- [ ] Set system prompt for accent coaching
- [ ] Test locally

**Evening (Optional):**
- [ ] Start MediaPipe integration in Next.js repo

---

#### **DAY 2 (March 12) — Frontend + MediaPipe + three.js** 🚀

**Morning:**
- [ ] Create Next.js project
- [ ] Install dependencies: `@mediapipe/tasks-vision`, `three`, `ws`
- [ ] Build basic layout (camera feed left, 3D avatar right, controls bottom)

**Afternoon:**
- [ ] Integrate MediaPipe Face Landmarker
- [ ] Load sample avatar model via three.js
- [ ] Test mouth-sync: Move face → Avatar mouth follows

**Skills Gained:** Real-time ML pipeline in browser + 3D graphics

---

#### **DAY 3 (March 13) — WebSocket Audio Streaming + Coaching Loop** 💬

**Morning:**
- [ ] Frontend WebSocket client (copy from ADK bidi-demo/frontend)
- [ ] Capture microphone audio → send 20ms chunks to backend
- [ ] Backend receives → Gemini Live API session

**Afternoon:**
- [ ] Implement feedback loop:
  1. Gemini returns coaching text
  2. Convert text → speech (Gemini TTS or external API)
  3. Stream audio back to frontend
  4. Display transcription + feedback

**Optional (if time):**
- [ ] Add Whisper for phoneme-level scoring (separate analysis thread)

---

#### **DAY 4 (March 14) — Gamification + Firestore** 🎮

**Morning:**
- [ ] Save user sessions to Firestore
- [ ] Implement score calculation (phoneme accuracy from Gemini feedback)
- [ ] Display user stats

**Afternoon:**
- [ ] Add avatar reactions (smile, thumbs up on correct pronunciation)
- [ ] Streak counter
- [ ] Leaderboard (if time)

---

#### **DAY 5 (March 15-16) — Polish + Demo** 🎬

**Morning:**
- [ ] Bug fixes + error handling
- [ ] Deploy backend to Cloud Run
- [ ] Test full end-to-end session

**Afternoon:**
- [ ] Create architecture diagram (draw.io)
- [ ] Record < 4-min demo video (OBS):
  - Show user's face + avatar mouth-sync
  - Speak a sentence → Gemini coaching in real-time
  - Show score feedback
  - Deploy proof

**Evening:**
- [ ] Submit to Devpost
- [ ] Celebrate 🎉

---

## Part 4: Code Reference Snippets

### Backend WebSocket Handler (ADK)

```python
# backend/main.py
from fastapi import FastAPI, WebSocket
from adk.streaming import LiveRequestQueue
import google.genai as genai

app = FastAPI()
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

@app.websocket("/ws/coach")
async def coach_session(websocket: WebSocket):
    await websocket.accept()
    
    # Initialize Gemini Live session
    async with client.agentic_loop(
        model="gemini-2.5-flash-native-audio-preview-12-2025",
        system_instruction=ACCENT_COACH_PROMPT
    ) as session:
        
        while True:
            # Receive audio chunk from frontend
            audio_data = await websocket.receive_bytes()
            
            # Send to Gemini Live API
            await session.send_audio(audio_data)
            
            # Receive response
            response = await session.receive()
            
            # Send back to frontend
            await websocket.send_json({
                "transcript": response.text,
                "audio": response.audio_bytes,
                "feedback": extract_feedback(response.text)
            })
```

### Frontend MediaPipe + WebSocket (React)

```typescript
// frontend/components/CoachSession.tsx
import { useMediaPipe } from './hooks/useMediaPipe';
import { useAudioStream } from './hooks/useAudioStream';
import Avatar from './Avatar';

export default function CoachSession() {
  const { faceLandmarks } = useMediaPipe(videoRef);
  const { isStreaming, send } = useAudioStream('ws://localhost:8000/ws/coach');
  
  useEffect(() => {
    // Stream audio when recording
    if (isStreaming && audioChunk) {
      send(audioChunk);
    }
  }, [audioChunk, isStreaming]);
  
  return (
    <div className="flex gap-4">
      {/* User camera */}
      <video ref={videoRef} className="w-1/2" />
      
      {/* Avatar with real-time mouth sync */}
      <Avatar blendshapes={faceLandmarks?.categories} />
      
      {/* Feedback */}
      <div className="p-4 bg-green-100">
        <p>Gemini: {response?.transcript}</p>
        <p className="text-sm">Score: {response?.feedback?.score}%</p>
      </div>
    </div>
  );
}
```

### Gitignore & Dependencies

```bash
# .gitignore additions
*.env.local
.gcloud/
node_modules/
__pycache__/
.venv/

# package.json (frontend)
{
  "dependencies": {
    "next": "^14.0",
    "react": "^18.0",
    "@mediapipe/tasks-vision": "latest",
    "three": "^r180",
    "axios": "^1.0",
    "ws": "^8.0"
  }
}

# requirements.txt (backend)
fastapi==0.104.0
uvicorn==0.24.0
google-genai==0.3.0  # ADK + Gemini Live API
python-dotenv==1.0.0
firestore==2.0.0  # GCP Firestore
```

---

## Part 5: Competitive Advantage Summary

### How LiveAccentCoach Beats Competitors Using Open Source

| Feature | ELSA | BoldVoice | **LiveAccentCoach** | OSS Advantage |
|---|---|---|---|---|
| **Real-time mouth tracking** | ❌ | ❌ | ✅ **MediaPipe** | Google's proprietary 478-landmark model |
| **Live voice coaching** | ❌ Turn-based | ❌ Async videos | ✅ **Gemini Live API** | Low-latency bidirectional LLM |
| **3D avatar** | ❌ | ❌ | ✅ **three.js** | Open web standard; easy to customize |
| **Context-aware feedback** | ❌ Generic | ❌ Generic | ✅ **Gemini reasoning** | Understands user context via agents |
| **Multimodal input** | Audio only | Audio only | ✅ **Audio + Video** | MediaPipe sees mouth position |

---

## Part 6: Risk Assessment & Mitigations

### Technical Risks

| Risk | Impact | Mitigation | Timeline |
|---|---|---|---|
| **Gemini Live Session crashes after 2 min** | 🔴 CRITICAL | Enable context window compression in ADK config (LINE 1 priority) | Day 1 afternoon |
| **MediaPipe landmarks noisy/jittery** | 🟡 MEDIUM | Add Kalman filter smoothing in React hook | Day 2 evening |
| **Avatar model doesn't load** | 🟡 MEDIUM | Use simpler procedural mesh (THREE.ShapeGeometry) as fallback | Day 2 end-of-day |
| **WebSocket audio chunking misaligned** | 🟡 MEDIUM | Reference ADK bidi-demo code; test with 20ms chunks | Day 3 morning |
| **GCP deployment fails** | 🟡 MEDIUM | Pre-test Docker image locally Day 4; use `gcloud run deploy --help` | Day 4 |

### Business Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Judges focus on phoneme precision (not innovation) | 🟡 MEDIUM | Add Whisper parallel analysis if ahead of schedule Day 3 |
| Demo video fails to show real-time features | 🟡 MEDIUM | Test recording setup Day 4; use OBS with multiple source windows |
| Architecture diagram unclear to judges | 🟡 MEDIUM | Use draw.io; include all 4 layers: Frontend → Backend → Gemini → GCP |

---

## Conclusion

**LiveAccentCoach is a STRONG hackathon entry** that:

✅ Solves a real problem (accent coaching lacks real-time mouth feedback)  
✅ Combines 3 novel technologies (MediaPipe + Gemini Live + 3D avatar) in one UX  
✅ Leverages proven open-source stack (ADK, Next.js, three.js, MediaPipe)  
✅ Meets all mandatory requirements (✓ Gemini, ✓ ADK, ✓ GCP, ✓ Cloud Run)  
✅ Achievable in 5 days with existing scaffolding

### Open Source Projects to Integrate

**MUST-HAVE:**
1. **MediaPipe** (already planned) — mouth tracking
2. **three.js** (add Day 2) — 3D avatar rendering
3. **ADK** (already planned) — Gemini Live backend

**NICE-TO-HAVE (if time):**
4. **Whisper** (optional Day 3) — phoneme-level analysis
5. **Jitsi** (skip for hackathon, add post-launch) — multi-user sessions

### Recommended Next Steps

1. **Day 1:** Confirm GCP credentials + ADK bidi-demo runs locally
2. **Day 2:** Complete three.js avatar integration
3. **Day 3:** Full WebSocket + coaching loop working
4. **Day 4+:** Gamification + polish + deployment

**Good luck! 🚀**

---

**Document prepared by:** LiveAccentCoach Review Team  
**Approved for:** 5-day sprint execution  
**Next review:** Day 3 EOD check-in
