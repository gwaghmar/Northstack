"""
Northstack Brain — Gemini Flash reasoning layer.
Handles mode switching, session memory, and intelligent chat replies.
Runs alongside Gemini Live (audio) as the "thinking" layer.
"""

import logging
from typing import Any, Dict, List, Optional
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# ── Mode system prompts ────────────────────────────────────────────────────────

MODE_PROMPTS = {
    "coach": """You are Northstack, an elite AI accent and pronunciation coach.
Your role: Give warm, encouraging, personalized coaching feedback.
- Celebrate wins, correct gently
- Focus on practical improvement
- Remember what the user struggled with earlier in this session
- Give specific exercises and drills
Keep replies concise (2-4 sentences max for chat).""",

    "technician": """You are Northstack in TECHNICIAN MODE — a precise phonetics analyst.
Your role: Deep technical breakdown of pronunciation issues.
- Use IPA notation when helpful
- Explain mouth position, tongue placement, airflow
- Identify specific phoneme errors
- Give clinical, data-driven feedback
Be precise and analytical. Concise but detailed.""",

    "tutorial": """You are Northstack in TUTORIAL MODE — a structured language teacher.
Your role: Teach pronunciation concepts with clear lessons.
- Break down rules systematically
- Use examples and contrast pairs (e.g. "ship" vs "sheep")
- Build from simple to complex
- Give the user a mini-lesson on their current challenge
Keep it educational and structured.""",

    "story": """You are Northstack in STORY MODE — an immersive language coach.
Your role: Create real-world scenarios for the user to practice in.
- Paint vivid scenes (job interview, coffee shop, presentation)
- Play characters in the scene
- Correct pronunciation in-character, subtly
- Make it feel like a simulation, not a lesson
Be creative and immersive.""",

    "recording": """You are Northstack in REVIEW MODE — analyzing a recorded session.
Your role: Summarize and analyze the coaching session.
- Identify key patterns and recurring issues
- Highlight improvements made during the session
- Give a structured action plan for next practice
- Score the session overall
Be thorough and constructive.""",
}

TECHNICIAN_MODE = MODE_PROMPTS["technician"]
DEFAULT_MODE = "coach"


class NorthstackBrain:
    """
    Gemini Flash reasoning brain for Northstack.
    Maintains session memory, handles mode switching,
    and generates intelligent text responses.
    """

    def __init__(self, api_key: str, session_id: str):
        self.session_id = session_id
        self.client = genai.Client(api_key=api_key)
        self.mode = DEFAULT_MODE
        self.memory: List[Dict[str, str]] = []  # conversation history
        self.session_notes: List[str] = []       # coaching observations
        self.model = "gemini-2.5-flash"

    def switch_mode(self, mode: str) -> str:
        """Switch brain mode. Returns confirmation message."""
        if mode in MODE_PROMPTS:
            self.mode = mode
            logger.info(f"Brain mode switched to: {mode}")
            return f"Switched to {mode.upper()} mode"
        return f"Unknown mode: {mode}"

    def add_coaching_observation(self, observation: str):
        """Store a coaching observation in session memory."""
        self.session_notes.append(observation)
        # Keep last 20 observations
        if len(self.session_notes) > 20:
            self.session_notes = self.session_notes[-20:]

    async def chat(self, user_message: str) -> str:
        """
        Generate an intelligent reply to a user chat message.
        Uses current mode + session memory.
        """
        # Build system prompt with session context
        system = MODE_PROMPTS.get(self.mode, MODE_PROMPTS["coach"])
        if self.session_notes:
            context = "\n".join(self.session_notes[-5:])
            system += f"\n\nSession context so far:\n{context}"

        # Build message history
        history = []
        for msg in self.memory[-10:]:  # last 10 exchanges
            history.append(types.Content(
                role=msg["role"],
                parts=[types.Part(text=msg["content"])]
            ))

        # Add current message
        history.append(types.Content(
            role="user",
            parts=[types.Part(text=user_message)]
        ))

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=history,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    max_output_tokens=300,
                    temperature=0.7,
                )
            )
            reply = response.text or "I'm here — keep going!"

            # Store in memory
            self.memory.append({"role": "user", "content": user_message})
            self.memory.append({"role": "model", "content": reply})

            return reply

        except Exception as e:
            logger.error(f"Brain chat error: {e}")
            return "I'm processing — try again in a moment."

    async def analyze_coaching_response(self, transcript: str, score: float) -> Optional[str]:
        """
        After Gemini Live gives feedback, Brain adds a deeper insight.
        Only fires if score is low or there's a clear pattern.
        """
        if score > 75 or not transcript:
            return None  # Good score — no need to pile on

        self.add_coaching_observation(f"Score {score:.0f}%: {transcript[:100]}")

        prompt = f"""The user just got this coaching feedback (score: {score:.0f}%):
"{transcript}"

In 1-2 sentences, add ONE specific, actionable tip that wasn't already mentioned.
Be direct. No fluff."""

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
                config=types.GenerateContentConfig(
                    system_instruction=MODE_PROMPTS.get(self.mode, MODE_PROMPTS["coach"]),
                    max_output_tokens=100,
                    temperature=0.5,
                )
            )
            return response.text
        except Exception as e:
            logger.error(f"Brain analysis error: {e}")
            return None

    async def get_session_summary(self) -> str:
        """Generate a full session summary at the end."""
        if not self.session_notes:
            return "No coaching data recorded this session."

        notes_text = "\n".join(self.session_notes)
        prompt = f"""Summarize this pronunciation coaching session:

{notes_text}

Include:
1. Main patterns noticed
2. Biggest improvement opportunity
3. Top 3 exercises to practice
4. Overall encouragement

Keep it under 150 words."""

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
                config=types.GenerateContentConfig(
                    system_instruction=MODE_PROMPTS["coach"],
                    max_output_tokens=200,
                )
            )
            return response.text or "Great session today!"
        except Exception as e:
            logger.error(f"Brain summary error: {e}")
            return "Session complete. Keep practicing!"
