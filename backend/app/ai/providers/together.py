from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import Any

import httpx

from app.core.config import settings

from .base import AIProvider, ChatMessage

logger = logging.getLogger(__name__)


class TogetherAIProvider(AIProvider):
    """Small Together AI client used by Charge recommendations."""

    BASE_URL = "https://api.together.ai/v1"
    DEFAULT_MODEL = "Qwen/Qwen3.5-9B"

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        self.api_key = (api_key or settings.TOGETHER_API_KEY or "").strip()
        self.model = (
            model or settings.TOGETHER_MODEL or self.DEFAULT_MODEL
        ).strip()
        self.timeout = settings.AI_REQUEST_TIMEOUT_MS / 1_000

    async def chat_completion(
        self,
        messages: list[ChatMessage],
        temperature: float = 0,
        max_tokens: int = 512,
        response_schema: dict[str, Any] | None = None,
        schema_name: str = "response",
        reasoning_enabled: bool = False,
        **kwargs: Any,
    ) -> dict[str, Any]:
        if not self.api_key:
            return {
                "error": "Together AI is not configured",
                "status_code": 503,
            }

        json_mode = bool(kwargs.pop("json_mode", False))
        kwargs.pop("intent", None)

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "reasoning": {"enabled": reasoning_enabled},
        }

        if response_schema is not None:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": schema_name,
                    "schema": response_schema,
                },
            }
        elif json_mode:
            payload["response_format"] = {"type": "json_object"}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except httpx.TimeoutException:
            return {
                "error": "Together AI request timed out",
                "status_code": 504,
            }
        except httpx.HTTPError:
            logger.exception("Together AI request failed")
            return {
                "error": "Together AI is unavailable",
                "status_code": 502,
            }

        if response.status_code >= 400:
            logger.warning(
                "Together AI returned HTTP %s",
                response.status_code,
            )
            return {
                "error": "Together AI is unavailable",
                "status_code": response.status_code,
            }

        try:
            return response.json()
        except ValueError:
            logger.warning("Together AI returned an invalid response")
            return {
                "error": "Together AI returned an invalid response",
                "status_code": 502,
            }

    async def stream_completion(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.2,
        max_tokens: int = 512,
        **kwargs: Any,
    ) -> AsyncGenerator[str, None]:
        if not self.api_key:
            yield "Together AI is not configured."
            return

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
            "reasoning": {"enabled": False},
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        yield data
        except httpx.HTTPError:
            logger.exception("Together AI stream failed")
            yield "Together AI is unavailable."

    async def generate_reply(
        self,
        messages: list[ChatMessage],
        **kwargs: Any,
    ) -> str:
        response = await self.chat_completion(messages, **kwargs)
        if "error" in response:
            return str(response["error"])

        try:
            return str(response["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError):
            return "Together AI returned an invalid response"

    async def close(self) -> None:
        return None
