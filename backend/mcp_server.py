"""
Northstack MCP Server
Exposes memory, knowledge, personas, files, and history as MCP tools
so any MCP-compatible client (Claude Desktop, Cursor, etc.) can use them.

Run: python mcp_server.py
"""

import json
import os
from pathlib import Path
from datetime import datetime

from mcp.server.fastmcp import FastMCP

# ── Paths (same as main.py) ───────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
MEMORY_DIR = BASE_DIR / "memory"
KNOWLEDGE_DIR = BASE_DIR / "knowledge"
SESSIONS_DIR = MEMORY_DIR / "sessions"
DATA_DIR = BASE_DIR / "data"
SAMPLES_DIR = DATA_DIR / "samples"

mcp = FastMCP(
    "Northstack",
    instructions=(
        "Tools for accessing memory, knowledge, personas, files, and session history "
        "from the Northstack AI agent system."
    ),
)


# ── Memory tools ─────────────────────────────────────────────────────────────

@mcp.tool()
def get_memory() -> str:
    """Return all saved user memories from previous sessions."""
    memory_file = MEMORY_DIR / "memory.md"
    if not memory_file.exists():
        return "No memory saved yet."
    return memory_file.read_text(encoding="utf-8")


@mcp.tool()
def save_memory(entry: str) -> str:
    """
    Save a new memory entry for the user.

    Args:
        entry: The information to remember (concise and specific).
    """
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    memory_file = MEMORY_DIR / "memory.md"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    line = f"- [{timestamp}] {entry}\n"
    with open(memory_file, "a", encoding="utf-8") as f:
        f.write(line)
    return f"Saved: {entry}"


# ── Knowledge tools ───────────────────────────────────────────────────────────

@mcp.tool()
def get_knowledge() -> str:
    """Return the combined knowledge base (all .md files in the knowledge directory)."""
    parts = []
    for md_file in sorted(KNOWLEDGE_DIR.glob("*.md")):
        parts.append(f"## {md_file.stem}\n{md_file.read_text(encoding='utf-8')}")
    return "\n\n".join(parts) if parts else "Knowledge base is empty."


@mcp.tool()
def list_personas() -> str:
    """List all available AI personas (built-in and custom)."""
    roles_dir = KNOWLEDGE_DIR / "roles"
    if not roles_dir.exists():
        return "No personas found."
    personas = []
    for f in sorted(roles_dir.glob("*.md")):
        personas.append(f"- {f.stem}: {f.name}")
    return "\n".join(personas) if personas else "No personas found."


@mcp.tool()
def get_persona(role_id: str) -> str:
    """
    Get the system prompt / knowledge for a specific persona.

    Args:
        role_id: The persona ID (e.g. 'analyst', 'accent_coach', 'workout').
    """
    role_file = KNOWLEDGE_DIR / "roles" / f"{role_id}.md"
    if not role_file.exists():
        return f"Persona '{role_id}' not found."
    return role_file.read_text(encoding="utf-8")


# ── File / Storage tools ──────────────────────────────────────────────────────

@mcp.tool()
def list_files() -> str:
    """List all data files available in the samples directory."""
    if not SAMPLES_DIR.exists():
        return "No sample files found."
    files = []
    for f in sorted(SAMPLES_DIR.iterdir()):
        size_kb = f.stat().st_size / 1024
        files.append(f"- {f.name} ({size_kb:.1f} KB)")
    return "\n".join(files) if files else "No files found."


@mcp.tool()
def read_file(filename: str) -> str:
    """
    Read the contents of a data file from the samples directory.

    Args:
        filename: The file name (e.g. 'real_estate.csv', 'finance.csv').
    """
    file_path = SAMPLES_DIR / filename
    if not file_path.exists():
        # Also check recordings dir
        return f"File '{filename}' not found in samples directory."
    if file_path.stat().st_size > 500_000:  # 500KB limit
        return f"File '{filename}' is too large to read directly (>{file_path.stat().st_size // 1024}KB)."
    return file_path.read_text(encoding="utf-8", errors="replace")


# ── Session history tools ─────────────────────────────────────────────────────

@mcp.tool()
def get_session_history(limit: int = 10) -> str:
    """
    Return the most recent session history entries.

    Args:
        limit: Number of sessions to return (default 10, max 50).
    """
    if not SESSIONS_DIR.exists():
        return "No session history found."
    limit = min(limit, 50)
    sessions = []
    for f in sorted(SESSIONS_DIR.glob("*.json"), reverse=True)[:limit]:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            title = data.get("title", "Session")
            role = data.get("role", "general")
            ts = data.get("timestamp", "")
            sessions.append(f"- [{ts}] {title} (role: {role})")
        except Exception:
            sessions.append(f"- {f.stem} (unreadable)")
    return "\n".join(sessions) if sessions else "No sessions found."


if __name__ == "__main__":
    print("Starting Northstack MCP server...")
    mcp.run()
