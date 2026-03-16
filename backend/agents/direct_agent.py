"""
Direct chat agent — plain conversational Gemini Live agent, no tools, no coaching.
"""

from google.adk.agents import Agent

direct_agent = Agent(
    name="direct_chat",
    model="gemini-2.5-flash-native-audio-preview-12-2025",
    description="A helpful, friendly conversational AI assistant.",
    instruction=(
        "You are a helpful, friendly AI assistant. "
        "Have natural, flowing conversations with the user. "
        "Be concise and responsive. "
        "Respond naturally in whatever language the user speaks."
    ),
)
