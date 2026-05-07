"""Replay/Spectate (§24) HTTP routes.

POST /api/sessions/{id}/events — recorder flushes a batch of events.
GET  /api/sessions/{id}/replay — player loads seed + ordered event stream.

Mounted on its own router rather than tacked onto game_session.py so the
ingest path can have a tighter rate limit (recorder flushes every few
seconds) without affecting the session CRUD limits.
"""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.db.database import SessionLocal, get_db
from app.domain.session.events_log import ReplayEvent
from app.domain.user.aggregate import User
from app.factories import build_auth_service, build_replay_service
from app.infrastructure.spectate_hub import hub as spectate_hub
from app.limiter import limiter
from app.middleware.auth import AUTH_COOKIE_NAME, get_current_user
from app.models.game_session import GameSession as GameSessionModel
from app.schemas.replay import (
    ReplayBatchIn,
    ReplayBatchOut,
    ReplayBundleOut,
    ReplayEventOut,
)


logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api/sessions", tags=["replay"])


@router.post("/{session_id}/events", response_model=ReplayBatchOut, status_code=202)
# Tuned for the recorder's 1 Hz flush cadence with headroom for a brief
# burst when the player closes the tab and the EventRecorder dumps its
# remaining buffer in one final POST.
@limiter.limit("60/minute")
async def append_events(
    request: Request,
    session_id: UUID,
    req: ReplayBatchIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReplayBatchOut:
    events = [
        ReplayEvent(
            seq=e.seq,
            ts=e.ts,
            event_type=e.event_type,
            payload=e.payload,
        )
        for e in req.events
    ]
    written = build_replay_service(db).append_events(
        str(session_id), current_user.id, events,
    )
    # Backlog §24 Phase D — fan out to live spectators after the persist
    # commits. We publish only the events that the recorder posted (not
    # `written` minus duplicates), because spectators don't deduplicate;
    # the recorder ensures it doesn't double-send. If publish raises, the
    # ingest still succeeds — spectator delivery is best-effort.
    try:
        await spectate_hub.publish(
            str(session_id),
            [e.model_dump(mode="json") for e in req.events],
        )
    except Exception:
        logger.exception("spectate publish failed session=%s", session_id)
    return ReplayBatchOut(written=written)


@router.get("/{session_id}/replay", response_model=ReplayBundleOut)
@limiter.limit("30/minute")
def get_replay(
    request: Request,
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReplayBundleOut:
    bundle = build_replay_service(db).get_replay(str(session_id), current_user.id)
    return ReplayBundleOut(
        session_id=bundle.session_id,
        rng_seed=bundle.rng_seed,
        star_rating=bundle.star_rating,
        events=[
            ReplayEventOut(
                seq=e.seq,
                ts=e.ts,
                event_type=e.event_type,
                payload=e.payload,
            )
            for e in bundle.events
        ],
    )


# ── §24 Phase D: live spectate ──

# A WS spectator first receives the historical event stream (so a viewer
# joining mid-run sees what already happened), then transitions to live
# updates from the SpectateHub. The hand-off is "send all stored, then
# subscribe" — there is a small race window where an event posted between
# those two steps could be missed. Acceptable: the recorder's seq is
# monotonic and gaps are visible client-side.
@router.websocket("/{session_id}/spectate")
async def spectate_session(websocket: WebSocket, session_id: UUID) -> None:
    # Authenticate via the access-token cookie (browser sends it on the WS
    # handshake automatically). Raw cookie parsing because Starlette's
    # Request is not available here.
    token = websocket.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        await websocket.close(code=4401, reason="unauthenticated")
        return

    db = SessionLocal()
    try:
        try:
            user = build_auth_service(db).authenticate_token(token)
        except Exception:
            await websocket.close(code=4401, reason="unauthenticated")
            return

        session_row = (
            db.query(GameSessionModel)
            .filter(GameSessionModel.id == str(session_id))
            .first()
        )
        if session_row is None:
            await websocket.close(code=4404, reason="session not found")
            return

        # Spectator authorization v1: owner-only. The spec calls for
        # "class peers" but classroom-scoped spectating depends on the
        # teacher-class membership invariants (which session owner is
        # in which class) being wired into a separate predicate. Until
        # that lands, owner-only avoids leaking another student's
        # input stream to anyone authenticated. To extend: replace the
        # comparison below with a class-membership check that admits
        # peers + teachers of the owner's class.
        if session_row.user_id != user.id:
            await websocket.close(code=4403, reason="forbidden")
            return

        await websocket.accept()

        # Send the (possibly empty) historical event stream so the viewer
        # has context before live events start arriving. Reuses the
        # ReplayApplicationService so ownership / quota rules stay in
        # one place; called with the spectator's own user id since the
        # owner-only gate above guarantees they match.
        bundle = build_replay_service(db).get_replay(
            str(session_id), user.id,
        )
        await websocket.send_json({
            "kind": "snapshot",
            "session_id": bundle.session_id,
            "rng_seed": bundle.rng_seed,
            "star_rating": bundle.star_rating,
            "events": [
                {
                    "seq": e.seq,
                    "ts": e.ts,
                    "event_type": e.event_type,
                    "payload": e.payload,
                }
                for e in bundle.events
            ],
        })

        queue = await spectate_hub.subscribe(str(session_id))
        try:
            while True:
                event = await queue.get()
                await websocket.send_json({"kind": "event", **event})
        except WebSocketDisconnect:
            return
        finally:
            await spectate_hub.unsubscribe(str(session_id), queue)
    finally:
        db.close()
