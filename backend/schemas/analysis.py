from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class SummaryRequest(BaseModel):
    analysis: dict


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class CoachChatRequest(BaseModel):
    analysis: dict
    messages: list[ChatMessage]
