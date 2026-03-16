"""
Accent Coach module - handles Gemini Live API session management
Uses google-genai SDK directly (official pattern from gemini-live-api-examples)
"""

import asyncio
import inspect
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from google import genai
from google.genai import types
from services.brain import NorthstackBrain

logger = logging.getLogger(__name__)


class AccentCoach:
    """
    Manages real-time pronunciation coaching via Gemini Live API.
    Based on the official google-gemini/gemini-live-api-examples pattern.
    Handles bidirectional audio, video frames, text, and tool calls.
    """

    def __init__(
        self,
        session_id: str,
        user_id: str,
        model: str,
        api_key: str,
        system_prompt: str,
    ):
        self.session_id = session_id
        self.user_id = user_id
        self.model_name = model
        self.api_key = api_key
        self.system_prompt = system_prompt

        # v1alpha required for native-audio-preview models (official examples confirm this)
        # See: github.com/google-gemini/gemini-live-api-examples
        self.client = genai.Client(
            api_key=api_key,
            http_options={"api_version": "v1alpha"},
        )

        # Input queues (filled by WebSocket handler)
        self.audio_input_queue: asyncio.Queue = asyncio.Queue()
        self.video_input_queue: asyncio.Queue = asyncio.Queue()
        self.text_input_queue: asyncio.Queue = asyncio.Queue()

        # Output queue (consumed by WebSocket handler to send to frontend)
        self.response_queue: asyncio.Queue = asyncio.Queue()

        # Session state
        self.is_active = False
        self.start_time: Optional[datetime] = None
        self.scores: List[float] = []
        self.live_task: Optional[asyncio.Task] = None

        # Tool mapping: name -> async or sync callable
        self.tool_mapping: Dict[str, Callable] = {
            "generate_visual_aid": self._tool_generate_visual_aid,
            "get_pronunciation_guide": self._tool_get_pronunciation_guide,
        }

        # Northstack Brain — Flash reasoning layer
        self.brain = NorthstackBrain(api_key=api_key, session_id=session_id)

        logger.info(f"AccentCoach initialised for session {session_id}")

    # ------------------------------------------------------------------
    # Public interface (called by WebSocket handler in main.py)
    # ------------------------------------------------------------------

    async def start_session(self) -> bool:
        """Start the live coaching session."""
        try:
            self.is_active = True
            self.start_time = datetime.now(timezone.utc)
            self.scores = []
            self.live_task = asyncio.create_task(self._run_live_session())
            logger.info(f"Session {self.session_id} started")
            return True
        except Exception as exc:
            logger.error(f"Failed to start session: {exc}", exc_info=True)
            self.is_active = False
            return False

    async def send_audio_chunk(self, audio_data: bytes) -> None:
        """Queue raw PCM audio bytes (16-bit, 16 kHz, mono) for Gemini."""
        if self.is_active:
            await self.audio_input_queue.put(audio_data)

    async def send_image_frame(self, image_data: bytes) -> None:
        """Queue a JPEG frame for Gemini vision input."""
        if self.is_active:
            await self.video_input_queue.put(image_data)

    async def send_text(self, text: str) -> None:
        """Queue a text message for Gemini AND get a Brain reply (non-blocking)."""
        if self.is_active:
            await self.text_input_queue.put(text)
        # Brain reply runs in background so it doesn't block the receive loop
        asyncio.create_task(self._brain_chat_and_queue(text))

    async def _brain_chat_and_queue(self, text: str):
        """Run brain chat in background and push reply to response queue."""
        try:
            brain_reply = await self.brain.chat(text)
            await self.response_queue.put({
                "type": "brain_response",
                "text": brain_reply,
                "mode": self.brain.mode,
            })
        except Exception as e:
            logger.error(f"Background brain chat failed: {e}")

    async def switch_mode(self, mode: str) -> None:
        """Switch brain mode and update Gemini Live system instruction."""
        result = self.brain.switch_mode(mode)
        logger.info(result)
        await self.response_queue.put({
            "type": "mode_switched",
            "mode": mode,
        })

    async def get_next_response(self) -> Optional[Dict[str, Any]]:
        """Get the next event from the response queue (blocks until available)."""
        try:
            return await self.response_queue.get()
        except asyncio.CancelledError:
            return None

    async def end_session(self) -> Dict[str, Any]:
        """Stop the session and return final metrics."""
        self.is_active = False

        if self.live_task:
            self.live_task.cancel()
            try:
                await self.live_task
            except asyncio.CancelledError:
                pass

        duration = (
            (datetime.now(timezone.utc) - self.start_time).total_seconds()
            if self.start_time
            else 0
        )
        avg_score = sum(self.scores) / len(self.scores) if self.scores else 0

        summary = {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "duration": duration,
            "num_utterances": len(self.scores),
            "average_accuracy": round(avg_score, 2),
            "best_accuracy": round(max(self.scores), 2) if self.scores else 0,
            "scores": self.scores,
        }
        logger.info(f"Session ended — avg accuracy: {avg_score:.1f}%")
        return summary

    def get_session_status(self) -> Dict[str, Any]:
        if not self.is_active or not self.start_time:
            return {"status": "inactive"}
        duration = (datetime.now(timezone.utc) - self.start_time).total_seconds()
        avg = sum(self.scores) / len(self.scores) if self.scores else 0
        return {
            "status": "active",
            "session_id": self.session_id,
            "duration_seconds": round(duration, 1),
            "utterances_processed": len(self.scores),
            "current_average_score": round(avg, 2),
        }

    # ------------------------------------------------------------------
    # Core Live API loop (official pattern)
    # ------------------------------------------------------------------

    async def _run_live_session(self):
        """
        Main session loop.
        Connects to Gemini Live API and runs send/receive concurrently.
        Mirrors the official GeminiLive class from gemini-live-api-examples.
        """
        from services.pronunciation import PronunciationScorer

        # Build tools for function calling
        tool_declarations = [
            types.FunctionDeclaration(
                name="generate_visual_aid",
                description=(
                    "Generates a real-time visual diagram or scene to help with "
                    "pronunciation or storytelling context."
                ),
                parameters=types.Schema(
                    type="object",
                    properties={
                        "prompt": types.Schema(
                            type="string",
                            description="Descriptive prompt for image generation.",
                        ),
                        "mode": types.Schema(
                            type="string",
                            enum=["coaching", "storytelling"],
                            description="Visual style mode.",
                        ),
                    },
                    required=["prompt", "mode"],
                ),
            ),
            types.FunctionDeclaration(
                name="get_pronunciation_guide",
                description="Retrieves expert phonetic data for a word or phoneme.",
                parameters=types.Schema(
                    type="object",
                    properties={
                        "word": types.Schema(type="string", description="Word to analyse."),
                        "phoneme": types.Schema(
                            type="string", description="Specific sound to focus on."
                        ),
                    },
                    required=["word"],
                ),
            ),
        ]

        # Minimal proven config — matches what the direct API test confirms works.
        # Extra options (VAD tuning, media_resolution) added only after basic flow works.
        config = {
            "response_modalities": ["AUDIO"],
            "speech_config": {
                "voice_config": {
                    "prebuilt_voice_config": {"voice_name": "Aoede"}
                }
            },
            "system_instruction": self.system_prompt,
            "input_audio_transcription": {},
            "output_audio_transcription": {},
            "enable_affective_dialog": True,
            "tools": [{"function_declarations": [
                {
                    "name": "generate_visual_aid",
                    "description": "Generates a visual aid for pronunciation coaching.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "prompt": {"type": "string"},
                            "mode": {"type": "string", "enum": ["coaching", "storytelling"]}
                        },
                        "required": ["prompt", "mode"]
                    }
                },
                {
                    "name": "get_pronunciation_guide",
                    "description": "Retrieves phonetic guide for a word.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "word": {"type": "string"},
                            "phoneme": {"type": "string"}
                        },
                        "required": ["word"]
                    }
                }
            ]}]
        }

        try:
            logger.info(f"Connecting to Gemini Live API — model: {self.model_name}")
            logger.info(f"Config keys: {list(config.keys())}")
            async with self.client.aio.live.connect(
                model=self.model_name, config=config
            ) as session:
                logger.info(f"Gemini Live connected for session {self.session_id}")
                event_queue: asyncio.Queue = asyncio.Queue()

                # Send greeting immediately so Gemini introduces itself
                await session.send_realtime_input(
                    text="The user just joined. Greet them briefly as Lumina and tell them you're ready to coach their pronunciation. Keep it to 2 sentences."
                )
                logger.info("Greeting sent to Gemini")

                # --- sender tasks ---
                async def send_audio():
                    try:
                        while True:
                            chunk = await self.audio_input_queue.get()
                            await session.send_realtime_input(
                                audio=types.Blob(
                                    data=chunk,
                                    mime_type="audio/pcm;rate=16000",
                                )
                            )
                            logger.debug(f"Audio chunk sent: {len(chunk)} bytes")
                    except asyncio.CancelledError:
                        pass

                async def send_video():
                    try:
                        while True:
                            frame = await self.video_input_queue.get()
                            await session.send_realtime_input(
                                video=types.Blob(data=frame, mime_type="image/jpeg")
                            )
                    except asyncio.CancelledError:
                        pass

                async def send_text():
                    try:
                        while True:
                            text = await self.text_input_queue.get()
                            await session.send_realtime_input(text=text)
                    except asyncio.CancelledError:
                        pass

                # --- receiver task ---
                async def receive_loop():
                    # Buffer to accumulate streaming text before sending as one message
                    output_buffer = []
                    input_buffer = []

                    try:
                        async for response in session.receive():
                            server_content = response.server_content
                            tool_call = response.tool_call

                            if server_content:
                                if server_content.model_turn:
                                    for part in server_content.model_turn.parts:
                                        if part.inline_data:
                                            await event_queue.put(
                                                {
                                                    "type": "audio_bytes",
                                                    "data": part.inline_data.data,
                                                }
                                            )

                                # Accumulate input transcription chunks
                                if (
                                    server_content.input_transcription
                                    and server_content.input_transcription.text
                                ):
                                    input_buffer.append(server_content.input_transcription.text)

                                # Accumulate output transcription chunks
                                if (
                                    server_content.output_transcription
                                    and server_content.output_transcription.text
                                ):
                                    output_buffer.append(server_content.output_transcription.text)

                                # On turn complete — flush buffers as single messages
                                if server_content.turn_complete:
                                    if input_buffer:
                                        full_input = "".join(input_buffer).strip()
                                        input_buffer = []
                                        if full_input:
                                            await event_queue.put(
                                                {"type": "user_transcript", "text": full_input}
                                            )

                                    if output_buffer:
                                        full_text = "".join(output_buffer).strip()
                                        output_buffer = []
                                        if full_text:
                                            accuracy = PronunciationScorer.extract_score_from_feedback(full_text)
                                            corrections = PronunciationScorer.extract_corrections(full_text)
                                            tips = PronunciationScorer.extract_tips(full_text)
                                            if accuracy > 0:
                                                self.scores.append(accuracy)
                                            await event_queue.put(
                                                {
                                                    "type": "coaching_response",
                                                    "feedback": full_text,
                                                    "accuracy_score": accuracy,
                                                    "corrections": corrections,
                                                    "tips": tips,
                                                    "timestamp": datetime.now(timezone.utc).isoformat(),
                                                }
                                            )
                                            # Fire brain analysis in background — don't block receive loop
                                            asyncio.create_task(
                                                self._brain_analyze_and_queue(full_text, accuracy)
                                            )

                                    await event_queue.put({"type": "turn_complete"})

                                if server_content.interrupted:
                                    output_buffer = []
                                    input_buffer = []
                                    await event_queue.put({"type": "interrupted"})

                            if tool_call:
                                function_responses = []
                                for fc in tool_call.function_calls:
                                    func = self.tool_mapping.get(fc.name)
                                    args = fc.args or {}
                                    if func:
                                        try:
                                            if inspect.iscoroutinefunction(func):
                                                result = await func(**args)
                                            else:
                                                loop = asyncio.get_running_loop()
                                                result = await loop.run_in_executor(
                                                    None, lambda: func(**args)
                                                )
                                        except Exception as exc:
                                            result = f"Error: {exc}"
                                    else:
                                        result = f"Unknown tool: {fc.name}"

                                    function_responses.append(
                                        types.FunctionResponse(
                                            name=fc.name,
                                            id=fc.id,
                                            response={"result": str(result)},
                                        )
                                    )
                                    await event_queue.put(
                                        {
                                            "type": "tool_call",
                                            "name": fc.name,
                                            "args": args,
                                            "result": result,
                                        }
                                    )

                                await session.send_tool_response(
                                    function_responses=function_responses
                                )

                    except Exception as exc:
                        await event_queue.put({"type": "error", "message": str(exc)})
                    finally:
                        await event_queue.put(None)  # sentinel

                # Start all tasks
                t_audio = asyncio.create_task(send_audio())
                t_video = asyncio.create_task(send_video())
                t_text = asyncio.create_task(send_text())
                t_recv = asyncio.create_task(receive_loop())

                try:
                    while self.is_active:
                        event = await event_queue.get()
                        if event is None:
                            break
                        await self.response_queue.put(event)
                finally:
                    for t in (t_audio, t_video, t_text, t_recv):
                        t.cancel()

        except asyncio.CancelledError:
            logger.info(f"Session {self.session_id} cancelled")
        except Exception as exc:
            logger.error(f"Live session error: {exc}", exc_info=True)
            await self.response_queue.put(
                {"type": "error", "message": f"Gemini connection error: {exc}"}
            )
        finally:
            self.is_active = False

    # ------------------------------------------------------------------
    # Tool implementations
    # ------------------------------------------------------------------

    async def _brain_analyze_and_queue(self, text: str, accuracy: float):
        """Run brain analysis in background and push result to response queue."""
        try:
            brain_tip = await self.brain.analyze_coaching_response(text, accuracy)
            if brain_tip:
                await self.response_queue.put({
                    "type": "brain_response",
                    "text": f"💡 {brain_tip}",
                    "mode": self.brain.mode,
                })
        except Exception as e:
            logger.error(f"Background brain analysis failed: {e}")

    async def _tool_generate_visual_aid(self, prompt: str, mode: str = "coaching") -> str:
        """Called when Gemini invokes generate_visual_aid."""
        logger.info(f"Visual aid requested: mode={mode}, prompt={prompt[:80]}")
        # Signal the frontend to show a visual aid placeholder
        await self.response_queue.put(
            {
                "type": "visual_aid",
                "prompt": prompt,
                "mode": mode,
                "status": "generating",
            }
        )
        return f"Visual aid generation initiated for: {prompt}"

    async def _tool_get_pronunciation_guide(
        self, word: str, phoneme: str = ""
    ) -> str:
        """Called when Gemini invokes get_pronunciation_guide."""
        logger.info(f"Pronunciation guide requested: word={word}, phoneme={phoneme}")
        guide = f"Phonetic guide for '{word}': /{word.lower()}/ — focus on mouth position and airflow."
        await self.response_queue.put(
            {"type": "pronunciation_guide", "word": word, "guide": guide}
        )
        return guide
