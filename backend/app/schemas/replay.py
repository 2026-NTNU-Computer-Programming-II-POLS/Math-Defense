"""Replay/Spectate (§24) request/response schemas."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.session.events_log import MAX_BATCH_SIZE


# Hard cap on a single payload's serialized JSON size, defence-in-depth
# against a tampered client trying to exhaust storage with one giant
# event payload. 8 KB comfortably fits the largest legitimate payload
# (a chain-rule question with both functions LaTeX-encoded ~2 KB).
_PAYLOAD_MAX_BYTES = 8_192


class ReplayEventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seq: int = Field(ge=0, le=200_000)
    # Game-time at emission, seconds. Hard cap matches stale-session
    # window (2h) to reject obviously bogus values without rejecting a
    # legitimate marathon run.
    ts: float = Field(ge=0, le=7_200.0)
    event_type: str = Field(min_length=1, max_length=64)
    payload: Any = None


class ReplayBatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[ReplayEventIn] = Field(min_length=1, max_length=MAX_BATCH_SIZE)


class ReplayBatchOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    written: int


class ReplayEventOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    seq: int
    ts: float
    event_type: str
    payload: Any = None


class ReplayBundleOut(BaseModel):
    """Everything a player needs to re-drive the engine for a session."""
    model_config = ConfigDict(extra="ignore")

    session_id: str
    # Nullable for legacy sessions created before §24 introduced the seed
    # column. The frontend Replay player warns when this is null and falls
    # back to a Math.random stream — events still play back, but RNG-driven
    # outcomes (buff disable target, Monty-Hall door) will diverge.
    rng_seed: int | None = None
    # 施工計畫書 §3.8 — replay protocol version this session was created under.
    # ReplayView branches on this: v1 keeps the existing JS-Math.* path
    # (within ε = 0.0005); v2 routes through the WASM determinism module and
    # surfaces an error if the .wasm fails to load (no silent fallback).
    replay_version: int = 1
    star_rating: int
    events: list[ReplayEventOut]
