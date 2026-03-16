"""
OpenClaw service — async client for the self-hosted OpenClaw AI agent.
Uses the OpenAI-compatible /v1/chat/completions endpoint.
"""

import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class OpenClawService:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def chat(
        self,
        messages: List[Dict[str, str]],
        model: str = "default",
        max_tokens: int = 512,
        system: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Send a chat request to OpenClaw and return the response dict.
        Returns {"content": str, "model": str} on success,
        {"error": str} on failure.
        """
        if system:
            messages = [{"role": "system", "content": system}] + messages

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.base_url}/v1/chat/completions",
                    headers=self.headers,
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return {"content": content, "model": data.get("model", model)}
        except httpx.HTTPStatusError as e:
            logger.error(f"OpenClaw HTTP error {e.response.status_code}: {e.response.text}")
            return {"error": f"OpenClaw returned {e.response.status_code}"}
        except Exception as e:
            logger.error(f"OpenClaw request failed: {e}")
            return {"error": str(e)}

    async def is_available(self) -> bool:
        """Quick health check — returns True if OpenClaw is reachable."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{self.base_url}/v1/models",
                    headers=self.headers,
                )
                return resp.status_code == 200
        except Exception:
            return False
