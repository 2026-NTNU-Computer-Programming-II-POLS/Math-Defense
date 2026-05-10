import json
from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.constraints import (
    GOLD_MAX,
    GOLD_MIN,
    HP_MAX,
    HP_MIN,
    KILLS_MAX,
    KILLS_MIN,
    SCORE_MAX,
    SCORE_MIN,
    STAR_MAX,
    STAR_MIN,
    WAVES_MAX,
    WAVES_MIN,
)


_PATH_CONFIG_MAX_BYTES = 10_240
_PATH_CONFIG_MAX_DEPTH = 8
_PrepareFloat = Annotated[float, Field(ge=0, le=7200.0)]


def _check_depth(obj: Any, max_depth: int, current: int = 0) -> None:
    if current > max_depth:
        raise ValueError(f"path_config nesting exceeds depth limit of {max_depth}")
    if isinstance(obj, dict):
        for v in obj.values():
            _check_depth(v, max_depth, current + 1)
    elif isinstance(obj, list):
        for item in obj:
            _check_depth(item, max_depth, current + 1)


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    star_rating: int = Field(ge=STAR_MIN, le=STAR_MAX)
    path_config: dict | None = None
    initial_answer: bool = False
    # Backlog §20 — opt-in slider-fallback / practice mode. Excluded from the
    # global leaderboard; achievements & talent points still award.
    practice_mode: bool = False
    # Backlog §23 — set when the session is launched from a challenge deep-link.
    challenge_id: str | None = Field(default=None, max_length=64)
    # Backlog §24 — per-session RNG seed for replay. 32-bit unsigned range
    # (matches the mulberry32 input on the frontend). Nullable so non-replay
    # clients (legacy tests, third-party tooling) can still create sessions.
    rng_seed: int | None = Field(default=None, ge=0, le=4_294_967_295)
    # 施工計畫書 §3.8 — 1 = legacy mulberry32 + JS Math.* (ε = 0.0005);
    # 2 = PCG64/32 + WASM musl transcendentals (bit-exact). Client tags new
    # sessions v2 only when initWasm() succeeded; otherwise omits the field
    # and the column defaults to 1. Range is intentionally tight so a future
    # v3 forces an explicit migration.
    replay_version: int = Field(default=1, ge=1, le=2)

    @model_validator(mode="after")
    def no_practice_with_challenge(self) -> "SessionCreate":
        if self.practice_mode and self.challenge_id is not None:
            raise ValueError("practice_mode and challenge_id are mutually exclusive")
        return self

    @field_validator("path_config")
    @classmethod
    def path_config_size(cls, v: dict | None) -> dict | None:
        if v is None:
            return v
        if len(json.dumps(v)) > _PATH_CONFIG_MAX_BYTES:
            raise ValueError(f"path_config exceeds {_PATH_CONFIG_MAX_BYTES} byte limit")
        # Bound JSON nesting so a recursive 1-key payload can't blow the
        # parser stack downstream. Mirrors schemas/territory.py.
        _check_depth(v, _PATH_CONFIG_MAX_DEPTH)
        return v


class SessionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_wave: int | None = Field(default=None, ge=WAVES_MIN, le=WAVES_MAX)
    score: int | None = Field(default=None, ge=SCORE_MIN, le=SCORE_MAX)
    kill_value: int | None = Field(default=None, ge=0, le=SCORE_MAX)
    cost_total: int | None = Field(default=None, ge=0, le=GOLD_MAX)
    # B-BUG-17: gold and hp are deliberately NOT accepted from the client.
    # A tampered PATCH could push gold to GOLD_MAX (clamped) and bank that
    # at end_session via the score path; both must be derived from the
    # authoritative replay event log instead.

    @model_validator(mode="after")
    def at_least_one_field(self) -> "SessionUpdate":
        fields = ("current_wave", "score", "kill_value", "cost_total")
        if all(getattr(self, f) is None for f in fields):
            raise ValueError(
                "Provide at least one of: current_wave, score, kill_value, cost_total"
            )
        return self


class SessionEnd(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # F-BUG-6: ``score`` is now optional. The frontend stopped sending a
    # client-computed value because the backend recomputes (`_verify_score`)
    # the canonical total from V2 inputs anyway, and trusting the client
    # opens a Burp-replay path onto the leaderboard. Old clients (and
    # tests) may still submit a value; we accept it for backward compat
    # but the service ignores it for scoring purposes.
    score: int = Field(default=0, ge=SCORE_MIN, le=SCORE_MAX)
    kills: int = Field(ge=KILLS_MIN, le=KILLS_MAX)
    waves_survived: int = Field(ge=WAVES_MIN, le=WAVES_MAX)

    # V2 scoring variables (optional for backward compat)
    kill_value: int | None = Field(default=None, ge=0, le=SCORE_MAX)
    cost_total: int | None = Field(default=None, ge=0, le=GOLD_MAX)
    time_total: float | None = Field(default=None, ge=0, le=7200.0)
    health_origin: int | None = Field(default=None, ge=HP_MIN, le=HP_MAX)
    health_final: int | None = Field(default=None, ge=HP_MIN, le=HP_MAX)
    time_exclude_prepare: list[_PrepareFloat] | None = Field(default=None, max_length=50)
    n_prep_phases: int | None = Field(default=None, ge=0, le=50)
    total_score: float | None = Field(default=None, ge=0, le=1_000_000)

    @field_validator("time_exclude_prepare")
    @classmethod
    def prep_list_sum_bound(cls, v: list[float] | None) -> list[float] | None:
        if v is not None and sum(v) > 7200.0 + 0.001:
            raise ValueError("sum(time_exclude_prepare) must not exceed 7200 s")
        return v

    @model_validator(mode="after")
    def prep_sum_le_time_total(self) -> "SessionEnd":
        if self.time_exclude_prepare is not None and self.time_total is not None:
            prep_sum = sum(self.time_exclude_prepare)
            if prep_sum > self.time_total + 0.001:
                raise ValueError(
                    "sum(time_exclude_prepare) must not exceed time_total"
                )
        if (
            self.n_prep_phases is not None
            and self.time_exclude_prepare is not None
            and self.n_prep_phases != len(self.time_exclude_prepare)
        ):
            raise ValueError(
                "n_prep_phases must equal len(time_exclude_prepare)"
            )
        return self


class ReflectionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(default="", max_length=2000)


SESSION_OUT_SCHEMA_VERSION = 1


class UnlockedAchievementOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    talent_points: int


class SessionOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    schema_version: int = SESSION_OUT_SCHEMA_VERSION
    id: str
    star_rating: int
    status: str
    current_wave: int
    gold: int
    hp: int
    score: int
    started_at: datetime
    ended_at: datetime | None = None
    # Backlog §20 — surfaced so the HUD can render the practice badge and the
    # ScoreResult view can warn that the run is leaderboard-ineligible.
    practice_mode: bool = False
    # Backlog §23 — surfaced so the client can hide the leaderboard CTA on
    # ScoreResult and instead deep-link to the challenge ranking.
    challenge_id: str | None = None
    # Backlog §24 — per-session RNG seed forwarded to the Replay player so
    # game.rng can be re-seeded before re-driving the engine.
    rng_seed: int | None = None
    # 施工計畫書 §3.8 — replay protocol version this session was created under.
    # The frontend reads this on ReplayView load to decide whether to drive
    # the run through the JS path (v1) or the WASM-only deterministic path
    # (v2). Defaults to 1 for legacy rows with NULL semantics.
    replay_version: int = 1
    newly_unlocked_achievements: list[UnlockedAchievementOut] = []
    # Player's rolling IA accuracy snapshot at the moment the session was
    # served. The frontend curve renderer reads it at level start to decide
    # the y-axis label opacity (concrete-fading, spec §17). The router fills
    # this from the authenticated user; it is not a property of the session.
    ia_recent_accuracy: float = 0.0
