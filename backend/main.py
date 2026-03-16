"""
LiveAccentCoach Backend - FastAPI server for real-time pronunciation coaching
Main entry point for WebSocket connections and HTTP endpoints
"""

import logging
import asyncio
import uuid
import json
import base64
import datetime
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import shutil

from google import genai
from google.genai import types

try:
    from google.adk.agents.live_request_queue import LiveRequestQueue
    from google.adk.agents.run_config import RunConfig, StreamingMode
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    ADK_AVAILABLE = True
except ImportError:
    ADK_AVAILABLE = False
    LiveRequestQueue = RunConfig = StreamingMode = Runner = InMemorySessionService = None

try:
    from config import config
    from handlers.websocket import WebSocketHandler
    from handlers.audio import AudioProcessor
    from coaches.accent_coach import AccentCoach
    from services.firestore import FirestoreService
    from services.cloud_storage import CloudStorageService
    from services.openclaw import OpenClawService
    from models.schemas import RecordingUploadRequest
    from agents.direct_agent import direct_agent
    LEGACY_AVAILABLE = True
except Exception as _e:
    LEGACY_AVAILABLE = False
    WebSocketHandler = AudioProcessor = AccentCoach = None
    FirestoreService = CloudStorageService = OpenClawService = None
    RecordingUploadRequest = direct_agent = None
    import logging as _lg; _lg.getLogger(__name__).warning(f"Legacy modules unavailable: {_e}")

# Load environment variables
load_dotenv()

# Configure logging — writes to both terminal AND backend.log so Claude can read it
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("backend.log", mode="a", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

# Global services
firestore_service = None
cloud_storage_service = None
openclaw_service = OpenClawService(config.OPENCLAW_URL, config.OPENCLAW_TOKEN) if LEGACY_AVAILABLE else None
ws_handler = WebSocketHandler() if LEGACY_AVAILABLE else None

# ── ADK setup for direct chat ─────────────────────────────────────────────────
ADK_APP_NAME = "live-accent-coach"
if ADK_AVAILABLE and LEGACY_AVAILABLE and direct_agent is not None:
    _adk_session_service = InMemorySessionService()
    _direct_runner = Runner(
        app_name=ADK_APP_NAME,
        agent=direct_agent,
        session_service=_adk_session_service,
    )
else:
    _adk_session_service = None
    _direct_runner = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle - startup and shutdown"""
    global firestore_service, cloud_storage_service
    
    # Startup
    logger.info("Starting LUMINA backend...")
    firestore_service = FirestoreService(config.GCP_PROJECT_ID) if LEGACY_AVAILABLE else None
    cloud_storage_service = CloudStorageService(config.GCS_BUCKET_NAME) if LEGACY_AVAILABLE else None
    logger.info("Backend started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down backend...")


# Initialize FastAPI app
app = FastAPI(
    title="LUMINA",
    description="Real-time AI multimodal assistant powered by Gemini 2.5 Flash",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "https://voice-fit-ai-aa060.web.app",
        "https://voice-fit-ai-aa060.firebaseapp.com",
        os.getenv("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


MEMORY_DIR = Path(__file__).parent / "memory"
KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"
SESSIONS_DIR = MEMORY_DIR / "sessions"
DATA_DIR = Path(__file__).parent / "data"
STORAGE_DIR = DATA_DIR / "storage"   # user-uploaded files live here
SAMPLES_DIR = DATA_DIR / "samples"   # pre-loaded sample files
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "LUMINA"}


# ── Memory endpoints ──────────────────────────────────────────────────────────

@app.get("/memory")
async def get_memory():
    """Return MEMORY.md + today's daily log combined."""
    content = ""
    main_file = MEMORY_DIR / "MEMORY.md"
    if main_file.exists():
        content += main_file.read_text(encoding="utf-8") + "\n\n"
    today = datetime.date.today().isoformat()
    daily = MEMORY_DIR / "daily" / f"{today}.md"
    if daily.exists():
        content += f"## Today's Log ({today})\n" + daily.read_text(encoding="utf-8")
    return {"content": content}


@app.post("/memory/log")
async def save_memory_log(payload: dict):
    """Append an entry to today's daily log."""
    entry = payload.get("entry", "").strip()
    if not entry:
        raise HTTPException(status_code=400, detail="entry required")
    daily_dir = MEMORY_DIR / "daily"
    daily_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today().isoformat()
    now = datetime.datetime.now().strftime("%H:%M")
    with open(daily_dir / f"{today}.md", "a", encoding="utf-8") as f:
        f.write(f"- [{now}] {entry}\n")
    return {"status": "saved"}


@app.post("/memory/update")
async def update_memory(payload: dict):
    """Overwrite MEMORY.md with new content."""
    content = payload.get("content", "")
    MEMORY_DIR.mkdir(exist_ok=True)
    (MEMORY_DIR / "MEMORY.md").write_text(content, encoding="utf-8")
    return {"status": "updated"}


# ── Knowledge endpoints ───────────────────────────────────────────────────────

@app.get("/knowledge")
async def get_knowledge():
    """Return all markdown files from the knowledge/ directory combined."""
    content = ""
    if KNOWLEDGE_DIR.exists():
        for f in sorted(KNOWLEDGE_DIR.glob("*.md")):
            content += f.read_text(encoding="utf-8") + "\n\n"
    return {"content": content}


# ── Storage endpoints (local-first, GCS optional) ────────────────────────────

ALLOWED_EXTENSIONS = {".csv", ".txt", ".md", ".pdf", ".xlsx", ".xls", ".json"}


def _read_local_file_as_text(path: Path) -> str:
    """Extract text from CSV, TXT, MD, PDF, XLSX."""
    suffix = path.suffix.lower()
    if suffix in (".csv", ".txt", ".md", ".json"):
        return path.read_text(encoding="utf-8", errors="replace")
    if suffix == ".pdf":
        try:
            import PyPDF2
            text_parts = []
            with open(path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text_parts.append(page.extract_text() or "")
            return "\n".join(text_parts)
        except Exception as e:
            return f"[PDF read error: {e}]"
    if suffix in (".xlsx", ".xls"):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
            rows = []
            for sheet in wb.worksheets:
                rows.append(f"## Sheet: {sheet.title}")
                for row in sheet.iter_rows(values_only=True):
                    rows.append(",".join("" if v is None else str(v) for v in row))
            return "\n".join(rows)
        except Exception as e:
            return f"[Excel read error: {e}]"
    return path.read_text(encoding="utf-8", errors="replace")


def _list_local_files(directory: Path) -> list:
    """List files recursively in a directory."""
    files = []
    if not directory.exists():
        return files
    for p in sorted(directory.rglob("*")):
        if p.is_file() and p.suffix.lower() in ALLOWED_EXTENSIONS:
            rel = p.relative_to(directory)
            files.append({
                "name": str(rel).replace("\\", "/"),
                "size": p.stat().st_size,
                "source": "local",
                "folder": str(rel.parent).replace("\\", "/") if str(rel.parent) != "." else "",
            })
    return files


@app.get("/storage/files")
async def list_storage_files(folder: str = ""):
    """List all files from local storage + samples directory."""
    files = _list_local_files(STORAGE_DIR) + _list_local_files(SAMPLES_DIR)
    if folder:
        files = [f for f in files if f["folder"] == folder or f["folder"].startswith(folder + "/")]
    return {"files": files}


@app.get("/storage/folders")
async def list_folders():
    """List all folders in storage."""
    folders = set()
    for p in STORAGE_DIR.rglob("*"):
        if p.is_dir():
            rel = str(p.relative_to(STORAGE_DIR)).replace("\\", "/")
            folders.add(rel)
    return {"folders": sorted(folders)}


@app.post("/storage/folders")
async def create_folder(payload: dict):
    """Create a folder in local storage."""
    name = payload.get("name", "").strip().strip("/")
    if not name:
        raise HTTPException(status_code=400, detail="Folder name required")
    folder = STORAGE_DIR / name
    folder.mkdir(parents=True, exist_ok=True)
    return {"status": "created", "folder": name}


@app.post("/storage/upload")
async def upload_file(file: UploadFile = File(...), folder: str = Form(default="")):
    """Upload a file (PDF, CSV, TXT, XLSX, etc.) to local storage."""
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {suffix} not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    target_dir = STORAGE_DIR / folder.strip("/") if folder else STORAGE_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    dest = target_dir / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"status": "uploaded", "filename": file.filename, "folder": folder, "size": dest.stat().st_size}


@app.delete("/storage/files/{filename:path}")
async def delete_storage_file(filename: str):
    """Delete a file from local storage."""
    path = STORAGE_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    path.unlink()
    return {"status": "deleted"}


@app.get("/storage/files/{filename:path}")
async def read_storage_file(filename: str):
    """Read and return text content of a file."""
    # Check storage first, then samples
    for base in (STORAGE_DIR, SAMPLES_DIR):
        path = base / filename
        if path.exists() and path.is_file():
            content = _read_local_file_as_text(path)
            return {"filename": filename, "content": content, "size": path.stat().st_size}
    raise HTTPException(status_code=404, detail="File not found")


# ── Role knowledge endpoints ──────────────────────────────────────────────────

@app.get("/knowledge/role/{role}")
async def get_role_knowledge(role: str):
    roles_dir = KNOWLEDGE_DIR / "roles"
    role_file = roles_dir / f"{role}.md"
    if not role_file.exists():
        return {"content": ""}
    return {"content": role_file.read_text(encoding="utf-8")}


# ── Persona creation ──────────────────────────────────────────────────────────

@app.post("/persona/create")
async def create_persona(payload: dict):
    """Use Gemini to generate a role system prompt from user's description."""
    name = payload.get("name", "").strip()
    description = payload.get("description", "").strip()
    personality = payload.get("personality", "").strip()

    if not name or not description:
        raise HTTPException(status_code=400, detail="name and description are required")

    prompt = f"""Create a concise AI agent role definition for the following persona.

Name: {name}
Description: {description}
{f'Personality/Tone: {personality}' if personality else ''}

Write a markdown document that:
1. Starts with "# {name} Role"
2. Has a 1-2 sentence role description right after the heading
3. Has a ## Capabilities section with 5-7 bullet points listing what this agent can do
4. Has a ## Communication Style section with 3-4 bullet points about how it communicates

Keep it under 300 words. Be specific, actionable, and written from the AI's perspective."""

    try:
        gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", ""))
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        content = response.text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini error: {e}")

    # Derive a safe role_id from the name
    role_id = "".join(c if c.isalnum() else "_" for c in name.lower()).strip("_")

    roles_dir = KNOWLEDGE_DIR / "roles"
    roles_dir.mkdir(parents=True, exist_ok=True)
    (roles_dir / f"{role_id}.md").write_text(content, encoding="utf-8")

    return {"role_id": role_id, "name": name, "content": content}


# ── History endpoints ─────────────────────────────────────────────────────────

@app.get("/history")
async def get_history():
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    sessions = []
    for f in sorted(SESSIONS_DIR.glob("*.json"), reverse=True)[:50]:
        try:
            sessions.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            pass
    return {"sessions": sessions}


@app.post("/history")
async def save_history(payload: dict):
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    session_id = payload.get("id") or datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    (SESSIONS_DIR / f"{session_id}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"status": "saved", "id": session_id}


# ── GCP Configuration endpoints ───────────────────────────────────────────────

GCP_CONFIG_FILE = DATA_DIR / "gcp_config.json"
DATA_DIR.mkdir(parents=True, exist_ok=True)

@app.get("/config/gcp")
async def get_gcp_config():
    """Return current GCP configuration."""
    if GCP_CONFIG_FILE.exists():
        return json.loads(GCP_CONFIG_FILE.read_text(encoding="utf-8"))
    return {
        "project_id": os.getenv("GCP_PROJECT_ID", ""),
        "gcs_bucket": os.getenv("GCS_BUCKET_NAME", ""),
        "region": os.getenv("GCP_REGION", "us-central1"),
        "connected": False,
    }

@app.post("/config/gcp")
async def save_gcp_config(payload: dict):
    """Save GCP configuration and test connectivity."""
    config_data = {
        "project_id": payload.get("project_id", "").strip(),
        "gcs_bucket": payload.get("gcs_bucket", "").strip(),
        "region": payload.get("region", "us-central1").strip(),
        "service_account_path": payload.get("service_account_path", "").strip(),
        "connected": False,
        "saved_at": datetime.datetime.now().isoformat(),
    }
    # Test connection by checking if google-cloud libs are available
    try:
        import google.auth
        credentials, project = google.auth.default()
        config_data["connected"] = True
        config_data["detected_project"] = project or config_data["project_id"]
    except Exception as e:
        config_data["connected"] = False
        config_data["connection_error"] = str(e)

    GCP_CONFIG_FILE.write_text(json.dumps(config_data, indent=2), encoding="utf-8")
    return config_data


# ── MCP server configuration ───────────────────────────────────────────────────

MCP_CONFIG_FILE = DATA_DIR / "mcp_config.json"

@app.get("/config/mcp")
async def get_mcp_config():
    """Return configured MCP server connections."""
    if MCP_CONFIG_FILE.exists():
        return json.loads(MCP_CONFIG_FILE.read_text(encoding="utf-8"))
    return {"servers": []}

@app.post("/config/mcp")
async def save_mcp_config(payload: dict):
    """Add or update an MCP server connection."""
    config_data = {"servers": payload.get("servers", []), "updated_at": datetime.datetime.now().isoformat()}
    MCP_CONFIG_FILE.write_text(json.dumps(config_data, indent=2), encoding="utf-8")
    return config_data


@app.get("/users/{user_id}/sessions")
async def get_user_sessions(user_id: str):
    """Retrieve all stored coaching sessions for a user."""
    if firestore_service is None:
        return {"user_id": user_id, "sessions": []}

    sessions = await firestore_service.get_user_sessions(user_id)
    return {
        "user_id": user_id,
        "count": len(sessions),
        "sessions": sessions,
    }


@app.get("/users/{user_id}/progress")
async def get_user_progress(user_id: str):
    """Return aggregate progress metrics for a user."""
    if firestore_service is None:
        return {
            "user_id": user_id,
            "session_count": 0,
            "average_accuracy": 0,
            "best_accuracy": 0,
            "total_utterances": 0,
        }

    sessions = await firestore_service.get_user_sessions(user_id)
    if not sessions:
        return {
            "user_id": user_id,
            "session_count": 0,
            "average_accuracy": 0,
            "best_accuracy": 0,
            "total_utterances": 0,
        }

    averages = [float(s.get("average_accuracy", 0) or 0) for s in sessions]
    best_scores = [float(s.get("best_accuracy", 0) or 0) for s in sessions]
    total_utterances = sum(int(s.get("num_utterances", 0) or 0) for s in sessions)

    return {
        "user_id": user_id,
        "session_count": len(sessions),
        "average_accuracy": round(sum(averages) / len(averages), 2),
        "best_accuracy": round(max(best_scores), 2),
        "total_utterances": total_utterances,
    }


@app.post("/users/{user_id}/sessions/{session_id}/recording")
async def upload_session_recording(
    user_id: str,
    session_id: str,
    payload: RecordingUploadRequest,
):
    """Upload a WAV recording for a coaching session."""
    if cloud_storage_service is None:
        raise HTTPException(status_code=503, detail="Storage service unavailable")

    try:
        audio_bytes = base64.b64decode(payload.audio_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 audio payload") from exc

    recording_url = await cloud_storage_service.upload_session_recording(
        user_id=user_id,
        session_id=session_id,
        audio_data=audio_bytes,
    )

    if not recording_url:
        raise HTTPException(status_code=500, detail="Failed to store recording")

    return {
        "user_id": user_id,
        "session_id": session_id,
        "recording_url": recording_url,
    }


@app.get("/openclaw/status")
async def openclaw_status():
    """Check if OpenClaw agent is reachable."""
    available = await openclaw_service.is_available()
    return {"available": available, "url": config.OPENCLAW_URL}


@app.post("/openclaw/chat")
async def openclaw_chat(payload: dict):
    """
    Forward a chat request to OpenClaw.
    Expects: { "messages": [...], "system": "optional system prompt", "context": "optional coaching context" }
    """
    messages = payload.get("messages", [])
    system = payload.get("system")
    context = payload.get("context", "")

    if not messages:
        raise HTTPException(status_code=400, detail="messages required")

    # Inject coaching context as a system message if provided
    if context and not system:
        system = (
            "You are OpenClaw, an expert AI language coach assistant. "
            f"Current coaching session context:\n{context}"
        )

    result = await openclaw_service.chat(messages=messages, system=system)

    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])

    return result


@app.websocket("/ws/coach")
async def websocket_coaching_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for coaching sessions
    Handles real-time audio streaming and coaching responses
    """
    session_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    
    logger.info(f"New connection attempt - Session: {session_id}")
    
    try:
        await websocket.accept()
        logger.info(f"Client connected - Session: {session_id}")
        
        coach = AccentCoach(
            session_id=session_id,
            user_id=user_id,
            model=config.GEMINI_MODEL,
            api_key=config.GOOGLE_API_KEY,
            system_prompt=config.SYSTEM_PROMPT
        )
        
        session_started = await coach.start_session()
        if not session_started:
            await websocket.send_json(
                {"type": "error", "message": "Failed to start session"}
            )
            await websocket.close()
            return
        
        await websocket.send_json(
            {"type": "session_started", "session_id": session_id}
        )
        logger.info(f"Session started - ID: {session_id}")
        
        async def receive_from_client():
            try:
                while True:
                    data = await websocket.receive_text()
                    try:
                        message = json.loads(data)
                    except json.JSONDecodeError:
                        logger.error("Invalid JSON received")
                        await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                        continue
                        
                    message_type = message.get("type")
                    
                    if message_type == "audio":
                        audio_b64 = message.get("audio")
                        if not audio_b64:
                            await websocket.send_json({"type": "error", "message": "Missing audio data"})
                            continue
                            
                        try:
                            audio_bytes = AudioProcessor.decode_base64(audio_b64)
                        except Exception as e:
                            logger.error(f"Audio decode error: {e}")
                            await websocket.send_json({"type": "error", "message": "Invalid audio format"})
                            continue
                            
                        is_valid, error_msg = AudioProcessor.validate_pcm_audio(audio_bytes)
                        if not is_valid:
                            logger.error(f"Invalid PCM audio format: {error_msg}")
                            await websocket.send_json({"type": "error", "message": f"Invalid PCM format: {error_msg}"})
                            continue
                            
                        await coach.send_audio_chunk(audio_bytes)
                        
                    elif message_type == "image":
                        image_b64 = message.get("image")
                        if not image_b64:
                            await websocket.send_json({"type": "error", "message": "Missing image data"})
                            continue
                            
                        try:
                            # Strip prefix if it exists (e.g. data:image/jpeg;base64,)
                            if "," in image_b64:
                                image_b64 = image_b64.split(",")[1]
                            image_bytes = base64.b64decode(image_b64)
                            await coach.send_image_frame(image_bytes)
                        except Exception as e:
                            logger.error(f"Image decode error: {e}")
                            await websocket.send_json({"type": "error", "message": "Invalid image format"})
                            continue
                        
                    elif message_type == "status":
                        status_response = coach.get_session_status()
                        await websocket.send_json({"type": "status_response", **status_response})
                        
                    elif message_type == "text":
                        text_content = message.get("text", "")
                        if text_content:
                            await coach.send_text(text_content)

                    elif message_type == "mode_switch":
                        mode = message.get("mode", "coach")
                        await coach.switch_mode(mode)

                    elif message_type == "end_session":
                        session_summary = await coach.end_session()

                        final_audio_b64 = message.get("final_audio_base64") or message.get("audio_base64")
                        if final_audio_b64 and cloud_storage_service:
                            try:
                                final_audio_bytes = AudioProcessor.decode_base64(final_audio_b64)
                                recording_url = await cloud_storage_service.upload_session_recording(
                                    user_id=user_id,
                                    session_id=session_id,
                                    audio_data=final_audio_bytes,
                                )
                                if recording_url:
                                    session_summary["recording_url"] = recording_url
                            except Exception as e:
                                logger.warning(f"Failed to store final session recording: {e}")
                        
                        if firestore_service:
                            try:
                                await firestore_service.save_session(user_id, session_summary)
                                logger.info(f"Session saved to Firestore - ID: {session_id}")
                            except Exception as e:
                                logger.error(f"Error saving session: {e}")
                        
                        await websocket.send_json({
                            "type": "session_ended",
                            "session_id": session_id,
                            "user_id": user_id,
                            **session_summary
                        })
                        logger.info(f"Session ended - ID: {session_id}")
                        return
                    else:
                        logger.warning(f"Unknown message type: {message_type}")
                        await websocket.send_json({"type": "error", "message": f"Unknown message type: {message_type}"})
            except WebSocketDisconnect:
                logger.info(f"Client disconnected inside receive loop - Session: {session_id}")
            except Exception as e:
                logger.error(f"Error in client receive loop: {e}", exc_info=True)

        async def send_to_client():
            try:
                while coach.is_active or not coach.response_queue.empty():
                    if not coach.is_active and coach.response_queue.empty():
                        break
                    try:
                        response = await asyncio.wait_for(coach.get_next_response(), timeout=1.0)
                        if response is None:
                            continue

                        response_type = response.get("type", "coaching_response")

                        # Binary audio from Gemini — send as raw bytes so frontend
                        # can feed it straight into AudioContext / PCM worklet
                        if response_type == "audio_bytes":
                            await websocket.send_bytes(response["data"])
                            continue

                        response_message = {
                            "type": response_type,
                            "session_id": session_id,
                            **{k: v for k, v in response.items() if k != "data"},
                        }
                        await websocket.send_json(response_message)
                        if response_type == "coaching_response":
                            logger.info(f"Coaching response sent - Score: {response.get('accuracy_score')}")
                    except asyncio.TimeoutError:
                        continue
            except Exception as e:
                logger.error(f"Error in send to client loop: {e}", exc_info=True)

        receive_task = asyncio.create_task(receive_from_client())
        send_task = asyncio.create_task(send_to_client())
        
        done, pending = await asyncio.wait(
            [receive_task, send_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        for task in pending:
            task.cancel()
            
    except WebSocketDisconnect:
        logger.info(f"Client disconnected - Session: {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
    finally:
        try:
            if coach.is_active:
                await coach.end_session()
        except Exception:
            pass
        logger.info(f"Connection closed - Session: {session_id}")


@app.websocket("/ws/direct")
async def websocket_direct_endpoint(websocket: WebSocket):
    """
    Direct Gemini Live WebSocket — ADK runner.run_live() pattern.
    Raw bidirectional voice/text with Gemini, no coaching overlay.
    Audio input: binary WebSocket frames (raw PCM 16-bit 16 kHz).
    Audio output: base64 PCM in ADK JSON events (inlineData).
    """
    session_id = str(uuid.uuid4())
    user_id = "direct-" + session_id[:8]
    logger.info(f"Direct ADK session: {session_id}")

    await websocket.accept()

    try:
        # Create ADK session
        await _adk_session_service.create_session(
            app_name=ADK_APP_NAME, user_id=user_id, session_id=session_id
        )

        run_config = RunConfig(
            streaming_mode=StreamingMode.BIDI,
            response_modalities=["AUDIO"],
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            session_resumption=types.SessionResumptionConfig(),
        )

        queue = LiveRequestQueue()

        async def upstream():
            """Browser → ADK queue"""
            try:
                while True:
                    message = await websocket.receive()

                    # Binary frame = raw PCM audio from microphone
                    if "bytes" in message:
                        blob = types.Blob(
                            mime_type="audio/pcm;rate=16000",
                            data=message["bytes"],
                        )
                        queue.send_realtime(blob)

                    # Text frame = JSON control message
                    elif "text" in message:
                        msg = json.loads(message["text"])
                        t = msg.get("type")

                        if t == "text":
                            text = msg.get("text", "").strip()
                            if text:
                                queue.send_content(
                                    types.Content(parts=[types.Part(text=text)])
                                )

                        elif t == "image":
                            img_data = base64.b64decode(msg["data"])
                            queue.send_realtime(
                                types.Blob(
                                    mime_type=msg.get("mimeType", "image/jpeg"),
                                    data=img_data,
                                )
                            )

                        elif t == "end_session":
                            break

            except WebSocketDisconnect:
                pass
            except Exception as e:
                logger.error(f"Direct upstream error: {e}")
            finally:
                queue.close()

        async def downstream():
            """ADK events → browser"""
            try:
                async for event in _direct_runner.run_live(
                    user_id=user_id,
                    session_id=session_id,
                    live_request_queue=queue,
                    run_config=run_config,
                ):
                    await websocket.send_text(
                        event.model_dump_json(exclude_none=True, by_alias=True)
                    )
            except Exception as e:
                logger.error(f"Direct downstream error: {e}")

        logger.info(f"Direct ADK tasks starting: {session_id}")
        await asyncio.gather(upstream(), downstream())

    except WebSocketDisconnect:
        logger.info(f"Direct session disconnected: {session_id}")
    except Exception as e:
        logger.error(f"Direct session error: {e}", exc_info=True)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        logger.info(f"Direct session closed: {session_id}")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    logger.info(f"Starting Uvicorn server on 0.0.0.0:{port}")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
