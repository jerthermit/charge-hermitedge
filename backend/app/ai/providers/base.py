from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Literal, Protocol, runtime_checkable


ChatMessage = dict[Literal["role", "content"], str]


class AIProvider(ABC):
    """Abstract base class for AI providers."""

    @abstractmethod
    async def chat_completion(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs: Any,
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def close(self) -> None:
        raise NotImplementedError

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()


@runtime_checkable
class SupportsChatCompletion(Protocol):
    async def chat_completion(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs: Any,
    ) -> dict[str, Any]:
        ...
